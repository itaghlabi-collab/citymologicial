/**
 * Formulaire catalogue article (identité permanente uniquement).
 * Pas de quantité / emplacement / entrée en stock.
 */
import { useState, useEffect } from 'react';
import { Package, Plus, Loader2 } from 'lucide-react';
import { generateStockArticleCode } from '../../services/inventaire/stockArticles';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, UNITES,
  TYPES_ARTICLE_STOCK, STATUTS_ARTICLE_STOCK,
  SectionTitle, FField, FRow,
} from './shared.jsx';

const EMPTY = {
  code: '',
  designation: '',
  type: '',
  categorie_id: '',
  numero_serie: '',
  unite: 'U',
  statut: 'Actif',
  description: '',
  notes: '',
  barcode_value: '',
  // stock fields intentionally empty — no auto movement
  quantite_initiale: '',
  valeur: '',
  stock_minimum: '',
  etat: 'Neuf',
  emplacement: '',
};

export default function ArticleCatalogForm({
  initial,
  categories,
  onSave,
  onCancel,
  saving,
}) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY };
    return {
      ...EMPTY,
      ...initial,
      code: initial.code || initial.reference || '',
      barcode_value: initial.barcode_value || initial.code || '',
      quantite_initiale: '',
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
      .then((code) => setForm((p) => (p.code ? p : { ...p, code, barcode_value: p.barcode_value || code })))
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
    // Garantir aucune entrée stock depuis le catalogue
    onSave({
      ...form,
      quantite_initiale: '',
      stock_emplacement: '',
      date_entree_stock: '',
      fournisseur_stock: '',
      reference_facture_bl: '',
      prix_achat_unitaire: '',
      observation_stock: '',
    });
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
        <FField label="Code-barres">
          <input
            value={form.barcode_value}
            onChange={(e) => set('barcode_value', e.target.value)}
            placeholder="Identique au code si vide"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Désignation" required>
          <input
            value={form.designation}
            onChange={(e) => set('designation', e.target.value)}
            placeholder="Nom de l'article…"
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
        <FField label="Valeur unitaire (MAD)">
          <input
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            value={form.valeur}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { set('valeur', ''); return; }
              const n = Math.max(0, Math.round(Number(raw)));
              set('valeur', Number.isFinite(n) ? String(n) : '');
            }}
            placeholder="Ex. 150"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_ARTICLE_STOCK.filter((s) => s !== 'Archivé').map((s) => <option key={s} value={s}>{s}</option>)}
            {isEdit && form.statut === 'Archivé' && <option value="Archivé">Archivé</option>}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Description & documents</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description de l'article…" style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FField label="Notes">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes…" style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: 16 }}>
        Photo, fiche technique et documents pourront être liés ultérieurement. La quantité et l’emplacement se gèrent dans <strong>Stocks</strong>.
      </p>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {isEdit ? 'Enregistrer' : 'Créer l’article'}
        </button>
      </div>
    </form>
  );
}
