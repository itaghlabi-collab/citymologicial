/**
 * BonMouvementTraceabilite.jsx — Traçabilité + historiques source/destination (détail bon).
 * Réutilise buildEmplacementControlView / normalizeMovementKind (même source de vérité que Stocks).
 */
import { useEffect, useMemo, useState } from 'react';
import { History, ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { INPUT_STYLE, SELECT_STYLE, SectionTitle, formatEmplacementDisplay } from './shared.jsx';
import {
  listAllStockMovementsRaw,
  buildEmplacementControlView,
  normalizeMovementKind,
  periodRange,
} from '../../services/inventaire/stockSync';

const STOCK_FILTER_KEY = 'citymo_stock_filter_emplacement';

function extractProjet(note = '') {
  const m = String(note).match(/Projet:\s*([^|]+)/i);
  return m ? m[1].trim() : '';
}

function Collapsible({ title, defaultOpen = true, children, actions = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 14, padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.85rem', flex: 1 }}>{title}</span>
        {actions}
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  );
}

function HistoryTable({ rows, highlightRef, isMobile }) {
  if (!rows.length) {
    return <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun mouvement pour ces articles sur cet emplacement.</p>;
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((h) => {
          const hi = h.ref && highlightRef && h.ref === highlightRef;
          return (
            <div
              key={h.id}
              style={{
                border: `1px solid ${hi ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 8, padding: 12, fontSize: '0.8rem',
                background: hi ? 'rgba(183,28,28,0.06)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <strong>{h.date_label}</strong>
                <span style={{ color: 'var(--red)', fontWeight: 700 }}>{h.ref}</span>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{h.article_code} — {h.article_designation}</div>
              <div>{h.operation_label}</div>
              <div style={{ marginTop: 4 }}>
                {h.inbound ? <span style={{ color: '#2e7d32', fontWeight: 700 }}>+{h.inbound}</span> : null}
                {h.outbound ? <span style={{ color: 'var(--red)', fontWeight: 700 }}> −{h.outbound}</span> : null}
                <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>Solde : <strong>{h.solde_apres ?? '—'}</strong></span>
              </div>
              <div style={{ color: 'var(--text-3)', marginTop: 4, fontSize: '0.72rem' }}>
                {h.emplacement_source || '—'} → {h.emplacement_destination || '—'}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Réf.</th>
            <th>Type</th>
            <th>Entrée</th>
            <th>Sortie</th>
            <th>Source</th>
            <th>Destination</th>
            <th>Motif</th>
            <th>Projet</th>
            <th>Par</th>
            <th>Solde</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const hi = h.ref && highlightRef && h.ref === highlightRef;
            return (
              <tr
                key={h.id}
                style={{
                  background: hi ? 'rgba(183,28,28,0.08)' : undefined,
                  outline: hi ? '2px solid var(--red)' : undefined,
                  outlineOffset: -2,
                }}
              >
                <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h.date_label}</td>
                <td style={{ fontSize: '0.72rem', fontWeight: hi ? 800 : 500, color: hi ? 'var(--red)' : undefined }}>{h.ref || '—'}</td>
                <td style={{ fontSize: '0.75rem' }}>{h.operation_label}</td>
                <td style={{ color: '#2e7d32', fontWeight: 700 }}>{h.inbound || '—'}</td>
                <td style={{ color: 'var(--red)', fontWeight: 700 }}>{h.outbound || '—'}</td>
                <td style={{ fontSize: '0.72rem' }}>{h.emplacement_source || '—'}</td>
                <td style={{ fontSize: '0.72rem' }}>{h.emplacement_destination || '—'}</td>
                <td style={{ fontSize: '0.72rem' }}>{h.motif || '—'}</td>
                <td style={{ fontSize: '0.72rem' }}>{h.projet || '—'}</td>
                <td style={{ fontSize: '0.72rem' }}>{h.cree_par || '—'}</td>
                <td style={{ fontWeight: 800 }}>{h.solde_apres == null ? '—' : h.solde_apres}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmpHistoryBlock({
  title, emplacement, articleIds, movements, articles, highlightRef, onNavigateStocks,
}) {
  const [periodKey, setPeriodKey] = useState('all');
  const [filterType, setFilterType] = useState('');
  const [filterArticle, setFilterArticle] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  const period = useMemo(() => periodRange(periodKey, customFrom, customTo), [periodKey, customFrom, customTo]);

  const view = useMemo(() => buildEmplacementControlView({
    articles,
    movements,
    emplacement,
    levels: [],
    period: { from: null, to: null },
  }), [articles, movements, emplacement]);

  const rows = useMemo(() => {
    let list = (view.history || []).filter((h) => articleIds.has(String(h.article_id)));
    if (filterArticle) list = list.filter((h) => String(h.article_id) === String(filterArticle));
    if (filterType) list = list.filter((h) => h.normalized_type === filterType);
    if (period.from || period.to) list = list.filter((h) => h.in_period !== false && (() => {
      // rebuild with period for filter — history has date; apply periodRange check via date_mouvement
      const ts = new Date(h.created_at || `${h.date_mouvement}T12:00:00`).getTime();
      if (period.from && ts < period.from.getTime()) return false;
      if (period.to && ts > period.to.getTime()) return false;
      return true;
    })());
    return list;
  }, [view.history, articleIds, filterArticle, filterType, period]);

  // Impact du bon courant pour résumé
  const currentImpact = useMemo(() => {
    const hit = (view.history || []).find((h) => h.ref === highlightRef && (!filterArticle || String(h.article_id) === String(filterArticle)));
    if (!hit) return null;
    return {
      label: hit.operation_label,
      inbound: hit.inbound,
      outbound: hit.outbound,
      delta: hit.delta,
    };
  }, [view.history, highlightRef, filterArticle]);

  return (
    <Collapsible
      title={title}
      defaultOpen
      actions={(
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            try { sessionStorage.setItem(STOCK_FILTER_KEY, emplacement); } catch { /* ignore */ }
            onNavigateStocks?.(emplacement);
          }}
          style={{ fontSize: '0.72rem' }}
        >
          <ExternalLink size={12} /> Voir le stock actuel
        </button>
      )}
    >
      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-3)' }}>
        Emplacement : <strong>{formatEmplacementDisplay(emplacement)}</strong>
        {currentImpact && (
          <>
            {' · '}Bon courant : <strong>{currentImpact.label}</strong>
            {currentImpact.inbound ? <> · Entrée <strong style={{ color: '#2e7d32' }}>+{currentImpact.inbound}</strong></> : null}
            {currentImpact.outbound ? <> · Sortie <strong style={{ color: 'var(--red)' }}>−{currentImpact.outbound}</strong></> : null}
            {' · '}Impact : <strong>{currentImpact.delta > 0 ? `+${currentImpact.delta}` : currentImpact.delta}</strong>
          </>
        )}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select value={filterArticle} onChange={(e) => setFilterArticle(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
          <option value="">Tous les articles du bon</option>
          {(articles || []).filter((a) => articleIds.has(String(a.id))).map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.designation}</option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
          <option value="">Tous types</option>
          <option value="entry">Entrées</option>
          <option value="exit">Sorties / conso</option>
          <option value="transfer">Transferts</option>
        </select>
        <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
          <option value="all">Toute période</option>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
          <option value="month">Mois en cours</option>
          <option value="custom">Personnalisée</option>
        </select>
        {periodKey === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 140 }} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 140 }} />
          </>
        )}
      </div>
      <HistoryTable rows={rows} highlightRef={highlightRef} isMobile={isMobile} />
    </Collapsible>
  );
}

/**
 * @param {object} bon — bon normalisé (ref, type, source, dest, lignes…)
 * @param {object[]} articles
 * @param {(emp: string) => void} [onNavigateStocks]
 */
export default function BonMouvementTraceabilite({ bon, articles = [], onNavigateStocks }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAllStockMovementsRaw()
      .then((rows) => { if (!cancelled) setMovements(rows || []); })
      .catch(() => { if (!cancelled) setMovements([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bon?.ref]);

  const kind = useMemo(() => normalizeMovementKind({
    type_mouvement: bon?.type_mouvement === 'Entrée' ? 'Entree' : bon?.type_mouvement,
    quantite: bon?.quantite_totale || bon?.lignes?.[0]?.quantite || 0,
    payload: {
      emplacement_source: bon?.emplacement_source || '',
      emplacement_destination: bon?.emplacement_destination || '',
      note: bon?.note || '',
      projet: extractProjet(bon?.note),
    },
  }), [bon]);

  const articleIds = useMemo(() => {
    const set = new Set();
    (bon?.lignes || []).forEach((l) => { if (l.article_id) set.add(String(l.article_id)); });
    if (bon?.article_id) set.add(String(bon.article_id));
    return set;
  }, [bon]);

  const projet = extractProjet(bon?.note) || '';
  const src = (bon?.emplacement_source || '').trim();
  const dest = (bon?.emplacement_destination || '').trim();

  const fields = [
    ['Référence', bon?.ref],
    ['Date', bon?.date_creation],
    ['Type affiché', bon?.type_mouvement],
    ['Type normalisé', kind.label + (kind.normalized_type === 'transfer' ? ' (transfer)' : '')],
    ['Source', formatEmplacementDisplay(src)],
    ['Destination', formatEmplacementDisplay(dest)],
    ['Projet', projet || '—'],
    ['Motif', bon?.motif || '—'],
    ['Créé par', bon?.cree_par || '—'],
    ['Validé par', bon?.receptionnaire || bon?.cree_par || '—'],
    ['Statut', bon?.statut || '—'],
    ['Appliqué', bon?.applied ? 'Oui' : 'Non'],
  ];

  if (loading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 className="cin-spin" /> Chargement de la traçabilité…
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <Collapsible title="Traçabilité du mouvement" defaultOpen>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <History size={14} style={{ color: 'var(--red)' }} />
          <SectionTitle>Synthèse</SectionTitle>
        </div>
        <div className="finance-detail-fields" style={{ fontSize: '0.84rem' }}>
          {fields.map(([l, v]) => (
            <div key={l}>
              <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
              <div style={{ fontWeight: 500 }}>{v || '—'}</div>
            </div>
          ))}
        </div>
        {kind.normalized_type === 'transfer' && src && dest && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-2, #f7f7f7)', borderRadius: 8, fontSize: '0.82rem' }}>
            <div><strong>{src}</strong> — Transfert sortant · impact <span style={{ color: 'var(--red)', fontWeight: 800 }}>−{kind.qty || '…'}</span></div>
            <div style={{ marginTop: 4 }}><strong>{dest}</strong> — Transfert entrant · impact <span style={{ color: '#2e7d32', fontWeight: 800 }}>+{kind.qty || '…'}</span></div>
          </div>
        )}
      </Collapsible>

      {src && (
        <EmpHistoryBlock
          title={`Historique de l'emplacement source — ${src}`}
          emplacement={src}
          articleIds={articleIds}
          movements={movements}
          articles={articles}
          highlightRef={bon?.ref}
          onNavigateStocks={onNavigateStocks}
        />
      )}

      {dest && (
        <EmpHistoryBlock
          title={`Historique de l'emplacement destination — ${dest}`}
          emplacement={dest}
          articleIds={articleIds}
          movements={movements}
          articles={articles}
          highlightRef={bon?.ref}
          onNavigateStocks={onNavigateStocks}
        />
      )}
    </div>
  );
}

export { STOCK_FILTER_KEY };
