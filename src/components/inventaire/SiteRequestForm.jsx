/**
 * SiteRequestForm.jsx — Formulaire demande chantier (accordéon fiche papier)
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
import { INPUT_STYLE, SELECT_STYLE } from './shared.jsx';

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

export default function SiteRequestForm({
  form, setForm, lines, setLines, projects = [], stockArticles = [], readOnly = false,
}) {
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState(() => new Set(['demolition', 'maconnerie']));
  const [customName, setCustomName] = useState('');

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

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Projet *</label>
          <select value={form.project_id || ''} onChange={(e) => onProjectChange(e.target.value)} style={{ ...SELECT_STYLE, marginTop: 4 }} disabled={readOnly} required>
            <option value="">— Sélectionner —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.ref} — {p.nom}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Client</label>
          <input value={form.client_name || ''} readOnly style={{ ...INPUT_STYLE, marginTop: 4, background: 'var(--surface-2)' }} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Chef de projet</label>
          <input value={form.chef_projet || ''} onChange={(e) => setForm((f) => ({ ...f, chef_projet: e.target.value }))} style={INPUT_STYLE} disabled={readOnly} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Chef de chantier</label>
          <input value={form.chef_chantier || ''} onChange={(e) => setForm((f) => ({ ...f, chef_chantier: e.target.value }))} style={INPUT_STYLE} disabled={readOnly} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Date demande</label>
          <input type="date" value={form.date_demande || ''} onChange={(e) => setForm((f) => ({ ...f, date_demande: e.target.value }))} style={INPUT_STYLE} disabled={readOnly} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Date souhaitée</label>
          <input type="date" value={form.date_souhaitee || ''} onChange={(e) => setForm((f) => ({ ...f, date_souhaitee: e.target.value }))} style={INPUT_STYLE} disabled={readOnly} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Priorité</label>
          <select value={form.priorite || 'Normale'} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))} style={SELECT_STYLE} disabled={readOnly}>
            {SITE_REQUEST_PRIORITES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Observation générale</label>
        <textarea
          value={form.observation || ''}
          onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
          style={{ ...INPUT_STYLE, minHeight: 64, marginTop: 4 }}
          disabled={readOnly}
          placeholder="Instructions particulières pour le magasinier…"
        />
      </div>

      {!readOnly && (
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche intelligente — ex. Perfo, Vis BA13, Laser…"
              style={{ ...INPUT_STYLE, paddingLeft: 34 }}
            />
          </div>
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4,
              background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 220, overflow: 'auto',
            }}
            >
              {searchResults.map((item) => (
                <button
                  key={`${item.categoryId}-${item.articleName}`}
                  type="button"
                  onClick={() => jumpToSearchResult(item)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                    background: 'transparent', cursor: 'pointer', fontSize: '0.86rem',
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
                background: 'var(--surface-2)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              }}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              {requestedCount > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>{requestedCount} article{requestedCount > 1 ? 's' : ''}</span>
              )}
            </button>
            {isOpen && (
              <div style={{ padding: '8px 12px 12px' }}>
                <div className="table-wrap">
                  <table style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th style={{ width: 80 }}>Qté</th>
                        <th style={{ width: 70 }}>Unité</th>
                        <th>Remarque</th>
                        <th style={{ width: 110 }}>Stock</th>
                        <th style={{ width: 90 }}>Dispo.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.filter((n) => n !== 'Autre').map((name) => {
                        const line = lines.find((l) => l.category_id === cat.id && l.article_name === name) || {};
                        const info = enrichedMap.get(`${cat.id}|${name}`) || {};
                        const badge = stockBadge(info.stock_status);
                        const lineId = `sr-line-${cat.id}-${name.replace(/\s/g, '-')}`;
                        return (
                          <tr key={name} id={lineId}>
                            <td>{name}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={line.quantite_demandee || ''}
                                onChange={(e) => updateLine(cat.id, name, { quantite_demandee: Number(e.target.value) || 0 })}
                                style={{ ...INPUT_STYLE, padding: '4px 8px' }}
                                disabled={readOnly}
                              />
                            </td>
                            <td>
                              <select
                                value={line.unite || 'u'}
                                onChange={(e) => updateLine(cat.id, name, { unite: e.target.value })}
                                style={{ ...SELECT_STYLE, padding: '4px 6px', fontSize: '0.78rem' }}
                                disabled={readOnly}
                              >
                                {SITE_REQUEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td>
                              <input
                                value={line.remarque || ''}
                                onChange={(e) => updateLine(cat.id, name, { remarque: e.target.value })}
                                style={{ ...INPUT_STYLE, padding: '4px 8px' }}
                                disabled={readOnly}
                              />
                            </td>
                            <td style={{ fontWeight: 600 }}>{info.stock_actuel ?? '—'}</td>
                            <td>
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
            background: 'var(--surface-2)', border: 'none', cursor: 'pointer', fontWeight: 700,
          }}
        >
          {openCats.has('autres') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>📦</span><span>Autres — articles personnalisés</span>
        </button>
        {openCats.has('autres') && (
          <div style={{ padding: 12 }}>
            {!readOnly && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nom de l'article…" style={INPUT_STYLE} />
                <button type="button" className="btn btn-primary btn-sm" onClick={addCustomLine}><Plus size={14} /> Ajouter</button>
              </div>
            )}
            {customLines.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun article personnalisé.</div>
            ) : (
              <div className="table-wrap">
                <table style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr><th>Article</th><th>Qté</th><th>Unité</th><th>Remarque</th><th></th></tr>
                  </thead>
                  <tbody>
                    {customLines.map((line) => (
                      <tr key={line.article_name}>
                        <td>{line.article_name}</td>
                        <td>
                          <input type="number" min="0" value={line.quantite_demandee || ''} onChange={(e) => updateLine('autres', line.article_name, { quantite_demandee: Number(e.target.value) || 0 })} style={{ ...INPUT_STYLE, padding: '4px 8px' }} disabled={readOnly} />
                        </td>
                        <td>
                          <select value={line.unite || 'u'} onChange={(e) => updateLine('autres', line.article_name, { unite: e.target.value })} style={{ ...SELECT_STYLE, padding: '4px 6px' }} disabled={readOnly}>
                            {SITE_REQUEST_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td>
                          <input value={line.remarque || ''} onChange={(e) => updateLine('autres', line.article_name, { remarque: e.target.value })} style={{ ...INPUT_STYLE, padding: '4px 8px' }} disabled={readOnly} />
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
}
