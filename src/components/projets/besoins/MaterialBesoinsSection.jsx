/**
 * MaterialBesoinsSection.jsx — Bloc « Besoins matériaux » (fiche déclarative)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Eye, Edit2, Trash2, Download, Send, Loader2, RefreshCw, AlertCircle, Layers,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import {
  canEditMaterialBesoin,
  canSubmitMaterialBesoin,
} from '../../../constants/projectMaterialBesoins';
import {
  listProjectMaterialBesoins,
  createProjectMaterialBesoin,
  updateProjectMaterialBesoin,
  submitProjectMaterialBesoin,
  deleteProjectMaterialBesoin,
  getProjectMaterialBesoin,
} from '../../../services/projects/projectMaterialBesoins';
import { generateMaterialBesoinPdf } from '../../../services/projects/projectMaterialBesoinPdf';
import MaterialBesoinFormModal from './MaterialBesoinFormModal';
import MaterialBesoinDetailModal from './MaterialBesoinDetailModal';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function demandeurLabel(user, projet) {
  const meta = user?.user_metadata || {};
  const fromUser = [meta.prenom, meta.nom].filter(Boolean).join(' ').trim()
    || meta.full_name
    || user?.email?.split('@')[0];
  return fromUser || projet?.chef_projet || projet?.chef_chantier || '';
}

export default function MaterialBesoinsSection({ projet }) {
  const { user } = useAuth();
  const projectId = projet?.id;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      setItems(await listProjectMaterialBesoins(projectId));
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form, submit = false) {
    setSaving(true);
    setError('');
    try {
      if (editItem?.id) {
        await updateProjectMaterialBesoin(editItem.id, form, { submit });
      } else {
        await createProjectMaterialBesoin(projectId, form, projet, { submit });
      }
      setFormOpen(false);
      setEditItem(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(item) {
    try {
      setDetailItem(await getProjectMaterialBesoin(item.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAction(action, item) {
    setError('');
    try {
      switch (action) {
        case 'view':
          await openDetail(item);
          break;
        case 'edit':
          setEditItem(item);
          setFormOpen(true);
          break;
        case 'pdf':
          await generateMaterialBesoinPdf(item, projet);
          break;
        case 'submit':
          await submitProjectMaterialBesoin(item.id);
          if (detailItem?.id === item.id) setDetailItem(await getProjectMaterialBesoin(item.id));
          await load();
          break;
        case 'delete':
          if (!window.confirm('Supprimer cette fiche de besoin matériaux ?')) return;
          await deleteProjectMaterialBesoin(item.id);
          if (detailItem?.id === item.id) setDetailItem(null);
          await load();
          break;
        default:
          break;
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
        >
          <Layers size={14} /> Besoins matériaux
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 4 }}>
          Fiche déclarative des matériaux nécessaires au chantier.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> Actualiser
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setEditItem(null); setFormOpen(true); }}>
          <Plus size={13} /> Ajouter un besoin matériaux
        </button>
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>
          <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> Chargement…
        </div>
      ) : (
        <div className="table-wrap">
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Date</th>
                <th>Lot</th>
                <th>Nb lignes</th>
                <th>Qté globale</th>
                <th>Priorité</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>
                    Aucune fiche — cliquez sur « Ajouter un besoin matériaux » pour déclarer les matériaux du chantier.
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Référence" style={{ fontWeight: 700, color: 'var(--red)' }}>{item.ref_besoin || '—'}</td>
                  <td data-label="Date">{fmtDate(item.date_besoin)}</td>
                  <td data-label="Lot">{item.lot_label}</td>
                  <td data-label="Nb lignes">{item.line_count}</td>
                  <td data-label="Qté globale">{item.quantite_globale}</td>
                  <td data-label="Priorité">
                    <span className={`badge ${item.priorite === 'Urgente' ? 'badge-orange' : 'badge-blue'}`}>{item.priorite}</span>
                  </td>
                  <td data-label="Statut">
                    <span className={`badge ${item.statutBadge}`}>{item.statutLabel}</span>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => handleAction('view', item)}><Eye size={13} /></button>
                      {canEditMaterialBesoin(item) && (
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => handleAction('edit', item)}><Edit2 size={13} /></button>
                      )}
                      {canSubmitMaterialBesoin(item) && (
                        <button type="button" className="btn btn-primary btn-sm" title="Soumettre" onClick={() => handleAction('submit', item)}><Send size={13} /></button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" title="PDF" onClick={() => handleAction('pdf', item)}><Download size={13} /></button>
                      <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" style={{ color: 'var(--red)' }} onClick={() => handleAction('delete', item)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MaterialBesoinFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditItem(null); }}
        onSave={handleSave}
        saving={saving}
        projet={projet}
        initial={editItem}
        demandeurName={demandeurLabel(user, projet)}
      />

      <MaterialBesoinDetailModal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        projet={projet}
        onPdf={(n) => generateMaterialBesoinPdf(n, projet)}
        onEdit={(n) => { setDetailItem(null); setEditItem(n); setFormOpen(true); }}
        onDelete={(n) => handleAction('delete', n)}
        onSubmit={(n) => handleAction('submit', n)}
      />
    </div>
  );
}
