/**
 * ProjectBesoinsModule.jsx — Déclaration des besoins RH (lecture seule affectation)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Send, Loader2, AlertCircle, RefreshCw, Info,
  Eye, Edit2, Download, ClipboardList, TrendingUp, Package,
} from 'lucide-react';
import { prioriteBadgeClass, deleteProjectNeedWarnMessage } from '../../constants/projectBesoins';
import {
  listProjectStaffNeeds,
  createProjectStaffNeed,
  updateProjectStaffNeed,
  deleteProjectStaffNeed,
  submitProjectStaffNeed,
  getProjectStaffNeed,
  computeBesoinStats,
} from '../../services/projects/projectBesoins';
import { generateBesoinPdf } from '../../services/projects/projectBesoinPdf';
import { getBesoinActions } from './besoins/besoinActions';
import BesoinFormModal from './besoins/BesoinFormModal';
import BesoinDetailModal from './besoins/BesoinDetailModal';
import DemandesChantier from '../inventaire/DemandesChantier.jsx';

function KpiCard({ icon, label, value, sub, color = 'grey' }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)', purple: '#6A1B9A' };
  const bg = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)', purple: '#F3E5F5' };
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg[color], color: colors[color] }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub" style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function coverageIndicator(need) {
  if (need.manque === 0 && need.quantite_affectee > 0) return { emoji: '🟢', label: 'Couvert', color: '#2E7D32' };
  if (need.quantite_affectee > 0) return { emoji: '🟠', label: 'Partiel', color: '#F57C00' };
  return { emoji: '🔴', label: 'Non couvert', color: '#C62828' };
}

const ACTION_ICONS = {
  view: Eye, edit: Edit2, pdf: Download, delete: Trash2, submit: Send,
};

export default function ProjectBesoinsModule({ projet }) {
  const projectId = projet?.id;
  const projectMeta = projet ? {
    chef_projet: projet.chef_projet || projet.responsable || '',
    chef_chantier: projet.chef_chantier || '',
  } : null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needs, setNeeds] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editNeed, setEditNeed] = useState(null);
  const [detailNeed, setDetailNeed] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      setNeeds(await listProjectStaffNeeds(projectId, projectMeta));
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectMeta?.chef_projet, projectMeta?.chef_chantier]);

  useEffect(() => { load(); }, [load]);

  const stats = computeBesoinStats(needs);

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>
        Enregistrez le projet pour gérer les besoins en ressources humaines.
      </div>
    );
  }

  async function handleSave(form, submit = false) {
    setSaving(true);
    setError('');
    try {
      if (editNeed?.id) {
        await updateProjectStaffNeed(editNeed.id, form, { submit, projet });
      } else {
        await createProjectStaffNeed(projectId, form, { submit, projet });
      }
      setFormOpen(false);
      setEditNeed(null);
      if (submit) {
        alert('Besoin soumis — une demande a été transmise au service RH.');
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(need) {
    try {
      setDetailNeed(await getProjectStaffNeed(need.id, projectMeta));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAction(action, need) {
    setError('');
    try {
      switch (action) {
        case 'view':
          await openDetail(need);
          break;
        case 'edit':
          setEditNeed(need);
          setFormOpen(true);
          break;
        case 'pdf':
          await generateBesoinPdf(need, projet);
          break;
        case 'submit':
          await submitProjectStaffNeed(need.id, projet);
          alert('Besoin soumis — une demande a été transmise au service RH.');
          await load();
          break;
        case 'delete': {
          if (!window.confirm(deleteProjectNeedWarnMessage(need))) return;
          await deleteProjectStaffNeed(need.id);
          if (detailNeed?.id === need.id) setDetailNeed(null);
          await load();
          break;
        }
        default:
          break;
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16,
        padding: '12px 14px', background: '#E8F5E9', borderRadius: 8, fontSize: '0.82rem', color: '#2E7D32',
      }}
      >
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Workflow RH</strong> — déclarez ici vos besoins en ressources humaines.
          L&apos;affectation des ouvriers est réalisée exclusivement par le service RH dans{' '}
          <em>RH → Demandes ressources</em>. L&apos;onglet Équipe affiche les affectations validées.
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Total besoins" value={stats.total} color="grey" />
        <KpiCard icon={<Users size={17} />} label="Total affectés" value={stats.totalAffectes} sub={`sur ${stats.totalDemandes} demandés`} color="blue" />
        <KpiCard icon={<TrendingUp size={17} />} label="Taux couverture" value={`${stats.taux}%`} color={stats.taux >= 100 ? 'green' : stats.taux >= 50 ? 'orange' : 'red'} />
        <KpiCard icon={<AlertCircle size={17} />} label="Besoins ouverts" value={stats.ouverts} color="orange" />
        <KpiCard icon={<AlertCircle size={17} />} label="Besoins urgents" value={stats.urgents} color="red" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Besoins ressources humaines
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> Actualiser
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditNeed(null); setFormOpen(true); }}>
          <Plus size={13} /> Ajouter un besoin
        </button>
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Chargement…
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Fonction</th>
                <th>Demandé</th>
                <th>Affecté</th>
                <th>Manque</th>
                <th>Couverture</th>
                <th>Date souhaitée</th>
                <th>Priorité</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {needs.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>
                    Aucun besoin — cliquez sur « Ajouter un besoin » pour déclarer une demande au service RH.
                  </td>
                </tr>
              ) : needs.map((n) => {
                const cov = coverageIndicator(n);
                const actions = getBesoinActions(n);
                return (
                  <tr key={n.id}>
                    <td data-label="Type">
                      <div style={{ fontWeight: 600 }}>{n.type_besoin}</div>
                      {n.ref_besoin && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{n.ref_besoin}</div>}
                    </td>
                    <td data-label="Fonction" style={{ fontWeight: 600 }}>{n.fonction}</td>
                    <td data-label="Demandé">{n.quantite_necessaire}</td>
                    <td data-label="Affecté">{n.quantite_affectee}</td>
                    <td data-label="Manque" style={{ fontWeight: 700, color: n.manque > 0 ? 'var(--red)' : '#2E7D32' }}>{n.manque}</td>
                    <td data-label="Couverture">
                      <span title={cov.label} style={{ fontSize: '0.82rem', color: cov.color, fontWeight: 600 }}>
                        {cov.emoji} {cov.label}
                      </span>
                    </td>
                    <td data-label="Date">{fmtDate(n.date_debut_souhaitee)}</td>
                    <td data-label="Priorité">
                      <span className={`badge ${prioriteBadgeClass(n.priorite)}`}>{n.priorite}</span>
                    </td>
                    <td data-label="Statut">
                      <span className={`badge ${n.statutBadge}`}>{n.statutLabel}</span>
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {actions.map((a) => {
                          const Icon = ACTION_ICONS[a.key] || Eye;
                          return (
                            <button
                              key={a.key}
                              type="button"
                              className={a.key === 'submit' ? 'btn btn-primary btn-sm' : a.key === 'delete' ? 'btn btn-ghost btn-sm' : 'btn btn-ghost btn-sm'}
                              title={a.label}
                              style={a.key === 'delete' ? { color: 'var(--red)' } : undefined}
                              onClick={() => handleAction(a.key, n)}
                            >
                              <Icon size={13} />
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BesoinFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditNeed(null); }}
        onSave={handleSave}
        saving={saving}
        projet={projet}
        initial={editNeed}
        submitLabel="Soumettre à la RH"
      />

      <BesoinDetailModal
        open={!!detailNeed}
        onClose={() => setDetailNeed(null)}
        need={detailNeed}
        projet={projet}
        onPdf={(n) => generateBesoinPdf(n, projet)}
        onEdit={(n) => { setDetailNeed(null); setEditNeed(n); setFormOpen(true); }}
        onDelete={(n) => handleAction('delete', n)}
      />

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16,
          padding: '12px 14px', background: '#E3F2FD', borderRadius: 8, fontSize: '0.82rem', color: '#1565C0',
        }}
        >
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Workflow matériel</strong> — les besoins matériel créés ici sont des demandes chantier
            transmises au magasinier (<em>Inventaire &amp; Dépôt → Demandes chantier</em>).
            En cas de rupture de stock, une demande d&apos;achat est générée automatiquement.
          </div>
        </div>

        <div style={{
          fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
        }}
        >
          <Package size={14} /> Besoins matériel / matériaux
        </div>

        <DemandesChantier projet={projet} embedded />
      </div>
    </div>
  );
}
