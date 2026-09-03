import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Plus } from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_PRIORITES,
  FAB_STATUTS_MAJ,
  FAB_AVANCEMENT_PRESETS,
  fabStatutMeta,
  fabOnTimeLabel,
} from '../../constants/fabrication';
import {
  FabModal, FabField, FabBadge, FabProgress, fmtDate, fmtDateTime, planFile, planPhotos,
  FAB_INPUT, FAB_SELECT, FAB_TEXTAREA, fabAtelierLabel,
} from './shared';

export function AffecterAtelierModal({ open, onClose, plan, users, onSubmit, saving }) {
  const [atelier, setAtelier] = useState('');
  const [chefId, setChefId] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [priorite, setPriorite] = useState('normale');
  const [consigne, setConsigne] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !plan) return;
    setAtelier(plan.atelier || '');
    setChefId(plan.chef_atelier_user_id || '');
    setDebut(plan.date_debut_prevue || '');
    setFin(plan.date_fin_prevue || '');
    setPriorite(plan.priorite || 'normale');
    setConsigne(plan.consigne || '');
    setError('');
  }, [open, plan]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!atelier) { setError('L’atelier est obligatoire.'); return; }
    if (!chefId) { setError('Le chef d’atelier est obligatoire.'); return; }
    if (!fin) { setError('La date prévue de fin est obligatoire.'); return; }
    const chef = users.find((u) => u.id === chefId);
    const result = await onSubmit(plan.id, {
      atelier,
      chef_atelier_user_id: chefId,
      chef_atelier_nom: chef?.nom || '',
      date_debut_prevue: debut,
      date_fin_prevue: fin,
      priorite,
      consigne,
    });
    if (!result?.success) {
      setError(result?.error || 'Erreur affectation.');
      return;
    }
    onClose();
  }

  const file = planFile(plan);

  return (
    <FabModal open={open} onClose={onClose} title="Affecter à l’atelier" width={640}>
      {plan ? (
        <form onSubmit={handleSubmit}>
          <div className="fab-form-grid">
            <FabField label="Projet">
              <input style={FAB_INPUT} value={plan.projet_nom} readOnly disabled />
            </FabField>
            <FabField label="Désignation">
              <input style={FAB_INPUT} value={plan.designation} readOnly disabled />
            </FabField>
            <div className="fab-span-2">
              <FabField label="Plan">
                {file?.url ? (
                  <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', gap: 6 }}>
                    <ExternalLink size={13} /> {file.file_name || 'Ouvrir le plan'}
                  </a>
                ) : <span style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun fichier</span>}
              </FabField>
            </div>
            <FabField label="Atelier" required>
              <select style={FAB_SELECT} value={atelier} onChange={(e) => setAtelier(e.target.value)}>
                <option value="">— Choisir —</option>
                {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </FabField>
            <FabField label="Chef d’atelier" required>
              <select style={FAB_SELECT} value={chefId} onChange={(e) => setChefId(e.target.value)}>
                <option value="">— Choisir —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
              </select>
            </FabField>
            <FabField label="Date prévue de début">
              <input type="date" style={FAB_INPUT} value={debut} onChange={(e) => setDebut(e.target.value)} />
            </FabField>
            <FabField label="Date prévue de fin" required>
              <input type="date" style={FAB_INPUT} value={fin} onChange={(e) => setFin(e.target.value)} />
            </FabField>
            <FabField label="Priorité">
              <select style={FAB_SELECT} value={priorite} onChange={(e) => setPriorite(e.target.value)}>
                {FAB_PRIORITES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </FabField>
            <div className="fab-span-2">
              <FabField label="Commentaire / consigne">
                <textarea style={FAB_TEXTAREA} value={consigne} onChange={(e) => setConsigne(e.target.value)} />
              </FabField>
            </div>
          </div>
          {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 10 }}>{error}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} /> : null} Affecter à l’atelier
            </button>
          </div>
        </form>
      ) : null}
    </FabModal>
  );
}

export function MajProductionModal({ open, onClose, plan, onSubmit, saving }) {
  const [avancement, setAvancement] = useState(0);
  const [statut, setStatut] = useState('en_fabrication');
  const [commentaire, setCommentaire] = useState('');
  const [motif, setMotif] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !plan) return;
    setAvancement(plan.avancement || 0);
    setStatut(plan.statut === 'plan_recu' ? 'a_lancer' : plan.statut);
    setCommentaire('');
    setMotif(plan.motif_blocage || '');
    setPhotos([]);
    setError('');
  }, [open, plan]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (statut === 'bloque' && !String(motif).trim()) {
      setError('Le motif du blocage est obligatoire.');
      return;
    }
    const result = await onSubmit(plan.id, {
      avancement,
      statut,
      commentaire,
      motif_blocage: motif,
      photos,
    });
    if (!result?.success) {
      setError(result?.error || 'Erreur mise à jour.');
      return;
    }
    onClose();
  }

  return (
    <FabModal open={open} onClose={onClose} title="Mettre à jour la production" width={560}>
      {plan ? (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>{plan.projet_nom}</div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>{plan.designation}</div>
          </div>
          <FabField label="Avancement">
            <div className="fab-avancement-pills">
              {FAB_AVANCEMENT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn btn-ghost btn-sm${Number(avancement) === n ? ' is-on' : ''}`}
                  onClick={() => {
                    setAvancement(n);
                    if (n === 100) setStatut('termine');
                    else if (n > 0 && statut === 'a_lancer') setStatut('en_fabrication');
                  }}
                >
                  {n} %
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={avancement}
              onChange={(e) => {
                const n = Number(e.target.value);
                setAvancement(n);
                if (n === 100) setStatut('termine');
              }}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: 4 }}>{avancement} %</div>
          </FabField>
          <div style={{ height: 12 }} />
          <FabField label="Statut">
            <select style={FAB_SELECT} value={statut} onChange={(e) => setStatut(e.target.value)}>
              {FAB_STATUTS_MAJ.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FabField>
          {statut === 'bloque' ? (
            <div style={{ marginTop: 12 }}>
              <FabField label="Motif du blocage" required>
                <textarea style={FAB_TEXTAREA} value={motif} onChange={(e) => setMotif(e.target.value)} />
              </FabField>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <FabField label="Commentaire">
              <textarea style={FAB_TEXTAREA} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
            </FabField>
          </div>
          <div style={{ marginTop: 12 }}>
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
          {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 10 }}>{error}</div> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <Loader2 size={14} /> : null} Enregistrer
            </button>
          </div>
        </form>
      ) : null}
    </FabModal>
  );
}

export function PlanDetailModal({ open, onClose, plan }) {
  if (!plan) return null;
  const file = planFile(plan);
  const photos = planPhotos(plan);
  const delayLabel = fabOnTimeLabel(plan);

  return (
    <FabModal open={open} onClose={onClose} title={plan.designation || 'Détail production'} width={720}>
      <div className="fab-form-grid">
        <FabField label="Projet"><div>{plan.projet_nom || '—'}</div></FabField>
        <FabField label="Référence"><div>{plan.reference}</div></FabField>
        <FabField label="Atelier"><div>{fabAtelierLabel(plan.atelier)}</div></FabField>
        <FabField label="Chef d’atelier"><div>{plan.chef_atelier_nom || '—'}</div></FabField>
        <FabField label="Statut"><FabBadge statut={plan.statut} /></FabField>
        <FabField label="Priorité"><FabBadge priorite={plan.priorite} /></FabField>
        <FabField label="Transmis par"><div>{plan.transmetteur_nom || '—'}</div></FabField>
        <FabField label="Date réception"><div>{fmtDateTime(plan.date_transmission)}</div></FabField>
        <FabField label="Début prévu"><div>{fmtDate(plan.date_debut_prevue)}</div></FabField>
        <FabField label="Fin prévue"><div>{fmtDate(plan.date_fin_prevue)}</div></FabField>
        <FabField label="Début réel"><div>{fmtDate(plan.date_debut_reelle)}</div></FabField>
        <FabField label="Fin réelle"><div>{fmtDate(plan.date_fin_reelle)}</div></FabField>
        <div className="fab-span-2">
          <FabField label="Avancement"><FabProgress value={plan.avancement} /></FabField>
        </div>
        {plan.statut === 'termine' ? (
          <div className="fab-span-2">
            <span className={`badge ${delayLabel.startsWith('Retard') ? 'badge-red' : 'badge-green'}`}>{delayLabel}</span>
          </div>
        ) : null}
        {plan.statut === 'bloque' && plan.motif_blocage ? (
          <div className="fab-span-2">
            <FabField label="Motif du blocage"><div style={{ color: 'var(--red)' }}>{plan.motif_blocage}</div></FabField>
          </div>
        ) : null}
        {plan.consigne ? (
          <div className="fab-span-2"><FabField label="Consigne"><div>{plan.consigne}</div></FabField></div>
        ) : null}
        <div className="fab-span-2">
          <FabField label="Plan">
            {file?.url ? (
              <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', gap: 6 }}>
                <ExternalLink size={13} /> {file.file_name || 'Ouvrir'}
              </a>
            ) : '—'}
          </FabField>
        </div>
        {photos.length ? (
          <div className="fab-span-2">
            <FabField label="Photos">
              <div className="fab-photo-row">
                {photos.map((p) => (
                  p.url ? <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.file_name} /></a> : null
                ))}
              </div>
            </FabField>
          </div>
        ) : null}
        {plan.commentaire_transmission ? (
          <div className="fab-span-2">
            <FabField label="Commentaire de transmission"><div>{plan.commentaire_transmission}</div></FabField>
          </div>
        ) : null}
      </div>
      {(plan.history || []).length ? (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, marginBottom: 8 }}>Historique</div>
          <div className="fab-history">
            {plan.history.map((h) => (
              <div key={h.id} className="fab-history-row">
                <div>
                  <div>{fmtDateTime(h.created_at)}</div>
                  <div style={{ color: 'var(--text-3)' }}>{h.utilisateur_nom || '—'}</div>
                </div>
                <div>
                  <div>
                    {h.ancien_statut ? `${fabStatutMeta(h.ancien_statut).label} → ` : ''}
                    {fabStatutMeta(h.nouveau_statut).label}
                    {h.avancement != null ? ` · ${h.avancement} %` : ''}
                  </div>
                  {h.commentaire ? <div style={{ color: 'var(--text-2)' }}>{h.commentaire}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </FabModal>
  );
}
