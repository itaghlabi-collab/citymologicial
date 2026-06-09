/**
 * BonsCommande.jsx — Bons de commande ERP CITYMO (Supabase purchase_orders)
 */
import { useState, useCallback } from 'react';
import {
  ShoppingCart, Plus, Eye, Edit2, Trash2, Copy, Download, Search,
  Package, Loader2, RefreshCw, ChevronLeft,
} from 'lucide-react';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { computeLineTotals } from '../../services/achats/purchaseOrders';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_BC, BADGE_BC, DEVISES, TVA_OPTIONS,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, genId,
} from './shared.jsx';

const EMPTY_LIGNE = { designation: '', qte: 1, unite: 'U', prix_ht: '', tva: 20 };
const EMPTY_FORM = {
  supplier_id: '',
  fournisseur: '',
  date: '',
  date_livraison: '',
  devise: 'MAD',
  note: '',
  lignes: [{ ...EMPTY_LIGNE, id: 1 }],
};

function toFormState(item) {
  if (!item) return EMPTY_FORM;
  return {
    supplier_id: item.supplier_id || '',
    fournisseur: item.fournisseur || item.supplier_name || '',
    date: item.date || item.order_date || '',
    date_livraison: item.date_livraison || item.delivery_date || '',
    devise: item.devise || item.currency || 'MAD',
    note: item.note || '',
    statut: item.statut || item.status || 'Brouillon',
    ref: item.ref || item.ref_bc || '',
    lignes: (item.lignes || item.lines || []).length
      ? (item.lignes || item.lines)
      : [{ ...EMPTY_LIGNE, id: genId() }],
  };
}

function LignesTable({ lignes, onChange }) {
  function updateLigne(id, k, v) {
    onChange(lignes.map((l) => (l.id === id ? { ...l, [k]: v } : l)));
  }
  function addLigne() {
    onChange([...lignes, { ...EMPTY_LIGNE, id: genId() }]);
  }
  function removeLigne(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter((l) => l.id !== id));
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
              {['Désignation', 'Qté', 'Unité', 'Prix HT', 'TVA %', 'Total HT', ''].map((h) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const totalHT = (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0);
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 6px' }}>
                    <input value={l.designation} onChange={(e) => updateLigne(l.id, 'designation', e.target.value)} placeholder="Désignation article..." style={{ ...INPUT_STYLE, minWidth: 160 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input type="number" min="0" value={l.qte} onChange={(e) => updateLigne(l.id, 'qte', e.target.value)} style={{ ...INPUT_STYLE, width: 70 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input value={l.unite} onChange={(e) => updateLigne(l.id, 'unite', e.target.value)} style={{ ...INPUT_STYLE, width: 60 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input type="number" min="0" step="0.01" value={l.prix_ht} onChange={(e) => updateLigne(l.id, 'prix_ht', e.target.value)} placeholder="0.00" style={{ ...INPUT_STYLE, width: 100 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <select value={l.tva} onChange={(e) => updateLigne(l.id, 'tva', Number(e.target.value))} style={{ ...SELECT_STYLE, width: 70 }}>
                      {TVA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: 'var(--font-head)', whiteSpace: 'nowrap' }}>
                    {totalHT.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLigne(l.id)} style={{ color: 'var(--red)', padding: '4px 6px' }}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={addLigne} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Plus size={13} /> Ajouter ligne
      </button>
    </div>
  );
}

function BCForm({ initial, onSave, onCancel, fournisseurs, suppliersLoading, saving }) {
  const [form, setForm] = useState(toFormState(initial));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const fournActifs = (fournisseurs || []).filter((f) => f.statut === 'Actif' || f.status === 'active');

  const { subtotal_ht: sousTotal, total_vat: montantTVA, total_ttc: totalTTC } = computeLineTotals(form.lignes);

  function handleSupplierChange(supplierId) {
    const s = fournActifs.find((f) => f.id === supplierId);
    setForm((p) => ({
      ...p,
      supplier_id: supplierId || '',
      fournisseur: s ? (s.raison_sociale || s.company_name || '') : '',
    }));
  }

  function handleSubmit(ev, statut) {
    ev.preventDefault();
    if (!form.fournisseur.trim() && !form.supplier_id) {
      setErrors({ fournisseur: 'Requis' });
      return;
    }
    setErrors({});
    onSave({ ...form, statut: statut || 'Brouillon', total_ttc: totalTTC });
  }

  return (
    <form>
      <SectionTitle icon={<ShoppingCart size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Fournisseur" required>
          {suppliersLoading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} className="spin" /> Chargement des fournisseurs...
            </div>
          ) : fournActifs.length > 0 ? (
            <select
              value={form.supplier_id || ''}
              onChange={(e) => handleSupplierChange(e.target.value)}
              style={{ ...SELECT_STYLE, borderColor: errors.fournisseur ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">— Sélectionner un fournisseur —</option>
              {fournActifs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.raison_sociale || f.company_name}{f.ville || f.city ? ` — ${f.ville || f.city}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <input
                value={form.fournisseur}
                onChange={(e) => set('fournisseur', e.target.value)}
                placeholder="Nom du fournisseur..."
                style={{ ...INPUT_STYLE, borderColor: errors.fournisseur ? 'var(--red)' : 'var(--border)' }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--orange)', marginTop: 4 }}>
                Aucun fournisseur actif — ajoutez-en dans la rubrique Fournisseurs.
              </div>
            </div>
          )}
          {errors.fournisseur && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.fournisseur}</div>}
        </FField>
        <FField label="Date"><input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Date livraison prévue"><input type="date" value={form.date_livraison} onChange={(e) => set('date_livraison', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Devise">
          <select value={form.devise} onChange={(e) => set('devise', e.target.value)} style={SELECT_STYLE}>
            {DEVISES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}><FField label="Note"><textarea value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Note interne, conditions..." style={TEXTAREA_STYLE} /></FField></div>

      <SectionTitle icon={<Package size={12} />}>Lignes articles</SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <LignesTable lignes={form.lignes} onChange={(v) => set('lignes', v)} />
      </div>

      <SectionTitle icon={<ShoppingCart size={12} />}>Totaux</SectionTitle>
      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        {[['Sous-total HT', sousTotal], ['TVA', montantTVA], ['Total TTC', totalTTC]].map(([l, v], i) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: i === 2 ? 700 : 500, color: i === 2 ? 'var(--text)' : 'var(--text-2)' }}>{l}</span>
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: i === 2 ? '1.05rem' : '0.9rem', color: i === 2 ? 'var(--red)' : 'var(--text)' }}>
              {v.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {form.devise}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="btn btn-secondary" onClick={(e) => handleSubmit(e, 'Brouillon')} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : null} Enregistrer brouillon
        </button>
        <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={(e) => handleSubmit(e, 'Envoyé')} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Générer BC
        </button>
      </div>
    </form>
  );
}

function DetailBC({ item, onBack, onEdit, onDelete, onDupliquer }) {
  const lignes = item.lignes || item.lines || [];
  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        <ChevronLeft size={14} /> Retour
      </button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{item.ref}</h1>
          <p className="page-subtitle">{item.fournisseur || '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onDupliquer(item)}><Copy size={13} /> Dupliquer</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onDelete(item.id)}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <SectionTitle icon={<Package size={13} />}>Lignes articles</SectionTitle>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Désignation</th><th>Qté</th><th>Unité</th><th>Prix HT</th><th>TVA</th><th>Total HT</th></tr></thead>
              <tbody>
                {lignes.map((l) => {
                  const ht = (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0);
                  return (
                    <tr key={l.id}>
                      <td>{l.designation || '—'}</td>
                      <td>{l.qte}</td>
                      <td>{l.unite}</td>
                      <td>{Number(l.prix_ht || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                      <td>{l.tva}%</td>
                      <td style={{ fontWeight: 700 }}>{ht.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {item.note && (
            <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-2)' }}>
              {item.note}
            </div>
          )}
        </div>
        <div className="card">
          <SectionTitle icon={<ShoppingCart size={13} />}>Synthèse</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Fournisseur', item.fournisseur || '—'], ['Date commande', item.date || '—'], ['Livraison prévue', item.date_livraison || '—'], ['Devise', item.devise || 'MAD'], ['Sous-total HT', formatMAD(item.subtotal_ht)], ['TVA', formatMAD(item.total_vat)], ['Total TTC', formatMAD(item.total_ttc)], ['Statut', <span className={'badge ' + (BADGE_BC[item.statut] || 'badge-grey')}>{item.statut}</span>], ['Créé le', item.date_creation || '—']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)', fontSize: '0.83rem' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{l}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BonsCommande() {
  const {
    records: bcs,
    suppliers,
    loading,
    suppliersLoading,
    saving,
    error,
    configured,
    reload,
    save,
    remove,
    duplicate,
    exportCsv,
  } = usePurchaseOrders();

  const [tab, setTab] = useState('liste');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editBc, setEditBc] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const handleSave = useCallback(async (data) => {
    const result = await save(data, editBc?.id);
    if (result.success) {
      setTab('liste');
      setShowModal(false);
      setEditBc(null);
    }
  }, [editBc, save]);

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce bon de commande ?')) return;
    const result = await remove(id);
    if (result.success) setDetailId(null);
  }

  async function handleDupliquer(bc) {
    const result = await duplicate(bc);
    if (result.success) setDetailId(null);
  }

  const filtered = bcs.filter((x) => {
    const q = search.toLowerCase();
    return (!q || x.ref?.toLowerCase().includes(q) || (x.fournisseur || '').toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut);
  });

  const ouverts = bcs.filter((x) => ['Brouillon', 'Envoyé'].includes(x.statut)).length;
  const valides = bcs.filter((x) => x.statut === 'Validé').length;
  const enAttente = bcs.filter((x) => x.statut === 'Brouillon').length;
  const montantTot = bcs.reduce((s, x) => s + (x.total_ttc || 0), 0);

  const TABS = [{ id: 'liste', label: 'Liste des BC' }, { id: 'nouveau', label: 'Nouveau BC' }];

  if (detailId) {
    const item = bcs.find((x) => x.id === detailId);
    if (!item) { setDetailId(null); return null; }
    return (
      <DetailBC
        item={item}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditBc(item); setShowModal(true); setDetailId(null); }}
        onDelete={handleDelete}
        onDupliquer={handleDupliquer}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">BONS DE COMMANDE</h1>
          <p className="page-subtitle">Gestion des bons de commande fournisseurs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reload} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditBc(null); setTab('nouveau'); }}>
            <Plus size={15} /> Nouveau BC
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-3)' }}>
              Exécutez <code>supabase/RUN_PURCHASE_ORDERS.sql</code> (après <code>RUN_PURCHASE_SUPPLIERS.sql</code>) dans le SQL Editor Supabase.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20, gap: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 20px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--red)' : 'var(--text-2)', marginBottom: -2, transition: 'color 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'liste' && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
            <KpiCard icon={<ShoppingCart size={17} />} label="BC ouverts" value={ouverts} color="blue" />
            <KpiCard icon={<ShoppingCart size={17} />} label="Validés" value={valides} color="green" />
            <KpiCard icon={<ShoppingCart size={17} />} label="En brouillon" value={enAttente} color="orange" />
            <KpiCard icon={<ShoppingCart size={17} />} label="Total commandes" value={bcs.length} color="grey" />
            <KpiCard icon={<ShoppingCart size={17} />} label="Montant total" value={formatMAD(montantTot)} color="red" />
          </div>
          <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
              </div>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
                <option value="">Tous statuts</option>
                {STATUTS_BC.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader2 size={20} className="spin" /> Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={<ShoppingCart size={24} />} title="Aucun bon de commande" sub="Créez votre premier BC" action="Nouveau BC" onAction={() => setTab('nouveau')} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Référence</th><th>Fournisseur</th><th>Total TTC</th><th>Date création</th><th>Date prévue</th><th>Statut</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map((x) => (
                      <tr key={x.id}>
                        <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                        <td data-label="Fournisseur" style={{ fontWeight: 600 }}>{x.fournisseur || '—'}</td>
                        <td data-label="Total TTC"><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{formatMAD(x.total_ttc)}</span></td>
                        <td data-label="Date création">{x.date_creation || '—'}</td>
                        <td data-label="Date prévue">{x.date_livraison || '—'}</td>
                        <td data-label="Statut"><span className={'badge ' + (BADGE_BC[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditBc(x); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Dupliquer" onClick={() => handleDupliquer(x)} disabled={saving}><Copy size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'nouveau' && (
        <div className="card">
          <BCForm
            initial={editBc}
            onSave={handleSave}
            onCancel={() => { setTab('liste'); setEditBc(null); }}
            fournisseurs={suppliers}
            suppliersLoading={suppliersLoading}
            saving={saving}
          />
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditBc(null); }} title="Modifier le bon de commande" width={800}>
        <BCForm
          initial={editBc}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditBc(null); }}
          fournisseurs={suppliers}
          suppliersLoading={suppliersLoading}
          saving={saving}
        />
      </Modal>
    </div>
  );
}
