/**
 * StockEmplacementControl.jsx — Vue stock actuel filtrée par emplacement (sans historique audit).
 */
import { useMemo, useState } from 'react';
import {
  Package, ChevronLeft, ArrowDownToLine, ArrowUpFromLine, Loader2,
  BarChart2, AlertTriangle, ArrowUpDown,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, EmptyState, SectionTitle, formatMAD, KpiCard,
} from './shared.jsx';

function fmtMvtDate(m) {
  return m?.date_label || '—';
}

export default function StockEmplacementControl({
  controlView,
  loading,
  visibility = 'avec_stock',
  search = '',
  filterCat = '',
  categories = [],
  onOpenArticle,
  onMvt,
}) {
  const [detailRow, setDetailRow] = useState(null);

  const filteredArticles = useMemo(() => {
    const rows = controlView?.articles || [];
    return rows.filter((x) => {
      const q = search.toLowerCase();
      const matchQ = !q
        || String(x.code || '').toLowerCase().includes(q)
        || String(x.designation || '').toLowerCase().includes(q);
      const matchCat = !filterCat || String(x.categorie_id) === String(filterCat);
      const qty = Number(x.stock_actuel) || 0;
      let matchVis = true;
      if (visibility === 'avec_stock') matchVis = qty !== 0;
      else if (visibility === 'rupture') matchVis = qty === 0 && x.has_mouvement;
      else if (visibility === 'avec_mouvement') matchVis = !!x.has_mouvement;
      else if (visibility === 'sans_mouvement') matchVis = !x.has_mouvement;
      return matchQ && matchCat && matchVis;
    });
  }, [controlView, search, filterCat, visibility]);

  const kpis = controlView?.kpis || {};
  const emp = controlView?.emplacement || '';

  if (detailRow) {
    return (
      <div className="animate-fade-in">
        <div className="finance-page-actions" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailRow(null)}>
            <ChevronLeft size={15} /> Retour à {emp}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onMvt?.('Entrée', detailRow)}>
            <ArrowDownToLine size={13} /> Entrée
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMvt?.('Sortie', detailRow)}>
            <ArrowUpFromLine size={13} /> Sortie
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenArticle?.(detailRow)}>
            Fiche stock globale
          </button>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <SectionTitle>
            {detailRow.code} — {detailRow.designation}
          </SectionTitle>
          <p style={{ margin: '0 0 12px', color: 'var(--text-3)', fontSize: '0.82rem' }}>
            Emplacement : <strong>{emp}</strong>
            {' · '}
            La traçabilité détaillée se consulte dans <strong>Bons de mouvements</strong>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
            {[
              ['Quantité actuelle', `${detailRow.stock_actuel} ${detailRow.unite || ''}`],
              ['Valeur actuelle', detailRow.valeur_actuelle ? formatMAD(detailRow.valeur_actuelle) : '—'],
              ['État', detailRow.etat_emplacement?.label || '—'],
              ['Dernière opération', detailRow.dernier_mouvement
                ? `${fmtMvtDate(detailRow.dernier_mouvement)} — ${detailRow.dernier_mouvement.operation_label || detailRow.dernier_mouvement.label}`
                : '—'],
            ].map(([l, v]) => (
              <div key={l}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                <div style={{ fontWeight: 600 }}>{v ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="stat-grid finance-kpi-grid finance-kpi-strip" style={{ marginBottom: 16 }}>
        <KpiCard icon={<BarChart2 size={17} />} label="Valeur totale" value={formatMAD(kpis.valeur_totale || 0)} color="red" />
        <KpiCard icon={<Package size={17} />} label="Articles (stock)" value={kpis.nb_articles || 0} color="blue" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Stock faible" value={kpis.stock_faible || 0} color="orange" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Critiques" value={kpis.critiques || 0} color="red" />
        <KpiCard icon={<Package size={17} />} label="Ruptures" value={kpis.ruptures || 0} color="grey" />
        <KpiCard icon={<ArrowUpDown size={17} />} label="Mouvements (période)" value={kpis.total_mouvements || 0} color="blue" />
        <KpiCard icon={<ArrowDownToLine size={17} />} label="Entrées (période)" value={kpis.entrees_periode || 0} color="green" />
        <KpiCard icon={<ArrowUpFromLine size={17} />} label="Sorties (période)" value={kpis.sorties_periode || 0} color="orange" />
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '12px 16px' }}>
          <SectionTitle>Stock actuel — {emp}</SectionTitle>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="cin-spin" /></div>
        ) : filteredArticles.length === 0 ? (
          <EmptyState
            icon={<Package size={24} />}
            title="Aucun article sur cet emplacement"
            sub="Aucune quantité selon le filtre de visibilité."
          />
        ) : (
          <div className="table-wrap">
            <table className="inv-stocks-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Catégorie</th>
                  <th>Qté actuelle</th>
                  <th>Unité</th>
                  <th>Valeur</th>
                  <th>Dernière entrée</th>
                  <th>Dernière sortie</th>
                  <th>Dernier mvt</th>
                  <th>État</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((x) => {
                  const cat = (categories || []).find((c) => String(c.id) === String(x.categorie_id));
                  const st = x.etat_emplacement || {};
                  return (
                    <tr key={x._rowKey} style={{ cursor: 'pointer' }} onClick={() => setDetailRow(x)}>
                      <td><strong style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{x.code}</strong></td>
                      <td style={{ fontWeight: 600 }}>{x.designation}</td>
                      <td>{cat?.nom || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>{x.stock_actuel}</td>
                      <td style={{ color: 'var(--text-3)' }}>{x.unite || '—'}</td>
                      <td style={{ color: 'var(--red)' }}>{x.valeur_actuelle ? formatMAD(x.valeur_actuelle) : '—'}</td>
                      <td style={{ fontSize: '0.72rem' }}>{x.derniere_entree ? fmtMvtDate(x.derniere_entree) : '—'}</td>
                      <td style={{ fontSize: '0.72rem' }}>{x.derniere_sortie ? fmtMvtDate(x.derniere_sortie) : '—'}</td>
                      <td style={{ fontSize: '0.72rem' }}>
                        {x.dernier_mouvement
                          ? <>{fmtMvtDate(x.dernier_mouvement)}<br /><span style={{ color: 'var(--text-3)' }}>{x.dernier_mouvement.operation_label || x.dernier_mouvement.label}</span></>
                          : '—'}
                      </td>
                      <td><span className={`badge ${st.cls || 'badge-grey'}`}>{st.label || '—'}</span></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailRow(x)}>Détail</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmplacementExtraFilters({
  periodKey, setPeriodKey, customFrom, setCustomFrom, customTo, setCustomTo,
  visibility, setVisibility,
}) {
  return (
    <>
      <select value={visibility} onChange={(e) => setVisibility(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
        <option value="avec_stock">Avec stock</option>
        <option value="rupture">Rupture (ayant eu mvt)</option>
        <option value="avec_mouvement">Tous ayant eu un mouvement</option>
        <option value="sans_mouvement">Sans mouvement</option>
        <option value="tous">Tous</option>
      </select>
      <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
        <option value="all">Toute période</option>
        <option value="today">Aujourd&apos;hui</option>
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="month">Mois en cours</option>
        <option value="custom">Personnalisée</option>
      </select>
      {periodKey === 'custom' && (
        <>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 140 }} />
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 140 }} />
        </>
      )}
    </>
  );
}
