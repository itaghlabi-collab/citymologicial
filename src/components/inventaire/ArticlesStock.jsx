/**
 * ArticlesStock.jsx — Articles de stock ERP CITYMO (Supabase)
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Package, Plus, Edit2, Trash2, Search, Filter, Download,
  ChevronLeft, Loader2, RefreshCw, Archive, History, CheckCircle2,
  Barcode, ScanLine, Printer, MapPin, AlertTriangle, Zap, FileText,
} from 'lucide-react';
import { useStockArticles } from '../../hooks/useStockArticles';
import { useStockCategories } from '../../hooks/useStockCategories';
import { generateStockArticleCode, listStockLevelsForArticle } from '../../services/inventaire/stockArticles';
import { downloadStockArticleLabel, printStockArticleLabel, downloadStockArticleLabelsA4, LABEL_FORMATS } from '../../services/inventaire/stockArticleLabelPdf';
import BarcodeModal from './BarcodeModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import BarcodeDisplay from './BarcodeDisplay';
import QrCodeDisplay from './QrCodeDisplay';
import ArticleScanBar from './ArticleScanBar';
import ArticleQuickActions, { ArticleMovementHistory } from './ArticleQuickActions';
import ArticleRowActions from './ArticleRowActions';
import ArticleCatalogForm from './ArticleCatalogForm';
import { canExecuteStockAction } from '../../services/inventaire/articleQuickActions';
import { useAuth } from '../../hooks/useAuth';
import { can } from '../../services/admin/permissions';
import { getArticleBarcodeValue, getArticlePublicUrl, syncArticleRoute } from '../../services/inventaire/barcodeUtils';
import {
  INPUT_STYLE, SELECT_STYLE, UNITES,
  TYPES_ARTICLE_STOCK, ETATS_ARTICLE_STOCK, STATUTS_ARTICLE_STOCK, EMPLACEMENTS_STOCK,
  CURRENT_STATES_ARTICLE, BADGE_CURRENT_STATE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, StockAlert,
} from './shared.jsx';

const PAGE_SIZE = 15;
const OPEN_ARTICLE_KEY = 'citymo_stock_open_article';

/** Documents éventuels déjà présents sur l'article (affichage uniquement). */
function collectArticleDocuments(article, movements = []) {
  const docs = [];
  const push = (label, value) => {
    const v = String(value || '').trim();
    if (!v) return;
    if (docs.some((d) => d.label === label && d.value === v)) return;
    docs.push({ label, value: v });
  };
  const a = article || {};
  push('Facture', a.facture || a.facture_url || a.reference_facture);
  push('Photo', a.photo || a.photo_url);
  push('Fiche technique', a.fiche_technique || a.fiche_technique_url);
  push('Manuel', a.manuel || a.manuel_url);
  push('Garantie', a.garantie || a.garantie_url);
  push('Document', a.document || a.document_url);
  (movements || []).forEach((m) => {
    const p = m.payload || {};
    push('Facture / BL', p.reference_facture || p.reference_facture_bl);
  });
  return docs;
}

function emplacementMatch(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function ArticleStockByLocation({ article, levels, loading }) {
  const declared = (article?.emplacement || '').trim();
  const unite = article?.unite || 'U';
  const totalLevels = (levels || []).reduce((s, l) => s + Number(l.quantite || 0), 0);
  const qtyAtDeclared = declared
    ? (levels || []).find((l) => emplacementMatch(l.emplacement, declared))?.quantite ?? 0
    : 0;
  const positiveLevels = (levels || []).filter((l) => Number(l.quantite) > 0);
  const zeroAtDeclared = declared
    ? (levels || []).filter((l) => emplacementMatch(l.emplacement, declared) && Number(l.quantite) === 0)
    : [];
  const displayLevels = positiveLevels.length
    ? positiveLevels
    : zeroAtDeclared;
  const showMismatch = declared && Number(article?.stock_actuel) > 0 && qtyAtDeclared <= 0 && positiveLevels.length > 0;
  const stockFromMovements = article?.stock_source === 'movements' && Number(article?.stock_actuel) > 0;

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <MapPin size={11} /> Stock par emplacement
      </span>

      {loading ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={13} className="cin-spin" /> Chargement…
        </div>
      ) : displayLevels.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {displayLevels.map((l) => {
            const isDeclared = declared && emplacementMatch(l.emplacement, declared);
            return (
              <div
                key={l.id || l.emplacement}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: isDeclared ? 'var(--bg-2)' : 'transparent',
                  border: isDeclared ? '1px solid var(--border)' : '1px solid transparent',
                  fontSize: '0.82rem',
                }}
              >
                <span style={{ fontWeight: isDeclared ? 600 : 500, color: 'var(--text-2)', minWidth: 0, wordBreak: 'break-word' }}>
                  {l.emplacement}
                  {isDeclared && (
                    <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 700 }}>fiche</span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {l.quantite} {unite}
                </span>
              </div>
            );
          })}
          {totalLevels !== Number(article?.stock_actuel) && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
              Total emplacements : {totalLevels} {unite}
            </div>
          )}
        </div>
      ) : stockFromMovements ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Stock calculé depuis l&apos;historique des mouvements ({article.stock_actuel} {unite}) — exécutez la resynchronisation stock dans Supabase.
        </div>
      ) : Number(article?.stock_actuel) > 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Stock disponible : {article.stock_actuel} {unite} (non réparti par emplacement).
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Aucun stock enregistré.</div>
      )}

      {showMismatch && (
        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 6,
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          fontSize: '0.76rem',
          color: 'var(--text-2)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: '#ca8a04' }} />
          <span>
            La fiche indique <strong>{declared}</strong> mais le stock physique s&apos;y trouve à <strong>0 {unite}</strong>.
            Les affectations partiront de l&apos;emplacement qui contient réellement le stock.
          </span>
        </div>
      )}
    </div>
  );
}

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
  stock_emplacement: '',
  emplacement_initial: '',
  date_entree_stock: '',
  fournisseur_stock: '',
  reference_facture_bl: '',
  prix_achat_unitaire: '',
  observation_stock: '',
};

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function ArticleForm(props) {
  return <ArticleCatalogForm {...props} />;
}

function DetailArticle({
  article, categories, movements, movementsLoading, stockLevels, stockLevelsLoading,
  onBack, onEdit, onHistory, onArchive, onBarcode, onRefresh, userName,
  onScan, scanLoading, scanError, onMouvementRapide, onDelete, canDelete = true,
}) {
  const cat = (categories || []).find((c) => String(c.id) === String(article.categorie_id));
  const catName = cat ? (cat.nom || cat.name) : '';
  const stateBadge = BADGE_CURRENT_STATE[article.current_state] || 'badge-grey';
  const etatBadge = article.etat === 'Neuf' ? 'badge-green' : article.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange';
  const statutBadge = article.statut === 'Actif' ? 'badge-green' : article.statut === 'Archivé' ? 'badge-orange' : 'badge-grey';
  const documents = collectArticleDocuments(article, movements);
  const historyRef = useRef(null);

  const scrollToHistory = () => {
    onHistory?.();
    historyRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="animate-fade-in inv-article-detail">
      {/* Header Desktop */}
      <div className="finance-page-actions finance-detail-actions inv-article-detail-header-desktop" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.72rem', color: 'var(--red)', letterSpacing: '0.04em' }}>{article.code}</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>{article.designation}</h2>
        </div>
        <span className={`badge ${catName ? 'badge-blue' : 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{catName || 'Sans catégorie'}</span>
        <span className={`badge ${stateBadge}`} style={{ fontSize: '0.72rem' }}>{article.current_state || 'Disponible'}</span>
        <span className={`badge ${etatBadge}`} style={{ fontSize: '0.72rem' }}>{article.etat}</span>
        <span className={`badge ${statutBadge}`} style={{ fontSize: '0.72rem' }}>{article.statut}</span>
      </div>

      {/* Actions rapides — desktop */}
      <div className="inv-article-detail-quickbar inv-article-detail-header-desktop" role="toolbar" aria-label="Actions rapides">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
        {onMouvementRapide && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onMouvementRapide}><Package size={13} /> Gérer dans Stocks</button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={scrollToHistory}><History size={13} /> Voir historique</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBarcode}><Barcode size={13} /> Code-barres</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadStockArticleLabel(article, 'standard')}><Download size={13} /> Étiquette</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => printStockArticleLabel(article, 'standard')}><Printer size={13} /> Imprimer</button>
        {article.statut !== 'Archivé' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive}><Archive size={13} /> Archiver</button>
        )}
        {canDelete && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete} style={{ color: 'var(--red)' }}><Trash2 size={13} /> Supprimer</button>
        )}
      </div>

      {/* Header Mobile PWA */}
      <header className="inv-article-detail-header-mobile">
        <div className="inv-article-detail-code-block">
          <span className="inv-article-detail-kicker">Référence</span>
          <div className="inv-article-detail-code">{article.code}</div>
        </div>
        <div className="inv-article-detail-title-block">
          <span className="inv-article-detail-kicker">Article</span>
          <h2 className="inv-article-detail-title">{article.designation}</h2>
        </div>
        <div className="inv-article-detail-badges">
          {catName && <span className="badge badge-blue">{catName}</span>}
          <span className={`badge ${stateBadge}`}>{article.current_state || 'Disponible'}</span>
          <span className={`badge ${etatBadge}`}>{article.etat}</span>
          {article.statut && <span className={`badge ${statutBadge}`}>{article.statut}</span>}
        </div>
        <div className="inv-article-detail-toolbar" role="toolbar" aria-label="Actions article">
          <button type="button" className="btn btn-ghost btn-sm inv-article-detail-tool" onClick={onBack} title="Retour" aria-label="Retour">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="btn btn-secondary btn-sm inv-article-detail-tool" onClick={onEdit} title="Modifier" aria-label="Modifier">
            <Edit2 size={18} />
          </button>
          {onMouvementRapide && (
            <button type="button" className="btn btn-primary btn-sm inv-article-detail-tool" onClick={onMouvementRapide} title="Mouvement rapide" aria-label="Mouvement rapide">
              <Zap size={18} />
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm inv-article-detail-tool" onClick={scrollToHistory} title="Historique" aria-label="Historique">
            <History size={18} />
          </button>
          {canDelete && (
            <button type="button" className="btn btn-ghost btn-sm inv-article-detail-tool" onClick={onDelete} title="Supprimer" aria-label="Supprimer" style={{ color: 'var(--red)' }}>
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </header>

      <ArticleScanBar
        onScan={onScan}
        loading={scanLoading}
        error={scanError}
        compact
        label="Scan rapide — changer d'article ou confirmer"
        placeholder="Scannez un code-barres ou QR code…"
      />

      <div className="finance-detail-grid">
        <div>
          {/* Informations article */}
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<Package size={12} />}>Informations article</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Référence', article.code],
                ['Nom', article.designation],
                ['Catégorie', catName || '—'],
                ['Type', article.type],
                ['N° série', article.numero_serie],
                ['Unité', article.unite],
                ['Emplacement', article.emplacement],
                ['État', article.etat],
                ['Statut', article.statut],
                ['État opérationnel', article.current_state || 'Disponible'],
                ['Code-barres', getArticleBarcodeValue(article)],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: l === 'Nom' || l === 'Référence' ? 700 : 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>Description</SectionTitle>
            {article.description ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap' }}>{article.description}</p>
            ) : (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', margin: 0 }}>Aucune description.</p>
            )}
            {article.notes ? (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Notes</span>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap' }}>{article.notes}</p>
              </div>
            ) : null}
          </div>

          {/* Documents */}
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<FileText size={12} />}>Documents</SectionTitle>
            {documents.length === 0 ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', margin: 0 }}>Aucun document.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documents.map((d) => (
                  <li key={`${d.label}-${d.value}`} style={{ fontSize: '0.84rem' }}>
                    <strong>{d.label}</strong>
                    {' — '}
                    {/^https?:\/\//i.test(d.value) ? (
                      <a href={d.value} target="_blank" rel="noreferrer">{d.value}</a>
                    ) : d.value}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Gestion du stock (actions rapides métier existantes) */}
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle>Gestion du stock</SectionTitle>
            <ArticleQuickActions
              article={article}
              userName={userName}
              onDone={onRefresh}
              onHistory={onHistory}
              disabled={!canExecuteStockAction(article)}
            />
          </div>

          {/* Historique des mouvements */}
          <div className="card" ref={historyRef} id="inv-article-historique">
            <SectionTitle icon={<History size={12} />}>Historique des mouvements</SectionTitle>
            <ArticleMovementHistory movements={movements} loading={movementsLoading} compact />
            {movements?.length > 10 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={onHistory}>
                Voir tout l&apos;historique
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Valeur & seuil */}
          <div className="card">
            <SectionTitle>Valeur &amp; seuil</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock disponible</span>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', color: (article.stock_actuel || 0) <= 0 ? 'var(--red)' : 'var(--text)' }}>
                  {article.stock_actuel || 0}
                  <span style={{ fontSize: '0.9rem', fontWeight: 500, marginLeft: 6, color: 'var(--text-3)' }}>{article.unite}</span>
                  <StockAlert qte={article.stock_actuel || 0} seuil={article.stock_minimum} />
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Seuil d&apos;alerte</span>
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
              <ArticleStockByLocation
                article={article}
                levels={stockLevels}
                loading={stockLevelsLoading}
              />
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
            <SectionTitle icon={<Barcode size={12} />}>Code-barres & QR code</SectionTitle>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160, padding: '8px 4px', background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
                <BarcodeDisplay article={article} height={48} width={2.2} displayValue={false} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.78rem', marginTop: 6, letterSpacing: '0.05em' }}>
                  {getArticleBarcodeValue(article)}
                </div>
                <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 4 }}>CODE128 — douchette</div>
              </div>
              <div style={{ textAlign: 'center', padding: 8, background: '#fff', borderRadius: 6, border: '1px solid var(--border)' }}>
                <QrCodeDisplay article={article} size={96} style={{ margin: '0 auto' }} />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 6, maxWidth: 120, wordBreak: 'break-all', lineHeight: 1.3 }}>
                  QR — fiche mobile
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 8, wordBreak: 'break-all' }}>
              {getArticlePublicUrl(article.code)}
            </div>
            <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={onBarcode}>
              Voir / imprimer étiquette
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileArticleRow({
  item, catName, onView, onEdit, onHistory, onDelete, onDuplicate, onMouvementRapide, canDelete,
}) {
  const stateBadge = BADGE_CURRENT_STATE[item.current_state] || 'badge-grey';
  const etatBadge = item.etat === 'Neuf' ? 'badge-green' : item.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange';
  const statutBadge = item.statut === 'Actif' ? 'badge-green' : item.statut === 'Archivé' ? 'badge-orange' : 'badge-grey';
  return (
    <div className="inv-stock-mobile-row">
      <button type="button" className="inv-stock-mobile-main" onClick={onView}>
        <div className="inv-stock-mobile-icon" aria-hidden><Package size={18} style={{ color: 'var(--red)' }} /></div>
        <div className="inv-stock-mobile-name">
          <strong>{item.code}</strong>
          <span className="inv-stock-mobile-designation">{item.designation}</span>
          <span className="inv-stock-mobile-meta">
            {catName || '—'} · Qté {item.stock_actuel || 0} {item.unite}
            {item.valeur ? ` · ${formatMAD(item.valeur)}` : ''}
          </span>
          <div className="inv-stock-mobile-badges">
            {catName ? <span className="badge badge-blue">{catName}</span> : null}
            <span className={`badge ${etatBadge}`}>{item.etat}</span>
            <span className={`badge ${statutBadge}`}>{item.statut}</span>
            <span className={`badge ${stateBadge}`}>{item.current_state || 'Disponible'}</span>
          </div>
        </div>
      </button>
      <ArticleRowActions
        onOpen={onView}
        onEdit={onEdit}
        onMouvementRapide={onMouvementRapide}
        mouvementRapideLabel="Gérer dans Stocks"
        onHistory={onHistory}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        canDelete={canDelete}
      />
    </div>
  );
}

export default function ArticlesStock({
  onArticlesChange,
  emplacementsList = EMPLACEMENTS_STOCK,
  initialArticleCode,
  onArticleCodeConsumed,
  onNavigate,
}) {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur';
  const {
    records: articles, loading, saving, error, success, configured,
    reload, save, archive, remove, getMovements, importCatalog,
    removeDuplicates, findDuplicates, lookupByBarcode,
  } = useStockArticles();
  const { records: categories } = useStockCategories();
  const [canDelete, setCanDelete] = useState(true);

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
  const [detailStockLevels, setDetailStockLevels] = useState([]);
  const [detailStockLevelsLoading, setDetailStockLevelsLoading] = useState(false);

  useEffect(() => {
    if (onArticlesChange) onArticlesChange(articles);
  }, [articles, onArticlesChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await can(user, 'articles-stock', 'supprimer');
        if (!cancelled) setCanDelete(ok);
      } catch {
        if (!cancelled) setCanDelete(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  useEffect(() => { setPage(1); }, [search, filterCat, filterType, filterEtat, filterStatut, filterEmplacement, filterCurrentState]);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
      // rester sur la fiche si on éditait depuis la fiche
    }
  }, [editItem, save]);

  function buildDuplicateDraft(article) {
    if (!article) return null;
    return {
      ...article,
      id: undefined,
      code: '',
      reference: '',
      barcode_value: '',
      stock_actuel: 0,
      quantite_initiale: '',
      date_entree_stock: todayInputDate(),
      last_scanned_at: null,
      dernier_mouvement: null,
    };
  }

  function handleDuplicate(article) {
    setEditItem(buildDuplicateDraft(article));
    setShowModal(true);
  }

  function goMouvementRapide(article) {
    try {
      if (article?.id) {
        sessionStorage.setItem('citymo_stock_open_article', JSON.stringify({ id: article.id, code: article.code }));
      }
    } catch { /* ignore */ }
    onNavigate?.('stocks');
  }

  function goGererStock(article) {
    try {
      if (article?.id) {
        sessionStorage.setItem('citymo_stock_open_article', JSON.stringify({ id: article.id, code: article.code }));
      }
    } catch { /* ignore */ }
    onNavigate?.('stocks');
  }

  async function handleArchive(id) {
    if (!window.confirm('Archiver cet article ?')) return;
    const res = await archive(id);
    if (res.success) {
      setDetailId(null);
      setHistoryId(null);
      syncArticleRoute(null, { replace: true });
    }
  }

  async function handleDelete(id) {
    if (!canDelete) return;
    if (!window.confirm('Supprimer définitivement cet article ? (impossible si mouvements ou stock)')) return;
    const res = await remove(id);
    if (res.success) {
      setDetailId(null);
      setHistoryId(null);
      syncArticleRoute(null, { replace: true });
    }
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

  useEffect(() => {
    if (!detailId) {
      setDetailStockLevels([]);
      setDetailStockLevelsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDetailStockLevelsLoading(true);
    listStockLevelsForArticle(detailId)
      .then((rows) => {
        if (!cancelled) {
          setDetailStockLevels(rows);
          setDetailStockLevelsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailStockLevels([]);
          setDetailStockLevelsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [detailId]);

  const refreshDetail = useCallback(async () => {
    await reload();
    if (!detailId) return;
    setDetailMovementsLoading(true);
    setDetailStockLevelsLoading(true);
    try {
      const [rows, levels] = await Promise.all([
        getMovements(detailId),
        listStockLevelsForArticle(detailId),
      ]);
      setDetailMovements(rows);
      setDetailStockLevels(levels);
    } catch {
      setDetailMovements([]);
      setDetailStockLevels([]);
    } finally {
      setDetailMovementsLoading(false);
      setDetailStockLevelsLoading(false);
    }
  }, [reload, detailId, getMovements]);

  const openBarcode = useCallback((article) => setBarcodeArticle(article), []);

  const openArticleDetail = useCallback((article) => {
    if (!article?.id) return;
    setDetailId(article.id);
    setScanError('');
    syncArticleRoute(getArticleBarcodeValue(article));
  }, []);

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
      setScanError(lookupErr || 'Aucun article trouvé pour ce code.');
      return;
    }
    setShowScanner(false);
    setScanError('');
    openArticleDetail(article);
  }, [lookupByBarcode, articles, openArticleDetail]);

  useEffect(() => {
    if (!initialArticleCode || loading) return undefined;
    let cancelled = false;
    (async () => {
      setScanLoading(true);
      setScanError('');
      const { article, error: lookupErr } = await lookupByBarcode(initialArticleCode, articles);
      if (cancelled) return;
      setScanLoading(false);
      if (article) {
        openArticleDetail(article);
        onArticleCodeConsumed?.();
      } else {
        setScanError(lookupErr || 'Article introuvable.');
        onArticleCodeConsumed?.();
      }
    })();
    return () => { cancelled = true; };
  }, [initialArticleCode, loading, articles, lookupByBarcode, onArticleCodeConsumed, openArticleDetail]);

  // Ouverture depuis la vue Stocks (sessionStorage) — UI only
  useEffect(() => {
    if (loading || !articles.length) return;
    let raw;
    try {
      raw = sessionStorage.getItem(OPEN_ARTICLE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(OPEN_ARTICLE_KEY);
    } catch {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { code: raw };
    }
    const article = articles.find((a) => a.id === parsed?.id)
      || articles.find((a) => getArticleBarcodeValue(a) === String(parsed?.code || '').trim())
      || articles.find((a) => a.code === String(parsed?.code || '').trim());
    if (article) openArticleDetail(article);
  }, [loading, articles, openArticleDetail]);

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
          stockLevels={detailStockLevels}
          stockLevelsLoading={detailStockLevelsLoading}
          onBack={() => {
            setDetailId(null);
            setScanError('');
            syncArticleRoute(null, { replace: true });
          }}
          onEdit={() => { setEditItem(detailArt); setShowModal(true); }}
          onHistory={() => openHistory(detailArt.id)}
          onArchive={() => handleArchive(detailArt.id)}
          onBarcode={() => openBarcode(detailArt)}
          onRefresh={refreshDetail}
          userName={userName}
          onScan={handleBarcodeScan}
          scanLoading={scanLoading}
          scanError={scanError}
          onMouvementRapide={onNavigate ? () => goMouvementRapide(detailArt) : undefined}
          onDelete={canDelete ? () => handleDelete(detailArt.id) : undefined}
          canDelete={canDelete}
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

      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">ARTICLES DE STOCK</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Catalogue de référence — codes, désignations, catégories. La gestion des quantités se fait dans Stocks.</p>
        </div>
        <div className="finance-page-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowScanner(true)} title="Scanner avec la caméra">
            <ScanLine size={14} /> Caméra
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

      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<Package size={17} />} label="Total articles" value={total} color="grey" />
        <KpiCard icon={<Package size={17} />} label="Stock faible" value={stockFaible} color="orange" />
        <KpiCard icon={<Package size={17} />} label="Articles neufs" value={articlesNeuf} color="green" />
        <KpiCard icon={<Package size={17} />} label="Articles utilisés" value={articlesUsed} color="blue" />
        <KpiCard icon={<Package size={17} />} label="Valeur totale" value={formatMAD(valeurTotale)} color="red" />
      </div>

      <ArticleScanBar
        onScan={handleBarcodeScan}
        loading={scanLoading}
        error={!detailId ? scanError : ''}
      />

      {showFilters ? (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
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
              {emplacementsList.map((e) => <option key={e} value={e}>{e}</option>)}
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
              <table className="inv-articles-table">
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
                    <th>Référence</th>
                    <th>Nom</th>
                    <th>Catégorie</th>
                    <th>Quantité</th>
                    <th>Valeur</th>
                    <th>Statut</th>
                    <th>État</th>
                    <th style={{ width: 52 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((x) => {
                    const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
                    const catName = cat ? (cat.nom || cat.name) : '';
                    const stateBadge = BADGE_CURRENT_STATE[x.current_state] || 'badge-grey';
                    const etatBadge = x.etat === 'Neuf' ? 'badge-green' : x.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange';
                    const statutBadge = x.statut === 'Actif' ? 'badge-green' : x.statut === 'Archivé' ? 'badge-orange' : 'badge-grey';
                    return (
                      <tr
                        key={x.id}
                        className="inv-articles-row"
                        onClick={() => openArticleDetail(x)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.includes(x.id)} onChange={() => toggleSelect(x.id)} aria-label={`Sélectionner ${x.code}`} />
                        </td>
                        <td data-label="Référence">
                          <span className="inv-articles-ref">{x.code}</span>
                        </td>
                        <td data-label="Nom">
                          <div className="inv-articles-name">{x.designation}</div>
                          {x.emplacement ? (
                            <div className="inv-articles-sub">{x.emplacement}</div>
                          ) : null}
                        </td>
                        <td data-label="Catégorie">
                          {catName ? <span className="badge badge-blue inv-articles-badge">{catName}</span> : '—'}
                        </td>
                        <td data-label="Quantité">
                          <span className="inv-articles-qty">{x.stock_actuel || 0}</span>
                          <span className="inv-articles-unit">{x.unite}</span>
                          <StockAlert qte={x.stock_actuel || 0} seuil={x.stock_minimum} />
                        </td>
                        <td data-label="Valeur" className="inv-articles-value">
                          {x.valeur ? formatMAD(x.valeur) : '—'}
                        </td>
                        <td data-label="Statut">
                          <span className={`badge ${statutBadge} inv-articles-badge`}>{x.statut}</span>
                          <span className={`badge ${stateBadge} inv-articles-badge`} style={{ marginLeft: 4 }}>{x.current_state || 'Disponible'}</span>
                        </td>
                        <td data-label="État">
                          <span className={`badge ${etatBadge} inv-articles-badge`}>{x.etat}</span>
                        </td>
                        <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                          <ArticleRowActions
                            onOpen={() => openArticleDetail(x)}
                            onEdit={() => { setEditItem(x); setShowModal(true); }}
                            onMouvementRapide={onNavigate ? () => goMouvementRapide(x) : undefined}
                            mouvementRapideLabel="Gérer dans Stocks"
                            onHistory={() => openHistory(x.id)}
                            onDuplicate={() => handleDuplicate(x)}
                            onDelete={() => handleDelete(x.id)}
                            canDelete={canDelete}
                          />
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
                  onView={() => openArticleDetail(x)}
                  onEdit={() => { setEditItem(x); setShowModal(true); }}
                  onHistory={() => openHistory(x.id)}
                  onDuplicate={() => handleDuplicate(x)}
                  onMouvementRapide={onNavigate ? () => goMouvementRapide(x) : undefined}
                  onDelete={() => handleDelete(x.id)}
                  canDelete={canDelete}
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
          emplacementsList={emplacementsList}
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
