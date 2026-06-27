/**
 * Depots.jsx — Emplacements de stock ERP CITYMO
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Search, Filter, Eye, ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, EMPLACEMENTS_STOCK,
  KpiCard, EmptyState, SectionTitle, Modal, FField, FRow,
} from './shared.jsx';
import {
  ensureStockWarehousesSeeded,
  listStockWarehouses,
  createStockWarehouse,
  deleteStockWarehouse,
  EMPLACEMENT_TYPES,
} from '../../services/inventaire/stockWarehouses';

const EMPTY_FORM = { nom: '', type_depot: 'Chantier', adresse: '', responsable: '' };

function MobileDepotRow({ item, count, onView, onDelete, deleting }) {
  return (
    <div className="inv-depot-mobile-row">
      <div className="inv-depot-mobile-icon" aria-hidden>
        <MapPin size={14} style={{ color: 'var(--red)' }} />
      </div>
      <div className="inv-depot-mobile-body">
        <strong>{item.nom}</strong>
        <span>{item.type} · {count} article{count !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="btn btn-ghost btn-sm inv-depot-mobile-btn" title="Voir" onClick={onView}>
          <Eye size={14} />
        </button>
        <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" disabled={deleting} onClick={onDelete} style={{ color: 'var(--red)' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function DetailEmplacement({ emplacement, articles, onBack }) {
  const articlesHere = (articles || []).filter(
    (a) => String(a.emplacement || '').trim().toLowerCase() === String(emplacement.nom).trim().toLowerCase(),
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{emplacement.nom}</h2>
        <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{emplacement.type}</span>
      </div>
      <div className="card">
        <SectionTitle icon={<MapPin size={12} />}>Articles à cet emplacement</SectionTitle>
        {articlesHere.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '20px 0' }}>Aucun article affecté à cet emplacement.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Type</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {articlesHere.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Code" style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{a.code}</td>
                    <td data-label="Désignation" style={{ fontWeight: 600 }}>{a.designation}</td>
                    <td data-label="Type" style={{ fontSize: '0.82rem' }}>{a.type || '—'}</td>
                    <td data-label="État"><span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{a.etat || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Depots({ articles, onDepotsChange }) {
  const [emplacements, setEmplacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const onDepotsChangeRef = useRef(onDepotsChange);
  onDepotsChangeRef.current = onDepotsChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let rows = await ensureStockWarehousesSeeded(EMPLACEMENTS_STOCK);
      if (!rows.length) {
        rows = await listStockWarehouses();
      }
      const mapped = rows.map((w) => ({
        id: w.id,
        nom: w.nom,
        type: w.type,
        statut: w.statut || 'Actif',
      }));
      setEmplacements(mapped);
      onDepotsChangeRef.current?.(mapped);
    } catch (err) {
      console.warn('[CITYMO] Depots load', err);
      const fallback = EMPLACEMENTS_STOCK.map((nom, index) => ({
        id: `local-${index}`,
        nom,
        type: nom.startsWith('DEPOT') ? 'Dépôt' : nom.startsWith('CHANTIER') ? 'Chantier' : 'Autre',
        statut: 'Actif',
        local: true,
      }));
      setEmplacements(fallback);
      onDepotsChangeRef.current?.(fallback);
      setError('Base Supabase indisponible — mode lecture seule (exécutez le script stock_warehouses).');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = emplacements.filter((x) => {
    const q = search.toLowerCase();
    return (!q || x.nom.toLowerCase().includes(q))
      && (!filterType || x.type === filterType);
  });

  const types = [...new Set(emplacements.map((e) => e.type))];
  const totalArticles = (articles || []).length;
  const avecEmplacement = (articles || []).filter((a) => (a.emplacement || '').trim()).length;
  const chantiers = emplacements.filter((x) => x.type === 'Chantier').length;
  const depotsCount = emplacements.filter((x) => x.type === 'Dépôt').length;

  function getArticlesCount(nom) {
    return (articles || []).filter(
      (a) => String(a.emplacement || '').trim().toLowerCase() === String(nom).trim().toLowerCase(),
    ).length;
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setError('');
    setFormOpen(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.nom.trim()) {
      setError('Le nom est requis.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createStockWarehouse(form);
      const item = { id: created.id, nom: created.nom, type: created.type, statut: created.statut };
      setEmplacements((prev) => {
        const next = [...prev, item].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        onDepotsChange?.(next);
        return next;
      });
      setFormOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    const count = getArticlesCount(item.nom);
    if (count > 0) {
      alert(`Impossible de supprimer : ${count} article(s) encore affecté(s) à « ${item.nom} ».`);
      return;
    }
    if (!window.confirm(`Supprimer l'emplacement « ${item.nom} » ?`)) return;
    if (item.local || String(item.id).startsWith('local-')) {
      alert('Emplacement par défaut — non supprimable en mode hors ligne.');
      return;
    }
    setDeletingId(item.id);
    setError('');
    try {
      await deleteStockWarehouse(item.id);
      setEmplacements((prev) => {
        const next = prev.filter((x) => x.id !== item.id);
        onDepotsChange?.(next);
        return next;
      });
      if (detailId === item.id) setDetailId(null);
    } catch (err) {
      setError(err.message || 'Erreur lors de la suppression.');
    } finally {
      setDeletingId(null);
    }
  }

  if (detailId) {
    const emp = emplacements.find((x) => x.id === detailId);
    if (!emp) { setDetailId(null); return null; }
    return (
      <DetailEmplacement
        emplacement={emp}
        articles={articles}
        onBack={() => setDetailId(null)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">EMPLACEMENTS</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Lieux de stockage CITYMO — dépôts, chantiers et ateliers.</p>
        </div>
        <div className="finance-page-actions depots-page-actions">
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={openCreate}>
            <Plus size={15} /> <span className="btn-label">Nouvel emplacement</span>
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> <span className="btn-label">Filtres</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFF8E1', color: '#E65100', border: '1px solid #FFCC80', borderRadius: 8, padding: '10px 14px', fontSize: '0.84rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<MapPin size={17} />} label="Total emplacements" value={emplacements.length} color="grey" />
        <KpiCard icon={<MapPin size={17} />} label="Dépôts" value={depotsCount} color="green" />
        <KpiCard icon={<MapPin size={17} />} label="Chantiers" value={chantiers} color="blue" />
        <KpiCard icon={<MapPin size={17} />} label="Articles stockés" value={totalArticles} color="orange" sub={avecEmplacement ? `${avecEmplacement} avec emplacement` : undefined} />
      </div>

      {showFilters ? (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom emplacement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous les types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un emplacement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading && emplacements.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            <Loader2 size={22} className="cin-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<MapPin size={24} />} title="Aucun emplacement" sub="Aucun résultat pour cette recherche" action="Ajouter un emplacement" onAction={openCreate} />
        ) : (
          <>
            <div className="inv-depot-desktop-only">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emplacement</th>
                      <th>Type</th>
                      <th>Articles</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((x) => (
                      <tr key={x.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <MapPin size={14} style={{ color: 'var(--red)' }} />
                            </div>
                            <span style={{ fontWeight: 600 }}>{x.nom}</span>
                          </div>
                        </td>
                        <td data-label="Type">
                          <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{x.type}</span>
                        </td>
                        <td data-label="Articles"><span style={{ fontWeight: 700 }}>{getArticlesCount(x.nom)}</span></td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}>
                              <Eye size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Supprimer"
                              disabled={deletingId === x.id}
                              style={{ color: 'var(--red)' }}
                              onClick={() => handleDelete(x)}
                            >
                              <Trash2 size={13} /> <span className="btn-label">Supprimer</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="inv-depot-mobile-only inv-depot-mobile-list">
              {filtered.map((x) => (
                <MobileDepotRow
                  key={x.id}
                  item={x}
                  count={getArticlesCount(x.nom)}
                  onView={() => setDetailId(x.id)}
                  onDelete={() => handleDelete(x)}
                  deleting={deletingId === x.id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title="Nouvel emplacement" width={520}>
        <form onSubmit={handleCreate}>
          <FRow>
            <FField label="Nom" required>
              <input
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Ex. CHANTIER NOUVEAU PROJET"
                style={INPUT_STYLE}
                required
              />
            </FField>
            <FField label="Type" required>
              <select value={form.type_depot} onChange={(e) => setForm((f) => ({ ...f, type_depot: e.target.value }))} style={SELECT_STYLE}>
                {EMPLACEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </FField>
          </FRow>
          <FRow>
            <FField label="Adresse">
              <input value={form.adresse} onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))} style={INPUT_STYLE} />
            </FField>
            <FField label="Responsable">
              <input value={form.responsable} onChange={(e) => setForm((f) => ({ ...f, responsable: e.target.value }))} style={INPUT_STYLE} />
            </FField>
          </FRow>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)} disabled={saving}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Créer l\'emplacement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
