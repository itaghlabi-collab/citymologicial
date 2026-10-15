import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  FAB_STATUTS_MAJ, fabLinePercent, fabLinesPercent, fabUniteLabel, fabFmtQty, fabAtelierFullLabel, todayISO,
} from '../../constants/fabrication';
import { FabModal, FabField, FabProgress, FAB_INPUT, FAB_SELECT, FAB_TEXTAREA } from './shared';

/** Mise à jour de l'avancement par désignation : réalisée / demandée × 100. */
export default function ProgressUpdateModal({ open, onClose, production, onSubmit, saving }) {
  const [realisees, setRealisees] = useState({});
  const [statut, setStatut] = useState('en_fabrication');
  const [statutTouched, setStatutTouched] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [probleme, setProbleme] = useState('');
  const [motif, setMotif] = useState('');
  const [dateSaisie, setDateSaisie] = useState(todayISO());
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !production) return;
    const init = {};
    (production.lines || []).forEach((l) => { init[l.id] = String(l.quantite_realisee ?? 0); });
    setRealisees(init);
    setStatut(['a_lancer', 'plan_recu', 'brouillon'].includes(production.statut) ? 'en_fabrication' : production.statut);
    setStatutTouched(false);
    setCommentaire('');
    setProbleme('');
    setMotif(production.motif_blocage || '');
    setDateSaisie(todayISO());
    setPhotos([]);
    setError('');
  }, [open, production]);

  const previewLines = useMemo(() => (production?.lines || []).map((l) => ({
    ...l,
    quantite_realisee: Number(realisees[l.id] ?? l.quantite_realisee) || 0,
  })), [production, realisees]);

  const globalPct = fabLinesPercent(previewLines) ?? 0;

  useEffect(() => {
    if (!open || statutTouched) return;
    if (globalPct === 100) setStatut('termine');
    else if (production && statut === 'termine') setStatut('en_fabrication');
  }, [globalPct, open, statutTouched, production, statut]);

  async function handleSubmit(e) {
    e.preventDefault();
    for (const l of previewLines) {
      if (l.quantite_realisee < 0) { setError('Les quantités réalisées doivent être positives.'); return; }
    }
    if (statut === 'bloque' && !motif.trim()) { setError('Le motif du blocage est obligatoire.'); return; }
    const result = await onSubmit(production.id, {
      lineUpdates: previewLines.map((l) => ({ line_id: l.id, quantite_realisee: l.quantite_realisee })),
      statut,
      commentaire,
      probleme,
      motif_blocage: motif,
      date_saisie: dateSaisie,
      photos,
    });
    if (!result?.success) {
      setError(result?.error || 'Erreur mise à jour.');
      return;
    }
    onClose();
  }

  if (!production) return null;

  return (
    <FabModal open={open} onClose={onClose} title={`Avancement — ${production.reference}`} width={760}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>{production.projet_nom}</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>{production.designation}</div>
        </div>

        <div className="fab-section-title">Quantités par désignation</div>
        {previewLines.map((l) => {
          const restante = Math.max(0, l.quantite - l.quantite_realisee);
          const unit = fabUniteLabel(l.unite, l.unite_autre);
          return (
            <div key={l.id} className="fab-line-card">
              <div className="fab-line-head">
                <strong>{l.designation}</strong>
                <span className="fab-card-meta" style={{ margin: 0 }}>{fabAtelierFullLabel(l.atelier, l.machine_type)}</span>
              </div>
              <div className="fab-progress-grid">
                <div><span>Demandée</span><strong>{fabFmtQty(l.quantite)} {unit}</strong></div>
                <FabField label={`Réalisée (cumul, ${unit})`}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={FAB_INPUT}
                    value={realisees[l.id] ?? ''}
                    onChange={(e) => setRealisees((r) => ({ ...r, [l.id]: e.target.value }))}
                  />
                </FabField>
                <div><span>Restante</span><strong>{fabFmtQty(restante)} {unit}</strong></div>
                <div style={{ minWidth: 140 }}><span>Avancement</span><FabProgress value={fabLinePercent(l)} /></div>
              </div>
            </div>
          );
        })}

        <div className="fab-card-meta" style={{ margin: '4px 0 12px' }}>
          Avancement global (moyenne des désignations) : <strong>{globalPct} %</strong>
        </div>

        <div className="fab-form-grid">
          <FabField label="Statut">
            <select style={FAB_SELECT} value={statut} onChange={(e) => { setStatut(e.target.value); setStatutTouched(true); }}>
              {FAB_STATUTS_MAJ.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FabField>
          <FabField label="Date">
            <input type="date" style={FAB_INPUT} value={dateSaisie} onChange={(e) => setDateSaisie(e.target.value)} />
          </FabField>
          {statut === 'bloque' ? (
            <div className="fab-span-2">
              <FabField label="Motif du blocage" required>
                <textarea style={FAB_TEXTAREA} value={motif} onChange={(e) => setMotif(e.target.value)} />
              </FabField>
            </div>
          ) : null}
          <div className="fab-span-2">
            <FabField label="Commentaire">
              <textarea style={{ ...FAB_TEXTAREA, minHeight: 60 }} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
            </FabField>
          </div>
          <div className="fab-span-2">
            <FabField label="Problème rencontré">
              <textarea style={{ ...FAB_TEXTAREA, minHeight: 60 }} value={probleme} onChange={(e) => setProbleme(e.target.value)} />
            </FabField>
          </div>
          <div className="fab-span-2">
            <FabField label="Photos">
              <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', gap: 6, cursor: 'pointer' }}>
                <Plus size={14} /> Ajouter photo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => setPhotos((prev) => [...prev, ...Array.from(e.target.files || [])])}
                />
              </label>
              {photos.length ? (
                <div style={{ fontSize: '0.8rem', marginTop: 6, color: 'var(--text-2)' }}>
                  {photos.length} photo{photos.length > 1 ? 's' : ''} à envoyer
                </div>
              ) : null}
            </FabField>
          </div>
        </div>

        {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 10 }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={14} /> : null} Enregistrer
          </button>
        </div>
      </form>
    </FabModal>
  );
}
