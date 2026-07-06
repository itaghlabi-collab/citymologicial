/**
 * BCLignesSection — Lignes bon de commande (catalogue CRM : catégorie, article, désignation)
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
  categorie_id: '',
  article_id: '',
  designation: '',
  description: '',
  qte: 1,
  unite: 'unite',
  prix_ht: '',
  tva: 20,
});

function FieldLabel({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

function draftToLigne(draft, id) {
  return {
    id: id || genId(),
    categorie_id: draft.categorie_id || '',
    article_id: draft.article_id || '',
    designation: draft.designation?.trim() || '',
    description: draft.description?.trim() || '',
    qte: Number(draft.qte) || 0,
    unite: draft.unite || 'unite',
    prix_ht: draft.prix_ht === '' ? '' : Number(draft.prix_ht),
    tva: Number(draft.tva) ?? 20,
  };
}

function ligneToDraft(ligne) {
  return {
    categorie_id: ligne.categorie_id ? String(ligne.categorie_id) : '',
    article_id: ligne.article_id ? String(ligne.article_id) : '',
    designation: ligne.designation || '',
    description: ligne.description || '',
    qte: ligne.qte ?? 1,
    unite: ligne.unite || 'unite',
    prix_ht: ligne.prix_ht ?? '',
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
        tva: fresh.tva ?? p.tva,
      }));
    } catch { /* keep local */ }
  }

  function commitDraft() {
    if (!draft.designation?.trim()) {
      setDraftError('Désignation requise.');
      return;
    }
    const row = draftToLigne(draft, editingId);
    if (editingId) {
      onChange(lignes.map((l) => (l.id === editingId ? row : l)));
    } else {
      onChange([...lignes, row]);
    }
    resetDraft();
  }

  function startEdit(ligne) {
    setEditingId(ligne.id);
    setDraft(ligneToDraft(ligne));
    setDraftError('');
  }

  function removeLigne(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter((l) => l.id !== id));
    if (editingId === id) resetDraft();
  }

  return (
    <div>
      {lignes.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
                {['Désignation', 'Catégorie', 'Qté', 'Unité', 'Prix HT', 'TVA %', 'Total HT', ''].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const totalHT = (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0);
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{l.designation || '—'}</div>
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
                    <td style={{ padding: '8px 10px' }}>{l.tva}%</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: 'var(--font-head)' }}>
                      {totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(l)} title="Modifier" style={{ padding: '4px 6px' }}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} title="Supprimer" style={{ color: 'var(--red)', padding: '4px 6px' }} disabled={lignes.length <= 1}>
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
          {editingId ? 'Modifier la ligne' : 'Ajouter une ligne'}
        </div>

        {draftError && (
          <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: 10 }}>{draftError}</div>
        )}

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

        <div style={{ marginBottom: 12 }}>
          <FieldLabel required>Désignation</FieldLabel>
          <ArticleDesignationSearch
            value={draft.designation}
            onChange={(v) => setF('designation', v)}
            articles={articles}
            categories={categories}
            onPickArticle={onArticleChange}
            inputStyle={INPUT_STYLE}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <FieldLabel>Description</FieldLabel>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => setF('description', e.target.value)}
            placeholder="Description détaillée…"
            style={TEXTAREA_STYLE}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
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
            <FieldLabel>Prix HT</FieldLabel>
            <input type="number" min="0" step="0.01" value={draft.prix_ht} onChange={(e) => setF('prix_ht', e.target.value)} placeholder="0.00" style={INPUT_STYLE} />
          </div>
          <div>
            <FieldLabel>TVA %</FieldLabel>
            <select value={draft.tva} onChange={(e) => setF('tva', Number(e.target.value))} style={SELECT_STYLE}>
              {TVA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={commitDraft} style={{ minWidth: 72, fontWeight: 800 }}>
            {editingId ? 'Mettre à jour' : 'OK'}
          </button>
          {(editingId || draft.designation || draft.categorie_id) && (
            <button type="button" className="btn btn-ghost" onClick={resetDraft}>Annuler</button>
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
