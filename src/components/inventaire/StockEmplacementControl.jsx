/**
 * StockEmplacementControl.jsx — Vue de contrôle Stocks filtrée par emplacement.
 * Contenu actuel + historique + fiche article×emplacement.
 */
import { useMemo, useState } from 'react';
import {
  Package, History, ChevronLeft, ArrowDownToLine, ArrowUpFromLine, Loader2,
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
  filterTypeMvt = '',
  filterProjet = '',
  filterUser = '',
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
      // visibility === 'tous' → tout
      return matchQ && matchCat && matchVis;
    });
  }, [controlView, search, filterCat, visibility]);

  const filteredHistory = useMemo(() => {
    let rows = controlView?.history || [];
    if (filterTypeMvt) {
      rows = rows.filter((h) => h.normalized_type === filterTypeMvt || h.type_mouvement === filterTypeMvt);
    }
    if (filterProjet) {
      const q = filterProjet.toLowerCase();
      rows = rows.filter((h) => String(h.projet || '').toLowerCase().includes(q));
    }
    if (filterUser) {
      const q = filterUser.toLowerCase();
      rows = rows.filter((h) => String(h.cree_par || '').toLowerCase().includes(q));
    }
    return rows;
  }, [controlView, filterTypeMvt, filterProjet, filterUser]);

  const kpis = controlView?.kpis || {};
  const emp = controlView?.emplacement || '';

  if (detailRow) {
    const ledger = filteredHistory.filter((h) => String(h.article_id) === String(detailRow.id || detailRow.article_id));
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
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
            {[
              ['Quantité actuelle', `${detailRow.stock_actuel} ${detailRow.unite || ''}`],
              ['Valeur actuelle', detailRow.valeur_actuelle ? formatMAD(detailRow.valeur_actuelle) : '—'],
              ['Total entré', detailRow.total_entree],
              ['Total sorti', detailRow.total_sortie],
              ['Transfert entrant', detailRow.total_transfer_in],
              ['Transfert sortant', detailRow.total_transfer_out],
              ['Consommé', detailRow.total_consomme],
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

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px' }}>
            <SectionTitle icon={<History size={12} />}>Historique chronologique — solde après chaque mouvement</SectionTitle>
          </div>
          {ledger.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--text-3)' }}>Aucun mouvement sur cet emplacement.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opération</th>
                    <th>Qté</th>
                    <th>Sens</th>
                    <th>Contrepartie</th>
                    <th>Motif</th>
                    <th>Par</th>
                    <th>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((h) => (
                    <tr key={h.id} style={{ opacity: h.applicable ? 1 : 0.55 }}>
                      <td style={{ fontSize: '0.78rem' }}>{h.date_label}</td>
                      <td style={{ fontSize: '0.78rem' }}>{h.operation_label}</td>
                      <td style={{ fontWeight: 700 }}>{h.quantite}</td>
                      <td style={{ color: h.inbound ? 'var(--green, #2e7d32)' : 'var(--red)', fontWeight: 700 }}>
                        {h.inbound ? `+${h.inbound}` : `−${h.outbound}`}
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>
                        {h.inbound
                          ? (h.emplacement_source ? `Depuis ${h.emplacement_source}` : '—')
                          : (h.emplacement_destination ? `Vers ${h.emplacement_destination}` : '—')}
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>{h.motif || h.note || '—'}</td>
                      <td style={{ fontSize: '0.75rem' }}>{h.cree_par || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>
                        {h.solde_apres == null ? '—' : h.solde_apres}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      {(controlView?.anomalies || []).length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--orange, #e65100)' }}>
          <SectionTitle>Anomalies détectées ({controlView.anomalies.length})</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: 'var(--text-2)' }}>
            {controlView.anomalies.slice(0, 12).map((a, i) => (
              <li key={`${a.type}-${a.ref}-${i}`}>{a.type} — {a.ref || 'sans réf.'}</li>
            ))}
          </ul>
        </div>
      )}

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
            sub="Aucun mouvement applicable ou quantité selon le filtre de visibilité."
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

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px' }}>
          <SectionTitle icon={<History size={12} />}>Historique de l&apos;emplacement</SectionTitle>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3)' }}>
            Tous les mouvements où {emp} est source ou destination.
          </p>
        </div>
        {filteredHistory.length === 0 ? (
          <p style={{ padding: 16, color: 'var(--text-3)' }}>Aucun mouvement.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Réf.</th>
                  <th>Article</th>
                  <th>Type</th>
                  <th>Qté</th>
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
                {filteredHistory.slice(0, 300).map((h) => (
                  <tr key={h.id} style={{ opacity: h.applicable ? 1 : 0.5 }}>
                    <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h.date_label}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.ref || '—'}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      <strong>{h.article_code}</strong><br />{h.article_designation}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{h.operation_label}</td>
                    <td>{h.quantite}</td>
                    <td style={{ color: '#2e7d32', fontWeight: 700 }}>{h.inbound || '—'}</td>
                    <td style={{ color: 'var(--red)', fontWeight: 700 }}>{h.outbound || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.emplacement_source || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.emplacement_destination || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.motif || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.projet || '—'}</td>
                    <td style={{ fontSize: '0.72rem' }}>{h.cree_par || '—'}</td>
                    <td style={{ fontWeight: 800 }}>{h.solde_apres == null ? '—' : h.solde_apres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Petit panneau filtres emplacement (période / visibilité) — rendu par le parent si besoin */
export function EmplacementExtraFilters({
  periodKey, setPeriodKey, customFrom, setCustomFrom, customTo, setCustomTo,
  visibility, setVisibility, filterTypeMvt, setFilterTypeMvt,
  filterProjet, setFilterProjet, filterUser, setFilterUser,
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
      <select value={filterTypeMvt} onChange={(e) => setFilterTypeMvt(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
        <option value="">Tous types mvt</option>
        <option value="entry">Entrées</option>
        <option value="exit">Sorties / conso</option>
        <option value="transfer">Transferts</option>
      </select>
      <input
        value={filterProjet}
        onChange={(e) => setFilterProjet(e.target.value)}
        placeholder="Projet…"
        style={{ ...INPUT_STYLE, maxWidth: 140 }}
      />
      <input
        value={filterUser}
        onChange={(e) => setFilterUser(e.target.value)}
        placeholder="Utilisateur…"
        style={{ ...INPUT_STYLE, maxWidth: 140 }}
      />
    </>
  );
}
