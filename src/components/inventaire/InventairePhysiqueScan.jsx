/**
 * InventairePhysiqueScan.jsx — Inventaire physique par scan douchette
 */
import { useState, useMemo, useEffect } from 'react';
import { ClipboardCheck, Play, RotateCcw, Loader2 } from 'lucide-react';
import { listStockArticles } from '../../services/inventaire/stockArticles';
import { useArticleScanner } from '../../hooks/useArticleScanner';
import ArticleScanBar from './ArticleScanBar.jsx';
import { EMPLACEMENTS_STOCK, INPUT_STYLE, SELECT_STYLE, KpiCard } from './shared.jsx';

export default function InventairePhysiqueScan({ emplacementsList = EMPLACEMENTS_STOCK }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [depot, setDepot] = useState('');
  const [active, setActive] = useState(false);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    listStockArticles()
      .then((rows) => setArticles(rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const {
    handleScan,
    scanning,
    scanError,
    scanSuccess,
  } = useArticleScanner({
    articles,
    onFound: (article) => {
      setCounts((prev) => {
        const id = article.id;
        const row = prev[id];
        const theorique = Number(article.stock_actuel) || 0;
        const compte = (row?.compte || 0) + 1;
        return {
          ...prev,
          [id]: { article, theorique, compte },
        };
      });
    },
  });

  const rows = useMemo(() => Object.values(counts), [counts]);

  const stats = useMemo(() => {
    let ok = 0;
    let ecart = 0;
    rows.forEach((r) => {
      if (r.compte === r.theorique) ok += 1;
      else ecart += 1;
    });
    return { scanned: rows.length, ok, ecart };
  }, [rows]);

  function updateCompte(articleId, value) {
    setCounts((prev) => {
      const row = prev[articleId];
      if (!row) return prev;
      return {
        ...prev,
        [articleId]: { ...row, compte: Math.max(0, Number(value) || 0) },
      };
    });
  }

  function resetSession() {
    setCounts({});
    setActive(false);
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <Loader2 size={24} className="cin-spin" style={{ margin: '0 auto 10px' }} />
        Chargement des articles…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between finance-page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">INVENTAIRE PAR SCAN</h1>
          <p className="page-subtitle">Comptage physique par douchette — comparez avec le stock théorique sans modifier le stock automatiquement.</p>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Dépôt / emplacement</div>
            <select value={depot} onChange={(e) => setDepot(e.target.value)} style={SELECT_STYLE} disabled={active}>
              <option value="">— Choisir le dépôt —</option>
              {emplacementsList.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!active ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!depot}
                onClick={() => setActive(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Play size={15} /> Démarrer l&apos;inventaire
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={resetSession} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={15} /> Nouvelle session
              </button>
            )}
          </div>
        </div>
      </div>

      {active && (
        <>
          <ArticleScanBar
            onScan={handleScan}
            loading={scanning}
            error={scanError}
            success={scanSuccess}
            label="Scanner un article"
            placeholder="Scannez chaque article compté (+1 à chaque scan)…"
          />

          <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 16 }}>
            <KpiCard icon={<ClipboardCheck size={17} />} label="Articles scannés" value={stats.scanned} color="blue" />
            <KpiCard icon={<ClipboardCheck size={17} />} label="Conformes" value={stats.ok} color="green" />
            <KpiCard icon={<ClipboardCheck size={17} />} label="Écarts" value={stats.ecart} color="orange" />
          </div>

          {rows.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th>Code</th>
                      <th>Théorique</th>
                      <th>Compté</th>
                      <th>Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const delta = r.compte - r.theorique;
                      const deltaColor = delta === 0 ? '#2E7D32' : delta > 0 ? '#1565C0' : '#C62828';
                      return (
                        <tr key={r.article.id}>
                          <td>{r.article.designation || r.article.nom}</td>
                          <td>{r.article.code || r.article.reference}</td>
                          <td>{r.theorique}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={r.compte}
                              onChange={(e) => updateCompte(r.article.id, e.target.value)}
                              style={{ ...INPUT_STYLE, width: 72, padding: '4px 8px' }}
                            />
                          </td>
                          <td style={{ fontWeight: 700, color: deltaColor }}>
                            {delta > 0 ? `+${delta}` : delta}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
