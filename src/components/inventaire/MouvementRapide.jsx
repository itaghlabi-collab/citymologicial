/**
 * MouvementRapide.jsx — Parcours simplifié d'enregistrement de mouvement (1 article).
 * Réutilise la logique stock_movements existante.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Package, Search, Calendar, User, FileText, Eye,
  MoreHorizontal, XCircle, Download, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Plus, Filter, X,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, SectionTitle, Modal, FField, FRow,
  EMPLACEMENTS_STOCK, UNITES,
} from './shared.jsx';
import {
  saveMouvementRapide,
  annulerMouvementRapide,
  listMouvementsRapides,
  getArticleStockInfo,
} from '../../services/inventaire/mouvementRapide';
import StockArticleSearch from './StockArticleSearch.jsx';

const MOTIFS_ENTREE = [
  'Réception directe', 'Retour chantier', 'Retour utilisateur',
  'Stock initial', 'Article retrouvé', 'Régularisation positive', 'Autre',
];
const MOTIFS_SORTIE = [
  'Consommation chantier', 'Remise à un ouvrier', 'Utilisation interne',
  'Casse', 'Perte', 'Mise au rebut', 'Régularisation négative', 'Autre',
];
const MOTIFS_TRANSFERT = [
  'Besoin chantier', 'Réorganisation stock', 'Besoin atelier',
  'Commande interne', 'Autre',
];

const TYPE_CONFIG = {
  Entrée: { icon: ArrowDownToLine, color: '#2E7D32', bg: '#E8F5E9', label: 'Entrée en stock', motifs: MOTIFS_ENTREE },
  Sortie: { icon: ArrowUpFromLine, color: '#C62828', bg: '#FFEBEE', label: 'Sortie de stock', motifs: MOTIFS_SORTIE },
  Transfert: { icon: ArrowLeftRight, color: '#1565C0', bg: '#E3F2FD', label: 'Transfert', motifs: MOTIFS_TRANSFERT },
};

export default function MouvementRapide({ articles = [], emplacementsList, onArticlesChange }) {
  const [view, setView] = useState('list'); // 'list' | 'form' | 'confirm' | 'detail'
  const [type, setType] = useState('');
  const [form, setForm] = useState(initialForm());
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleStock, setArticleStock] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelMotif, setCancelMotif] = useState('');
  const [searchHist, setSearchHist] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const emplacements = emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK;

  function initialForm() {
    return {
      article_id: '', quantite: '', date_creation: new Date().toISOString().slice(0, 10),
      motif: '', emplacement_source: '', emplacement_destination: '',
      cree_par: '', projet: '', note: '', beneficiaire: '', fournisseur: '', ref_externe: '',
    };
  }

  const loadHistorique = useCallback(async () => {
    try {
      const data = await listMouvementsRapides();
      setHistorique(data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadHistorique(); }, [loadHistorique]);

  const loadArticleStock = useCallback(async (artId) => {
    if (!artId) { setArticleStock(null); return; }
    try {
      const info = await getArticleStockInfo(artId);
      setArticleStock(info);
    } catch { setArticleStock(null); }
  }, []);

  const handleSelectArticle = useCallback((artId) => {
    const art = articles.find((a) => String(a.id) === String(artId));
    setSelectedArticle(art || null);
    setForm((f) => ({ ...f, article_id: artId }));
    loadArticleStock(artId);
  }, [articles, loadArticleStock]);

  const filteredHistorique = useMemo(() => {
    return historique.filter((m) => {
      const q = searchHist.toLowerCase();
      const matchQ = !q
        || (m.ref || '').toLowerCase().includes(q)
        || (m.article_designation || '').toLowerCase().includes(q)
        || (m.article_code || '').toLowerCase().includes(q);
      const matchType = !filterType || m.type_mouvement === filterType;
      return matchQ && matchType;
    });
  }, [historique, searchHist, filterType]);

  const needsSource = type === 'Sortie' || type === 'Transfert';
  const needsDest = type === 'Entrée' || type === 'Transfert';

  const stockAvant = articleStock?.totalStock ?? 0;
  const qty = Number(form.quantite) || 0;
  const stockApres = type === 'Entrée' ? stockAvant + qty
    : type === 'Sortie' ? stockAvant - qty
    : stockAvant; // Transfert: global unchanged

  const sourceLevel = useMemo(() => {
    if (!needsSource || !form.emplacement_source || !articleStock?.levels) return null;
    return articleStock.levels.find((l) => l.emplacement === form.emplacement_source);
  }, [needsSource, form.emplacement_source, articleStock]);

  const sourceQty = sourceLevel?.quantite ?? stockAvant;

  function validate() {
    if (!type) return 'Sélectionnez un type de mouvement.';
    if (!form.article_id) return 'Sélectionnez un article.';
    if (!qty || qty <= 0) return 'La quantité doit être supérieure à 0.';
    if (!form.date_creation) return 'La date est requise.';
    if (!form.motif) return 'Le motif est requis.';
    if (!form.cree_par?.trim()) return 'Le champ "Effectué par" est requis.';
    if (needsSource && !form.emplacement_source) return 'L\'emplacement source est requis.';
    if (needsDest && !form.emplacement_destination) return 'L\'emplacement destination est requis.';
    if (type === 'Transfert' && form.emplacement_source === form.emplacement_destination) {
      return 'Source et destination doivent être différentes.';
    }
    if ((type === 'Sortie' || type === 'Transfert') && qty > sourceQty) {
      return `Stock insuffisant (${sourceQty} disponible à cet emplacement).`;
    }
    return null;
  }

  function handleGoConfirm() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setView('confirm');
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');
    try {
      await saveMouvementRapide({ ...form, type_mouvement: type });
      setSuccess('Mouvement enregistré avec succès.');
      setView('list');
      setType('');
      setForm(initialForm());
      setSelectedArticle(null);
      setArticleStock(null);
      loadHistorique();
      if (onArticlesChange) {
        const { listStockArticles } = await import('../../services/inventaire/stockArticles');
        const refreshed = await listStockArticles();
        onArticlesChange(refreshed || []);
      }
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\'enregistrement.');
      setView('form');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(ref) {
    setLoading(true);
    setError('');
    try {
      await annulerMouvementRapide(ref, cancelMotif, '');
      setSuccess(`Mouvement ${ref} annulé.`);
      setCancelModal(null);
      setCancelMotif('');
      loadHistorique();
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\'annulation.');
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setType('');
    setForm(initialForm());
    setSelectedArticle(null);
    setArticleStock(null);
    setError('');
    setSuccess('');
    setView('form');
  }

  // ─── KPI ───
  const totalMR = historique.length;
  const entrees = historique.filter((m) => m.type_mouvement === 'Entrée').length;
  const sorties = historique.filter((m) => m.type_mouvement === 'Sortie').length;
  const transferts = historique.filter((m) => m.type_mouvement === 'Transfert').length;

  // ─── RENDER ───

  if (view === 'confirm') return renderConfirm();
  if (view === 'form') return renderForm();
  if (view === 'detail') return renderDetail();
  return renderList();

  // ═══════════════════════════════════════════
  // LIST VIEW
  // ═══════════════════════════════════════════
  function renderList() {
    return (
      <div className="animate-fade-in">
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">MOUVEMENT RAPIDE</h1>
            <p className="page-subtitle finance-sub-hide-mobile">Enregistrez rapidement un mouvement sur un article.</p>
          </div>
          <div className="finance-page-actions">
            <button className="btn btn-primary btn-sm" onClick={startNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Mouvement rapide
            </button>
          </div>
        </div>

        {success && (
          <div style={{ background: '#E8F5E9', border: '1px solid #2E7D32', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#2E7D32', fontSize: '0.85rem' }}>
            <CheckCircle2 size={16} /> {success}
            <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#2E7D32' }}><X size={14} /></button>
          </div>
        )}

        <div className="stat-grid finance-kpi-grid finance-kpi-strip">
          <KpiCard icon={<FileText size={17} />} label="Total mouvements" value={totalMR} color="blue" />
          <KpiCard icon={<ArrowDownToLine size={17} />} label="Entrées" value={entrees} color="green" />
          <KpiCard icon={<ArrowUpFromLine size={17} />} label="Sorties" value={sorties} color="red" />
          <KpiCard icon={<ArrowLeftRight size={17} />} label="Transferts" value={transferts} color="orange" />
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={searchHist} onChange={(e) => setSearchHist(e.target.value)} placeholder="Référence, article..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
              <option value="">Tous types</option>
              <option value="Entrée">Entrée</option>
              <option value="Sortie">Sortie</option>
              <option value="Transfert">Transfert</option>
            </select>
          </div>
        </div>

        {/* Table desktop / cards mobile */}
        <div className="card" style={{ padding: 0 }}>
          {filteredHistorique.length === 0 ? (
            <EmptyState
              icon={<ArrowLeftRight size={24} />}
              title="Aucun mouvement rapide"
              sub="Cliquez sur + Mouvement rapide pour en créer un."
              action="Mouvement rapide"
              onAction={startNew}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="table-wrap mr-desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Article</th>
                      <th>Quantité</th>
                      <th>Source</th>
                      <th>Destination</th>
                      <th>Motif</th>
                      <th>Par</th>
                      <th style={{ width: 60 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistorique.map((m) => {
                      const p = m;
                      const statut = p.statut || 'Validé';
                      const isCancelled = statut === 'Annulé';
                      const cfg = TYPE_CONFIG[m.type_mouvement] || {};
                      return (
                        <tr key={m.id} style={isCancelled ? { opacity: 0.5 } : {}}>
                          <td>
                            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{m.ref}</span>
                            {isCancelled && <span className="badge badge-red" style={{ fontSize: '0.65rem', marginLeft: 6 }}>Annulé</span>}
                          </td>
                          <td style={{ fontSize: '0.83rem' }}>{m.date_creation}</td>
                          <td>
                            <span className={`badge ${m.type_mouvement === 'Entrée' ? 'badge-green' : m.type_mouvement === 'Sortie' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                              {m.type_mouvement}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{m.article_designation || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{m.article_code}</div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{m.quantite}</td>
                          <td style={{ fontSize: '0.82rem' }}>{m.emplacement_source || '—'}</td>
                          <td style={{ fontSize: '0.82rem' }}>{m.emplacement_destination || '—'}</td>
                          <td style={{ fontSize: '0.82rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.motif || '—'}</td>
                          <td style={{ fontSize: '0.82rem' }}>{m.cree_par || '—'}</td>
                          <td>
                            <MRActions
                              item={m}
                              isCancelled={isCancelled}
                              onView={() => { setDetailItem(m); setView('detail'); }}
                              onCancel={() => setCancelModal(m.ref)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mr-mobile-cards">
                {filteredHistorique.map((m) => {
                  const statut = m.statut || 'Validé';
                  const isCancelled = statut === 'Annulé';
                  return (
                    <div key={m.id} className="mr-mobile-card" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', opacity: isCancelled ? 0.5 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{m.ref}</span>
                          {isCancelled && <span className="badge badge-red" style={{ fontSize: '0.62rem', marginLeft: 6 }}>Annulé</span>}
                        </div>
                        <span className={`badge ${m.type_mouvement === 'Entrée' ? 'badge-green' : m.type_mouvement === 'Sortie' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.68rem' }}>
                          {m.type_mouvement}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>{m.article_designation || '—'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                        <span>Qté: <strong>{m.quantite}</strong></span>
                        <span>{m.date_creation}</span>
                      </div>
                      {(m.emplacement_source || m.emplacement_destination) && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 4 }}>
                          {m.emplacement_source && <span>{m.emplacement_source}</span>}
                          {m.emplacement_source && m.emplacement_destination && <span> → </span>}
                          {m.emplacement_destination && <span>{m.emplacement_destination}</span>}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setDetailItem(m); setView('detail'); }} style={{ fontSize: '0.76rem' }}>
                          <Eye size={13} /> Voir
                        </button>
                        {!isCancelled && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setCancelModal(m.ref)} style={{ fontSize: '0.76rem', color: 'var(--red)' }}>
                            <XCircle size={13} /> Annuler
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Cancel modal */}
        <Modal open={!!cancelModal} onClose={() => { setCancelModal(null); setCancelMotif(''); }} title="Annuler le mouvement" width={480}>
          <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>
            Cette action va créer un mouvement inverse pour annuler <strong>{cancelModal}</strong>.
          </p>
          <FField label="Motif d'annulation" required>
            <textarea value={cancelMotif} onChange={(e) => setCancelMotif(e.target.value)} style={TEXTAREA_STYLE} placeholder="Raison de l'annulation..." />
          </FField>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCancelModal(null); setCancelMotif(''); }}>Annuler</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={loading || !cancelMotif.trim()} onClick={() => handleCancel(cancelModal)}>
              {loading ? 'En cours...' : 'Confirmer l\'annulation'}
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // FORM VIEW
  // ═══════════════════════════════════════════
  function renderForm() {
    return (
      <div className="animate-fade-in">
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">NOUVEAU MOUVEMENT RAPIDE</h1>
            <p className="page-subtitle finance-sub-hide-mobile">Enregistrement simplifié d'un mouvement sur un article.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setType(''); setForm(initialForm()); setSelectedArticle(null); }}>
            ← Retour
          </button>
        </div>

        {/* Type selection cards */}
        {!type && (
          <div style={{ marginBottom: 24 }}>
            <SectionTitle>Type de mouvement *</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {['Entrée', 'Sortie', 'Transfert'].map((t) => {
                const cfg = TYPE_CONFIG[t];
                const Icon = cfg.icon;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    style={{
                      background: cfg.bg, border: `2px solid ${cfg.color}22`, borderRadius: 12,
                      padding: '24px 20px', cursor: 'pointer', textAlign: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${cfg.color}22`; e.currentTarget.style.transform = 'none'; }}
                  >
                    <Icon size={32} style={{ color: cfg.color, marginBottom: 10 }} />
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.95rem', color: cfg.color }}>{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {type && (
          <div className="card" style={{ padding: '24px' }}>
            {/* Type badge + change */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              {(() => { const cfg = TYPE_CONFIG[type]; const Icon = cfg.icon; return <Icon size={20} style={{ color: cfg.color }} />; })()}
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>{TYPE_CONFIG[type].label}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setType('')} style={{ marginLeft: 'auto', fontSize: '0.76rem' }}>Changer</button>
            </div>

            {/* Article selection */}
            <SectionTitle icon={<Package size={14} />}>Article *</SectionTitle>
            <div style={{ marginBottom: 16 }}>
              <StockArticleSearch
                articles={articles}
                value={form.article_id}
                onChange={handleSelectArticle}
                placeholder="Tapez une lettre pour rechercher…"
              />
            </div>

            {/* Article info card */}
            {selectedArticle && (
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Référence</span><div style={{ fontWeight: 700 }}>{selectedArticle.code || selectedArticle.reference}</div></div>
                  <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Désignation</span><div style={{ fontWeight: 600 }}>{selectedArticle.designation || selectedArticle.nom}</div></div>
                  <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Unité</span><div>{selectedArticle.unite || 'U'}</div></div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Stock disponible</span>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: stockAvant > 0 ? '#2E7D32' : 'var(--red)' }}>
                      {stockAvant} {selectedArticle.unite || 'U'}
                    </div>
                  </div>
                  {selectedArticle.emplacement && (
                    <div><span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>Emplacement</span><div>{selectedArticle.emplacement}</div></div>
                  )}
                </div>
                {articleStock?.levels?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-2)' }}>
                    <strong>Par emplacement :</strong>{' '}
                    {articleStock.levels.filter((l) => l.quantite > 0).map((l) => `${l.emplacement}: ${l.quantite}`).join(' · ') || 'Aucun stock réparti'}
                  </div>
                )}
              </div>
            )}

            {/* Form fields */}
            <FRow>
              <FField label="Quantité" required>
                <input type="number" min="1" value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} style={INPUT_STYLE} placeholder="0" />
              </FField>
              <FField label="Date du mouvement" required>
                <input type="date" value={form.date_creation} onChange={(e) => setForm((f) => ({ ...f, date_creation: e.target.value }))} style={INPUT_STYLE} />
              </FField>
              <FField label="Effectué par" required>
                <input value={form.cree_par} onChange={(e) => setForm((f) => ({ ...f, cree_par: e.target.value }))} style={INPUT_STYLE} placeholder="Nom de la personne" />
              </FField>
            </FRow>

            <FRow>
              {needsSource && (
                <FField label="Emplacement source" required>
                  <select value={form.emplacement_source} onChange={(e) => setForm((f) => ({ ...f, emplacement_source: e.target.value }))} style={SELECT_STYLE}>
                    <option value="">— Sélectionner —</option>
                    {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </FField>
              )}
              {needsDest && (
                <FField label="Emplacement destination" required>
                  <select value={form.emplacement_destination} onChange={(e) => setForm((f) => ({ ...f, emplacement_destination: e.target.value }))} style={SELECT_STYLE}>
                    <option value="">— Sélectionner —</option>
                    {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </FField>
              )}
            </FRow>

            <FRow>
              <FField label="Motif" required>
                <select value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} style={SELECT_STYLE}>
                  <option value="">— Sélectionner —</option>
                  {(TYPE_CONFIG[type]?.motifs || []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </FField>
              <FField label="Projet / chantier lié">
                <input value={form.projet} onChange={(e) => setForm((f) => ({ ...f, projet: e.target.value }))} style={INPUT_STYLE} placeholder="Optionnel" />
              </FField>
            </FRow>

            {type === 'Entrée' && (
              <FRow>
                <FField label="Fournisseur">
                  <input value={form.fournisseur} onChange={(e) => setForm((f) => ({ ...f, fournisseur: e.target.value }))} style={INPUT_STYLE} placeholder="Si réception" />
                </FField>
              </FRow>
            )}
            {type === 'Sortie' && (
              <FRow>
                <FField label="Bénéficiaire / destinataire">
                  <input value={form.beneficiaire} onChange={(e) => setForm((f) => ({ ...f, beneficiaire: e.target.value }))} style={INPUT_STYLE} placeholder="Personne ou service" />
                </FField>
              </FRow>
            )}

            <FRow>
              <FField label="Observation">
                <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={TEXTAREA_STYLE} placeholder="Optionnel" />
              </FField>
              <FField label="Référence externe">
                <input value={form.ref_externe} onChange={(e) => setForm((f) => ({ ...f, ref_externe: e.target.value }))} style={INPUT_STYLE} placeholder="BL, facture..." />
              </FField>
            </FRow>

            {/* Stock preview */}
            {selectedArticle && qty > 0 && (
              <div style={{ background: type === 'Entrée' ? '#E8F5E9' : type === 'Sortie' ? '#FFEBEE' : '#E3F2FD', borderRadius: 8, padding: '14px 18px', marginTop: 16, border: `1px solid ${TYPE_CONFIG[type]?.color}33` }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.82rem', marginBottom: 8, textTransform: 'uppercase', color: TYPE_CONFIG[type]?.color }}>
                  Aperçu du mouvement
                </div>
                {type === 'Transfert' ? (
                  <div style={{ fontSize: '0.88rem' }}>
                    <div>{form.emplacement_source || '?'} : {sourceQty} → {sourceQty - qty}</div>
                    <div>{form.emplacement_destination || '?'} : stock augmenté de +{qty}</div>
                    <div style={{ fontWeight: 700, marginTop: 4 }}>Stock global : inchangé ({stockAvant})</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.88rem' }}>
                    <div>Stock actuel : <strong>{stockAvant} {selectedArticle.unite || 'U'}</strong></div>
                    <div>{type === 'Entrée' ? 'Entrée' : 'Sortie'} : <strong>{type === 'Entrée' ? '+' : '-'}{qty} {selectedArticle.unite || 'U'}</strong></div>
                    <div style={{ fontWeight: 700, marginTop: 4, color: stockApres < 0 ? 'var(--red)' : undefined }}>
                      Nouveau stock : {stockApres} {selectedArticle.unite || 'U'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setType(''); setForm(initialForm()); setSelectedArticle(null); }}>Annuler</button>
              <button className="btn btn-primary btn-sm" onClick={handleGoConfirm} disabled={loading}>
                Vérifier et confirmer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // CONFIRM VIEW
  // ═══════════════════════════════════════════
  function renderConfirm() {
    const cfg = TYPE_CONFIG[type] || {};
    const Icon = cfg.icon || Package;
    return (
      <div className="animate-fade-in">
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">CONFIRMER LE MOUVEMENT</h1>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setView('form')}>← Modifier</button>
        </div>

        <div className="card" style={{ padding: '28px', maxWidth: 640 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <Icon size={24} style={{ color: cfg.color }} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>{cfg.label}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Article</span>
            <span style={{ fontWeight: 600 }}>{selectedArticle?.code || selectedArticle?.reference} — {selectedArticle?.designation || selectedArticle?.nom}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Quantité</span>
            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{qty} {selectedArticle?.unite || 'U'}</span>
            {needsSource && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Source</span><span>{form.emplacement_source}</span></>}
            {needsDest && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Destination</span><span>{form.emplacement_destination}</span></>}
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Date</span>
            <span>{form.date_creation}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Motif</span>
            <span>{form.motif}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Effectué par</span>
            <span>{form.cree_par}</span>
            {form.projet && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Projet</span><span>{form.projet}</span></>}
            {form.note && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Observation</span><span>{form.note}</span></>}
          </div>

          {/* Stock impact */}
          <div style={{ background: cfg.bg, borderRadius: 8, padding: '14px 18px', marginTop: 20 }}>
            {type === 'Transfert' ? (
              <div style={{ fontSize: '0.88rem' }}>
                <div><strong>{form.emplacement_source}</strong> : {sourceQty} → {sourceQty - qty}</div>
                <div><strong>{form.emplacement_destination}</strong> : +{qty}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>Stock global inchangé</div>
              </div>
            ) : (
              <div style={{ fontSize: '0.88rem' }}>
                <div>Stock actuel : {stockAvant} → Nouveau : <strong>{stockApres}</strong> {selectedArticle?.unite || 'U'}</div>
              </div>
            )}
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setView('form')}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer le mouvement'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════
  function renderDetail() {
    if (!detailItem) return null;
    const m = detailItem;
    const cfg = TYPE_CONFIG[m.type_mouvement] || {};
    return (
      <div className="animate-fade-in">
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">{m.ref}</h1>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setDetailItem(null); }}>← Retour</button>
        </div>
        <div className="card" style={{ padding: '24px', maxWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Référence</span>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>{m.ref}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Type</span>
            <span className={`badge ${m.type_mouvement === 'Entrée' ? 'badge-green' : m.type_mouvement === 'Sortie' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.72rem', width: 'fit-content' }}>{m.type_mouvement}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Statut</span>
            <span className={`badge ${m.statut === 'Annulé' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.72rem', width: 'fit-content' }}>{m.statut || 'Validé'}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Article</span>
            <span>{m.article_code} — {m.article_designation}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Quantité</span>
            <span style={{ fontWeight: 700 }}>{m.quantite}</span>
            {m.emplacement_source && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Source</span><span>{m.emplacement_source}</span></>}
            {m.emplacement_destination && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Destination</span><span>{m.emplacement_destination}</span></>}
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Date</span>
            <span>{m.date_creation}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Motif</span>
            <span>{m.motif || '—'}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Par</span>
            <span>{m.cree_par || '—'}</span>
            {m.note && <><span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Notes</span><span>{m.note}</span></>}
          </div>
        </div>
      </div>
    );
  }
}

function MRActions({ item, isCancelled, onView, onCancel }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} style={{ padding: '4px 6px' }}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: '100%', background: '#fff', borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 1000, minWidth: 160, padding: '4px 0', border: '1px solid var(--border)' }}>
            <button onClick={() => { onView(); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
              <Eye size={14} /> Voir
            </button>
            {!isCancelled && (
              <button onClick={() => { onCancel(); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--red)' }}>
                <XCircle size={14} /> Annuler
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
