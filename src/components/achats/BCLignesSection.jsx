/**
 * BCLignesSection — Lignes bon de commande (composeur + affichage devis avec drag)
 */
import { useState, useEffect } from 'react';
import { Pencil, Trash2, GripVertical, Copy } from 'lucide-react';
import { listArticles, getArticleById } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';
import ArticleDesignationSearch from '../crm/ArticleDesignationSearch';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, TVA_OPTIONS, genId, formatMAD,
} from './shared.jsx';

const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack', 'U'];

const EMPTY_DRAFT = () => ({
  mode: 'article',
  categorie_id: '',
  article_id: '',
  designation: '',
  description: '',
  qte: 1,
  unite: 'unite',
  prix_ht: '',
  remise: 0,
  tva: 20,
});

function FieldLabel({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

function lineType(l) {
  return l.type || 'article';
}

function lineTotalHt(l) {
  const t = lineType(l);
  if (t === 'titre' || t === 'sous_titre') return 0;
  const base = (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0);
  const remise = parseFloat(l.remise) || 0;
  return base * (1 - remise / 100);
}

function rowDragStyle(isDragging, isOver) {
  if (isDragging) return { opacity: 0.45 };
  if (isOver) return { boxShadow: 'inset 0 0 0 2px var(--red)' };
  return {};
}

function DragHandle({ onDragStart, onDragEnd }) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title="Glisser pour réorganiser"
      style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', touchAction: 'none' }}
    >
      <GripVertical size={13} style={{ color: 'var(--text-3)' }} />
    </span>
  );
}

function LigneDescriptionText({ description }) {
  if (!description?.trim()) return null;
  return (
    <div style={{ fontSize: '0.76rem', color: 'var(--text-2)', marginTop: 6, lineHeight: 1.55, fontWeight: 400, whiteSpace: 'pre-wrap' }}>
      {description}
    </div>
  );
}

function draftToLigne(draft, id, articles = []) {
  if (draft.mode === 'titre') {
    return { id: id || genId(), type: 'titre', designation: draft.designation.trim() };
  }
  if (draft.mode === 'sous_titre') {
    return { id: id || genId(), type: 'sous_titre', designation: draft.designation.trim() };
  }
  let description = draft.description?.trim() || '';
  if (!description && draft.mode === 'article' && draft.article_id) {
    const art = articles.find((a) => String(a.id) === String(draft.article_id));
    description = art?.description?.trim() || '';
  }
  return {
    id: id || genId(),
    type: 'article',
    ephemeral: draft.mode === 'hors_catalogue',
    categorie_id: draft.mode === 'hors_catalogue' ? '' : (draft.categorie_id || ''),
    article_id: draft.mode === 'hors_catalogue' ? '' : (draft.article_id || ''),
    designation: draft.designation?.trim() || '',
    description,
    qte: Number(draft.qte) || 0,
    unite: draft.unite || 'unite',
    prix_ht: draft.prix_ht === '' ? '' : Number(draft.prix_ht),
    remise: Number(draft.remise) || 0,
    tva: Number(draft.tva) ?? 20,
  };
}

function ligneToDraft(ligne, articles = []) {
  const t = lineType(ligne);
  if (t === 'titre') {
    return { ...EMPTY_DRAFT(), mode: 'titre', designation: ligne.designation || '' };
  }
  if (t === 'sous_titre') {
    return { ...EMPTY_DRAFT(), mode: 'sous_titre', designation: ligne.designation || '' };
  }
  let description = ligne.description || '';
  if (!description?.trim() && ligne.article_id) {
    const art = articles.find((a) => String(a.id) === String(ligne.article_id));
    description = art?.description?.trim() || '';
  }
  return {
    ...EMPTY_DRAFT(),
    mode: ligne.ephemeral ? 'hors_catalogue' : 'article',
    categorie_id: ligne.categorie_id ? String(ligne.categorie_id) : '',
    article_id: ligne.article_id ? String(ligne.article_id) : '',
    designation: ligne.designation || '',
    description,
    qte: ligne.qte ?? 1,
    unite: ligne.unite || 'unite',
    prix_ht: ligne.prix_ht ?? '',
    remise: ligne.remise ?? 0,
    tva: ligne.tva ?? 20,
  };
}

function BCLineDisplay({ ligne, lineNum, idx, onDelete, onDuplicate, onEdit, drag }) {
  const dragProps = {
    style: rowDragStyle(drag.isDragging, drag.isOver),
    onDragOver: (e) => { e.preventDefault(); drag.onDragOver(idx); },
    onDrop: (e) => { e.preventDefault(); drag.onDrop(idx); },
  };
  const handleProps = {
    onDragStart: (e) => drag.onDragStart(e, idx),
    onDragEnd: drag.onDragEnd,
  };
  const actions = (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
      <button type="button" onClick={() => onEdit(idx)} title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
        <Pencil size={13} />
      </button>
      {lineType(ligne) === 'article' && (
        <button type="button" onClick={() => onDuplicate(idx)} title="Dupliquer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
          <Copy size={13} />
        </button>
      )}
      <button type="button" onClick={() => onDelete(idx)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
        <Trash2 size={13} />
      </button>
    </div>
  );

  if (lineType(ligne) === 'titre') {
    return (
      <tr {...dragProps}>
        <td colSpan={8} style={{ padding: '12px 14px', background: 'linear-gradient(90deg, #F5F5F5 0%, #FAFAFA 100%)', borderTop: '2px solid var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DragHandle {...handleProps} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              {ligne.designation || 'Section'}
            </span>
            {actions}
          </div>
        </td>
      </tr>
    );
  }

  if (lineType(ligne) === 'sous_titre') {
    return (
      <tr {...dragProps}>
        <td colSpan={8} style={{ padding: '8px 14px 8px 28px', background: '#FAFAFA', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DragHandle {...handleProps} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', flex: 1 }}>
              {ligne.designation || 'Sous-titre'}
            </span>
            {actions}
          </div>
        </td>
      </tr>
    );
  }

  const ht = lineTotalHt(ligne);

  return (
    <tr {...dragProps} style={{ ...dragProps.style, background: ligne.ephemeral ? '#FFFBF0' : '#fff' }}>
      <td style={{ padding: '10px 6px', width: 28, verticalAlign: 'top' }}>
        <DragHandle {...handleProps} />
      </td>
      <td style={{ padding: '10px 8px', width: 36, fontWeight: 700, color: 'var(--text-3)', fontSize: '0.82rem', verticalAlign: 'top' }}>
        {lineNum}
      </td>
      <td style={{ padding: '10px 8px', minWidth: 200, verticalAlign: 'top' }}>
        {ligne.designation?.trim() && (
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>{ligne.designation}</div>
        )}
        {ligne.ephemeral && (
          <span style={{ fontSize: '0.68rem', color: '#E65100', fontWeight: 600, background: '#FFF3E0', padding: '2px 6px', borderRadius: 4 }}>Hors catalogue</span>
        )}
        <LigneDescriptionText description={ligne.description} />
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top', fontSize: '0.88rem' }}>{ligne.qte}</td>
      <td style={{ padding: '10px 8px', verticalAlign: 'top', fontSize: '0.82rem', color: 'var(--text-2)' }}>{ligne.unite}</td>
      <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top', fontSize: '0.88rem' }}>
        {formatMAD(ligne.prix_ht)}
        {Number(ligne.remise) > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>-{ligne.remise}%</div>
        )}
      </td>
      <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top', fontFamily: 'var(--font-head)', fontWeight: 700 }}>
        {formatMAD(ht)}
      </td>
      <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>{actions}</td>
    </tr>
  );
}

export default function BCLignesSection({ lignes, onChange }) {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draftError, setDraftError] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  useEffect(() => {
    Promise.all([listArticles(), listCategories()])
      .then(([ar, ca]) => {
        setArticles(ar || []);
        setCategories(ca || []);
      })
      .catch(() => {});
  }, []);

  const catArticles = draft.categorie_id
    ? articles.filter((a) => String(a.categorie_id) === String(draft.categorie_id))
    : [];

  function setF(k, v) {
    setDraft((p) => ({ ...p, [k]: v }));
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT());
    setEditingIdx(null);
    setDraftError('');
  }

  function onCategorieChange(catId) {
    setDraft((p) => ({ ...p, categorie_id: catId, article_id: '', designation: '', description: '' }));
  }

  async function onArticleChange(articleId) {
    if (!articleId) {
      setDraft((p) => ({ ...p, article_id: '' }));
      return;
    }
    const art = articles.find((a) => String(a.id) === String(articleId));
    if (art) {
      setDraft((p) => ({
        ...p,
        article_id: articleId,
        categorie_id: art.categorie_id ? String(art.categorie_id) : p.categorie_id,
        designation: art.nom || '',
        description: art.description || '',
        unite: art.unite || 'unite',
        prix_ht: art.prix_ht ?? art.prix ?? '',
        remise: art.remise ?? 0,
        tva: art.tva ?? 20,
      }));
    } else {
      setDraft((p) => ({ ...p, article_id: articleId }));
    }
    try {
      const fresh = await getArticleById(articleId);
      if (!fresh) return;
      setArticles((prev) => {
        const i = prev.findIndex((a) => String(a.id) === String(articleId));
        if (i >= 0) {
          const next = [...prev];
          next[i] = fresh;
          return next;
        }
        return [...prev, fresh];
      });
      setDraft((p) => ({
        ...p,
        article_id: articleId,
        categorie_id: fresh.categorie_id ? String(fresh.categorie_id) : p.categorie_id,
        designation: fresh.nom || p.designation,
        description: fresh.description || p.description,
        unite: fresh.unite || p.unite,
        prix_ht: fresh.prix_ht ?? fresh.prix ?? p.prix_ht,
        remise: fresh.remise ?? p.remise,
        tva: fresh.tva ?? p.tva,
      }));
    } catch { /* keep local */ }
  }

  function commitDraft() {
    if (draft.mode === 'titre' || draft.mode === 'sous_titre') {
      if (!draft.designation?.trim()) {
        setDraftError(draft.mode === 'titre' ? 'Titre requis.' : 'Sous-titre requis.');
        return;
      }
    } else if (!draft.designation?.trim()) {
      setDraftError('Désignation requise.');
      return;
    }
    const existingId = editingIdx != null ? lignes[editingIdx]?.id : null;
    const row = draftToLigne(draft, existingId, articles);
    if (editingIdx != null) {
      const ls = [...lignes];
      ls[editingIdx] = row;
      onChange(ls);
    } else {
      onChange([...lignes, row]);
    }
    resetDraft();
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setDraft(ligneToDraft(lignes[idx], articles));
    setDraftError('');
  }

  function removeLigne(idx) {
    onChange(lignes.filter((_, i) => i !== idx));
    if (editingIdx === idx) resetDraft();
    else if (editingIdx != null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  }

  function duplicateLigne(idx) {
    const ls = [...lignes];
    ls.splice(idx + 1, 0, { ...ls[idx], id: genId() });
    onChange(ls);
  }

  function reorderLignes(from, to) {
    if (from == null || to == null || from === to) return;
    const ls = [...lignes];
    const [item] = ls.splice(from, 1);
    ls.splice(to, 0, item);
    onChange(ls);
    if (editingIdx === from) setEditingIdx(to);
    else if (editingIdx != null && from < editingIdx && to >= editingIdx) setEditingIdx(editingIdx - 1);
    else if (editingIdx != null && from > editingIdx && to <= editingIdx) setEditingIdx(editingIdx + 1);
  }

  const dragHandlers = {
    onDragStart: (e, idx) => {
      setDragIdx(idx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    },
    onDragOver: (idx) => setOverIdx(idx),
    onDrop: (idx) => {
      if (dragIdx !== null) reorderLignes(dragIdx, idx);
      setDragIdx(null);
      setOverIdx(null);
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    isDragging: (idx) => dragIdx === idx,
    isOver: (idx) => overIdx === idx && dragIdx !== idx,
  };

  const isTitre = draft.mode === 'titre';
  const isSousTitre = draft.mode === 'sous_titre';
  const isHorsCatalogue = draft.mode === 'hors_catalogue';

  const composerTitle = editingIdx != null
    ? 'Modifier la ligne'
    : isTitre
      ? 'Ajouter un titre'
      : isSousTitre
        ? 'Ajouter un sous-titre'
        : isHorsCatalogue
          ? 'Ajouter un article hors catalogue'
          : 'Ajouter une ligne';

  let articleLineNum = 0;

  return (
    <div>
      {lignes.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
                <th style={{ width: 28 }} />
                <th style={{ width: 36, padding: '8px 6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>#</th>
                {['Désignation', 'Qté', 'Unité', 'Prix HT', 'Total HT', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Prix HT' || h === 'Total HT' ? 'right' : 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, idx) => {
                const isArticle = lineType(ligne) === 'article';
                const lineNum = isArticle ? ++articleLineNum : null;
                return (
                  <BCLineDisplay
                    key={ligne.id || idx}
                    ligne={ligne}
                    lineNum={lineNum}
                    idx={idx}
                    onDelete={removeLigne}
                    onDuplicate={duplicateLigne}
                    onEdit={startEdit}
                    drag={{
                      ...dragHandlers,
                      isDragging: dragHandlers.isDragging(idx),
                      isOver: dragHandlers.isOver(idx),
                    }}
                  />
                );
              })}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-3)' }}>
            Glissez les lignes pour réorganiser titres, sous-titres et articles.
          </p>
        </div>
      )}

      <div style={{ padding: '18px 20px', background: '#F8F9FA', borderRadius: 10, border: '1.5px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.88rem', marginBottom: 14, color: 'var(--text)' }}>
          {composerTitle}
        </div>

        {draftError && (
          <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 10 }}>{draftError}</div>
        )}

        {isTitre ? (
          <div style={{ marginBottom: 14 }}>
            <FieldLabel required>Titre de section</FieldLabel>
            <input
              value={draft.designation}
              onChange={(e) => setF('designation', e.target.value)}
              placeholder="Ex : GROS ŒUVRE, PEINTURE…"
              style={{ ...INPUT_STYLE, fontFamily: 'var(--font-head)', fontWeight: 700 }}
            />
          </div>
        ) : isSousTitre ? (
          <div style={{ marginBottom: 14 }}>
            <FieldLabel required>Sous-titre</FieldLabel>
            <input
              value={draft.designation}
              onChange={(e) => setF('designation', e.target.value)}
              placeholder="Ex : Cloisons, Électricité…"
              style={{ ...INPUT_STYLE, fontFamily: 'var(--font-head)', fontWeight: 600 }}
            />
          </div>
        ) : (
          <>
            {!isHorsCatalogue && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <FieldLabel>Catégorie</FieldLabel>
                  <select value={draft.categorie_id} onChange={(e) => onCategorieChange(e.target.value)} style={SELECT_STYLE}>
                    <option value="">Choisir…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{formatCategoryDisplayName(c.nom)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Article</FieldLabel>
                  <select
                    value={draft.article_id}
                    onChange={(e) => onArticleChange(e.target.value)}
                    disabled={!draft.categorie_id}
                    style={{ ...SELECT_STYLE, opacity: draft.categorie_id ? 1 : 0.6 }}
                  >
                    <option value="">{draft.categorie_id ? 'Choisir…' : 'Catégorie d\'abord'}</option>
                    {catArticles.map((a) => (
                      <option key={a.id} value={a.id}>{a.nom}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <FieldLabel required={isHorsCatalogue}>Désignation</FieldLabel>
              {!isHorsCatalogue ? (
                <ArticleDesignationSearch
                  value={draft.designation}
                  onChange={(v) => setF('designation', v)}
                  articles={articles}
                  categories={categories}
                  onPickArticle={onArticleChange}
                  inputStyle={INPUT_STYLE}
                />
              ) : (
                <input
                  value={draft.designation}
                  onChange={(e) => setF('designation', e.target.value)}
                  placeholder="Ex : Démolition cloison BA13 (facultatif)"
                  style={INPUT_STYLE}
                />
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <FieldLabel>Description</FieldLabel>
              <textarea
                rows={Math.min(8, Math.max(2, (draft.description || '').split('\n').length))}
                value={draft.description}
                onChange={(e) => setF('description', e.target.value)}
                placeholder="Description détaillée…"
                style={{ ...TEXTAREA_STYLE, resize: 'vertical', minHeight: 56 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginBottom: 12, alignItems: 'end' }}>
              <div>
                <FieldLabel>Quantité</FieldLabel>
                <input type="number" min="0" step="0.01" value={draft.qte} onChange={(e) => setF('qte', e.target.value)} style={INPUT_STYLE} />
              </div>
              <div>
                <FieldLabel>Unité</FieldLabel>
                <select value={draft.unite} onChange={(e) => setF('unite', e.target.value)} style={SELECT_STYLE}>
                  {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel><span style={{ whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>PRIX.U.HT.</span></FieldLabel>
                <input type="number" min="0" step="0.01" value={draft.prix_ht} onChange={(e) => setF('prix_ht', e.target.value)} style={INPUT_STYLE} />
              </div>
              <div>
                <FieldLabel>Remise %</FieldLabel>
                <input type="number" min="0" max="100" value={draft.remise} onChange={(e) => setF('remise', e.target.value)} style={INPUT_STYLE} />
              </div>
              <div>
                <FieldLabel>TVA %</FieldLabel>
                <select value={draft.tva} onChange={(e) => setF('tva', Number(e.target.value))} style={SELECT_STYLE}>
                  {TVA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={commitDraft} style={{ minWidth: 72, fontWeight: 800 }}>
            {editingIdx != null ? 'Mettre à jour' : 'OK'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetDraft}>Effacer</button>
          {!isTitre && !isSousTitre && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft({ ...EMPTY_DRAFT(), mode: 'titre' }); setDraftError(''); setEditingIdx(null); }}>
                Ajouter Titre
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft({ ...EMPTY_DRAFT(), mode: 'sous_titre' }); setDraftError(''); setEditingIdx(null); }}>
                Ajouter Sous-titre
              </button>
            </>
          )}
          {!isTitre && !isSousTitre && draft.mode !== 'hors_catalogue' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'hors_catalogue' })} style={{ color: '#E65100' }}>
              Article hors catalogue
            </button>
          )}
          {!isTitre && !isSousTitre && draft.mode === 'hors_catalogue' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'article' })}>
              Article catalogue
            </button>
          )}
          {(isTitre || isSousTitre) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...EMPTY_DRAFT(), mode: 'article' })}>
              Ligne article
            </button>
          )}
        </div>
      </div>

      {editingIdx == null && (
        <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          Choisissez une catégorie et un article du catalogue, ou recherchez par désignation.
        </p>
      )}
    </div>
  );
}
