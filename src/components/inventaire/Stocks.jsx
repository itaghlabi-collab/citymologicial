/**
 * Stocks.jsx — Centre de gestion opérationnelle de l'inventaire.
 * Réutilise saveMouvementRapide, updateStockArticle, getMovements — aucune logique dupliquée.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart2, Package, AlertTriangle, ArrowUpDown, Search, Filter, Plus,
  ChevronLeft, Edit2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Scale, History, Zap, Loader2, FileText, Barcode,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, EMPLACEMENTS_STOCK,
  KpiCard, EmptyState, Modal, SectionTitle, formatMAD, StockAlert,
  BADGE_CURRENT_STATE,
  FILTER_SANS_EMPLACEMENT, formatEmplacementDisplay, filterVisibleEmplacements, isSansEmplacement,
  matchesStockSearch,
} from './shared.jsx';
import StockOpsActions from './StockOpsActions';
import StockDirectMovementModal from './StockDirectMovementModal';
import StockFicheEditModal from './StockFicheEditModal';
import ArticleCatalogForm from './ArticleCatalogForm';
import { ArticleMovementHistory } from './ArticleQuickActions';
import StockEmplacementControl, { EmplacementExtraFilters } from './StockEmplacementControl';
import { STOCK_FILTER_KEY } from './BonMouvementTraceabilite';
import { useStockArticles } from '../../hooks/useStockArticles';
import { listStockLevelsForArticle } from '../../services/inventaire/stockArticles';
import {
  listAllStockLevels,
  listAllStockMovementsRaw,
  expandArticlesByEmplacement,
  buildEmplacementControlView,
  rebuildStockLevelsFromMovements,
  subscribeStockChanged,
  periodRange,
} from '../../services/inventaire/stockSync';
import { can } from '../../services/admin/permissions';
import { useAuth } from '../../hooks/useAuth';
import { getArticleBarcodeValue } from '../../services/inventaire/barcodeUtils';
import { useIsMobile } from '../../hooks/useIsMobile';

function getStatutStock(qte, seuil) {
  const q = Number(qte) || 0;
  const s = Number(seuil) || 0;
  if (q === 0) return { label: 'Rupture', cls: 'badge-red' };
  if (s > 0 && q <= s * 0.5) return { label: 'Critique', cls: 'badge-red' };
  if (s > 0 && q <= s) return { label: 'Bas', cls: 'badge-orange' };
  return { label: 'Normal', cls: 'badge-green' };
}

function collectDocs(article, movements = []) {
  const docs = [];
  const push = (label, value) => {
    const v = String(value || '').trim();
    if (!v || docs.some((d) => d.value === v)) return;
    docs.push({ label, value: v });
  };
  push('Facture', article?.facture || article?.reference_facture);
  push('Photo', article?.photo || article?.photo_url);
  push('Fiche technique', article?.fiche_technique);
  (movements || []).forEach((m) => {
    const p = m.payload || {};
    push('Facture / BL', p.reference_facture || p.reference_facture_bl);
    if (m.ref) push('Mouvement', m.ref);
  });
  return docs;
}

function StockFiche({
  article, categories, movements, movementsLoading, stockLevels, stockLevelsLoading,
  onBack, onEditFiche, onEditCatalog, onMvt, onHistory, onMouvementRapide,
}) {
  const cat = (categories || []).find((c) => String(c.id) === String(article.categorie_id));
  const catName = cat ? (cat.nom || cat.name) : '—';
  const s = getStatutStock(article.stock_actuel, article.stock_minimum);
  const stateBadge = BADGE_CURRENT_STATE[article.current_state] || 'badge-grey';
  const docs = collectDocs(article, movements);
  const valTot = (Number(article.valeur) || 0) * (Number(article.stock_actuel) || 0);

  return (
    <div className="animate-fade-in inv-article-detail">
      <div className="finance-page-actions" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={15} /> Retour</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.72rem', color: 'var(--red)' }}>{article.code}</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>{article.designation}</h2>
        </div>
        <span className={`badge ${s.cls}`}>{s.label}</span>
        <span className={`badge ${stateBadge}`}>{article.current_state || 'Disponible'}</span>
      </div>

      <div className="inv-article-detail-quickbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onMvt('Entrée')}><ArrowDownToLine size={13} /> Entrée</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMvt('Sortie')}><ArrowUpFromLine size={13} /> Sortie</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMvt('Transfert')}><ArrowLeftRight size={13} /> Transfert</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMvt('Régularisation')}><Scale size={13} /> Régularisation</button>
        {onMouvementRapide && <button type="button" className="btn btn-ghost btn-sm" onClick={onMouvementRapide}><Zap size={13} /> Mouvement rapide</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEditFiche}><Edit2 size={13} /> Modifier la fiche stock</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEditCatalog}><Package size={13} /> Modifier l&apos;article catalogue</button>
      </div>

      <div className="finance-detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>En-tête article (catalogue)</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Code', article.code],
                ['Désignation', article.designation],
                ['Catégorie', catName],
                ['Type', article.type],
                ['Unité', article.unite],
                ['Code-barres', getArticleBarcodeValue(article)],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: l === 'Désignation' ? 700 : 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>Répartition par emplacement</SectionTitle>
            {stockLevelsLoading ? (
              <div style={{ color: 'var(--text-3)' }}><Loader2 size={14} className="cin-spin" /> Chargement…</div>
            ) : (stockLevels || []).filter((l) => Number(l.quantite) > 0).length === 0 ? (
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun stock par emplacement.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emplacement</th>
                      <th>Quantité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stockLevels || []).filter((l) => Number(l.quantite) > 0).map((l) => (
                      <tr key={l.id || l.emplacement}>
                        <td>{formatEmplacementDisplay(l.emplacement)}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>{l.quantite} {article.unite}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<FileText size={12} />}>Documents</SectionTitle>
            {docs.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun document.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {docs.map((d) => <li key={`${d.label}-${d.value}`} style={{ fontSize: '0.84rem' }}><strong>{d.label}</strong> — {d.value}</li>)}
              </ul>
            )}
          </div>

          <div className="card" id="stock-historique">
            <SectionTitle icon={<History size={12} />}>Historique des mouvements</SectionTitle>
            <ArticleMovementHistory movements={movements} loading={movementsLoading} />
            {movements?.length > 10 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={onHistory}>Voir tout</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Indicateurs de stock</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Quantité disponible</span>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem' }}>
                  {article.stock_actuel || 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>{article.unite}</span>
                  <StockAlert qte={article.stock_actuel || 0} seuil={article.stock_minimum} />
                </div>
              </div>
              <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Stock minimum</span><div style={{ fontWeight: 600 }}>{article.stock_minimum || '—'}</div></div>
              <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Valeur unitaire</span><div style={{ fontWeight: 700, color: 'var(--red)' }}>{article.valeur ? formatMAD(article.valeur) : '—'}</div></div>
              <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Valeur totale</span><div style={{ fontWeight: 700, color: 'var(--red)' }}>{valTot > 0 ? formatMAD(valTot) : '—'}</div></div>
              <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>État</span><div>{article.etat || '—'}</div></div>
              <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Emplacement</span><div>{formatEmplacementDisplay(article.emplacement)}</div></div>
              <div><span className={`badge ${s.cls}`}>{s.label}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Stocks({
  articles: articlesProp,
  categories,
  depots,
  emplacementsList = EMPLACEMENTS_STOCK,
  onNavigate,
  onArticlesChange,
}) {
  const { user } = useAuth();
  const {
    records: hookArticles, loading, saving, reload, save, archive, remove, getMovements,
  } = useStockArticles();

  const arts = (hookArticles?.length ? hookArticles : articlesProp) || [];
  const [levels, setLevels] = useState([]);
  const [allMovements, setAllMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildReport, setRebuildReport] = useState(null);
  const [rebuildError, setRebuildError] = useState('');
  const [periodKey, setPeriodKey] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [visibility, setVisibility] = useState('avec_stock');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [filterAlerte, setFilterAlerte] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [mvtModal, setMvtModal] = useState(null);
  const [editFiche, setEditFiche] = useState(null);
  const [catalogModal, setCatalogModal] = useState(null);
  const [afterCreatePrompt, setAfterCreatePrompt] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [docsModal, setDocsModal] = useState(null);
  const [detailMovements, setDetailMovements] = useState([]);
  const [detailMovementsLoading, setDetailMovementsLoading] = useState(false);
  const [detailLevels, setDetailLevels] = useState([]);
  const [detailLevelsLoading, setDetailLevelsLoading] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const isMobile = useIsMobile();

  const loadLevels = useCallback(async () => {
    try {
      const rows = await listAllStockLevels();
      setLevels(rows || []);
    } catch (err) {
      console.error('[CITYMO] Stocks levels', err);
      setLevels([]);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    try {
      const rows = await listAllStockMovementsRaw();
      setAllMovements(rows || []);
    } catch (err) {
      console.error('[CITYMO] Stocks movements', err);
      setAllMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLevels();
    loadMovements();
  }, [loadLevels, loadMovements]);

  useEffect(() => {
    if (onArticlesChange && hookArticles?.length) onArticlesChange(hookArticles);
  }, [hookArticles, onArticlesChange]);

  useEffect(() => subscribeStockChanged(() => {
    loadLevels();
    loadMovements();
  }), [loadLevels, loadMovements]);

  const stockRows = useMemo(
    () => expandArticlesByEmplacement(arts, levels),
    [arts, levels],
  );

  const period = useMemo(
    () => periodRange(periodKey, customFrom, customTo),
    [periodKey, customFrom, customTo],
  );

  const controlView = useMemo(() => {
    if (!filterEmplacement || filterEmplacement === FILTER_SANS_EMPLACEMENT) return null;
    return buildEmplacementControlView({
      articles: arts,
      movements: allMovements,
      emplacement: filterEmplacement,
      levels,
      period,
    });
  }, [filterEmplacement, arts, allMovements, levels, period]);

  useEffect(() => {
    let cancelled = false;
    can(user, 'stocks', 'supprimer').then((ok) => { if (!cancelled) setCanDelete(ok); }).catch(() => { if (!cancelled) setCanDelete(false); });
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  const detailArt = detailId ? arts.find((a) => a.id === detailId) : null;

  // Ouverture depuis Articles de stock / navigation / lien traçabilité
  useEffect(() => {
    try {
      const empFilter = sessionStorage.getItem(STOCK_FILTER_KEY);
      if (empFilter) {
        sessionStorage.removeItem(STOCK_FILTER_KEY);
        setFilterEmplacement(empFilter);
        setShowFilters(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (loading || !arts.length) return;
    let raw;
    try {
      raw = sessionStorage.getItem('citymo_stock_open_article');
      if (!raw) return;
      sessionStorage.removeItem('citymo_stock_open_article');
    } catch {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { code: raw };
    }
    const article = arts.find((a) => a.id === parsed?.id)
      || arts.find((a) => a.code === String(parsed?.code || '').trim());
    if (article) setDetailId(article.id);
  }, [loading, arts]);

  useEffect(() => {
    if (!detailId) {
      setDetailMovements([]);
      setDetailLevels([]);
      return undefined;
    }
    let cancelled = false;
    setDetailMovementsLoading(true);
    setDetailLevelsLoading(true);
    Promise.all([getMovements(detailId), listStockLevelsForArticle(detailId)])
      .then(([mvts, levels]) => {
        if (cancelled) return;
        setDetailMovements(mvts || []);
        setDetailLevels(levels || []);
      })
      .catch(() => {
        if (!cancelled) { setDetailMovements([]); setDetailLevels([]); }
      })
      .finally(() => {
        if (!cancelled) { setDetailMovementsLoading(false); setDetailLevelsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [detailId, getMovements]);

  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), loadLevels(), loadMovements()]);
    if (detailId) {
      const [mvts, lv] = await Promise.all([getMovements(detailId), listStockLevelsForArticle(detailId)]);
      setDetailMovements(mvts || []);
      setDetailLevels(lv || []);
    }
  }, [reload, loadLevels, loadMovements, detailId, getMovements]);

  function openHistory(article) {
    setHistoryModal(article);
    setHistoryLoading(true);
    getMovements(article.id)
      .then((rows) => setHistoryRows(rows || []))
      .catch(() => setHistoryRows([]))
      .finally(() => setHistoryLoading(false));
  }

  function goMouvementRapide(article) {
    try {
      sessionStorage.setItem('citymo_mr_prefill_article', JSON.stringify({
        id: article.id, code: article.code, designation: article.designation, type: undefined,
      }));
    } catch { /* ignore */ }
    onNavigate?.('mouvement-rapide');
  }

  async function handleCatalogSave(form) {
    const isCreate = !catalogModal?.article?.id;
    const res = await save(form, catalogModal?.article?.id);
    if (!res.success) return;
    setCatalogModal(null);
    await refreshAll();
    if (isCreate) {
      setAfterCreatePrompt({ code: form.code, designation: form.designation });
    }
  }

  async function handleDesactiver(article) {
    if (!window.confirm(`Désactiver « ${article.designation} » ?`)) return;
    await archive(article.id);
    setDetailId(null);
    await refreshAll();
  }

  async function handleDelete(article) {
    if (!canDelete) return;
    if (!window.confirm('Supprimer définitivement ? Impossible s’il y a stock ou mouvements.')) return;
    const res = await remove(article.id);
    if (res?.success !== false) {
      setDetailId(null);
      await refreshAll();
    }
  }

  async function runRebuildDryRun() {
    setRebuildBusy(true);
    setRebuildError('');
    try {
      const res = await rebuildStockLevelsFromMovements({ dryRun: true });
      setRebuildReport(res);
    } catch (err) {
      setRebuildError(err?.message || 'Erreur recalcul.');
    } finally {
      setRebuildBusy(false);
    }
  }

  async function runRebuildApply() {
    if (!rebuildReport) return;
    if (!window.confirm(
      `Écrire ${rebuildReport.divergences?.length || 0} correction(s) dans stock_levels ?\nAucun mouvement ne sera supprimé.`,
    )) return;
    setRebuildBusy(true);
    setRebuildError('');
    try {
      const res = await rebuildStockLevelsFromMovements({ dryRun: false });
      setRebuildReport(res);
      await refreshAll();
    } catch (err) {
      setRebuildError(err?.message || 'Erreur écriture stock.');
    } finally {
      setRebuildBusy(false);
    }
  }

  const filtered = useMemo(() => stockRows.filter((x) => {
    const cat = (categories || []).find((c) => String(c.id) === String(x.categorie_id));
    const matchQ = matchesStockSearch(x, search, `${cat?.nom || ''} ${getArticleBarcodeValue(x)}`);
    const matchCat = !filterCat || String(x.categorie_id) === String(filterCat);

    const emp = String(x.emplacement || '').trim();
    let matchEmp = true;
    if (filterEmplacement === FILTER_SANS_EMPLACEMENT) {
      matchEmp = isSansEmplacement(emp) || !x.is_level_row;
    } else if (filterEmplacement) {
      matchEmp = emp.toLowerCase() === String(filterEmplacement).trim().toLowerCase();
    }

    const qte = Number(x.stock_actuel) || 0;
    const seuil = Number(x.stock_minimum) || 0;
    let matchAlerte = true;
    if (filterAlerte === 'critique') matchAlerte = seuil > 0 && qte <= seuil * 0.5 && qte > 0;
    if (filterAlerte === 'bas') matchAlerte = seuil > 0 && qte > seuil * 0.5 && qte <= seuil;
    if (filterAlerte === 'rupture') matchAlerte = qte === 0;
    if (filterAlerte === 'normal') matchAlerte = seuil === 0 || qte > seuil;

    // Par défaut : uniquement quantités > 0 (rupture via filtre d'état)
    if (!filterAlerte && qte <= 0) return false;

    return matchQ && matchCat && matchEmp && matchAlerte;
  }), [stockRows, categories, search, filterCat, filterEmplacement, filterAlerte]);

  const emplacements = useMemo(
    () => filterVisibleEmplacements(emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK),
    [emplacementsList],
  );

  // KPI selon le filtre actif (lignes affichables avant filtre alerte pour totaux emplacement)
  const kpiRows = useMemo(() => {
    if (!filterEmplacement && !filterCat && !search && !filterAlerte) {
      // Global : agréger par article pour éviter de compter N fois
      return arts;
    }
    return filtered;
  }, [filterEmplacement, filterCat, search, filterAlerte, arts, filtered]);

  const valeurTotale = useMemo(() => {
    if (!filterEmplacement && !filterCat && !search && !filterAlerte) {
      return arts.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);
    }
    return filtered.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);
  }, [filterEmplacement, filterCat, search, filterAlerte, arts, filtered]);

  const stockFaible = kpiRows.filter((a) => a.stock_minimum && Number(a.stock_actuel) <= Number(a.stock_minimum) && Number(a.stock_actuel) > 0).length;
  const stockCritique = kpiRows.filter((a) => a.stock_minimum && Number(a.stock_actuel) <= Number(a.stock_minimum) * 0.5 && Number(a.stock_actuel) > 0).length;
  const ruptures = kpiRows.filter((a) => Number(a.stock_actuel) === 0).length;
  const totalArticlesKpi = filterEmplacement || filterCat || search || filterAlerte
    ? new Set(filtered.map((r) => r.id)).size
    : arts.length;
  const alertes = kpiRows.filter((a) => {
    const q = Number(a.stock_actuel) || 0;
    const s = Number(a.stock_minimum) || 0;
    return s > 0 && q <= s;
  });

  // Resolve article after create for entrée prompt
  useEffect(() => {
    if (!afterCreatePrompt?.code || !arts.length) return;
    const art = arts.find((a) => a.code === afterCreatePrompt.code);
    if (art) setAfterCreatePrompt((p) => (p ? { ...p, article: art } : null));
  }, [arts, afterCreatePrompt?.code]);

  if (detailArt) {
    return (
      <div className="animate-fade-in">
        <StockFiche
          article={detailArt}
          categories={categories}
          movements={detailMovements}
          movementsLoading={detailMovementsLoading}
          stockLevels={detailLevels}
          stockLevelsLoading={detailLevelsLoading}
          onBack={() => setDetailId(null)}
          onEditFiche={() => setEditFiche(detailArt)}
          onEditCatalog={() => setCatalogModal({ article: detailArt })}
          onMvt={(type) => setMvtModal({ type, article: detailArt })}
          onHistory={() => openHistory(detailArt)}
          onMouvementRapide={() => goMouvementRapide(detailArt)}
        />
        <StockDirectMovementModal
          open={!!mvtModal}
          type={mvtModal?.type}
          article={mvtModal?.article}
          emplacementsList={emplacementsList}
          onClose={() => setMvtModal(null)}
          onDone={refreshAll}
        />
        <StockFicheEditModal
          open={!!editFiche}
          article={editFiche}
          emplacementsList={emplacementsList}
          onClose={() => setEditFiche(null)}
          onDone={refreshAll}
        />
        <Modal open={!!catalogModal} onClose={() => !saving && setCatalogModal(null)} title={catalogModal?.article ? 'Modifier l’article catalogue' : 'Nouvel article'} width={760}>
          {catalogModal && (
            <ArticleCatalogForm
              initial={catalogModal.article || null}
              categories={categories}
              onSave={handleCatalogSave}
              onCancel={() => setCatalogModal(null)}
              saving={saving}
            />
          )}
        </Modal>
        <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title="Historique des mouvements" width={900}>
          {historyLoading ? <Loader2 className="cin-spin" /> : <ArticleMovementHistory movements={historyRows} loading={false} />}
        </Modal>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">STOCKS</h1>
          <p className="page-subtitle finance-sub-hide-mobile">
            {filterEmplacement && filterEmplacement !== FILTER_SANS_EMPLACEMENT
              ? `Contrôle emplacement — ${filterEmplacement}`
              : 'Gestion opérationnelle des quantités, emplacements et mouvements.'}
          </p>
        </div>
        <div className="finance-page-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCatalogModal({ article: null })}>
            <Plus size={14} /> Nouvel article
          </button>
          {onNavigate && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('mouvement-rapide')}>
              <Zap size={14} /> Mouvement rapide
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRebuildOpen(true); setRebuildReport(null); setRebuildError(''); }}>
            <Scale size={14} /> Recalculer stocks
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
        </div>
      </div>

      {(showFilters || !!filterEmplacement) ? (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, désignation…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes catégories</option>
              {(categories || []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={filterEmplacement} onChange={(e) => setFilterEmplacement(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
              <option value="">Tous emplacements</option>
              <option value={FILTER_SANS_EMPLACEMENT}>Sans emplacement</option>
              {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            {!controlView && (
              <select value={filterAlerte} onChange={(e) => setFilterAlerte(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
                <option value="">Tous états</option>
                <option value="normal">Normal</option>
                <option value="bas">Stock bas</option>
                <option value="critique">Critique</option>
                <option value="rupture">Rupture</option>
              </select>
            )}
            {controlView && (
              <EmplacementExtraFilters
                periodKey={periodKey}
                setPeriodKey={setPeriodKey}
                customFrom={customFrom}
                setCustomFrom={setCustomFrom}
                customTo={customTo}
                setCustomTo={setCustomTo}
                visibility={visibility}
                setVisibility={setVisibility}
              />
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch(''); setFilterCat(''); setFilterEmplacement(''); setFilterAlerte('');
                setPeriodKey('all'); setVisibility('avec_stock');
                setCustomFrom(''); setCustomTo('');
              }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans le stock…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {controlView ? (
        <StockEmplacementControl
          controlView={controlView}
          loading={loading || movementsLoading}
          visibility={visibility}
          search={search}
          filterCat={filterCat}
          categories={categories}
          onOpenArticle={(row) => setDetailId(row.id || row.article_id)}
          onMvt={(type, row) => setMvtModal({ type, article: row })}
        />
      ) : (
        <>
      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<BarChart2 size={17} />} label="Valeur totale stock" value={formatMAD(valeurTotale)} color="red" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Stock faible" value={stockFaible} color="orange" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Articles critiques" value={stockCritique} color="red" />
        <KpiCard icon={<Package size={17} />} label="Ruptures de stock" value={ruptures} color="grey" />
        <KpiCard icon={<ArrowUpDown size={17} />} label="Total articles" value={totalArticlesKpi} color="blue" />
      </div>

      {alertes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.82rem', color: 'var(--red)' }}>
              Alertes stock ({alertes.length})
            </span>
          </div>
        </div>
      )}

      {isMobile ? (
        <div className="card stock-mobile-view inv-stock-mobile-list">
          {loading && !arts.length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 className="cin-spin" /> Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package size={24} />}
              title="Aucun article en stock"
              sub={filterEmplacement
                ? `Aucune quantité à « ${filterEmplacement} ». Vérifiez les transferts ou lancez un recalcul.`
                : 'Créez un article catalogue puis effectuez une entrée.'}
            />
          ) : filtered.map((x) => {
            const st = getStatutStock(x.stock_actuel, x.stock_minimum);
            return (
              <div key={x._rowKey || x.id} className="inv-stock-mobile-row">
                <button type="button" className="inv-stock-mobile-main" onClick={() => setDetailId(x.id)}>
                  <div className="inv-stock-mobile-icon" aria-hidden><Package size={18} style={{ color: 'var(--red)' }} /></div>
                  <div className="inv-stock-mobile-name">
                    <strong>{x.code}</strong>
                    <span className="inv-stock-mobile-designation">{x.designation}</span>
                    <span className="inv-stock-mobile-meta">Qté {x.stock_actuel || 0} {x.unite} · {formatEmplacementDisplay(x.emplacement)}</span>
                    <div className="inv-stock-mobile-badges">
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                      <span className="badge badge-grey">{x.etat}</span>
                    </div>
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn btn-ghost btn-sm" title="Entrée" onClick={() => setMvtModal({ type: 'Entrée', article: x })}><ArrowDownToLine size={14} /></button>
                  <button type="button" className="btn btn-ghost btn-sm" title="Sortie" onClick={() => setMvtModal({ type: 'Sortie', article: x })}><ArrowUpFromLine size={14} /></button>
                  <StockOpsActions
                    onOpenFiche={() => setDetailId(x.id)}
                    onEditFiche={() => setEditFiche(x)}
                    onEntree={() => setMvtModal({ type: 'Entrée', article: x })}
                    onSortie={() => setMvtModal({ type: 'Sortie', article: x })}
                    onTransfert={() => setMvtModal({ type: 'Transfert', article: x })}
                    onRegulariser={() => setMvtModal({ type: 'Régularisation', article: x })}
                    onHistory={() => openHistory(x)}
                    onDocuments={() => setDocsModal(x)}
                    onEditCatalog={() => setCatalogModal({ article: x })}
                    onMouvementRapide={onNavigate ? () => goMouvementRapide(x) : undefined}
                    onDesactiver={() => handleDesactiver(x)}
                    onDelete={() => handleDelete(x)}
                    canDelete={canDelete}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card stock-desktop-view" style={{ padding: 0 }}>
          {loading && !arts.length ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 className="cin-spin" /> Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package size={24} />}
              title="Aucun article en stock"
              sub={filterEmplacement
                ? `Aucune quantité à « ${filterEmplacement} ». Vérifiez les transferts ou lancez un recalcul.`
                : 'Créez un article catalogue puis effectuez une entrée.'}
            />
          ) : (
            <div className="table-wrap">
              <table className="inv-stocks-table inv-articles-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Code-barres</th>
                    <th>Désignation</th>
                    <th>Catégorie</th>
                    <th>Type</th>
                    <th>Emplacement</th>
                    <th>Qté</th>
                    <th>Min.</th>
                    <th>État</th>
                    <th>Valeur u.</th>
                    <th>Valeur tot.</th>
                    <th>Statut</th>
                    <th>Dernier mvt</th>
                    <th style={{ width: 48 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x) => {
                    const cat = (categories || []).find((c) => String(c.id) === String(x.categorie_id));
                    const st = getStatutStock(x.stock_actuel, x.stock_minimum);
                    const etatBadge = x.etat === 'Neuf' ? 'badge-green' : x.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange';
                    const valTot = (Number(x.valeur) || 0) * (Number(x.stock_actuel) || 0);
                    const barcode = getArticleBarcodeValue(x);
                    return (
                      <tr key={x._rowKey || x.id} className="inv-articles-row" style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                        <td><span className="inv-articles-ref">{x.code}</span></td>
                        <td data-label="Code-barres">
                          <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-2)' }}>
                            <Barcode size={12} /> {barcode || '—'}
                          </span>
                        </td>
                        <td><div className="inv-articles-name">{x.designation}</div></td>
                        <td>{cat ? <span className="badge badge-blue inv-articles-badge">{cat.nom}</span> : '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>{x.type || '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>{formatEmplacementDisplay(x.emplacement)}</td>
                        <td>
                          <span className="inv-articles-qty" style={{ color: st.cls === 'badge-red' ? 'var(--red)' : undefined }}>{x.stock_actuel || 0}</span>
                          <span className="inv-articles-unit">{x.unite}</span>
                        </td>
                        <td style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{x.stock_minimum || '—'}</td>
                        <td><span className={`badge ${etatBadge} inv-articles-badge`}>{x.etat}</span></td>
                        <td className="inv-articles-value">{x.valeur ? formatMAD(x.valeur) : '—'}</td>
                        <td className="inv-articles-value" style={{ color: 'var(--red)' }}>{valTot > 0 ? formatMAD(valTot) : '—'}</td>
                        <td><span className={`badge ${st.cls} inv-articles-badge`}>{st.label}</span></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                          {x.dernier_mouvement ? (
                            <>{x.dernier_mouvement.date_label}<br /><span style={{ color: 'var(--text-3)' }}>{x.dernier_mouvement.action}</span></>
                          ) : '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <StockOpsActions
                            onOpenFiche={() => setDetailId(x.id)}
                            onEditFiche={() => setEditFiche(x)}
                            onEntree={() => setMvtModal({ type: 'Entrée', article: x })}
                            onSortie={() => setMvtModal({ type: 'Sortie', article: x })}
                            onTransfert={() => setMvtModal({ type: 'Transfert', article: x })}
                            onRegulariser={() => setMvtModal({ type: 'Régularisation', article: x })}
                            onHistory={() => openHistory(x)}
                            onDocuments={() => setDocsModal(x)}
                            onEditCatalog={() => setCatalogModal({ article: x })}
                            onMouvementRapide={onNavigate ? () => goMouvementRapide(x) : undefined}
                            onDesactiver={() => handleDesactiver(x)}
                            onDelete={() => handleDelete(x)}
                            canDelete={canDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
        </>
      )}

      <StockDirectMovementModal
        open={!!mvtModal}
        type={mvtModal?.type}
        article={mvtModal?.article}
        emplacementsList={emplacementsList}
        onClose={() => setMvtModal(null)}
        onDone={refreshAll}
      />
      <StockFicheEditModal
        open={!!editFiche}
        article={editFiche}
        emplacementsList={emplacementsList}
        onClose={() => setEditFiche(null)}
        onDone={refreshAll}
      />
      <Modal open={!!catalogModal} onClose={() => !saving && setCatalogModal(null)} title={catalogModal?.article ? 'Modifier l’article catalogue' : 'Nouvel article de stock'} width={760}>
        {catalogModal && (
          <ArticleCatalogForm
            initial={catalogModal.article || null}
            categories={categories}
            onSave={handleCatalogSave}
            onCancel={() => setCatalogModal(null)}
            saving={saving}
          />
        )}
      </Modal>
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title="Historique des mouvements" width={900}>
        {historyLoading ? <div style={{ padding: 24, textAlign: 'center' }}><Loader2 className="cin-spin" /></div> : <ArticleMovementHistory movements={historyRows} loading={false} />}
      </Modal>
      <Modal open={!!docsModal} onClose={() => setDocsModal(null)} title="Documents" width={480}>
        {docsModal && (
          collectDocs(docsModal).length === 0
            ? <p style={{ color: 'var(--text-3)' }}>Aucun document.</p>
            : (
              <ul>
                {collectDocs(docsModal).map((d) => <li key={d.value}><strong>{d.label}</strong> — {d.value}</li>)}
              </ul>
            )
        )}
      </Modal>
      <Modal open={!!afterCreatePrompt} onClose={() => setAfterCreatePrompt(null)} title="Article créé" width={420}>
        <p style={{ fontSize: '0.9rem' }}>
          Article <strong>{afterCreatePrompt?.code}</strong> créé avec une quantité de zéro.
          Souhaitez-vous effectuer une entrée en stock ?
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setAfterCreatePrompt(null)}>Plus tard</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const art = afterCreatePrompt?.article || arts.find((a) => a.code === afterCreatePrompt?.code);
              setAfterCreatePrompt(null);
              if (art) setMvtModal({ type: 'Entrée', article: art });
            }}
          >
            Faire une entrée
          </button>
        </div>
      </Modal>

      <Modal
        open={rebuildOpen}
        onClose={() => !rebuildBusy && setRebuildOpen(false)}
        title="Recalcul des stocks (DRY RUN)"
        width={920}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginTop: 0 }}>
          Rejoue les mouvements validés (chronologique) pour comparer <strong>stock_levels</strong> au stock recalculé.
          Aucun mouvement n’est modifié ni supprimé. L’écriture n’a lieu qu’après confirmation explicite.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={rebuildBusy} onClick={runRebuildDryRun}>
            {rebuildBusy ? <Loader2 size={14} className="cin-spin" /> : <Scale size={14} />} Lancer DRY RUN
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={rebuildBusy || !rebuildReport || !(rebuildReport.divergences?.length)}
            onClick={runRebuildApply}
          >
            Appliquer les corrections
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={rebuildBusy} onClick={() => setRebuildOpen(false)}>Fermer</button>
        </div>
        {rebuildError && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{rebuildError}</p>}
        {rebuildReport?.summary && (
          <div style={{ fontSize: '0.82rem', marginBottom: 10, color: 'var(--text-2)' }}>
            Mouvements : {rebuildReport.summary.mouvements_appliques}/{rebuildReport.summary.mouvements_total}
            {' · '}ignorés : {rebuildReport.summary.mouvements_ignores}
            {' · '}divergences : <strong style={{ color: rebuildReport.summary.divergences ? 'var(--red)' : 'var(--green)' }}>{rebuildReport.summary.divergences}</strong>
            {rebuildReport.summary.written ? ' · écriture effectuée' : ' · mode lecture seule'}
          </div>
        )}
        {rebuildReport?.divergences?.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Emplacement</th>
                  <th>Actuel</th>
                  <th>Recalculé</th>
                  <th>Écart</th>
                  <th>Nb mvt</th>
                  <th>Dernier mvt</th>
                  <th>Anomalies</th>
                </tr>
              </thead>
              <tbody>
                {rebuildReport.divergences.slice(0, 200).map((r) => (
                  <tr key={`${r.article_id}-${r.emplacement}`}>
                    <td style={{ fontSize: '0.78rem' }}><strong>{r.article_code}</strong><br />{r.article_nom}</td>
                    <td style={{ fontSize: '0.78rem' }}>{r.emplacement}</td>
                    <td>{r.stock_actuel}</td>
                    <td>{r.stock_recalcule}</td>
                    <td style={{ color: r.ecart ? 'var(--red)' : undefined, fontWeight: 700 }}>{r.ecart}</td>
                    <td>{r.nb_mouvements ?? (r.mouvements || []).length}</td>
                    <td style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{r.dernier_mouvement || '—'}</td>
                    <td style={{ fontSize: '0.7rem', color: 'var(--red)' }}>{(r.anomalies || []).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rebuildReport && !rebuildReport.divergences?.length && (
          <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Aucune divergence : stock_levels est aligné sur l’historique.</p>
        )}
      </Modal>
    </div>
  );
}
