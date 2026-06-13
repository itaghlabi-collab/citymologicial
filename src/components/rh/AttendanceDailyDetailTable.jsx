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

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-MA');
  } catch {
    return iso;
  }
}

export default function AttendanceDailyDetailTable({
  lignes = [],
  onEdit,
  onDelete,
  showActions = true,
}) {
  if (!lignes.length) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>
        Aucune présence journalière pour cette période.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Entrée</th>
            <th>Sortie</th>
            <th>H. travaillées</th>
            <th>Retard</th>
            <th>Équiv. jour</th>
            <th>Statut</th>
            <th>Notes</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((r) => (
            <tr key={r.id || `${r.date}-${r.heureEntree}`}>
              <td data-label="Date">{fmtDate(r.date)}</td>
              <td data-label="Entrée">{r.heureEntree || '—'}</td>
              <td data-label="Sortie">{r.heureSortie || '—'}</td>
              <td data-label="H. travaillées">{r.heuresTravaillees > 0 ? fmtHours(r.heuresTravaillees) : '—'}</td>
              <td data-label="Retard" style={{ color: r.retardHeures > 0 ? '#E65100' : 'var(--text-3)' }}>
                {r.retardHeures > 0 ? fmtHours(r.retardHeures) : '—'}
              </td>
              <td data-label="Équiv. jour">{r.joursEquivalent > 0 ? fmtDayEquiv(r.joursEquivalent) : '—'}</td>
              <td data-label="Statut">
                <span className={`badge ${STATUS_BADGE[r.statut] || 'badge-grey'}`}>{r.statut}</span>
              </td>
              <td data-label="Notes" style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{r.notes || '—'}</td>
              {showActions && (
                <td data-label="Actions">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {onEdit && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r)}>Modifier</button>
                    )}
                    {onDelete && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(r.id)} style={{ color: 'var(--red)' }}>Suppr.</button>
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
