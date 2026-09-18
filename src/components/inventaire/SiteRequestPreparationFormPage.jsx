/**
 * SiteRequestPreparationFormPage — Bon de préparation d'articles disponibles en stock.
 * Ne remplace pas le formulaire catalogue / manuel des autres parcours.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, Loader2, CheckCircle, Plus, Trash2, Search } from 'lucide-react';
import { SITE_REQUEST_PRIORITES } from '../../constants/siteMaterialRequests';
import { INPUT_STYLE, SELECT_STYLE, formatEmplacementDisplay } from './shared.jsx';
import {
  filterPreparationOffers,
  offerToPreparationLine,
  preparationOfferKey,
  validatePreparationQuantities,
  formatPreparationConflictMessage,
  linesToPreparationPayload,
  decodeSourceEmplacement,
} from '../../services/inventaire/siteRequestPreparation';

function Label({ children, required }) {
  return (
    <label style={{
      fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5,
    }}
    >
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

export default function SiteRequestPreparationFormPage({
  editId,
  form,
  setForm,
  lines,
  setLines,
  projects,
  offers = [],
  saving,
  error,
  onBack,
  onSave,
  lockProject = false,
}) {
  const [search, setSearch] = useState('');
  const [articleType, setArticleType] = useState('');
  const [localError, setLocalError] = useState('');
  const isEdit = !!editId;

  const typeOptions = useMemo(() => {
    const set = new Set((offers || []).map((o) => o.article_type).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [offers]);

  const filteredOffers = useMemo(
    () => filterPreparationOffers(offers, { query: search, articleType }),
    [offers, search, articleType],
  );

  const selectedKeys = useMemo(
    () => new Set((lines || []).map((l) => preparationOfferKey(
      l.article_id,
      l.emplacement_source || decodeSourceEmplacement(l.remarque).emplacement,
    ))),
    [lines],
  );

  function onProjectChange(projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    setForm((f) => ({
      ...f,
      project_id: projectId || '',
      project_ref: p?.ref || '',
      project_name: p?.nom || p?.name || '',
      client_name: p?.client || p?.client_nom || '',
      chef_projet: p?.chef_projet || p?.responsable || f.chef_projet,
      chef_chantier: p?.chef_chantier || f.chef_chantier,
    }));
  }

  function addOffer(offer) {
    if (selectedKeys.has(offer.key)) return;
    setLines((prev) => [...prev, offerToPreparationLine(offer, prev.length)]);
  }

  function updateLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_order: i })));
  }

  function validateAndSave(submitAfter) {
    setLocalError('');
    if (!form.project_id) {
      setLocalError('Sélectionnez un projet (destination).');
      return;
    }
    if (!lines.length) {
      setLocalError('Sélectionnez au moins un article disponible.');
      return;
    }
    const payload = linesToPreparationPayload(lines);
    const qtyErrors = validatePreparationQuantities(payload, offers);
    if (qtyErrors.length) {
      setLocalError(formatPreparationConflictMessage(qtyErrors));
      return;
    }
    setLines(payload);
    onSave(submitAfter, payload);
  }

  const displayError = localError || error;
  const destination = form.project_name
    ? `${form.project_name}${form.project_ref ? ` (${form.project_ref})` : ''}`
    : '—';

  return (
    <div className="animate-fade-in inv-dc-prep-page">
      <button
        type="button"
        className="inv-dc-prep-back"
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600,
          marginBottom: 16, padding: 0, minHeight: 44,
        }}
      >
        <ChevronLeft size={16} /> Retour aux demandes
      </button>

      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          {isEdit ? 'Modifier le bon de préparation' : 'Créer un bon de préparation'}
        </h1>
        <p className="page-subtitle">
          Articles disponibles dans le catalogue stock — sans manquant ni demande d&apos;achat.
        </p>
      </div>

      {displayError && (
        <div style={{
          background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)',
          borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, whiteSpace: 'pre-wrap',
        }}
        >
          {displayError}
        </div>
      )}

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
        }}
        >
          Destination et renseignements
        </div>
        <div className="inv-dc-prep-meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <Label required>Projet / destination</Label>
            <select
              value={form.project_id || ''}
              onChange={(e) => onProjectChange(e.target.value)}
              style={SELECT_STYLE}
              disabled={lockProject}
              required
            >
              <option value="">— Sélectionner un projet —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.ref} — {p.nom || p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Destination</Label>
            <input value={destination} readOnly style={{ ...INPUT_STYLE, background: '#F5F5F5' }} />
          </div>
          <div>
            <Label>Client</Label>
            <input value={form.client_name || ''} readOnly style={{ ...INPUT_STYLE, background: '#F5F5F5' }} />
          </div>
          <div>
            <Label>Chef de projet</Label>
            <input
              value={form.chef_projet || ''}
              onChange={(e) => setForm((f) => ({ ...f, chef_projet: e.target.value }))}
              style={INPUT_STYLE}
            />
          </div>
          <div>
            <Label>Chef de chantier</Label>
            <input
              value={form.chef_chantier || ''}
              onChange={(e) => setForm((f) => ({ ...f, chef_chantier: e.target.value }))}
              style={INPUT_STYLE}
            />
          </div>
          <div>
            <Label>Date demande</Label>
            <input
              type="date"
              value={form.date_demande || ''}
              onChange={(e) => setForm((f) => ({ ...f, date_demande: e.target.value }))}
              style={INPUT_STYLE}
            />
          </div>
          <div>
            <Label>Date souhaitée</Label>
            <input
              type="date"
              value={form.date_souhaitee || ''}
              onChange={(e) => setForm((f) => ({ ...f, date_souhaitee: e.target.value }))}
              style={INPUT_STYLE}
            />
          </div>
          <div>
            <Label>Priorité</Label>
            <select
              value={form.priorite || 'Normale'}
              onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}
              style={SELECT_STYLE}
            >
              {SITE_REQUEST_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Label>Observations</Label>
          <textarea
            value={form.observation || ''}
            onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
            style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 64 }}
            placeholder="Instructions pour le magasinier…"
          />
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
        }}
        >
          Catalogue — articles disponibles
        </div>
        <div className="inv-dc-prep-filters" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche (référence, désignation, dépôt)…"
              style={{ ...INPUT_STYLE, paddingLeft: 32 }}
            />
          </div>
          <select
            value={articleType}
            onChange={(e) => setArticleType(e.target.value)}
            style={{ ...SELECT_STYLE, maxWidth: 220 }}
          >
            <option value="">Toutes les catégories</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap inv-dc-prep-desktop inv-dc-prep-catalog" style={{ maxHeight: 280, overflow: 'auto' }}>
          <table style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Unité</th>
                <th>Emplacement source</th>
                <th>Disponible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredOffers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-3)', padding: 16 }}>
                    Aucun article disponible pour ces filtres.
                  </td>
                </tr>
              ) : filteredOffers.map((o) => {
                const added = selectedKeys.has(o.key);
                return (
                  <tr key={o.key}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{o.reference || '—'}</td>
                    <td>{o.designation}</td>
                    <td>{o.unite}</td>
                    <td>{formatEmplacementDisplay(o.emplacement)}</td>
                    <td style={{ fontWeight: 700 }}>{o.quantite_disponible}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={added}
                        onClick={() => addOffer(o)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Plus size={13} /> {added ? 'Ajouté' : 'Ajouter'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="inv-dc-prep-mobile inv-dc-prep-catalog" aria-label="Catalogue articles disponibles">
          {filteredOffers.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', padding: 8 }}>
              Aucun article disponible pour ces filtres.
            </div>
          ) : filteredOffers.map((o) => {
            const added = selectedKeys.has(o.key);
            return (
              <article key={o.key} className="inv-dc-prep-offer-card">
                <div className="inv-dc-prep-offer-head">
                  <div className="inv-dc-prep-offer-ref">{o.reference || '—'}</div>
                  <div style={{ fontWeight: 800, flexShrink: 0 }}>{o.quantite_disponible} {o.unite}</div>
                </div>
                <div className="inv-dc-prep-offer-name">{o.designation}</div>
                <div className="inv-dc-prep-offer-meta">{formatEmplacementDisplay(o.emplacement)}</div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={added}
                  onClick={() => addOffer(o)}
                >
                  <Plus size={13} /> {added ? 'Ajouté' : 'Ajouter'}
                </button>
              </article>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          Quantité au dépôt indiqué — distincte du stock global. Les articles sans emplacement disponible n’apparaissent pas.
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
        }}
        >
          Articles à préparer ({lines.length})
        </div>
        {lines.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.86rem' }}>
            Ajoutez des articles depuis le catalogue ci-dessus.
          </div>
        ) : (
          <>
          <div className="table-wrap inv-dc-prep-desktop">
            <table style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Désignation</th>
                  <th>Unité</th>
                  <th>Source</th>
                  <th>Disponible</th>
                  <th>Qté demandée</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const emp = l.emplacement_source || decodeSourceEmplacement(l.remarque).emplacement;
                  const key = preparationOfferKey(l.article_id, emp);
                  const offer = offers.find((o) => o.key === key);
                  const available = Number(offer?.quantite_disponible ?? l.quantite_disponible ?? 0);
                  const qty = Number(l.quantite_demandee);
                  const over = qty > available;
                  return (
                    <tr key={key || idx} style={over ? { background: '#FFEBEE' } : undefined}>
                      <td style={{ fontWeight: 700 }}>{l.reference || '—'}</td>
                      <td>{l.article_name}</td>
                      <td>{l.unite}</td>
                      <td>{formatEmplacementDisplay(emp)}</td>
                      <td>{available}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={l.quantite_demandee}
                          onChange={(e) => updateLine(idx, { quantite_demandee: e.target.value })}
                          style={{ ...INPUT_STYLE, width: 90, padding: '4px 8px', borderColor: over ? 'var(--red)' : undefined }}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(idx)} aria-label="Retirer">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inv-dc-prep-mobile" aria-label="Articles à préparer">
            {lines.map((l, idx) => {
              const emp = l.emplacement_source || decodeSourceEmplacement(l.remarque).emplacement;
              const key = preparationOfferKey(l.article_id, emp);
              const offer = offers.find((o) => o.key === key);
              const available = Number(offer?.quantite_disponible ?? l.quantite_disponible ?? 0);
              const qty = Number(l.quantite_demandee);
              const over = qty > available;
              return (
                <article
                  key={key || idx}
                  className="inv-dc-prep-line-card"
                  style={over ? { background: '#FFEBEE', borderColor: 'rgba(211,47,47,0.35)' } : undefined}
                >
                  <div className="inv-dc-prep-line-head">
                    <div className="inv-dc-prep-line-ref">{l.reference || '—'}</div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(idx)} aria-label="Retirer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="inv-dc-prep-line-name">{l.article_name}</div>
                  <div className="inv-dc-prep-line-meta">{formatEmplacementDisplay(emp)} · {l.unite}</div>
                  <div className="inv-dc-prep-qty">
                    <div>
                      <Label>Disponible</Label>
                      <div style={{ fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>{available}</div>
                    </div>
                    <div>
                      <Label>Qté demandée</Label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={l.quantite_demandee}
                        onChange={(e) => updateLine(idx, { quantite_demandee: e.target.value })}
                        style={{ ...INPUT_STYLE, padding: '8px 10px', borderColor: over ? 'var(--red)' : undefined }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>

      <div
        className="inv-dc-prep-actions"
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end',
          marginTop: 8, paddingTop: 16, borderTop: '2px solid var(--border)',
        }}
      >
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={saving}>Annuler</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => validateAndSave(true)}
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 220, justifyContent: 'center' }}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
          Confirmer le bon de préparation
        </button>
      </div>
    </div>
  );
}
