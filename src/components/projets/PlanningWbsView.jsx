/**
 * PlanningWbsView.jsx — Vue WBS (arborescence tâches)
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus } from 'lucide-react';
import { buildWbsTree, flattenWbsTree } from '../../services/projects/projectPlanningTasks';
import { planningStatutMeta, planningTaskBarColor } from '../../constants/projectPlanning';

const HDR = {
  background: 'linear-gradient(135deg, var(--red-dark) 0%, var(--red) 100%)',
  color: '#fff',
  fontFamily: 'var(--font-head)',
  fontWeight: 700,
  fontSize: '0.68rem',
  textTransform: 'uppercase',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PlanningWbsView({ tasks, onEdit, onAddChild }) {
  const [collapsed, setCollapsed] = useState(new Set());

  const rows = useMemo(() => {
    const roots = buildWbsTree(tasks);
    if (!roots.length) return tasks.map((t, i) => ({ ...t, wbs: String(i + 1), depth: 0, hasChildren: false }));
    return flattenWbsTree(roots, collapsed);
  }, [tasks, collapsed]);

  function toggle(id) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!tasks.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 8 }}>
        Aucune tâche — ajoutez des tâches pour construire le WBS.
      </div>
    );
  }

  return (
    <div className="pj-wbs">
      {/* Desktop — tableau inchangé */}
      <div className="pj-wbs-desktop" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        <div style={{ ...HDR, display: 'grid', gridTemplateColumns: '48px 1fr 100px 72px 88px 88px 80px', padding: '10px 12px', gap: 8 }}>
          <span>#</span>
          <span>Structure WBS</span>
          <span>Lot</span>
          <span>Durée</span>
          <span>Début</span>
          <span>Fin</span>
          <span>%</span>
        </div>
        {rows.map((row, i) => {
          const st = planningStatutMeta(row.statut);
          const color = planningTaskBarColor(row);
          return (
            <div
              key={row.id}
              style={{
                display: 'grid', gridTemplateColumns: '48px 1fr 100px 72px 88px 88px 80px',
                padding: '8px 12px', gap: 8, alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--text-3)' }}>{row.wbs_code || row.wbs}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: (row.depth || 0) * 18, minWidth: 0 }}>
                {row.hasChildren ? (
                  <button type="button" onClick={() => toggle(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-2)' }}>
                    {collapsed.has(row.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : <span style={{ width: 14 }} />}
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: row.hasChildren ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.nom}>
                  {row.nom}
                </span>
                <button type="button" onClick={() => onEdit(row)} title="Modifier" style={{ marginLeft: 'auto', padding: 3, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                  <Edit2 size={11} />
                </button>
                <button type="button" onClick={() => onAddChild?.(row)} title="Sous-tâche" style={{ padding: 3, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer', color: 'var(--red)' }}>
                  <Plus size={11} />
                </button>
              </div>
              <span style={{ color: 'var(--text-2)', fontSize: '0.75rem' }}>{row.lot || '—'}</span>
              <span>{row.duree_jours ? `${row.duree_jours} j` : '—'}</span>
              <span style={{ fontSize: '0.75rem' }}>{fmtDate(row.date_debut)}</span>
              <span style={{ fontSize: '0.75rem' }}>{fmtDate(row.date_fin)}</span>
              <span style={{ fontWeight: 700, color: st.color }}>{Math.round(row.avancement)}%</span>
            </div>
          );
        })}
      </div>

      {/* Mobile — cartes */}
      <div className="pj-wbs-mobile" aria-label="Structure WBS">
        {rows.map((row) => {
          const st = planningStatutMeta(row.statut);
          const color = planningTaskBarColor(row);
          const pct = Math.min(100, Math.max(0, Math.round(Number(row.avancement) || 0)));
          const depth = row.depth || 0;
          return (
            <article
              key={row.id}
              className={`pj-wbs-card${row.hasChildren ? ' pj-wbs-card--parent' : ''}`}
              style={{ marginLeft: Math.min(depth, 3) * 10 }}
            >
              <header className="pj-wbs-card-head">
                <div className="pj-wbs-card-id">
                  {row.hasChildren ? (
                    <button
                      type="button"
                      className="pj-wbs-toggle"
                      onClick={() => toggle(row.id)}
                      aria-label={collapsed.has(row.id) ? 'Développer' : 'Réduire'}
                    >
                      {collapsed.has(row.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                  ) : (
                    <span className="pj-wbs-toggle-spacer" />
                  )}
                  <span className="pj-wbs-dot" style={{ background: color }} aria-hidden="true" />
                  <span className="pj-wbs-code">{row.wbs_code || row.wbs}</span>
                </div>
                <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
              </header>

              <div className={`pj-wbs-card-name${row.hasChildren ? ' is-parent' : ''}`}>{row.nom}</div>

              {row.lot && (
                <div className="pj-wbs-lot">{row.lot}</div>
              )}

              <div className="pj-wbs-card-meta">
                <div>
                  <span>Durée</span>
                  <strong>{row.duree_jours ? `${row.duree_jours} j` : '—'}</strong>
                </div>
                <div>
                  <span>Dates</span>
                  <strong>{fmtDate(row.date_debut)} → {fmtDate(row.date_fin)}</strong>
                </div>
              </div>

              <div className="pj-wbs-progress">
                <div className="pj-wbs-progress-label">
                  <span>Progression</span>
                  <strong>{pct}%</strong>
                </div>
                <div className="pj-wbs-progress-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>

              <footer className="pj-wbs-card-actions">
                {row.hasChildren && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => toggle(row.id)}
                  >
                    {collapsed.has(row.id) ? 'Voir les sous-tâches' : 'Masquer les sous-tâches'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onEdit(row)}
                >
                  <Edit2 size={13} /> Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm pj-wbs-add-child"
                  onClick={() => onAddChild?.(row)}
                >
                  <Plus size={13} /> Sous-tâche
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
