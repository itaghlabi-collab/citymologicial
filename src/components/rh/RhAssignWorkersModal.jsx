/**
 * RhAssignWorkersModal.jsx — Affectation ouvriers par la Chargée RH
 */
import { useState, useMemo, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { listWorkers } from '../../services/rh/workers';
import { workerFullName } from '../../services/rh/attendance';
import { normBesoinFonction } from '../../constants/projectBesoins';

const IS = { padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: '0.84rem', width: '100%', boxSizing: 'border-box' };

function workerVille(w) {
  const a = w.adresse || w.ville_naissance || '';
  const parts = a.split(/[,;]/);
  return (parts[parts.length - 1] || a).trim().slice(0, 40) || '—';
}

function workerDisponible(w, projectId) {
  const ids = w.assigned_project_ids || [];
  const onThis = ids.includes(String(projectId));
  const others = ids.filter((id) => String(id) !== String(projectId));
  if (onThis) return { label: 'Sur ce chantier', ok: true };
  if (others.length > 0) return { label: 'Occupé', ok: false };
  return { label: 'Disponible', ok: true };
}

function matchFonction(workerFonction, targetFonction) {
  const f = (targetFonction || '').trim();
  if (!f || f === 'Ouvriers') return true;
  return normBesoinFonction(workerFonction) === normBesoinFonction(f)
    || normBesoinFonction(workerFonction).includes(normBesoinFonction(f));
}

export default function RhAssignWorkersModal({
  open, onClose, request, initialSelected = [], onConfirm, saving = false,
}) {
  const [workers, setWorkers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    search: '', fonction: '', dispo: '', ville: '', qualification: '',
  });

  const projectId = request?.project_id;
  const targetFonction = request?.fonction || '';

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    listWorkers()
      .then((all) => setWorkers(all || []))
      .finally(() => setLoading(false));
    setSelected(new Set((initialSelected || []).map(String)));
  }, [open, projectId, initialSelected]);

  const fonctions = useMemo(() => {
    const s = new Set((workers || []).map((w) => w.fonction).filter(Boolean));
    return [...s].sort();
  }, [workers]);

  const filtered = useMemo(() => (workers || []).filter((w) => {
    if (w.statut === 'inactif') return false;
    if (!matchFonction(w.fonction, targetFonction)) return false;
    const name = workerFullName(w).toLowerCase();
    const q = filters.search.toLowerCase().trim();
    if (q && !name.includes(q) && !(w.fonction || '').toLowerCase().includes(q)) return false;
    if (filters.fonction && w.fonction !== filters.fonction) return false;
    const disp = workerDisponible(w, projectId);
    if (filters.dispo === 'dispo' && !disp.ok) return false;
    if (filters.dispo === 'occupe' && disp.ok) return false;
    if (filters.ville && !workerVille(w).toLowerCase().includes(filters.ville.toLowerCase())) return false;
    if (filters.qualification && (w.experience || '') !== filters.qualification) return false;
    return true;
  }), [workers, filters, targetFonction, projectId]);

  function toggle(id) {
    const sid = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  function selectFirst(n) {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.slice(0, n).forEach((w) => next.add(String(w.id)));
      return next;
    });
  }

  async function handleConfirm() {
    await onConfirm?.([...selected]);
  }

  if (!open || !request) return null;

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1400 }}>
      <div className="card" style={{ width: 'min(98vw, 960px)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Affectation RH</div>
            <h3 style={{ margin: 0, fontWeight: 800, fontFamily: 'var(--font-head)' }}>
              {request.ref} — {request.fonction} ({request.quantite} demandé)
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{request.project_name}</div>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          <div style={{ position: 'relative', gridColumn: 'span 2' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--text-3)' }} />
            <input value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} placeholder="Rechercher…" style={{ ...IS, paddingLeft: 28 }} />
          </div>
          <select value={filters.fonction} onChange={(e) => setFilters((p) => ({ ...p, fonction: e.target.value }))} style={IS}>
            <option value="">Toutes fonctions</option>
            {fonctions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={filters.dispo} onChange={(e) => setFilters((p) => ({ ...p, dispo: e.target.value }))} style={IS}>
            <option value="">Disponibilité</option>
            <option value="dispo">Disponible</option>
            <option value="occupe">Occupé ailleurs</option>
          </select>
          <input value={filters.ville} onChange={(e) => setFilters((p) => ({ ...p, ville: e.target.value }))} placeholder="Ville" style={IS} />
          <select value={filters.qualification} onChange={(e) => setFilters((p) => ({ ...p, qualification: e.target.value }))} style={IS}>
            <option value="">Qualification</option>
            <option value="debutant">Débutant</option>
            <option value="intermediaire">Intermédiaire</option>
            <option value="expert">Expert</option>
          </select>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} className="spin" /></div>
          ) : (
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: '#FAFAFA' }}>
                  <th style={{ width: 36, padding: 8 }} />
                  <th style={{ textAlign: 'left', padding: 8 }}>Nom</th>
                  <th style={{ padding: 8 }}>Fonction</th>
                  <th style={{ padding: 8 }}>Disponibilité</th>
                  <th style={{ padding: 8 }}>Projet actuel</th>
                  <th style={{ padding: 8 }}>Ville</th>
                  <th style={{ padding: 8 }}>Téléphone</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Aucun ouvrier trouvé.</td></tr>
                ) : filtered.map((w) => {
                  const disp = workerDisponible(w, projectId);
                  const checked = selected.has(String(w.id));
                  const otherProjects = (w.assigned_project_ids || []).filter((id) => String(id) !== String(projectId)).length;
                  return (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)', background: checked ? '#FFF5F5' : 'transparent' }}>
                      <td style={{ padding: 8 }}><input type="checkbox" checked={checked} onChange={() => toggle(w.id)} /></td>
                      <td style={{ padding: 8, fontWeight: 700 }}>{workerFullName(w)}</td>
                      <td style={{ padding: 8 }}>{w.fonction || '—'}</td>
                      <td style={{ padding: 8 }}><span className={`badge ${disp.ok ? 'badge-green' : 'badge-orange'}`}>{disp.label}</span></td>
                      <td style={{ padding: 8 }}>{otherProjects > 0 ? `${otherProjects} autre(s)` : checked ? 'Ce chantier' : '—'}</td>
                      <td style={{ padding: 8 }}>{workerVille(w)}</td>
                      <td style={{ padding: 8 }}>{w.telephone || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectFirst(5)}>+ 5</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectFirst(10)}>+ 10</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectFirst(20)}>+ 20</button>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginLeft: 8 }}>
              {selected.size} / {request.quantite} sélectionné(s)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={saving || selected.size === 0}>
              {saving ? <Loader2 size={14} className="spin" /> : null} Valider affectation
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
