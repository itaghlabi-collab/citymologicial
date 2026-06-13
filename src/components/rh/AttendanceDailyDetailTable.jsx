import { Pencil, Trash2 } from 'lucide-react';

const STATUS_BADGE = {
  Present: 'badge-green',
  Absent: 'badge-red',
  Retard: 'badge-orange',
  'Demi-journee': 'badge-blue',
  Mixte: 'badge-grey',
};

function fmtHours(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
}

function fmtDayEquiv(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-MA');
  } catch {
    return iso;
  }
}

function fmtJour(iso) {
  if (!iso) return '—';
  try {
    return JOURS[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()];
  } catch {
    return '—';
  }
}

const HEADERS = {
  default: {
    date: 'Date',
    jour: 'Jour',
    entree: 'Entrée',
    sortie: 'Sortie',
    heures: 'H. travaillées',
    retard: 'Retard',
    equiv: 'Équiv. jour',
    statut: 'Statut',
    notes: 'Notes',
    actions: 'Actions',
  },
  compact: {
    date: 'Date',
    jour: 'Jour',
    entree: 'Entrée',
    sortie: 'Sortie',
    heures: 'H. trav.',
    retard: 'Retard',
    equiv: 'Équiv.',
    statut: 'Statut',
    notes: 'Notes',
    actions: '',
  },
};

export default function AttendanceDailyDetailTable({
  lignes = [],
  onEdit,
  onDelete,
  showActions = true,
  showJour = false,
  striped = false,
  compact = false,
}) {
  const labels = compact ? HEADERS.compact : HEADERS.default;
  const wrapClass = [
    'table-wrap',
    striped ? 'rh-attendance-table--striped' : '',
    compact ? 'rh-attendance-detail-scroll' : '',
  ].filter(Boolean).join(' ');

  if (!lignes.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem', background: 'var(--surface-2)', borderRadius: 8 }}>
        Aucune présence journalière pour cette période.
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <table>
        <thead>
          <tr>
            <th>{labels.date}</th>
            {showJour && <th>{labels.jour}</th>}
            <th>{labels.entree}</th>
            <th>{labels.sortie}</th>
            <th>{labels.heures}</th>
            <th>{labels.retard}</th>
            <th>{labels.equiv}</th>
            <th>{labels.statut}</th>
            <th>{labels.notes}</th>
            {showActions && <th style={{ width: compact ? 72 : undefined }}>{labels.actions}</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((r) => (
            <tr key={r.id || `${r.date}-${r.heureEntree}`}>
              <td data-label="Date" style={{ fontWeight: 600 }}>{fmtDate(r.date)}</td>
              {showJour && <td data-label="Jour" style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{fmtJour(r.date)}</td>}
              <td data-label="Entrée">{r.heureEntree || '—'}</td>
              <td data-label="Sortie">{r.heureSortie || '—'}</td>
              <td data-label="H. travaillées">{r.heuresTravaillees > 0 ? fmtHours(r.heuresTravaillees) : '—'}</td>
              <td data-label="Retard" style={{ color: r.retardHeures > 0 ? '#E65100' : 'var(--text-3)', fontWeight: r.retardHeures > 0 ? 600 : 400 }}>
                {r.retardHeures > 0 ? fmtHours(r.retardHeures) : '—'}
              </td>
              <td data-label="Équiv. jour" style={{ fontWeight: 600 }}>{r.joursEquivalent > 0 ? fmtDayEquiv(r.joursEquivalent) : '—'}</td>
              <td data-label="Statut">
                <span className={`badge ${STATUS_BADGE[r.statut] || 'badge-grey'}`}>{r.statut}</span>
              </td>
              <td data-label="Notes" style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{r.notes || '—'}</td>
              {showActions && (
                <td data-label="Actions">
                  <div className={compact ? 'rh-att-detail-actions' : ''} style={{ display: 'flex', gap: 6 }}>
                    {onEdit && (
                      compact ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r)} title="Modifier" aria-label="Modifier">
                          <Pencil size={14} />
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>Modifier</button>
                      )
                    )}
                    {onDelete && (
                      compact ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(r.id)} title="Supprimer" aria-label="Supprimer" style={{ color: 'var(--red)' }}>
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(r.id)} style={{ color: 'var(--red)' }}>Suppr.</button>
                      )
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
