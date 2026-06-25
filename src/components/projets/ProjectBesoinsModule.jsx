/**
 * ProjectBesoinsModule.jsx — Besoins RH projet (chefs, ouvriers, sous-traitants)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Trash2, Send, Loader2, AlertCircle, RefreshCw, Info,
} from 'lucide-react';
import {
  BESOIN_RH_TYPES,
  BESOIN_PRIORITES,
} from '../../constants/projectBesoins';
import {
  listProjectStaffNeeds,
  upsertProjectStaffNeed,
  deleteProjectStaffNeed,
} from '../../services/projects/projectBesoins';
import { createResourceRequest } from '../../services/rh/resourceRequests';

const inputStyle = {
  padding: '8px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
};

const RH_TYPE_HINTS = {
  'Chef de chantier': 'Affectation via la fiche projet ou demande RH.',
  'Chef de projet': 'Affectation via la fiche projet ou demande RH.',
  Ouvriers: 'Affectation via l’onglet Équipe ou demande RH.',
  'Sous-traitants': 'Affectation via l’onglet Équipe ou demande RH.',
};

export default function ProjectBesoinsModule({ projet }) {
  const projectId = projet?.id;
  const projectMeta = projet ? {
    chef_projet: projet.chef_projet || '',
    chef_chantier: projet.chef_chantier || '',
  } : null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staffNeeds, setStaffNeeds] = useState([]);
  const [staffForm, setStaffForm] = useState({ fonction: BESOIN_RH_TYPES[0], quantite_necessaire: 1 });
  const [requestModal, setRequestModal] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      setStaffNeeds(await listProjectStaffNeeds(projectId, projectMeta));
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [projectId, projectMeta?.chef_projet, projectMeta?.chef_chantier]);

  useEffect(() => { load(); }, [load]);

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>
        Enregistrez le projet pour gérer les besoins en ressources humaines.
      </div>
    );
  }

  async function handleAddStaff(ev) {
    ev.preventDefault();
    setSaving(true);
    setError('');
    try {
      await upsertProjectStaffNeed(projectId, staffForm);
      await load();
      setStaffForm({ fonction: BESOIN_RH_TYPES[0], quantite_necessaire: 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitResourceRequest(ev) {
    ev.preventDefault();
    if (!requestModal) return;
    setSaving(true);
    setError('');
    try {
      await createResourceRequest({ project: projet, ...requestModal });
      setRequestModal(null);
      alert('Demande envoyée au service RH.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16,
        padding: '12px 14px', background: '#E3F2FD', borderRadius: 8, fontSize: '0.82rem', color: '#1565C0',
      }}
      >
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Matériel et consommables</strong> — utilisez le module{' '}
          <em>Inventaire &amp; Dépôt → Demandes chantier</em> pour centraliser toutes les demandes de matériel.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Ressources humaines
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} /> Actualiser
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
        <>
          <form onSubmit={handleAddStaff} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Type de besoin</label>
              <select value={staffForm.fonction} onChange={(e) => setStaffForm((p) => ({ ...p, fonction: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }}>
                {BESOIN_RH_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Quantité nécessaire</label>
              <input type="number" min={0} value={staffForm.quantite_necessaire} onChange={(e) => setStaffForm((p) => ({ ...p, quantite_necessaire: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}><Plus size={13} /> Ajouter besoin</button>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type de besoin</th>
                  <th>Qté nécessaire</th>
                  <th>Qté affectée</th>
                  <th>Manque</th>
                  <th>Ressources affectées</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffNeeds.length === 0 ? (
                  <tr><td colSpan={7} style={{ color: 'var(--text-3)', textAlign: 'center' }}>Aucun besoin RH défini pour ce projet.</td></tr>
                ) : staffNeeds.map((n) => (
                  <tr key={n.id}>
                    <td data-label="Type">
                      <div style={{ fontWeight: 600 }}>{n.fonction}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{RH_TYPE_HINTS[n.fonction]}</div>
                    </td>
                    <td data-label="Qté nécessaire">{n.quantite_necessaire}</td>
                    <td data-label="Qté affectée">{n.quantite_affectee}</td>
                    <td data-label="Manque" style={{ fontWeight: 700, color: n.manque > 0 ? 'var(--red)' : 'inherit' }}>{n.manque}</td>
                    <td data-label="Ressources" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
                      {(n.ressources_affectees || n.ouvriers_affectes || []).length
                        ? (n.ressources_affectees || n.ouvriers_affectes).join(', ')
                        : '—'}
                    </td>
                    <td data-label="Statut"><span className={`badge ${n.statutBadge}`}>{n.statutLabel}</span></td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {n.manque > 0 && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setRequestModal({
                            fonction: n.fonction,
                            quantite: n.manque || 1,
                            date_souhaitee: '',
                            priorite: 'Normale',
                            commentaire: '',
                          })}
                          >
                            <Send size={12} /> Demander
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--red)' }}
                          onClick={() => deleteProjectStaffNeed(n.id, projectId, projectMeta).then(load)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {requestModal && (
        <div className="rh-emp-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Demander des ressources RH</h3>
            <form onSubmit={submitResourceRequest}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><strong>Besoin :</strong> {requestModal.fonction}</div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700 }}>Quantité</label>
                  <input type="number" min={1} value={requestModal.quantite} onChange={(e) => setRequestModal((p) => ({ ...p, quantite: e.target.value }))} style={inputStyle} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700 }}>Date souhaitée</label>
                  <input type="date" value={requestModal.date_souhaitee} onChange={(e) => setRequestModal((p) => ({ ...p, date_souhaitee: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700 }}>Priorité</label>
                  <select value={requestModal.priorite} onChange={(e) => setRequestModal((p) => ({ ...p, priorite: e.target.value }))} style={inputStyle}>
                    {BESOIN_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700 }}>Commentaire</label>
                  <textarea value={requestModal.commentaire} onChange={(e) => setRequestModal((p) => ({ ...p, commentaire: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRequestModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Send size={13} /> Envoyer à la RH</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
