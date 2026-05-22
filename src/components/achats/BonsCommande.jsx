/**
 * BonsCommande.jsx — Bons de commande ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { ShoppingCart, Plus, Eye, Edit2, Trash2, Copy, Download, Search, Filter, Package } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_BC, BADGE_BC, DEVISES, TVA_OPTIONS,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, genRef, genId
} from './shared.jsx';

const EMPTY_LIGNE = { designation: '', qte: 1, unite: 'U', prix_ht: '', tva: 20 };
const EMPTY_FORM  = { fournisseur: '', date: '', date_livraison: '', devise: 'MAD', note: '', lignes: [{ ...EMPTY_LIGNE, id: 1 }] };

function LignesTable({ lignes, onChange }) {
  function updateLigne(id, k, v) {
    onChange(lignes.map(l => l.id === id ? { ...l, [k]: v } : l));
  }
  function addLigne() {
    onChange([...lignes, { ...EMPTY_LIGNE, id: genId() }]);
  }
  function removeLigne(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter(l => l.id !== id));
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1.5px solid var(--border)' }}>
              {['Désignation', 'Qté', 'Unité', 'Prix HT', 'TVA %', 'Total HT', ''].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map(l => {
              const totalHT = (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0);
              return (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 6px' }}>
                    <input value={l.designation} onChange={e => updateLigne(l.id, 'designation', e.target.value)} placeholder="Désignation article..." style={{ ...INPUT_STYLE, minWidth: 160 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input type="number" min="0" value={l.qte} onChange={e => updateLigne(l.id, 'qte', e.target.value)} style={{ ...INPUT_STYLE, width: 70 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input value={l.unite} onChange={e => updateLigne(l.id, 'unite', e.target.value)} style={{ ...INPUT_STYLE, width: 60 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <input type="number" min="0" step="0.01" value={l.prix_ht} onChange={e => updateLigne(l.id, 'prix_ht', e.target.value)} placeholder="0.00" style={{ ...INPUT_STYLE, width: 100 }} />
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    <select value={l.tva} onChange={e => updateLigne(l.id, 'tva', Number(e.target.value))} style={{ ...SELECT_STYLE, width: 70 }}>
                      {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
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

function BCForm({ initial, onSave, onCancel, fournisseurs }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const fournActifs = (fournisseurs || []).filter(f => f.statut === 'Actif' || !f.statut);

  const sousTotal = form.lignes.reduce((s, l) => s + (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0), 0);
  const montantTVA = form.lignes.reduce((s, l) => s + (parseFloat(l.qte) || 0) * (parseFloat(l.prix_ht) || 0) * (l.tva / 100), 0);
  const totalTTC = sousTotal + montantTVA;

  function handleSubmit(ev, statut) {
    ev.preventDefault();
    if (!form.fournisseur.trim()) { setErrors({ fournisseur: 'Requis' }); return; }
    onSave({ ...form, statut: statut || 'Brouillon', total_ttc: totalTTC });
  }

  return (
    <form>
      <SectionTitle icon={<ShoppingCart size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Fournisseur" required>
          {fournActifs.length > 0 ? (
            <select
              value={form.fournisseur}
              onChange={e => set('fournisseur', e.target.value)}
              style={{ ...SELECT_STYLE, borderColor: errors.fournisseur ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">— Sélectionner un fournisseur —</option>
              {fournActifs.map(f => (
                <option key={f.id} value={f.raison_sociale}>
                  {f.raison_sociale}{f.ville ? ' — ' + f.ville : ''}{f.favori ? ' ★' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div>
              <input
                value={form.fournisseur}
                onChange={e => set('fournisseur', e.target.value)}
                placeholder="Nom du fournisseur..."
                style={{ ...INPUT_STYLE, borderColor: errors.fournisseur ? 'var(--red)' : 'var(--border)' }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                Aucun fournisseur enregistré — rendez-vous dans la rubrique Fournisseurs pour en ajouter.
              </div>
            </div>
          )}
          {errors.fournisseur && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.fournisseur}</div>}
        </FField>
        <FField label="Date"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Date livraison prévue"><input type="date" value={form.date_livraison} onChange={e => set('date_livraison', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Devise">
          <select value={form.devise} onChange={e => set('devise', e.target.value)} style={SELECT_STYLE}>
            {DEVISES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}><FField label="Note"><textarea value={form.note} onChange={e => set('note', e.target.value)} placeholder="Note interne, conditions..." style={TEXTAREA_STYLE} /></FField></div>

      <SectionTitle icon={<Package size={12} />}>Lignes articles</SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <LignesTable lignes={form.lignes} onChange={v => set('lignes', v)} />
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
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="button" className="btn btn-secondary" onClick={e => handleSubmit(e, 'Brouillon')}>Enregistrer brouillon</button>
        <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={e => handleSubmit(e, 'Envoyé')}>
          <Plus size={14} /> Générer BC
        </button>
      </div>
    </form>
  );
}

export default function BonsCommande({ fournisseurs }) {
  const [bcs, setBcs] = useState([]);
  const [tab, setTab] = useState('liste');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editBc, setEditBc] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback((data) => {
    if (editBc) {
      setBcs(prev => prev.map(x => x.id === editBc.id ? { ...x, ...data } : x));
    } else {
      setBcs(prev => [...prev, { ...data, id: genId(), ref: genRef('BC'), date_creation: today }]);
    }
    setTab('liste'); setShowModal(false); setEditBc(null);
  }, [editBc, today]);

  function handleDelete(id) {
    if (window.confirm('Supprimer ce bon de commande ?')) { setBcs(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }
  function handleDupliquer(bc) {
    setBcs(prev => [...prev, { ...bc, id: genId(), ref: genRef('BC'), date_creation: today, statut: 'Brouillon' }]);
  }

  const filtered = bcs.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.ref?.toLowerCase().includes(q) || (x.fournisseur || '').toLowerCase().includes(q))
      && (!filterStatut || x.statut === filterStatut);
  });

  const ouverts    = bcs.filter(x => ['Brouillon', 'Envoyé'].includes(x.statut)).length;
  const valides    = bcs.filter(x => x.statut === 'Validé').length;
  const enAttente  = bcs.filter(x => x.statut === 'Brouillon').length;
  const montantTot = bcs.reduce((s, x) => s + (x.total_ttc || 0), 0);

  const TABS = [{ id: 'liste', label: 'Liste des BC' }, { id: 'nouveau', label: 'Nouveau BC' }];

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">BONS DE COMMANDE</h1>
          <p className="page-subtitle">Gestion des bons de commande fournisseurs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setTab('nouveau')}><Plus size={15} /> Nouveau BC</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20, gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 20px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? 'var(--red)' : 'var(--text-2)', marginBottom: -2, transition: 'color 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'liste' && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
            <KpiCard icon={<ShoppingCart size={17} />} label="BC ouverts"      value={ouverts}            color="blue"   />
            <KpiCard icon={<ShoppingCart size={17} />} label="Validés"         value={valides}            color="green"  />
            <KpiCard icon={<ShoppingCart size={17} />} label="En brouillon"    value={enAttente}          color="orange" />
            <KpiCard icon={<ShoppingCart size={17} />} label="Total commandes" value={bcs.length}         color="grey"   />
            <KpiCard icon={<ShoppingCart size={17} />} label="Montant total"   value={formatMAD(montantTot)} color="red" />
          </div>
          <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Réf., fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
              </div>
              <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
                <option value="">Tous statuts</option>
                {STATUTS_BC.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <EmptyState icon={<ShoppingCart size={24} />} title="Aucun bon de commande" sub="Créez votre premier BC" action="Nouveau BC" onAction={() => setTab('nouveau')} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Référence</th><th>Fournisseur</th><th>Total TTC</th><th>Date création</th><th>Date prévue</th><th>Statut</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map(x => (
                      <tr key={x.id}>
                        <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                        <td data-label="Fournisseur" style={{ fontWeight: 600 }}>{x.fournisseur || '—'}</td>
                        <td data-label="Total TTC"><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{formatMAD(x.total_ttc)}</span></td>
                        <td data-label="Date création">{x.date_creation || '—'}</td>
                        <td data-label="Date prévue">{x.date_livraison || '—'}</td>
                        <td data-label="Statut"><span className={"badge " + (BADGE_BC[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditBc(x); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Dupliquer" onClick={() => handleDupliquer(x)}><Copy size={13} /></button>
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
          <BCForm initial={editBc} onSave={handleSave} onCancel={() => { setTab('liste'); setEditBc(null); }} fournisseurs={fournisseurs} />
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditBc(null); }} title="Modifier le bon de commande" width={800}>
        <BCForm initial={editBc} onSave={handleSave} onCancel={() => { setShowModal(false); setEditBc(null); }} fournisseurs={fournisseurs} />
      </Modal>
    </div>
  );
}
