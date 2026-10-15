import { Pencil, Play } from 'lucide-react';
import { FAB_LIBRARY_STATUTS, fabAtelierFullLabel } from '../../constants/fabrication';
import { FabModal, FabField, FabBadge, FabProgress, fmtDate } from './shared';
import FilePreviewList from './FilePreview';

export function LibraryStatutBadge({ statut }) {
  const meta = FAB_LIBRARY_STATUTS[statut] || FAB_LIBRARY_STATUTS.disponible;
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

export default function LibraryPlanDetail({
  open, onClose, plan, focus, canEdit, canStart, onEdit, onStart, onOpenProduction,
}) {
  if (!plan) return null;
  const productions = plan.productions || [];

  return (
    <FabModal open={open} onClose={onClose} title={`${plan.reference} — ${plan.nom}`} width={780}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <LibraryStatutBadge statut={plan.statut} />
        {plan.source === 'projets' ? <span className="badge badge-grey">Transmis depuis Projets</span> : null}
        <div style={{ flex: 1 }} />
        {canEdit ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(plan)}><Pencil size={13} /> Modifier</button>
        ) : null}
        {canStart ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onStart(plan)}><Play size={13} /> Débuter une production</button>
        ) : null}
      </div>

      {focus !== 'productions' ? (
        <>
          <div className="fab-form-grid">
            <FabField label="Projet"><div>{plan.projet_ref ? `${plan.projet_ref} · ` : ''}{plan.projet_nom || '—'}</div></FabField>
            <FabField label="Client"><div>{plan.client_nom || '—'}</div></FabField>
            <FabField label="Atelier"><div>{plan.atelier ? fabAtelierFullLabel(plan.atelier, plan.machine_type) : '—'}</div></FabField>
            <FabField label="Ajouté le / par"><div>{fmtDate(plan.created_at)} · {plan.created_by_nom || '—'}</div></FabField>
            {plan.designation ? (
              <div className="fab-span-2"><FabField label="Désignation générale"><div>{plan.designation}</div></FabField></div>
            ) : null}
            {plan.observations ? (
              <div className="fab-span-2"><FabField label="Observations techniques"><div style={{ whiteSpace: 'pre-wrap' }}>{plan.observations}</div></FabField></div>
            ) : null}
            {plan.commentaire_transmission ? (
              <div className="fab-span-2"><FabField label="Commentaire de transmission"><div>{plan.commentaire_transmission}</div></FabField></div>
            ) : null}
          </div>
          <div style={{ marginTop: 16 }}>
            <FabField label="Fichiers">
              <FilePreviewList files={plan.files || []} />
            </FabField>
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <div className="fab-section-title">Productions associées ({productions.length})</div>
        {productions.length === 0 ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucune production n’utilise encore ce plan.</div>
        ) : (
          <div className="fab-watch-list">
            {productions.map((p) => (
              <button
                key={p.id}
                type="button"
                className="fab-watch-item"
                style={{ gridTemplateColumns: '1fr auto' }}
                onClick={() => onOpenProduction?.(p.id)}
              >
                <div>
                  <div className="fab-watch-title">{p.reference} · {p.designation}</div>
                  <div className="fab-watch-meta">
                    {fabAtelierFullLabel(p.atelier)} · Limite {fmtDate(p.date_fin_prevue)}
                  </div>
                  <div style={{ maxWidth: 220, marginTop: 6 }}><FabProgress value={p.avancement} /></div>
                </div>
                <FabBadge statut={p.statut} />
              </button>
            ))}
          </div>
        )}
      </div>
    </FabModal>
  );
}
