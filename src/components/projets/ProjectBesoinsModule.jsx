/**
 * ProjectBesoinsModule.jsx — Besoins chantier (RH, matériels, matériaux)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Wrench, Package, Plus, Trash2, Send, Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BESOIN_MODULE_TABS,
  BESOIN_FONCTIONS,
  BESOIN_PRIORITES,
} from '../../constants/projectBesoins';
import {
  listProjectStaffNeeds,
  upsertProjectStaffNeed,
  deleteProjectStaffNeed,
  listProjectEquipmentNeeds,
  saveProjectEquipmentNeed,
  deleteProjectEquipmentNeed,
  listProjectMaterialNeeds,
  saveProjectMaterialNeed,
  deleteProjectMaterialNeed,
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

export default function ProjectBesoinsModule({ projet }) {
  const projectId = projet?.id;
  const [tab, setTab] = useState('rh');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [staffNeeds, setStaffNeeds] = useState([]);
  const [equipmentNeeds, setEquipmentNeeds] = useState([]);
  const [materialNeeds, setMaterialNeeds] = useState([]);

  const [staffForm, setStaffForm] = useState({ fonction: BESOIN_FONCTIONS[0], quantite_necessaire: 1 });
  const [equipForm, setEquipForm] = useState({ equipement: '', quantite_necessaire: 1, quantite_disponible: 0 });
  const [matForm, setMatForm] = useState({ materiau: '', quantite_necessaire: '', unite: 'u', devis_ref: '', notes: '' });
  const [requestModal, setRequestModal] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [staff, equip, mat] = await Promise.all([
        listProjectStaffNeeds(projectId),
        listProjectEquipmentNeeds(projectId),
        listProjectMaterialNeeds(projectId),
      ]);
      setStaffNeeds(staff);
      setEquipmentNeeds(equip);
      setMaterialNeeds(mat);
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (!projectId) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.88rem' }}>
        Enregistrez le projet pour gérer les besoins chantier.
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
      setStaffForm({ fonction: BESOIN_FONCTIONS[0], quantite_necessaire: 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestResources(need) {
    setRequestModal({
      fonction: need.fonction,
      quantite: need.manque || 1,
      date_souhaitee: '',
      priorite: 'Normale',
      commentaire: '',
    });
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {BESOIN_MODULE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.78rem' }}
            onClick={() => setTab(t.id)}
          >
            {t.id === 'rh' && <Users size={13} />}
            {t.id === 'materiels' && <Wrench size={13} />}
            {t.id === 'materiaux' && <Package size={13} />}
            {t.label}
          </button>
        ))}
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
          {tab === 'rh' && (
            <>
              <form onSubmit={handleAddStaff} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Fonction</label>
                  <select value={staffForm.fonction} onChange={(e) => setStaffForm((p) => ({ ...p, fonction: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }}>
                    {BESOIN_FONCTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
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
                      <th>Fonction</th>
                      <th>Qté nécessaire</th>
                      <th>Qté affectée</th>
                      <th>Manque</th>
                      <th>Ouvriers affectés</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffNeeds.length === 0 ? (
                      <tr><td colSpan={7} style={{ color: 'var(--text-3)', textAlign: 'center' }}>Aucun besoin RH défini.</td></tr>
                    ) : staffNeeds.map((n) => (
                      <tr key={n.id}>
                        <td data-label="Fonction" style={{ fontWeight: 600 }}>{n.fonction}</td>
                        <td data-label="Qté nécessaire">{n.quantite_necessaire}</td>
                        <td data-label="Qté affectée">{n.quantite_affectee}</td>
                        <td data-label="Manque" style={{ fontWeight: 700, color: n.manque > 0 ? 'var(--red)' : 'inherit' }}>{n.manque}</td>
                        <td data-label="Ouvriers" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
                          {(n.ouvriers_affectes || []).length ? n.ouvriers_affectes.join(', ') : '—'}
                        </td>
                        <td data-label="Statut"><span className={`badge ${n.statutBadge}`}>{n.statutLabel}</span></td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {n.manque > 0 && (
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleRequestResources(n)}>
                                <Send size={12} /> Demander
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteProjectStaffNeed(n.id, projectId).then(load)}>
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

          {tab === 'materiels' && (
            <>
              <form onSubmit={async (ev) => {
                ev.preventDefault();
                setSaving(true);
                try {
                  await saveProjectEquipmentNeed(projectId, equipForm);
                  await load();
                  setEquipForm({ equipement: '', quantite_necessaire: 1, quantite_disponible: 0 });
                } catch (err) { setError(err.message); }
                finally { setSaving(false); }
              }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Équipement</label>
                  <input value={equipForm.equipement} onChange={(e) => setEquipForm((p) => ({ ...p, equipement: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} placeholder="Grue, Bétonnière…" required />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Qté nécessaire</label>
                  <input type="number" min={0} value={equipForm.quantite_necessaire} onChange={(e) => setEquipForm((p) => ({ ...p, quantite_necessaire: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Disponible</label>
                  <input type="number" min={0} value={equipForm.quantite_disponible} onChange={(e) => setEquipForm((p) => ({ ...p, quantite_disponible: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}><Plus size={13} /> Ajouter</button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Équipement</th><th>Nécessaire</th><th>Disponible</th><th>Manque</th><th></th></tr>
                  </thead>
                  <tbody>
                    {equipmentNeeds.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: 'var(--text-3)', textAlign: 'center' }}>Aucun équipement enregistré.</td></tr>
                    ) : equipmentNeeds.map((e) => (
                      <tr key={e.id}>
                        <td data-label="Équipement" style={{ fontWeight: 600 }}>{e.equipement}</td>
                        <td data-label="Nécessaire">{e.quantite_necessaire}</td>
                        <td data-label="Disponible">{e.quantite_disponible}</td>
                        <td data-label="Manque" style={{ fontWeight: 700, color: e.manque > 0 ? 'var(--red)' : 'inherit' }}>{e.manque}</td>
                        <td><button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteProjectEquipmentNeed(e.id, projectId).then(load)}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'materiaux' && (
            <>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginBottom: 12 }}>
                Structure préparée pour une future intégration avec les devis et les achats.
              </p>
              <form onSubmit={async (ev) => {
                ev.preventDefault();
                setSaving(true);
                try {
                  await saveProjectMaterialNeed(projectId, matForm);
                  await load();
                  setMatForm({ materiau: '', quantite_necessaire: '', unite: 'u', devis_ref: '', notes: '' });
                } catch (err) { setError(err.message); }
                finally { setSaving(false); }
              }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 16, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Matériau</label>
                  <input value={matForm.materiau} onChange={(e) => setMatForm((p) => ({ ...p, materiau: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Quantité</label>
                  <input value={matForm.quantite_necessaire} onChange={(e) => setMatForm((p) => ({ ...p, quantite_necessaire: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Unité</label>
                  <input value={matForm.unite} onChange={(e) => setMatForm((p) => ({ ...p, unite: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Réf. devis</label>
                  <input value={matForm.devis_ref} onChange={(e) => setMatForm((p) => ({ ...p, devis_ref: e.target.value }))} style={{ ...inputStyle, marginTop: 4 }} placeholder="Futur lien devis" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}><Plus size={13} /> Ajouter</button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Matériau</th><th>Quantité</th><th>Unité</th><th>Réf. devis</th><th>Statut</th><th></th></tr>
                  </thead>
                  <tbody>
                    {materialNeeds.length === 0 ? (
                      <tr><td colSpan={6} style={{ color: 'var(--text-3)', textAlign: 'center' }}>Aucun matériau enregistré.</td></tr>
                    ) : materialNeeds.map((m) => (
                      <tr key={m.id}>
                        <td data-label="Matériau" style={{ fontWeight: 600 }}>{m.materiau}</td>
                        <td data-label="Quantité">{m.quantite_necessaire}</td>
                        <td data-label="Unité">{m.unite}</td>
                        <td data-label="Devis">{m.devis_ref || '—'}</td>
                        <td data-label="Statut"><span className="badge badge-grey">{m.statut}</span></td>
                        <td><button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteProjectMaterialNeed(m.id, projectId).then(load)}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {requestModal && (
        <div className="rh-emp-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>Demander des ressources</h3>
            <form onSubmit={submitResourceRequest}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><strong>Fonction :</strong> {requestModal.fonction}</div>
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
