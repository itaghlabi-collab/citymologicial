/**
 * SiteRequestForm.jsx — Formulaire demande chantier (style devis CITYMO)
 */
import { useState, useMemo, useCallback } from 'react';
import { Search, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  SITE_REQUEST_CATEGORIES,
  SITE_REQUEST_PRIORITES,
  SITE_REQUEST_UNITS,
  buildDefaultCatalogLines,
  searchCatalogItems,
} from '../../constants/siteMaterialRequests';
import { enrichLinesWithStock } from '../../services/inventaire/siteMaterialRequests';

const CITYMO_LOGO = 'https://i.ibb.co/N6SbC06M/logopng.png';
const CITYMO_COMPANY = {
  address: '228 Bd Mohammed V, Casablanca 20000',
  email: 'contact@citymo.ma',
  phone: 'Tél : +212 52 231 0043',
  ice: 'ICE : 002023116000060',
};

function IS(extra = {}) {
  return {
    padding: '8px 11px',
    border: '1.5px solid var(--border)',
    borderRadius: 6,
    fontSize: '0.86rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
    ...extra,
  };
}

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

function fmtDateFr(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

function stockBadge(status) {
  if (status === 'rupture') return { label: 'Rupture', color: '#C62828', bg: '#FFEBEE' };
  if (status === 'low') return { label: 'Stock faible', color: '#E65100', bg: '#FFF3E0' };
  return { label: 'Disponible', color: '#2E7D32', bg: '#E8F5E9' };
}

export function buildInitialLines(existingLines) {
  if (existingLines?.length) {
    const map = new Map(existingLines.map((l) => [`${l.category_id}|${l.article_name}`, l]));
    const base = buildDefaultCatalogLines().map((l) => map.get(`${l.category_id}|${l.article_name}`) || l);
    const customs = existingLines.filter((l) => l.is_custom);
    return [...base, ...customs];
  }
  return buildDefaultCatalogLines();
}

function SiteRequestDocumentHeader({ form }) {
  return (
    <div className="devis-doc-header card" style={{ padding: 0, overflow: 'visible', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '24px 28px', borderRight: '1px solid var(--border)', background: '#FAFAFA' }}>
          <img src={CITYMO_LOGO} alt="CITYMO" style={{ height: 48, objectFit: 'contain', marginBottom: 14 }} />
          <div style={{ fontSize: '0.92rem', color: 'var(--text-2)', lineHeight: 1.75 }}>
            <div>{CITYMO_COMPANY.address}</div>
            <div>{CITYMO_COMPANY.email}</div>
            <div>{CITYMO_COMPANY.phone}</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{CITYMO_COMPANY.ice}</div>
          </div>
        </div>
        <div style={{ padding: '24px 28px', background: '#fff' }}>
          <div style={{
            fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.55rem',
            color: 'var(--red)', letterSpacing: '0.04em', marginBottom: 16, lineHeight: 1.2,
          }}
          >
            BON DE DEMANDE CHANTIER
          </div>
          <div style={{ display: 'grid', gap: 10, fontSize: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Référence</span>
              <span style={{ fontWeight: 800 }}>{form.ref || "Auto à l'enregistrement"}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Date demande</span>
              <span style={{ fontWeight: 600 }}>{fmtDateFr(form.date_demande)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Date souhaitée</span>
              <span style={{ fontWeight: 600 }}>{fmtDateFr(form.date_souhaitee)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Priorité</span>
              <span style={{ fontWeight: 700, color: form.priorite === 'Critique' ? 'var(--red)' : 'var(--text)' }}>
                {form.priorite || 'Normale'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequestSummary({ lines, form }) {
  const active = lines.filter((l) => Number(l.quantite_demandee) > 0);
  const totalQty = active.reduce((s, l) => s + (Number(l.quantite_demandee) || 0), 0);
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
      }}
      >
        Récapitulatif
      </div>
      {[
        ['Articles demandés', active.length],
        ['Quantité totale', totalQty],
        ['Priorité', form.priorite || 'Normale'],
        ['Projet', form.project_name || '—'],
      ].map(([label, val]) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between', padding: '8px 0',
          borderBottom: '1px solid var(--border)', fontSize: '0.86rem',
        }}
        >
          <span style={{ color: 'var(--text-3)' }}>{label}</span>
          <span style={{ fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{val}</span>
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
        Renseignez les quantités par catégorie puis soumettez au magasin pour préparation.
      </div>
    </div>
  );
}

export default function SiteRequestForm({
  form, setForm, lines, setLines, projects = [], stockArticles = [], readOnly = false,
  layout = 'drawer',
}) {
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState(() => new Set(['demolition', 'maconnerie']));
  const [customName, setCustomName] = useState('');
  const isPage = layout === 'page';

  const enriched = useMemo(() => enrichLinesWithStock(lines, stockArticles), [lines, stockArticles]);
  const enrichedMap = useMemo(() => {
    const m = new Map();
    enriched.forEach((l) => m.set(`${l.category_id}|${l.article_name}`, l));
    return m;
  }, [enriched]);

  const searchResults = useMemo(
    () => searchCatalogItems(search, stockArticles),
    [search, stockArticles],
  );

  const toggleCat = (id) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateLine = useCallback((categoryId, articleName, patch) => {
    setLines((prev) => prev.map((l) => (
      l.category_id === categoryId && l.article_name === articleName ? { ...l, ...patch } : l
    )));
  }, [setLines]);

  const jumpToSearchResult = (item) => {
    setOpenCats((prev) => new Set([...prev, item.categoryId]));
    setSearch('');
    const el = document.getElementById(`sr-line-${item.categoryId}-${item.articleName.replace(/\s/g, '-')}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('input[type="number"]')?.focus();
  };

  function addCustomLine() {
    const name = customName.trim();
    if (!name) return;
    setLines((prev) => [...prev, {
      category_id: 'autres',
      article_name: name,
      quantite_demandee: 1,
      quantite_preparee: 0,
      quantite_livree: 0,
      unite: 'u',
      remarque: '',
      is_custom: true,
      line_order: prev.length,
    }]);
    setCustomName('');
    setOpenCats((prev) => new Set([...prev, 'autres']));
  }

  function removeCustomLine(articleName) {
    setLines((prev) => prev.filter((l) => !(l.is_custom && l.article_name === articleName)));
  }

  function onProjectChange(projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    setForm((f) => ({
      ...f,
      project_id: projectId || '',
      project_ref: p?.ref || '',
      project_name: p?.nom || '',
      client_name: p?.client || p?.client_nom || '',
      chef_projet: p?.chef_projet || p?.responsable || f.chef_projet,
      chef_chantier: p?.chef_chantier || f.chef_chantier,
    }));
  }

  const customLines = lines.filter((l) => l.is_custom);

  const metaFields = (
    <div className="card" style={{ padding: '20px 22px', marginBottom: isPage ? 0 : 16 }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
      }}
      >
        Informations chantier
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <Label required>Projet</Label>
          <select value={form.project_id || ''} onChange={(e) => onProjectChange(e.target.value)} style={IS()} disabled={readOnly} required>
            <option value="">— Sélectionner un projet —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.nom}</option>)}
          </select>
        </div>
        <div>
          <Label>Client</Label>
          <input value={form.client_name || ''} readOnly style={IS({ background: '#F5F5F5' })} />
        </div>
        <div>
          <Label>Chef de projet</Label>
          <input value={form.chef_projet || ''} onChange={(e) => setForm((f) => ({ ...f, chef_projet: e.target.value }))} style={IS()} disabled={readOnly} />
        </div>
        <div>
          <Label>Chef de chantier</Label>
          <input value={form.chef_chantier || ''} onChange={(e) => setForm((f) => ({ ...f, chef_chantier: e.target.value }))} style={IS()} disabled={readOnly} />
        </div>
        <div>
          <Label>Date demande</Label>
          <input type="date" value={form.date_demande || ''} onChange={(e) => setForm((f) => ({ ...f, date_demande: e.target.value }))} style={IS()} disabled={readOnly} />
        </div>
        <div>
          <Label>Date souhaitée</Label>
          <input type="date" value={form.date_souhaitee || ''} onChange={(e) => setForm((f) => ({ ...f, date_souhaitee: e.target.value }))} style={IS()} disabled={readOnly} />
        </div>
        <div>
          <Label>Priorité</Label>
          <select value={form.priorite || 'Normale'} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))} style={IS()} disabled={readOnly}>
            {SITE_REQUEST_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {form.project_name && (
        <div style={{ background: 'var(--red)', color: '#fff', borderRadius: 8, padding: '14px 18px', marginTop: 16 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85, marginBottom: 6 }}>
            Chantier
          </div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>
            {form.project_name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: '0.82rem', opacity: 0.95 }}>
            {form.project_ref && <div>Réf. {form.project_ref}</div>}
            {form.client_name && <div>Client : {form.client_name}</div>}
            {form.chef_chantier && <div>Chef chantier : {form.chef_chantier}</div>}
          </div>
        </div>
      )}
    </div>
  );

  const observationBlock = (
    <div className="card" style={{ padding: '20px 22px', marginBottom: isPage ? 0 : 16 }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
      }}
      >
        Observations générales
      </div>
      <textarea
        value={form.observation || ''}
        onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
        style={{ ...IS({ resize: 'vertical', minHeight: 72 }), marginTop: 0 }}
        disabled={readOnly}
        placeholder="Instructions particulières pour le magasinier…"
        rows={3}
      />
    </div>
  );

  const articlesSection = (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
      }}
      >
        Articles demandés
      </div>

      {!readOnly && (
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche intelligente — ex. Perfo, Vis BA13, Laser…"
              style={{ ...IS({ paddingLeft: 34 }) }}
            />
          </div>
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4,
              background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,0.14)', maxHeight: 220, overflow: 'auto',
            }}
            >
              {searchResults.map((item) => (
                <button
                  key={`${item.categoryId}-${item.articleName}`}
                  type="button"
                  onClick={() => jumpToSearchResult(item)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.86rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <strong>{item.articleName}</strong>
                  <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: '0.78rem' }}>{item.categoryLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {SITE_REQUEST_CATEGORIES.map((cat) => {
        if (cat.freeForm) return null;
        const catLines = lines.filter((l) => l.category_id === cat.id && !l.is_custom);
        const requestedCount = catLines.filter((l) => Number(l.quantite_demandee) > 0).length;
        const isOpen = openCats.has(cat.id);
        return (
          <section key={cat.id} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => toggleCat(cat.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                background: '#F5F5F5', border: 'none', borderLeft: '4px solid var(--red)',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
              }}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {requestedCount > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                  {requestedCount} article{requestedCount > 1 ? 's' : ''}
                </span>
              )}
            </button>
            {isOpen && (
              <div style={{ padding: '8px 12px 12px' }}>
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', background: '#FAFAFA' }}>
                        <th style={{ textAlign: 'left', padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Article</th>
                        <th style={{ width: 80, padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Qté</th>
                        <th style={{ width: 70, padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Unité</th>
                        <th style={{ padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Remarque</th>
                        <th style={{ width: 110, padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Stock</th>
                        <th style={{ width: 90, padding: '8px', fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-3)' }}>Dispo.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.filter((n) => n !== 'Autre').map((name) => {
                        const line = lines.find((l) => l.category_id === cat.id && l.article_name === name) || {};
                        const info = enrichedMap.get(`${cat.id}|${name}`) || {};
                        const badge = stockBadge(info.stock_status);
                        const lineId = `sr-line-${cat.id}-${name.replace(/\s/g, '-')}`;
                        return (
                          <tr key={name} id={lineId} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>{name}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={line.quantite_demandee || ''}
                                onChange={(e) => updateLine(cat.id, name, { quantite_demandee: Number(e.target.value) || 0 })}
                                style={IS({ padding: '4px 8px' })}
                                disabled={readOnly}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <select
                                value={line.unite || 'u'}
                                onChange={(e) => updateLine(cat.id, name, { unite: e.target.value })}
                                style={IS({ padding: '4px 6px', fontSize: '0.78rem' })}
                                disabled={readOnly}
                              >
                                {SITE_REQUEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                value={line.remarque || ''}
                                onChange={(e) => updateLine(cat.id, name, { remarque: e.target.value })}
                                style={IS({ padding: '4px 8px' })}
                                disabled={readOnly}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>{info.stock_actuel ?? '—'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              {Number(line.quantite_demandee) > 0 ? (
                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 99, background: badge.bg, color: badge.color, fontWeight: 700 }}>
                                  {badge.label}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <section style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => toggleCat('autres')}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
            background: '#F5F5F5', border: 'none', borderLeft: '4px solid var(--red)', cursor: 'pointer', fontWeight: 700,
          }}
        >
          {openCats.has('autres') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>📦</span><span>Autres — articles personnalisés</span>
        </button>
        {openCats.has('autres') && (
          <div style={{ padding: 12 }}>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nom de l'article…" style={IS()} />
                <button type="button" className="btn btn-primary btn-sm" onClick={addCustomLine}><Plus size={14} /> Ajouter</button>
              </div>
            )}
            {customLines.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun article personnalisé.</div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', background: '#FAFAFA' }}>
                      <th>Article</th><th>Qté</th><th>Unité</th><th>Remarque</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {customLines.map((line) => (
                      <tr key={line.article_name} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ fontWeight: 600 }}>{line.article_name}</td>
                        <td>
                          <input type="number" min="0" value={line.quantite_demandee || ''} onChange={(e) => updateLine('autres', line.article_name, { quantite_demandee: Number(e.target.value) || 0 })} style={IS({ padding: '4px 8px' })} disabled={readOnly} />
                        </td>
                        <td>
                          <select value={line.unite || 'u'} onChange={(e) => updateLine('autres', line.article_name, { unite: e.target.value })} style={IS({ padding: '4px 6px' })} disabled={readOnly}>
                            {SITE_REQUEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td>
                          <input value={line.remarque || ''} onChange={(e) => updateLine('autres', line.article_name, { remarque: e.target.value })} style={IS({ padding: '4px 8px' })} disabled={readOnly} />
                        </td>
                        <td>
                          {!readOnly && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeCustomLine(line.article_name)} style={{ color: 'var(--red)' }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );

  if (!isPage) {
    return (
      <div>
        {metaFields}
        {observationBlock}
        {articlesSection}
      </div>
    );
  }

  return (
    <div className="site-request-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SiteRequestDocumentHeader form={form} />
        {metaFields}
        {observationBlock}
        {articlesSection}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
        <RequestSummary lines={lines} form={form} />
      </div>
    </div>
  );
}
