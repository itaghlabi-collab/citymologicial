/**
 * Formulaire fiche stock opérationnelle (distinct du catalogue).
 * Réutilise updateStockArticle / patchStockArticle — ne touche pas à la quantité.
 */
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, EMPLACEMENTS_STOCK,
  ETATS_ARTICLE_STOCK, CURRENT_STATES_ARTICLE,
  Modal, FField, FRow, SectionTitle,
  filterVisibleEmplacements, isSansEmplacement, isDeprecatedEmplacement,
} from './shared.jsx';
import { updateStockArticle, patchStockArticle } from '../../services/inventaire/stockArticles';

export default function StockFicheEditModal({
  open,
  article,
  emplacementsList = EMPLACEMENTS_STOCK,
  onClose,
  onDone,
}) {
  const emplacements = filterVisibleEmplacements(emplacementsList?.length ? emplacementsList : EMPLACEMENTS_STOCK);
  const [form, setForm] = useState({
    emplacement: '',
    stock_minimum: '',
    etat: 'Neuf',
    valeur: '',
    current_state: 'Disponible',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !article) return;
    setForm({
      // F5/G3 masqués à l’UI — valeur DB conservée tant que l’utilisateur ne choisit pas autre chose
      emplacement: isSansEmplacement(article.emplacement) ? '' : (article.emplacement || ''),
      stock_minimum: article.stock_minimum ?? '',
      etat: article.etat || 'Neuf',
      valeur: article.valeur ?? '',
      current_state: article.current_state || 'Disponible',
      notes: article.notes || '',
    });
    setError('');
  }, [open, article?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!article?.id) return;
    setSaving(true);
    setError('');
    try {
      let emplacementToSave = form.emplacement;
      // Ne pas écraser F5/G3 en base si l’utilisateur n’a pas choisi un nouvel emplacement
      if (!emplacementToSave && isDeprecatedEmplacement(article.emplacement)) {
        emplacementToSave = article.emplacement;
      }
      await updateStockArticle(article.id, {
        ...article,
        emplacement: emplacementToSave,
        stock_minimum: form.stock_minimum,
        etat: form.etat,
        valeur: form.valeur,
        notes: form.notes,
        quantite_initiale: '',
      });
      await patchStockArticle(article.id, {
        emplacement: emplacementToSave,
        current_state: form.current_state,
      });
      onDone?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (!article) return null;

  return (
    <Modal open={open} onClose={() => !saving && onClose?.()} title="Modifier la fiche stock" width={560}>
      <form onSubmit={handleSubmit}>
        {error && <div style={{ color: 'var(--red)', marginBottom: 10, fontSize: '0.84rem' }}>{error}</div>}

        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>{article.code}</div>
          <div style={{ fontWeight: 600 }}>{article.designation}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Données catalogue en lecture seule</div>
        </div>

        <SectionTitle>Informations opérationnelles</SectionTitle>
        <FRow>
          <FField label="Emplacement principal">
            <select value={form.emplacement} onChange={(e) => set('emplacement', e.target.value)} style={SELECT_STYLE}>
              <option value="">— Sélectionner —</option>
              {emplacements.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </FField>
          <FField label="Stock minimum (alerte)">
            <input type="number" min="0" value={form.stock_minimum} onChange={(e) => set('stock_minimum', e.target.value)} style={INPUT_STYLE} />
          </FField>
          <FField label="État">
            <select value={form.etat} onChange={(e) => set('etat', e.target.value)} style={SELECT_STYLE}>
              {ETATS_ARTICLE_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </FField>
          <FField label="Valeur unitaire (MAD)">
            <input type="number" step="0.01" min="0" value={form.valeur} onChange={(e) => set('valeur', e.target.value)} style={INPUT_STYLE} />
          </FField>
          <FField label="Statut opérationnel">
            <select value={form.current_state} onChange={(e) => set('current_state', e.target.value)} style={SELECT_STYLE}>
              {CURRENT_STATES_ARTICLE.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FField>
        </FRow>
        <FField label="Observation stock">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 size={14} className="cin-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}
