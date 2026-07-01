/**
 * MaterialBesoinFormModal.jsx — Création / édition fiche besoins matériaux
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  MATERIAL_BESOIN_LOTS,
  MATERIAL_BESOIN_PRIORITES,
  MATERIAL_BESOIN_UNITES,
  EMPTY_MATERIAL_BESOIN_FORM,
  EMPTY_MATERIAL_BESOIN_LINE,
} from '../../../constants/projectMaterialBesoins';

const IS = (extra = {}) => ({
  padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 6,
  fontSize: '0.86rem', width: '100%', boxSizing: 'border-box', background: '#fff', ...extra,
});

function Label({ children, required }) {
  return (
    <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
      {children}{required && <span style={{ color: 'var(--red)' }}> *</span>}
    </label>
  );
}

export default function MaterialBesoinFormModal({
  open, onClose, onSave, saving, projet, initial = null, demandeurName = '',
}) {
  const [form, setForm] = useState(EMPTY_MATERIAL_BESOIN_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        date_besoin: initial.date_besoin || new Date().toISOString().slice(0, 10),
        priorite: initial.priorite || 'Normale',
        observation: initial.observation || '',
        demandeur_name: initial.demandeur_name || demandeurName,
        lines: (initial.lines?.length ? initial.lines : [{ ...EMPTY_MATERIAL_BESOIN_LINE }]).map((l) => ({
          designation: l.designation || '',
          quantite: l.quantite ?? '',
          unite: l.unite || 'sac',
          lot: l.lot || 'Gros œuvre',
          date_souhaitee: l.date_souhaitee || '',
          observation: l.observation || '',
        })),
      });
    } else {
      setForm({
        ...EMPTY_MATERIAL_BESOIN_FORM,
        demandeur_name: demandeurName || projet?.chef_projet || projet?.chef_chantier || '',
      });
    }
  }, [open, initial, projet, demandeurName]);

  if (!open) return null;

  function setLine(idx, key, value) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    }));
  }

  function addLine() {
    setForm((p) => ({ ...p, lines: [...p.lines, { ...EMPTY_MATERIAL_BESOIN_LINE }] }));
  }

  function removeLine(idx) {
    setForm((p) => ({
      ...p,
      lines: p.lines.length <= 1 ? p.lines : p.lines.filter((_, i) => i !== idx),
    }));
  }

  async function handleSubmit(ev, submit = false) {
    ev.preventDefault();
    await onSave(form, submit);
  }

  const projectLabel = [projet?.ref, projet?.nom].filter(Boolean).join(' — ') || '—';

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1300 }}>
      <div className="card" style={{ width: 'min(98vw, 920px)', maxHeight: '92vh', overflow: 'auto', padding: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Besoins matériaux</div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>
              {initial ? 'Modifier la fiche' : 'Ajouter un besoin matériaux'}
            </h3>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose}><X size={20} /></button>
        </header>

        <form onSubmit={(e) => handleSubmit(e, false)} style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Informations générales
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <Label>Projet lié</Label>
              <input value={projectLabel} readOnly style={IS({ background: 'var(--surface-2)' })} />
            </div>
            <div>
              <Label>Demandeur</Label>
              <input value={form.demandeur_name || ''} onChange={(e) => set('demandeur_name', e.target.value)} style={IS()} />
            </div>
            <div>
              <Label required>Date du besoin</Label>
              <input type="date" value={form.date_besoin || ''} onChange={(e) => set('date_besoin', e.target.value)} style={IS()} />
            </div>
            <div>
              <Label required>Priorité</Label>
              <select value={form.priorite} onChange={(e) => set('priorite', e.target.value)} style={IS()}>
                {MATERIAL_BESOIN_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Lignes matériaux
          </div>

          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Quantité</th>
                  <th>Unité</th>
                  <th>Lot</th>
                  <th>Date souhaitée</th>
                  <th>Observation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        value={line.designation}
                        onChange={(e) => setLine(idx, 'designation', e.target.value)}
                        placeholder="ciment, sable, câbles…"
                        style={IS({ fontSize: '0.8rem' })}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <input type="number" min="0" step="any" value={line.quantite} onChange={(e) => setLine(idx, 'quantite', e.target.value)} style={IS({ fontSize: '0.8rem' })} />
                    </td>
                    <td style={{ width: 100 }}>
                      <select value={line.unite} onChange={(e) => setLine(idx, 'unite', e.target.value)} style={IS({ fontSize: '0.8rem' })}>
                        {MATERIAL_BESOIN_UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 130 }}>
                      <select value={line.lot} onChange={(e) => setLine(idx, 'lot', e.target.value)} style={IS({ fontSize: '0.8rem' })}>
                        {MATERIAL_BESOIN_LOTS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 130 }}>
                      <input type="date" value={line.date_souhaitee || ''} onChange={(e) => setLine(idx, 'date_souhaitee', e.target.value)} style={IS({ fontSize: '0.8rem' })} />
                    </td>
                    <td>
                      <input value={line.observation || ''} onChange={(e) => setLine(idx, 'observation', e.target.value)} style={IS({ fontSize: '0.8rem' })} />
                    </td>
                    <td style={{ width: 44 }}>
                      <button type="button" className="btn btn-ghost btn-sm" title="Supprimer la ligne" onClick={() => removeLine(idx)} style={{ color: 'var(--red)' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} style={{ marginBottom: 16 }}>
            <Plus size={13} /> Ajouter une ligne
          </button>

          <div style={{ marginBottom: 20 }}>
            <Label>Observation / précision chantier</Label>
            <textarea value={form.observation || ''} onChange={(e) => set('observation', e.target.value)} rows={3} style={{ ...IS(), resize: 'vertical', minHeight: 72 }} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn btn-secondary" disabled={saving}>
              {saving ? <Loader2 size={14} className="cin-spin" /> : null} Enregistrer brouillon
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={(e) => handleSubmit(e, true)}>
              {saving ? <Loader2 size={14} className="cin-spin" /> : null} Soumettre
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
