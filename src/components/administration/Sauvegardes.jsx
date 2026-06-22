/**
 * Sauvegardes.jsx — Journal sauvegardes ERP CITYMO (Supabase).
 */
import { useState, useCallback } from 'react';
import { HardDrive, Plus, Trash2, Download, RefreshCw, FileText, Search, Filter, CheckCircle, Clock, AlertTriangle, Server } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  TYPES_BACKUP, STATUTS_BACKUP, BADGE_BACKUP, BADGE_TYPE_BACKUP,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';
import { ERP_MODULES } from '../../services/admin/constants';
import {
  createBackupLog,
  finalizeBackup,
  deleteBackup,
  requestRestore,
} from '../../services/admin/backups';

const EMPTY_FORM = {
  type: 'Manuelle',
  module_code: '',
  description: '',
  planification: 'Manuelle',
};

function BackupForm({ onSave, onCancel, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function handleSubmit(ev) {
    ev.preventDefault();
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<HardDrive size={12} />}>Nouvelle sauvegarde</SectionTitle>
      <FRow>
        <FField label="Type de sauvegarde" required>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} style={SELECT_STYLE}>
            {TYPES_BACKUP.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Module concerné">
          <select value={form.module_code} onChange={(e) => set('module_code', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Tous / Système —</option>
            {ERP_MODULES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </FField>
        <FField label="Planification">
          <select value={form.planification} onChange={(e) => set('planification', e.target.value)} style={SELECT_STYLE}>
            <option value="Manuelle">Manuelle (maintenant)</option>
            <option value="Quotidienne">Quotidienne</option>
            <option value="Hebdomadaire">Hebdomadaire</option>
            <option value="Mensuelle">Mensuelle</option>
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description / Notes">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexte de la sauvegarde..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#E65100' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Journal de sauvegarde</div>
        <div>Cette action enregistre une entrée dans le journal. La restauration réelle nécessite une confirmation manuelle en production.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={14} /> {saving ? 'En cours…' : 'Lancer la sauvegarde'}
        </button>
      </div>
    </form>
  );
}

function InfraCard({ icon, title, value, description, color }) {
  const bgMap = { green: '#E8F5E9', orange: '#FFF3E0', red: 'var(--red-light)', blue: '#E3F2FD', grey: 'var(--surface-2)' };
  const clMap = { green: '#2E7D32', orange: '#E65100', red: 'var(--red)', blue: '#1565C0', grey: 'var(--text-3)' };
  const c = color || 'grey';
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: bgMap[c], display: 'flex', alignItems: 'center', justifyContent: 'center', color: clMap[c] }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: clMap[c] }}>{value}</div>
        </div>
      </div>
      {description && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>{description}</div>}
    </div>
  );
}

export default function Sauvegardes({ backups = [], setBackups, reload, canManage, currentUser }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async (data) => {
    if (!canManage) return;
    setSaving(true);
    try {
      const row = await createBackupLog(data, currentUser);
      setBackups((prev) => [row, ...prev]);
      setShowModal(false);
      setTimeout(async () => {
        try {
          const done = await finalizeBackup(row.id, { statut: 'Succès', taille_bytes: null });
          setBackups((prev) => prev.map((b) => (b.id === done.id ? done : b)));
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }, [canManage, currentUser, setBackups]);

  async function handleDelete(id) {
    if (!canManage || !window.confirm('Supprimer cette entrée du journal ?')) return;
    try {
      await deleteBackup(id);
      setBackups((prev) => prev.filter((x) => x.id !== id));
      reload?.();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRestore(backup) {
    if (!canManage) return;
    const step1 = window.confirm(
      `Demander la restauration de ${backup.ref} ?\n\nCette opération est IRRÉVERSIBLE en production.`,
    );
    if (!step1) return;
    const step2 = window.confirm('Confirmation finale : êtes-vous absolument certain ?');
    if (!step2) return;
    try {
      await requestRestore(backup);
      alert('Demande enregistrée dans le journal. Un administrateur système doit valider la restauration.');
      reload?.();
    } catch (err) {
      alert(err.message);
    }
  }

  const filtered = backups.filter((x) => {
    const q = search.toLowerCase();
    return (!q || x.ref.toLowerCase().includes(q) || (x.nom || '').toLowerCase().includes(q))
      && (!filterType || x.type === filterType)
      && (!filterStatut || x.statut === filterStatut);
  });

  const derniere = backups.find((b) => b.statut === 'Succès');
  const nbAuto = backups.filter((b) => b.planification && b.planification !== 'Manuelle').length;
  const totalSucces = backups.filter((b) => b.statut === 'Succès').length;
  const enCours = backups.filter((b) => b.statut === 'En cours').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">SAUVEGARDES</h1>
          <p className="page-subtitle">Journal des sauvegardes automatiques et manuelles.</p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}><Filter size={14} /> Filtres</button>
            <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={15} /> Nouvelle sauvegarde
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Clock size={17} />} label="Dernière sauvegarde" value={derniere ? derniere.date.slice(0, 10) : '—'} color="grey" />
        <KpiCard icon={<HardDrive size={17} />} label="Sauvegardes réussies" value={totalSucces} color="green" />
        <KpiCard icon={<RefreshCw size={17} />} label="Planifiées" value={nbAuto} color="blue" />
        <KpiCard icon={<CheckCircle size={17} />} label="En cours" value={enCours} color="orange" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Infrastructure
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <InfraCard icon={<Server size={16} />} title="Supabase" value="Actif" color="green" description="Auth + Database + Storage" />
          <InfraCard icon={<Server size={16} />} title="Journal" value={`${backups.length} entrées`} color="blue" description="Historique sauvegardes ERP" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Référence, nom..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          {showFilters && (
            <>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
                <option value="">Tous types</option>
                {TYPES_BACKUP.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
                <option value="">Tous statuts</option>
                {STATUTS_BACKUP.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<HardDrive size={24} />} title="Aucune sauvegarde" sub="Le journal est vide" action={canManage ? 'Nouvelle sauvegarde' : undefined} onAction={canManage ? () => setShowModal(true) : undefined} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Module</th>
                  <th>Taille</th>
                  <th>Statut</th>
                  <th>Créé par</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                    <td data-label="Date" style={{ fontSize: '0.82rem' }}>{x.date}</td>
                    <td data-label="Type">
                      <span className={`badge ${BADGE_TYPE_BACKUP[x.type] || 'badge-grey'}`} style={{ fontSize: '0.7rem' }}>{x.type}</span>
                    </td>
                    <td data-label="Module" style={{ fontSize: '0.8rem' }}>{x.module || '—'}</td>
                    <td data-label="Taille" style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{x.taille || '—'}</td>
                    <td data-label="Statut">
                      <span className={`badge ${BADGE_BACKUP[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {x.statut === 'En cours' && <RefreshCw size={10} />}
                        {x.statut === 'Succès' && <CheckCircle size={10} />}
                        {x.statut === 'Erreur' && <AlertTriangle size={10} />}
                        {x.statut}
                      </span>
                    </td>
                    <td data-label="Créé par" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.cree_par || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Télécharger" disabled={x.statut !== 'Succès'}><Download size={13} /></button>
                        {canManage && (
                          <>
                            <button type="button" className="btn btn-secondary btn-sm" title="Restaurer" onClick={() => handleRestore(x)} disabled={x.statut !== 'Succès'}>
                              <RefreshCw size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvelle sauvegarde" width={560}>
        <BackupForm onSave={handleSave} onCancel={() => setShowModal(false)} saving={saving} />
      </Modal>
    </div>
  );
}
