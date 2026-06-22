/**
 * SubPermMatrix.jsx — Matrice permissions par rubrique / sous-rubrique.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { ERP_RUBRIQUES, ERP_ACTIONS } from '../../config/menuRegistry';

export default function SubPermMatrix({ permissions, onChange, readOnly }) {
  const [open, setOpen] = useState(() =>
    Object.fromEntries(ERP_RUBRIQUES.map((r) => [r.code, false])),
  );

  function toggle(subCode, actionCode) {
    if (readOnly) return;
    const cur = permissions[subCode] || {};
    onChange({
      ...permissions,
      [subCode]: { ...cur, [actionCode]: !cur[actionCode] },
    });
  }

  function toggleSubmodule(subCode, on) {
    if (readOnly) return;
    const next = { ...permissions };
    next[subCode] = {};
    ERP_ACTIONS.forEach((a) => { next[subCode][a.code] = on; });
    onChange(next);
  }

  function toggleRubrique(rub, on) {
    if (readOnly) return;
    const next = { ...permissions };
    rub.submodules.forEach((sub) => {
      if (sub.executiveOnly) return;
      next[sub.code] = {};
      ERP_ACTIONS.forEach((a) => { next[sub.code][a.code] = on; });
    });
    onChange(next);
  }

  return (
    <div style={{ fontSize: '0.78rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-2)' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', minWidth: 220 }}>Rubrique / Sous-rubrique</th>
            {ERP_ACTIONS.map((a) => (
              <th key={a.code} style={{ padding: '6px 4px', textAlign: 'center', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ERP_RUBRIQUES.map((rub) => {
            const isOpen = open[rub.code];
            const allSubsOn = rub.submodules.every((sub) =>
              ERP_ACTIONS.every((a) => permissions[sub.code]?.[a.code]),
            );
            return [
              <tr key={`${rub.code}-head`} style={{ background: '#fafafa', borderTop: '2px solid var(--border)' }}>
                <td colSpan={ERP_ACTIONS.length + 1} style={{ padding: '8px 10px' }}>
                  <button
                    type="button"
                    onClick={() => setOpen((p) => ({ ...p, [rub.code]: !p[rub.code] }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: '0.8rem', color: 'var(--text)' }}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {rub.label}
                    {!readOnly && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); toggleRubrique(rub, !allSubsOn); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleRubrique(rub, !allSubsOn); } }}
                        style={{ marginLeft: 8, fontSize: '0.68rem', color: 'var(--red)', fontWeight: 700 }}
                      >
                        {allSubsOn ? 'Tout désactiver' : 'Tout activer'}
                      </span>
                    )}
                  </button>
                </td>
              </tr>,
              ...(isOpen ? rub.submodules.map((sub) => {
                const subOn = ERP_ACTIONS.every((a) => permissions[sub.code]?.[a.code]);
                return (
                  <tr key={sub.code} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px 6px 28px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!readOnly && !sub.executiveOnly ? (
                          <button type="button" onClick={() => toggleSubmodule(sub.code, !subOn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: subOn ? 'var(--red)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {subOn ? <CheckSquare size={12} /> : <Square size={12} />}
                            <span style={{ fontWeight: 600 }}>{sub.label}</span>
                          </button>
                        ) : (
                          <span style={{ fontWeight: 500, color: sub.executiveOnly ? 'var(--text-3)' : 'var(--text)' }}>
                            {sub.label}{sub.executiveOnly ? ' (DG)' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    {ERP_ACTIONS.map((act) => {
                      const on = Boolean(permissions[sub.code]?.[act.code]);
                      return (
                        <td key={act.code} style={{ textAlign: 'center', padding: 4 }}>
                          <button
                            type="button"
                            disabled={readOnly || sub.executiveOnly}
                            onClick={() => toggle(sub.code, act.code)}
                            style={{ background: 'none', border: 'none', cursor: readOnly ? 'default' : 'pointer', color: on ? 'var(--red)' : 'var(--border)' }}
                          >
                            {on ? <CheckSquare size={14} /> : <Square size={14} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              }) : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
