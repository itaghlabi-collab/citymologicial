/**
 * BesoinFormModal.jsx — Création / édition demande de ressource
 */
import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
  BESOIN_TYPES, BESOIN_CORPS_METIERS, BESOIN_PRIORITES, EMPTY_BESOIN_FORM,
} from '../../../constants/projectBesoins';

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

export default function BesoinFormModal({
  open, onClose, onSave, saving, projet, initial = null, submitLabel = 'Enregistrer',
}) {
  const [form, setForm] = useState(EMPTY_BESOIN_FORM);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        ...EMPTY_BESOIN_FORM,
        type_besoin: initial.type_besoin || 'Ouvriers',
        corps_metier: initial.corps_metier || 'Maçon',
        specialite: initial.specialite || '',
        quantite_necessaire: initial.quantite_necessaire || 1,
        date_debut_souhaitee: initial.date_debut_souhaitee || '',
        date_fin_estimee: initial.date_fin_estimee || '',
        duree_prevue: initial.duree_prevue || '',
        priorite: initial.priorite || 'Normale',
        responsable_demande: initial.responsable_demande || '',
        description_travaux: initial.description_travaux || '',
        competences: initial.competences || '',
        epi_obligatoires: initial.epi_obligatoires || '',
        observation: initial.observation || '',
        statut: initial.statut || 'brouillon',
      });
    } else {
      setForm({
        ...EMPTY_BESOIN_FORM,
        responsable_demande: projet?.chef_projet || projet?.responsable || '',
      });
    }
  }, [open, initial, projet]);

  if (!open) return null;

  const isOuvriers = form.type_besoin === 'Ouvriers';

  async function handleSubmit(ev, submit = false) {
    ev.preventDefault();
    await onSave(form, submit);
  }

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1300 }}>
      <div className="card" style={{ width: 'min(96vw, 720px)', maxHeight: '92vh', overflow: 'auto', padding: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Demande de ressource</div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>
              {initial ? 'Modifier le besoin' : 'Ajouter un besoin'}
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
              <Label required>Type de besoin</Label>
              <select value={form.type_besoin} onChange={(e) => set('type_besoin', e.target.value)} style={IS()}>
                {BESOIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {isOuvriers && (
              <div>
                <Label required>Corps de métier</Label>
                <select value={form.corps_metier} onChange={(e) => set('corps_metier', e.target.value)} style={IS()}>
                  {BESOIN_CORPS_METIERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            {!isOuvriers && (
              <div>
                <Label>Spécialité</Label>
                <input value={form.specialite} onChange={(e) => set('specialite', e.target.value)} style={IS()} placeholder="Optionnel" />
              </div>
            )}
            <div>
              <Label required>Nombre demandé</Label>
              <input type="number" min={1} value={form.quantite_necessaire} onChange={(e) => set('quantite_necessaire', e.target.value)} style={IS()} required />
            </div>
            <div>
              <Label>Date début souhaitée</Label>
              <input type="date" value={form.date_debut_souhaitee} onChange={(e) => set('date_debut_souhaitee', e.target.value)} style={IS()} />
            </div>
            <div>
              <Label>Date fin estimée</Label>
              <input type="date" value={form.date_fin_estimee} onChange={(e) => set('date_fin_estimee', e.target.value)} style={IS()} />
            </div>
            <div>
              <Label>Durée prévue</Label>
              <input value={form.duree_prevue} onChange={(e) => set('duree_prevue', e.target.value)} style={IS()} placeholder="Ex. 3 semaines" />
            </div>
            <div>
              <Label>Priorité</Label>
              <select value={form.priorite} onChange={(e) => set('priorite', e.target.value)} style={IS()}>
                {BESOIN_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label>Chantier concerné</Label>
              <input value={projet?.nom || ''} readOnly style={IS({ background: '#F5F5F5' })} />
            </div>
            <div>
              <Label>Responsable demande</Label>
              <input value={form.responsable_demande} onChange={(e) => set('responsable_demande', e.target.value)} style={IS()} />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <div>
              <Label>Description des travaux</Label>
              <textarea rows={3} value={form.description_travaux} onChange={(e) => set('description_travaux', e.target.value)} style={{ ...IS(), resize: 'vertical' }} />
            </div>
            {isOuvriers && (
              <>
                <div>
                  <Label>Compétences particulières</Label>
                  <textarea rows={2} value={form.competences} onChange={(e) => set('competences', e.target.value)} style={{ ...IS(), resize: 'vertical' }} />
                </div>
                <div>
                  <Label>EPI obligatoires</Label>
                  <input value={form.epi_obligatoires} onChange={(e) => set('epi_obligatoires', e.target.value)} style={IS()} placeholder="Casque, gants, harnais…" />
                </div>
              </>
            )}
            <div>
              <Label>Observation</Label>
              <textarea rows={2} value={form.observation} onChange={(e) => set('observation', e.target.value)} style={{ ...IS(), resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn btn-secondary" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : null} Enregistrer brouillon
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={(e) => handleSubmit(e, true)}>
              {saving ? <Loader2 size={14} className="spin" /> : null} {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
