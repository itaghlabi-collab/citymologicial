/**
 * ArticlesStock.jsx — Articles de stock ERP CITYMO (Supabase)
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Package, Plus, Edit2, Trash2, Eye, Search, Filter, Download,
  ChevronLeft, Loader2, RefreshCw, Archive, History, CheckCircle2,
  Barcode, ScanLine, Printer,
} from 'lucide-react';
import { useStockArticles } from '../../hooks/useStockArticles';
import { useStockCategories } from '../../hooks/useStockCategories';
import { generateStockArticleCode } from '../../services/inventaire/stockArticles';
import { downloadStockArticleLabel, printStockArticleLabel, downloadStockArticleLabelsA4, LABEL_FORMATS } from '../../services/inventaire/stockArticleLabelPdf';
import BarcodeModal from './BarcodeModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import BarcodeDisplay from './BarcodeDisplay';
import ArticleQuickActions, { ArticleMovementHistory } from './ArticleQuickActions';
import { useAuth } from '../../hooks/useAuth';
import { getArticleBarcodeValue } from '../../services/inventaire/barcodeUtils';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, UNITES,
  TYPES_ARTICLE_STOCK, ETATS_ARTICLE_STOCK, STATUTS_ARTICLE_STOCK, EMPLACEMENTS_STOCK,
  CURRENT_STATES_ARTICLE, BADGE_CURRENT_STATE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, StockAlert,
} from './shared.jsx';

const PAGE_SIZE = 15;

const EMPTY_FORM = {
  code: '',
  designation: '',
  type: '',
  categorie_id: '',
  numero_serie: '',
  unite: 'U',
  valeur: '',
  stock_minimum: '',
  etat: 'Neuf',
  statut: 'Actif',
  emplacement: '',
  description: '',
  notes: '',
  quantite_initiale: '',
  emplacement_initial: '',
};

function ArticleForm({ initial, categories, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      ...EMPTY_FORM,
      ...initial,
      code: initial.code || initial.reference || '',
    };
  });
  const [errors, setErrors] = useState({});
  const [codeLoading, setCodeLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (isEdit || form.code) return;
    setCodeLoading(true);
    generateStockArticleCode()
      .then((code) => setForm((p) => (p.code ? p : { ...p, code })))
      .catch(() => {})
      .finally(() => setCodeLoading(false));
  }, [isEdit, form.code]);

  function validate() {
    const e = {};
    if (!form.designation?.trim()) e.designation = 'Requis';
    if (!form.code?.trim()) e.code = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  function emplacementOptions(current) {
    const v = (current || '').trim();
    if (v && !EMPLACEMENTS_STOCK.includes(v)) return [v, ...EMPLACEMENTS_STOCK];
    return EMPLACEMENTS_STOCK;
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Package size={12} />}>Informations article</SectionTitle>
      <FRow>
        <FField label="Code article" required>
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            readOnly={isEdit}
            placeholder={codeLoading ? 'Génération…' : 'ART-2026-0001'}
            style={{ ...INPUT_STYLE, borderColor: errors.code ? 'var(--red)' : 'var(--border)', fontFamily: 'var(--font-head)', fontWeight: 700 }}
          />
          {errors.code && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.code}</div>}
        </FField>
        <FField label="Désignation" required>
          <input
            value={form.designation}
            onChange={(e) => set('designation', e.target.value)}
            placeholder="Nom de l'article..."
            style={{ ...INPUT_STYLE, borderColor: errors.designation ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.designation && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.designation}</div>}
        </FField>
        <FField label="Type">
          <select value={form.type} onChange={(e) => set('type', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {TYPES_ARTICLE_STOCK.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Catégorie">
          <select value={form.categorie_id} onChange={(e) => set('categorie_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {(categories || []).filter((c) => c.actif === 'Oui' || c.is_active !== false).map((c) => (
              <option key={c.id} value={c.id}>{c.nom || c.name}</option>
            ))}
          </select>
        </FField>
        <FField label="N° de série">
          <input value={form.numero_serie} onChange={(e) => set('numero_serie', e.target.value)} placeholder="Optionnel" style={INPUT_STYLE} />
        </FField>
        <FField label="Unité">
          <select value={form.unite} onChange={(e) => set('unite', e.target.value)} style={SELECT_STYLE}>
            {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Valeur & Stock</SectionTitle>
      <FRow>
        <FField label="Valeur unitaire (MAD)">
          <input type="number" step="0.01" min="0" value={form.valeur} onChange={(e) => set('valeur', e.target.value)} placeholder="0.00" style={INPUT_STYLE} />
        </FField>
        <FField label="Stock minimum">
          <input type="number" min="0" value={form.stock_minimum} onChange={(e) => set('stock_minimum', e.target.value)} placeholder="Seuil alerte..." style={INPUT_STYLE} />
        </FField>
        <FField label="État">
          <select value={form.etat} onChange={(e) => set('etat', e.target.value)} style={SELECT_STYLE}>
            {ETATS_ARTICLE_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_ARTICLE_STOCK.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Emplacement</SectionTitle>
      <FRow>
        <FField label="Emplacement">
          <select value={form.emplacement} onChange={(e) => set('emplacement', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {emplacementOptions(form.emplacement).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </FField>
      </FRow>

      {!isEdit && (
        <>
          <SectionTitle>Stock initial (optionnel)</SectionTitle>
          <FRow>
            <FField label="Quantité initiale">
              <input type="number" min="0" step="0.001" value={form.quantite_initiale} onChange={(e) => set('quantite_initiale', e.target.value)} placeholder="0" style={INPUT_STYLE} />
            </FField>
            <FField label="Emplacement initial">
              <select value={form.emplacement_initial} onChange={(e) => set('emplacement_initial', e.target.value)} style={SELECT_STYLE}>
                <option value="">— Même que défaut —</option>
                {emplacementOptions(form.emplacement_initial).map((e) => (
                  <option key={`init-${e}`} value={e}>{e}</option>
                ))}
              </select>
            </FField>
          </FRow>
        </>
      )}

      <SectionTitle>Description & Notes</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description de l'article..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FField label="Notes internes">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes, remarques..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial?.id ? 'Enregistrer' : 'Ajouter article'}
        </button>
      </div>
    </form>
  );
}

function DetailArticle({
  article, categories, movements, movementsLoading, onBack, onEdit, onHistory, onArchive, onBarcode, onRefresh, userName,
}) {
  const cat = (categories || []).find((c) => String(c.id) === String(article.categorie_id));
  const catName = cat ? (cat.nom || cat.name) : '';
  const stateBadge = BADGE_CURRENT_STATE[article.current_state] || 'badge-grey';

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {article.code} — {article.designation}
        </h2>
        <span className={`badge ${stateBadge}`} style={{ fontSize: '0.72rem' }}>{article.current_state || 'Disponible'}</span>
        <span className={`badge ${article.etat === 'Neuf' ? 'badge-green' : article.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: '0.72rem' }}>{article.etat}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBarcode}><Barcode size={13} /> Code-barres</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadStockArticleLabel(article, 'standard')}><Download size={13} /> Étiquette</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => printStockArticleLabel(article, 'standard')}><Printer size={13} /> Imprimer</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onHistory}><History size={13} /> Historique</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
        {article.statut !== 'Archivé' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive}><Archive size={13} /> Archiver</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<Package size={12} />}>État actuel & informations</SectionTitle>
            <div style={{ marginBottom: 12, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>État opérationnel</span>
              <span className={`badge ${stateBadge}`}>{article.current_state || 'Disponible'}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Emplacement : <strong>{article.emplacement || '—'}</strong></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Code', article.code],
                ['Désignation', article.designation],
                ['Catégorie', catName || '—'],
                ['Type', article.type],
                ['N° série', article.numero_serie],
                ['Emplacement', article.emplacement],
                ['Valeur', article.valeur ? formatMAD(article.valeur) : '—'],
                ['Stock minimum', article.stock_minimum || '—'],
                ['État physique', article.etat],
                ['Statut', article.statut],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {article.description && (
            <div className="card" style={{ marginBottom: 14 }}>
              <SectionTitle>Description</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap' }}>{article.description}</p>
            </div>
          )}

          <ArticleQuickActions article={article} userName={userName} onDone={onRefresh} />

          <div className="card">
            <SectionTitle icon={<History size={12} />}>Historique complet</SectionTitle>
            <ArticleMovementHistory movements={movements} loading={movementsLoading} compact />
            {movements?.length > 10 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onHistory}>
                Voir tout l&apos;historique
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Stock & Valeur</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock disponible</span>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)' }}>
                  {article.stock_actuel || 0}
                  <span style={{ fontSize: '0.9rem', fontWeight: 500, marginLeft: 6, color: 'var(--text-3)' }}>{article.unite}</span>
                  <StockAlert qte={article.stock_actuel || 0} seuil={article.stock_minimum} />
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock minimum</span>
                <div style={{ fontWeight: 600 }}>{article.stock_minimum || '—'} {article.stock_minimum ? article.unite : ''}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Valeur unitaire</span>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>{article.valeur ? formatMAD(article.valeur) : '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Valeur totale stock</span>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>
                  {(article.valeur && article.stock_actuel) ? formatMAD(Number(article.valeur) * Number(article.stock_actuel)) : '—'}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <SectionTitle>Suivi</SectionTitle>
            <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><span style={{ color: 'var(--text-3)' }}>Création : </span>{article.date_creation || '—'}</div>
              <div><span style={{ color: 'var(--text-3)' }}>Dernier mouvement : </span>{article.dernier_mouvement?.date_label || '—'}{article.dernier_mouvement?.action ? ` — ${article.dernier_mouvement.action}` : ''}</div>
              <div><span style={{ color: 'var(--text-3)' }}>Dernier scan : </span>{article.last_scanned_at ? new Date(article.last_scanned_at).toLocaleString('fr-FR') : '—'}</div>
            </div>
          </div>
          <div className="card">
            <SectionTitle icon={<Barcode size={12} />}>Code-barres</SectionTitle>
            <div style={{ padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
              <BarcodeDisplay article={article} height={48} width={2.2} displayValue={false} />
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.78rem', marginTop: 6, letterSpacing: '0.05em' }}>
                {article.code}
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={onBarcode}>
              Voir / imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileArticleRow({ item, catName, onView, onEdit, onArchive, onHistory, onDelete, onBarcode }) {
  return (
    <div className="inv-stock-mobile-row">
      <div className="inv-stock-mobile-icon" aria-hidden><Package size={18} style={{ color: 'var(--red)' }} /></div>
      <button type="button" className="inv-stock-mobile-name" onClick={onView}>
        <strong>{item.code}</strong>
        <span>{item.designation}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{catName} · Stock {item.stock_actuel || 0} {item.unite}</span>
      </button>
      <span className={`inv-stock-mobile-status ${item.statut === 'Actif' ? 'is-active' : 'is-inactive'}`}>{item.statut}</span>
      <div className="inv-stock-mobile-actions">
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Voir" onClick={onView}><Eye size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Code-barres" onClick={onBarcode}><Barcode size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Modifier" onClick={onEdit}><Edit2 size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Historique" onClick={onHistory}><History size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Archiver" onClick={onArchive}><Archive size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn inv-stock-mobile-btn--danger" title="Supprimer" onClick={onDelete}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

export default function ArticlesStock({ onArticlesChange }) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur';
  const {
    records: articles, loading, saving, error, success, configured,
    reload, save, archive, remove, getMovements, importCatalog,
    removeDuplicates, findDuplicates, lookupByBarcode,
  } = useStockArticles();
  const { records: categories } = useStockCategories();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEtat, setFilterEtat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterEmplacement, setFilterEmplacement] = useState('');
  const [filterCurrentState, setFilterCurrentState] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailMovements, setDetailMovements] = useState([]);
  const [page, setPage] = useState(1);
  const [barcodeArticle, setBarcodeArticle] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailMovementsLoading, setDetailMovementsLoading] = useState(false);

  useEffect(() => {
    if (onArticlesChange) onArticlesChange(articles);
  }, [articles, onArticlesChange]);

  useEffect(() => { setPage(1); }, [search, filterCat, filterType, filterEtat, filterStatut, filterEmplacement, filterCurrentState]);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
      if (detailId === editItem?.id) setDetailId(null);
    }
  }, [editItem, save, detailId]);

  async function handleArchive(id) {
    if (!window.confirm('Archiver cet article ?')) return;
    const res = await archive(id);
    if (res.success) { setDetailId(null); setHistoryId(null); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer définitivement cet article ? (impossible si mouvements ou stock)')) return;
    const res = await remove(id);
    if (res.success) { setDetailId(null); setHistoryId(null); }
  }

  const openHistory = useCallback((id) => {
    setHistoryId(id);
  }, []);

  useEffect(() => {
    if (!historyId) {
      setHistoryRows([]);
      setHistoryLoading(false);
      return undefined;
    }

    if (historyId === detailId && !detailMovementsLoading) {
      setHistoryRows(detailMovements);
      setHistoryLoading(false);
      return undefined;
    }

    let cancelled = false;
    setHistoryLoading(true);
    getMovements(historyId)
      .then((rows) => {
        if (!cancelled) setHistoryRows(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryRows([]);
      })
      .finally(() => {
        setHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [historyId, detailId, detailMovements, detailMovementsLoading, getMovements]);

  useEffect(() => {
    if (!detailId) {
      setDetailMovements([]);
      setDetailMovementsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDetailMovementsLoading(true);
    getMovements(detailId)
      .then((rows) => {
        if (!cancelled) {
          setDetailMovements(rows);
          setDetailMovementsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailMovements([]);
          setDetailMovementsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [detailId, getMovements]);

  const refreshDetail = useCallback(async () => {
    await reload();
    if (!detailId) return;
    setDetailMovementsLoading(true);
    try {
      const rows = await getMovements(detailId);
      setDetailMovements(rows);
    } catch {
      setDetailMovements([]);
    } finally {
      setDetailMovementsLoading(false);
    }
  }, [reload, detailId, getMovements]);

  const openBarcode = useCallback((article) => setBarcodeArticle(article), []);

  const getCategoryName = useCallback((article) => {
    const cat = categories.find((c) => String(c.id) === String(article?.categorie_id));
    return cat ? (cat.nom || cat.name) : '';
  }, [categories]);

  const handleBarcodeScan = useCallback(async (code) => {
    setScanLoading(true);
    setScanError('');
    const { article, error: lookupErr } = await lookupByBarcode(code, articles);
    setScanLoading(false);
    if (!article) {
      setScanError(lookupErr || 'Article introuvable.');
      return;
    }
    setShowScanner(false);
    setScanError('');
    setDetailId(article.id);
  }, [lookupByBarcode, articles]);

  const filtered = useMemo(() => articles.filter((x) => {
    const q = search.toLowerCase();
    const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
    const catName = (cat?.nom || cat?.name || '').toLowerCase();
    const bc = getArticleBarcodeValue(x).toLowerCase();
    return (!q || x.code.toLowerCase().includes(q) || x.designation.toLowerCase().includes(q) || catName.includes(q) || bc.includes(q))
      && (!filterCat || String(x.categorie_id) === String(filterCat))
      && (!filterType || x.type === filterType)
      && (!filterEtat || x.etat === filterEtat)
      && (!filterStatut || x.statut === filterStatut)
      && (!filterEmplacement || x.emplacement === filterEmplacement)
      && (!filterCurrentState || x.current_state === filterCurrentState);
  }), [articles, search, filterCat, filterType, filterEtat, filterStatut, filterEmplacement, filterCurrentState, categories]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = articles.length;
  const duplicateInfo = useMemo(() => findDuplicates(articles), [articles, findDuplicates]);
  const stockFaible = articles.filter((x) => x.stock_minimum && x.stock_actuel <= x.stock_minimum).length;
  const articlesNeuf = articles.filter((x) => x.etat === 'Neuf').length;
  const articlesUsed = articles.filter((x) => x.etat === 'Utilisé').length;
  const valeurTotale = articles.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);

  const selectedArticles = useMemo(
    () => articles.filter((a) => selectedIds.includes(a.id)),
    [articles, selectedIds],
  );

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllPage() {
    const ids = pageItems.map((x) => x.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    else setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
  }

  const detailArt = detailId ? articles.find((x) => x.id === detailId) : null;

  if (loading && !articles.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des articles de stock…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {detailId && detailArt && (
        <DetailArticle
          article={detailArt}
          categories={categories}
          movements={detailMovements}
          movementsLoading={detailMovementsLoading}
          onBack={() => setDetailId(null)}
          onEdit={() => { setEditItem(detailArt); setShowModal(true); }}
          onHistory={() => openHistory(detailArt.id)}
          onArchive={() => handleArchive(detailArt.id)}
          onBarcode={() => openBarcode(detailArt)}
          onRefresh={refreshDetail}
          userName={userName}
        />
      )}

      {!detailId && (
        <>
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_STOCK_ARTICLES_LEVELS.sql puis reconnectez-vous.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
            Si l&apos;import échoue : exécutez <code>RUN_STOCK_CATEGORIES.sql</code>, puis <code>RUN_STOCK_ARTICLES_LEVELS.sql</code>, puis <code>SEED_STOCK_ARTICLES_43.sql</code> dans Supabase SQL Editor.
          </div>
        </div>
      )}
      {success && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: '#2E7D32', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}
      {duplicateInfo.count > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: 12, background: '#FFF3E0', border: '1px solid #FFB74D', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#E65100' }}>
            {duplicateInfo.count} article(s) en doublon détecté(s) (même code ou même désignation).
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={removeDuplicates}
          >
            {saving ? <Loader2 size={14} className="cin-spin" /> : null}
            Nettoyer les doublons
          </button>
        </div>
      )}

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ARTICLES DE STOCK</h1>
          <p className="page-subtitle">Gestion des articles, états et niveaux de stock.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowScanner(true)}>
            <ScanLine size={14} /> Scanner article
          </button>
          {selectedArticles.length > 0 && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadStockArticleLabelsA4(selectedArticles, 'standard')}>
                <Download size={14} /> A4 {LABEL_FORMATS.standard.name}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadStockArticleLabelsA4(selectedArticles, 'small')}>
                <Download size={14} /> A4 {LABEL_FORMATS.small.name}
              </button>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter article
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Package size={17} />} label="Total articles" value={total} color="grey" />
        <KpiCard icon={<Package size={17} />} label="Stock faible" value={stockFaible} color="orange" />
        <KpiCard icon={<Package size={17} />} label="Articles neufs" value={articlesNeuf} color="green" />
        <KpiCard icon={<Package size={17} />} label="Articles utilisés" value={articlesUsed} color="blue" />
        <KpiCard icon={<Package size={17} />} label="Valeur totale" value={formatMAD(valeurTotale)} color="red" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, désignation, code-barres…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 170 }}>
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom || c.name}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous types</option>
              {TYPES_ARTICLE_STOCK.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterEtat} onChange={(e) => setFilterEtat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous états</option>
              {ETATS_ARTICLE_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 130 }}>
              <option value="">Tous statuts</option>
              {STATUTS_ARTICLE_STOCK.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterEmplacement} onChange={(e) => setFilterEmplacement(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Tous emplacements</option>
              {EMPLACEMENTS_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterCurrentState} onChange={(e) => setFilterCurrentState(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 170 }}>
              <option value="">Tous états opérationnels</option>
              {CURRENT_STATES_ARTICLE.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterType(''); setFilterEtat(''); setFilterStatut(''); setFilterEmplacement(''); setFilterCurrentState(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, désignation, code-barres…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package size={24} />}
            title="Aucun article"
            sub={configured
              ? 'Importez le catalogue CITYMO (43 articles) ou ajoutez un article manuellement.'
              : 'Configurez Supabase puis exécutez les scripts SQL.'}
            action="Ajouter article"
            onAction={() => { setEditItem(null); setShowModal(true); }}
          />
          {configured && (
            <div style={{ textAlign: 'center', paddingBottom: 28 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={importCatalog}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {saving ? <Loader2 size={14} className="cin-spin" /> : <Download size={14} />}
                Importer le catalogue (43 articles)
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card inv-stock-desktop-only" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((x) => selectedIds.includes(x.id))}
                        onChange={toggleSelectAllPage}
                        aria-label="Sélectionner la page"
                      />
                    </th>
                    <th>Code</th>
                    <th>Code-barres</th>
                    <th>Désignation</th>
                    <th>Type</th>
                    <th>Catégorie</th>
                    <th>État op.</th>
                    <th>Emplacement</th>
                    <th>Dernier mouvement</th>
                    <th>Dernier scan</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((x) => {
                    const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
                    const stateBadge = BADGE_CURRENT_STATE[x.current_state] || 'badge-grey';
                    return (
                      <tr key={x.id}>
                        <td>
                          <input type="checkbox" checked={selectedIds.includes(x.id)} onChange={() => toggleSelect(x.id)} aria-label={`Sélectionner ${x.code}`} />
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</span>
                        </td>
                        <td data-label="Code-barres">
                          <button type="button" className="btn btn-ghost btn-sm" title={getArticleBarcodeValue(x)} onClick={() => openBarcode(x)} style={{ fontFamily: 'monospace', fontSize: '0.72rem', padding: '2px 6px' }}>
                            <Barcode size={12} /> {getArticleBarcodeValue(x)}
                          </button>
                        </td>
                        <td data-label="Désignation" style={{ fontWeight: 600 }}>{x.designation}</td>
                        <td data-label="Type" style={{ fontSize: '0.82rem' }}>{x.type || '—'}</td>
                        <td data-label="Catégorie">
                          {cat ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{cat.nom || cat.name}</span> : '—'}
                        </td>
                        <td data-label="État op.">
                          <span className={`badge ${stateBadge}`} style={{ fontSize: '0.7rem' }}>{x.current_state || 'Disponible'}</span>
                        </td>
                        <td data-label="Emplacement" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement || '—'}</td>
                        <td data-label="Dernier mouvement" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
                          {x.dernier_mouvement ? (
                            <span>{x.dernier_mouvement.date_label}<br /><span style={{ color: 'var(--text-3)' }}>{x.dernier_mouvement.action}</span></span>
                          ) : '—'}
                        </td>
                        <td data-label="Dernier scan" style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
                          {x.last_scanned_at ? new Date(x.last_scanned_at).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Code-barres" onClick={() => openBarcode(x)}><Barcode size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Historique" onClick={() => openHistory(x.id)}><History size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Archiver" onClick={() => handleArchive(x.id)}><Archive size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card inv-stock-mobile-only inv-stock-mobile-list">
            {pageItems.map((x) => {
              const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
              return (
                <MobileArticleRow
                  key={x.id}
                  item={x}
                  catName={cat ? (cat.nom || cat.name) : '—'}
                  onView={() => setDetailId(x.id)}
                  onBarcode={() => openBarcode(x)}
                  onEdit={() => { setEditItem(x); setShowModal(true); }}
                  onHistory={() => openHistory(x.id)}
                  onArchive={() => handleArchive(x.id)}
                  onDelete={() => handleDelete(x.id)}
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>Page {page} / {totalPages} ({filtered.length} articles)</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
            </div>
          )}
        </>
      )}
        </>
      )}

      <Modal open={showModal} onClose={() => { if (!saving) { setShowModal(false); setEditItem(null); } }} title={editItem ? "Modifier l'article" : 'Nouvel article de stock'} width={760}>
        <ArticleForm
          initial={editItem}
          categories={categories}
          onSave={handleSave}
          onCancel={() => { if (!saving) { setShowModal(false); setEditItem(null); } }}
          saving={saving}
        />
      </Modal>

      <Modal open={!!historyId} onClose={() => setHistoryId(null)} title="Historique complet" width={900}>
        {historyLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={20} className="cin-spin" /></div>
        ) : (
          <ArticleMovementHistory movements={historyRows} loading={false} />
        )}
      </Modal>

      <BarcodeModal
        open={!!barcodeArticle}
        article={barcodeArticle}
        onClose={() => setBarcodeArticle(null)}
      />

      <BarcodeScannerModal
        open={showScanner}
        onClose={() => { setShowScanner(false); setScanError(''); }}
        onScan={handleBarcodeScan}
        scanning={scanLoading}
        error={scanError}
      />
    </div>
  );
}
