/**
 * BCLignesSection — Lignes bon de commande (même composeur que devis CRM)
 */
import { useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { listArticles, getArticleById } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';
import ArticleDesignationSearch from '../crm/ArticleDesignationSearch';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, TVA_OPTIONS, genId,
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

function catName(categories, id) {
  const c = categories.find((x) => String(x.id) === String(id));
  return c ? formatCategoryDisplayName(c.nom) : '—';
}

export default function BCLignesSection({ lignes, onChange }) {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [draftError, setDraftError] = useState('');

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
    setEditingId(null);
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
    const row = draftToLigne(draft, editingId, articles);
    if (editingId) {
      onChange(lignes.map((l) => (l.id === editingId ? row : l)));
    } else {
      onChange([...lignes, row]);
    }
    resetDraft();
  }

  function startEdit(ligne) {
    setEditingId(ligne.id);
    setDraft(ligneToDraft(ligne, articles));
    setDraftError('');
  }

  function removeLigne(id) {
    onChange(lignes.filter((l) => l.id !== id));
    if (editingId === id) resetDraft();
  }

  const isTitre = draft.mode === 'titre';
  const isSousTitre = draft.mode === 'sous_titre';
  const isHorsCatalogue = draft.mode === 'hors_catalogue';

  const composerTitle = editingId
    ? 'Modifier la ligne'
    : isTitre
      ? 'Ajouter un titre'
      : isSousTitre
        ? 'Ajouter un sous-titre'
        : isHorsCatalogue
          ? 'Ajouter un article hors catalogue'
          : 'Ajouter une ligne';

  return (
    <div>
      {lignes.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
                {['Désignation', 'Catégorie', 'Qté', 'Unité', 'Prix HT', 'Remise %', 'TVA %', 'Total HT', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const t = lineType(l);
                if (t === 'titre') {
                  return (
                    <tr key={l.id} style={{ background: '#F5F6F8', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={9} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase' }}>
                            {l.designation || '—'}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px' }}>Titre</span>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(l)} title="Modifier" style={{ padding: '4px 6px' }}>
                              <Pencil size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} title="Supprimer" style={{ color: 'var(--red)', padding: '4px 6px' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                if (t === 'sous_titre') {
                  return (
                    <tr key={l.id} style={{ background: '#FAFBFC', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={9} style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{l.designation || '—'}</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px' }}>Sous-titre</span>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(l)} title="Modifier" style={{ padding: '4px 6px' }}>
                              <Pencil size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} title="Supprimer" style={{ color: 'var(--red)', padding: '4px 6px' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const totalHT = lineTotalHt(l);
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: l.ephemeral ? '#FFFBF0' : undefined }}>
                    <td style={{ padding: '8px 10px', minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{l.designation || '—'}</div>
                      {l.ephemeral && (
                        <span style={{ fontSize: '0.68rem', color: '#E65100', fontWeight: 600 }}>Hors catalogue</span>
                      )}
                      {l.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                          {l.description.length > 120 ? `${l.description.slice(0, 120)}…` : l.description}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {l.categorie_id ? (
                        <span className="badge badge-blue">{catName(categories, l.categorie_id)}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>{l.qte}</td>
                    <td style={{ padding: '8px 10px' }}>{l.unite}</td>
                    <td style={{ padding: '8px 10px' }}>{Number(l.prix_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '8px 10px' }}>{l.remise ? `${l.remise}%` : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{l.tva}%</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: 'var(--font-head)' }}>
                      {totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(l)} title="Modifier" style={{ padding: '4px 6px' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} title="Supprimer" style={{ color: 'var(--red)', padding: '4px 6px' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            {editingId ? 'Mettre à jour' : 'OK'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetDraft}>Effacer</button>
          {!isTitre && !isSousTitre && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft({ ...EMPTY_DRAFT(), mode: 'titre' }); setDraftError(''); }}>
                Ajouter Titre
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft({ ...EMPTY_DRAFT(), mode: 'sous_titre' }); setDraftError(''); }}>
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

      {!editingId && (
        <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          Choisissez une catégorie et un article du catalogue, ou recherchez par désignation.
        </p>
      )}
    </div>
  );
}
