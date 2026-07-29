/**
 * MouvementRapide.jsx — Parcours simplifié d'enregistrement de mouvement (1 article).
 * Réutilise la logique stock_movements existante.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Package, Search, Eye,
  MoreHorizontal, XCircle,
  AlertTriangle, CheckCircle2, Plus, X, Trash2,
} from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  EmptyState, SectionTitle, Modal, FField, FRow,
  EMPLACEMENTS_STOCK,
} from './shared.jsx';
import {
  saveMouvementRapide,
  annulerMouvementRapide,
  deleteMouvementRapide,
  listMouvementsRapides,
  getArticleStockInfo,
} from '../../services/inventaire/mouvementRapide';
import StockArticleSearch from './StockArticleSearch.jsx';
import { useAuth } from '../../hooks/useAuth';

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
  const { user } = useAuth();
  const sessionName = (user?.nom || '').trim();

  const [view, setView] = useState('list'); // 'list' | 'form' | 'confirm' | 'detail'
  const [type, setType] = useState('');
  const [form, setForm] = useState(() => ({
    article_id: '', quantite: '', date_creation: new Date().toISOString().slice(0, 10),
    motif: '', emplacement_source: '', emplacement_destination: '',
    cree_par: sessionName, projet: '', note: '', beneficiaire: '', fournisseur: '', ref_externe: '',
  }));
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [articleStock, setArticleStock] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelMotif, setCancelMotif] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [searchHist, setSearchHist] = useState('');
  const [filterType, setFilterType] = useState('');
  const emplacements = emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK;

  function initialForm() {
    return {
      article_id: '', quantite: '', date_creation: new Date().toISOString().slice(0, 10),
      motif: '', emplacement_source: '', emplacement_destination: '',
      cree_par: sessionName, projet: '', note: '', beneficiaire: '', fournisseur: '', ref_externe: '',
    };
  }

  // Si le nom session arrive après le premier render, préremplir si champ encore vide
  useEffect(() => {
    if (!sessionName) return;
    setForm((f) => (f.cree_par ? f : { ...f, cree_par: sessionName }));
  }, [sessionName]);

  const loadArticleStock = useCallback(async (artId) => {
    if (!artId) { setArticleStock(null); return; }
    try {
      const info = await getArticleStockInfo(artId);
      setArticleStock(info);
    } catch { setArticleStock(null); }
  }, []);

  // Prefill article depuis la fiche article (navigation UI)
  useEffect(() => {
    let raw;
    try {
      raw = sessionStorage.getItem('citymo_mr_prefill_article');
      if (!raw) return;
      sessionStorage.removeItem('citymo_mr_prefill_article');
    } catch {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const art = (articles || []).find((a) => a.id === parsed?.id)
      || (articles || []).find((a) => a.code === parsed?.code);
    if (!art) return;
    setView('form');
    setType('Sortie');
    setSelectedArticle(art);
    setForm((f) => ({ ...f, article_id: art.id }));
    loadArticleStock(art.id);
  }, [articles, loadArticleStock]);

  const loadHistorique = useCallback(async () => {
    try {
      const data = await listMouvementsRapides();
      setHistorique(data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadHistorique(); }, [loadHistorique]);

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
  // Entrée : on affiche aussi la source (provenance) pour la renseigner dans l'historique
  const showSource = needsSource || type === 'Entrée';
  const showDest = needsDest || type === 'Sortie';

  const emplacementOptions = useMemo(() => {
    const fromProps = (emplacements || []).map((e) => String(e || '').trim()).filter(Boolean);
    const fromLevels = (articleStock?.levels || [])
      .map((l) => String(l.emplacement || '').trim())
      .filter(Boolean);
    const current = [form.emplacement_source, form.emplacement_destination]
      .map((e) => String(e || '').trim())
      .filter(Boolean);
    return [...new Set([...fromLevels, ...fromProps, ...current, ...EMPLACEMENTS_STOCK])];
  }, [emplacements, articleStock, form.emplacement_source, form.emplacement_destination]);

  const sourceOptionsWithStock = useMemo(() => {
    const levels = articleStock?.levels || [];
    const byEmp = new Map(levels.map((l) => [String(l.emplacement || '').trim(), Number(l.quantite) || 0]));
    return emplacementOptions.map((emp) => ({
      value: emp,
      qty: byEmp.has(emp) ? byEmp.get(emp) : null,
    }));
  }, [emplacementOptions, articleStock]);

  const stockAvant = articleStock?.totalStock ?? 0;
  const qty = Number(form.quantite) || 0;
  const stockApres = type === 'Entrée' ? stockAvant + qty
    : type === 'Sortie' ? stockAvant - qty
    : stockAvant; // Transfert: global unchanged

  const sourceLevel = useMemo(() => {
    if (!form.emplacement_source || !articleStock?.levels) return null;
    return articleStock.levels.find((l) => l.emplacement === form.emplacement_source);
  }, [form.emplacement_source, articleStock]);

  const sourceQty = sourceLevel?.quantite ?? stockAvant;

  // Préremplir source / destination dès qu'article + type sont connus
  useEffect(() => {
    if (!type || !selectedArticle) return;
    const levels = articleStock?.levels || [];
    const withStock = levels
      .filter((l) => Number(l.quantite) > 0)
      .sort((a, b) => Number(b.quantite) - Number(a.quantite));
    const preferredSource = withStock[0]?.emplacement
      || selectedArticle.emplacement
      || emplacements[0]
      || '';
    const preferredDest = selectedArticle.emplacement
      || emplacements[0]
      || EMPLACEMENTS_STOCK[0]
      || '';

    setForm((f) => {
      const next = { ...f };
      if (showSource && !f.emplacement_source && preferredSource) {
        next.emplacement_source = preferredSource;
      }
      if (showDest && !f.emplacement_destination && preferredDest) {
        next.emplacement_destination = preferredDest;
      }
      return next;
    });
  }, [type, selectedArticle, articleStock, emplacements, showSource, showDest]);

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
      await annulerMouvementRapide(ref, cancelMotif, sessionName);
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

  async function handleDelete(ref) {
    setLoading(true);
    setError('');
    try {
      await deleteMouvementRapide(ref);
      setSuccess(`Mouvement ${ref} supprimé.`);
      setDeleteModal(null);
      if (detailItem?.ref === ref) {
        setDetailItem(null);
        setView('list');
      }
      loadHistorique();
      if (onArticlesChange) {
        const { listStockArticles } = await import('../../services/inventaire/stockArticles');
        const refreshed = await listStockArticles();
        onArticlesChange(refreshed || []);
      }
    } catch (e) {
      setError(e?.message || 'Erreur lors de la suppression.');
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

        {/* Tabs pastilles de filtre par type */}
        <div
          className="mr-type-tabs"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 14,
            alignItems: 'center',
          }}
        >
          {[
            { key: '', label: 'Tous', count: totalMR, color: 'var(--red)' },
            { key: 'Entrée', label: 'Entrée en stock', count: entrees, color: '#2E7D32' },
            { key: 'Sortie', label: 'Sortie de stock', count: sorties, color: '#C62828' },
            { key: 'Transfert', label: 'Transfert', count: transferts, color: '#1565C0' },
          ].map((tab) => {
            const active = filterType === tab.key;
            return (
              <button
                key={tab.key || 'all'}
                type="button"
                onClick={() => setFilterType(tab.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: active ? `1.5px solid ${tab.color}` : '1.5px solid var(--border)',
                  cursor: 'pointer',
                  background: active ? tab.color : '#fff',
                  color: active ? '#fff' : 'var(--text-2)',
                  fontFamily: 'var(--font-head)',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 22,
                  height: 22,
                  padding: '0 6px',
                  borderRadius: 999,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: active ? 'rgba(255,255,255,0.28)' : 'var(--surface-2)',
                  color: active ? '#fff' : 'var(--text-3)',
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Recherche */}
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={searchHist}
              onChange={(e) => setSearchHist(e.target.value)}
              placeholder="Référence, article..."
              style={{ ...INPUT_STYLE, paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Table desktop / cards mobile */}
        <div className="card" style={{ padding: 0 }}>
          {filteredHistorique.length === 0 ? (
            <EmptyState
              icon={<ArrowLeftRight size={24} />}
              title={filterType || searchHist ? 'Aucun résultat' : 'Aucun mouvement rapide'}
              sub={filterType || searchHist
                ? 'Aucun mouvement pour ce filtre / cette recherche.'
                : 'Cliquez sur + Mouvement rapide pour en créer un.'}
              action={filterType || searchHist ? undefined : 'Mouvement rapide'}
              onAction={filterType || searchHist ? undefined : startNew}
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
                              isCancelled={isCancelled}
                              onView={() => { setDetailItem(m); setView('detail'); }}
                              onCancel={() => setCancelModal(m.ref)}
                              onDelete={() => setDeleteModal(m.ref)}
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
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setDetailItem(m); setView('detail'); }} style={{ fontSize: '0.76rem' }}>
                          <Eye size={13} /> Voir
                        </button>
                        {!isCancelled && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setCancelModal(m.ref)} style={{ fontSize: '0.76rem', color: 'var(--red)' }}>
                            <XCircle size={13} /> Annuler
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteModal(m.ref)} style={{ fontSize: '0.76rem', color: 'var(--red)' }}>
                          <Trash2 size={13} /> Supprimer
                        </button>
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
            <button className="btn btn-ghost btn-sm" onClick={() => { setCancelModal(null); setCancelMotif(''); }}>Fermer</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={loading || !cancelMotif.trim()} onClick={() => handleCancel(cancelModal)}>
              {loading ? 'En cours...' : 'Confirmer l\'annulation'}
            </button>
          </div>
        </Modal>

        {/* Delete modal */}
        <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Supprimer le mouvement" width={480}>
          <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>
            Confirmez-vous la suppression de <strong>{deleteModal}</strong> ?
            Le stock sera recalculé (mouvement inverse) puis l&apos;enregistrement sera effacé.
          </p>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteModal(null)}>Fermer</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={loading} onClick={() => handleDelete(deleteModal)}>
              {loading ? 'Suppression...' : 'Supprimer définitivement'}
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
              {showSource && (
                <FField label={type === 'Entrée' ? 'Emplacement provenance' : 'Emplacement source'} required={needsSource}>
                  <select
                    value={form.emplacement_source}
                    onChange={(e) => setForm((f) => ({ ...f, emplacement_source: e.target.value }))}
                    style={SELECT_STYLE}
                  >
                    <option value="">— Sélectionner un emplacement —</option>
                    {sourceOptionsWithStock.map(({ value, qty: q }) => (
                      <option key={`src-${value}`} value={value}>
                        {q != null ? `${value} (${q} dispo.)` : value}
                      </option>
                    ))}
                  </select>
                  {needsSource && form.emplacement_source && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                      Stock à cet emplacement : <strong>{sourceQty}</strong> {selectedArticle?.unite || 'U'}
                    </div>
                  )}
                </FField>
              )}
              {showDest && (
                <FField label="Emplacement destination" required={needsDest}>
                  <select
                    value={form.emplacement_destination}
                    onChange={(e) => setForm((f) => ({ ...f, emplacement_destination: e.target.value }))}
                    style={SELECT_STYLE}
                  >
                    <option value="">— Sélectionner un emplacement —</option>
                    {emplacementOptions.map((e) => (
                      <option key={`dst-${e}`} value={e}>{e}</option>
                    ))}
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
    const isCancelled = (m.statut || 'Validé') === 'Annulé';
    return (
      <div className="animate-fade-in">
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">{m.ref}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isCancelled && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCancelModal(m.ref)} style={{ color: 'var(--red)' }}>
                <XCircle size={14} /> Annuler
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteModal(m.ref)} style={{ color: 'var(--red)' }}>
              <Trash2 size={14} /> Supprimer
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); setDetailItem(null); }}>← Retour</button>
          </div>
        </div>
        <div className="card" style={{ padding: '24px', maxWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Référence</span>
            <span style={{ fontWeight: 700, color: 'var(--red)' }}>{m.ref}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Type</span>
            <span className={`badge ${m.type_mouvement === 'Entrée' ? 'badge-green' : m.type_mouvement === 'Sortie' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.72rem', width: 'fit-content' }}>{m.type_mouvement}</span>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>Statut</span>
            <span className={`badge ${isCancelled ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.72rem', width: 'fit-content' }}>{m.statut || 'Validé'}</span>
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

        <Modal open={!!cancelModal} onClose={() => { setCancelModal(null); setCancelMotif(''); }} title="Annuler le mouvement" width={480}>
          <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>
            Cette action va créer un mouvement inverse pour annuler <strong>{cancelModal}</strong>.
          </p>
          <FField label="Motif d'annulation" required>
            <textarea value={cancelMotif} onChange={(e) => setCancelMotif(e.target.value)} style={TEXTAREA_STYLE} placeholder="Raison de l'annulation..." />
          </FField>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCancelModal(null); setCancelMotif(''); }}>Fermer</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={loading || !cancelMotif.trim()} onClick={() => handleCancel(cancelModal)}>
              {loading ? 'En cours...' : 'Confirmer l\'annulation'}
            </button>
          </div>
        </Modal>

        <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Supprimer le mouvement" width={480}>
          <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>
            Confirmez-vous la suppression de <strong>{deleteModal}</strong> ?
          </p>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteModal(null)}>Fermer</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} disabled={loading} onClick={() => handleDelete(deleteModal)}>
              {loading ? 'Suppression...' : 'Supprimer définitivement'}
            </button>
          </div>
        </Modal>
      </div>
    );
  }
}

function MRActions({ isCancelled, onView, onCancel, onDelete }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 190;
    const left = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8));
    // Ouvrir vers le haut si pas assez de place en bas
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 160;
    setMenuPos({
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left,
      width: menuW,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onReposition = () => updatePos();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const menu = open && menuPos && createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: menuPos.top,
        bottom: menuPos.bottom,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 10050,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
        border: '1px solid var(--border)',
        padding: '4px 0',
      }}
    >
      <button
        type="button"
        onClick={() => { onView(); setOpen(false); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)' }}
      >
        <Eye size={14} /> Voir
      </button>
      {!isCancelled && (
        <button
          type="button"
          onClick={() => { onCancel(); setOpen(false); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text)' }}
        >
          <XCircle size={14} /> Annuler le mouvement
        </button>
      )}
      <button
        type="button"
        onClick={() => { onDelete(); setOpen(false); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--red)' }}
      >
        <Trash2 size={14} /> Supprimer
      </button>
    </div>,
    document.body,
  );

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        style={{ padding: '4px 8px' }}
        title="Actions"
        aria-label="Actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </div>
  );
}
