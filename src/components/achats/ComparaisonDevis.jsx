/**
 * ComparaisonDevis.jsx — Comparaison de devis fournisseurs ERP CITYMO
 * Backend-ready / database-ready
 */
import { useState, useCallback } from 'react';
import { BarChart2, Plus, Edit2, Trash2, CheckCircle, Search, Filter, Download, ChevronLeft, X, Star } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  CATEGORIES_FOURN,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  genRef, genId, formatMAD
} from './shared.jsx';

const STATUTS_COMP = ['En cours', 'Finalisée', 'Annulée'];
const BADGE_COMP = {
  'En cours': 'badge-orange',
  'Finalisée': 'badge-green',
  'Annulée': 'badge-red',
};

const EMPTY_DEVIS_LINE = () => ({
  id: genId(),
  fournisseur: '',
  montant: '',
  delai: '',
  validite: '',
  observations: '',
  selectionne: false,
});

const EMPTY_FORM = {
  titre: '',
  projet_lie: '',
  categorie_achat: '',
  description: '',
  statut: 'En cours',
  lignes: [EMPTY_DEVIS_LINE()],
};

function DevisLignes({ lignes, onChange }) {
  function setLine(id, key, val) {
    onChange(lignes.map(l => l.id === id ? { ...l, [key]: val } : l));
  }
  function selectLine(id) {
    onChange(lignes.map(l => ({ ...l, selectionne: l.id === id })));
  }
  function addLine() {
    onChange([...lignes, EMPTY_DEVIS_LINE()]);
  }
  function removeLine(id) {
    if (lignes.length <= 1) return;
    onChange(lignes.filter(l => l.id !== id));
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionTitle icon={<BarChart2 size={12} />}>Devis fournisseurs</SectionTitle>
        <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={addLine}>
          <Plus size={12} /> Ajouter fournisseur
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lignes.map((l, idx) => (
          <div key={l.id} style={{ border: `1.5px solid ${l.selectionne ? 'var(--red)' : 'var(--border)'}`, borderRadius: 8, padding: 14, background: l.selectionne ? 'var(--red-light)' : 'var(--surface-2)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Fournisseur #{idx + 1}
                {l.selectionne && <span style={{ marginLeft: 8, color: 'var(--red)', fontSize: '0.7rem' }}>★ Sélectionné</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={l.selectionne ? "Sélectionné" : "Sélectionner ce fournisseur"}
                  style={{ background: l.selectionne ? 'var(--red)' : 'var(--surface)', color: l.selectionne ? '#fff' : 'var(--text-2)', border: '1.5px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => selectLine(l.id)}
                >
                  <CheckCircle size={12} /> {l.selectionne ? "Sélectionné" : "Sélectionner"}
                </button>
                {lignes.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeLine(l.id)}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
              <FField label="Fournisseur" required>
                <input
                  value={l.fournisseur}
                  onChange={e => setLine(l.id, 'fournisseur', e.target.value)}
                  placeholder="Nom du fournisseur"
                  style={INPUT_STYLE}
                />
              </FField>
              <FField label="Montant (MAD)">
                <input
                  type="number"
                  value={l.montant}
                  onChange={e => setLine(l.id, 'montant', e.target.value)}
                  placeholder="0.00"
                  style={INPUT_STYLE}
                />
              </FField>
              <FField label="Délai livraison">
                <input
                  value={l.delai}
                  onChange={e => setLine(l.id, 'delai', e.target.value)}
                  placeholder="Ex: 5 jours, 2 semaines..."
                  style={INPUT_STYLE}
                />
              </FField>
              <FField label="Validité offre">
                <input
                  type="date"
                  value={l.validite}
                  onChange={e => setLine(l.id, 'validite', e.target.value)}
                  style={INPUT_STYLE}
                />
              </FField>
            </div>
            <FField label="Observations">
              <textarea
                value={l.observations}
                onChange={e => setLine(l.id, 'observations', e.target.value)}
                placeholder="Notes, conditions particulières..."
                style={{ ...TEXTAREA_STYLE, minHeight: 52 }}
              />
            </FField>
            <div style={{ marginTop: 10 }}>
              <UploadField label="Devis / Document joint" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? { ...initial } : { ...EMPTY_FORM, lignes: [EMPTY_DEVIS_LINE()] });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.titre.trim()) e.titre = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<BarChart2 size={12} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Titre de la comparaison" required>
          <input
            value={form.titre}
            onChange={e => set('titre', e.target.value)}
            placeholder="Ex: Comparaison matériaux Q1..."
            style={{ ...INPUT_STYLE, borderColor: errors.titre ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.titre}</div>}
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_COMP.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
        <FField label="Projet lié">
          <input
            value={form.projet_lie}
            onChange={e => set('projet_lie', e.target.value)}
            placeholder="Nom du projet"
            style={INPUT_STYLE}
          />
        </FField>
        <FField label="Catégorie achat">
          <select value={form.categorie_achat} onChange={e => set('categorie_achat', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {CATEGORIES_FOURN.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 16 }}>
        <FField label="Description">
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Contexte de la comparaison, critères d'évaluation..."
            style={TEXTAREA_STYLE}
          />
        </FField>
      </div>

      <DevisLignes lignes={form.lignes} onChange={ls => set('lignes', ls)} />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer comparaison'}
        </button>
      </div>
    </form>
  );
}

function DetailView({ comp, onBack, onEdit }) {
  const best = comp.lignes && comp.lignes.reduce((b, l) => {
    if (!l.montant) return b;
    return (!b || Number(l.montant) < Number(b.montant)) ? l : b;
  }, null);
  const selected = comp.lignes && comp.lignes.find(l => l.selectionne);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{comp.ref} — {comp.titre}</h2>
        <span className={"badge " + (BADGE_COMP[comp.statut] || 'badge-grey')}>{comp.statut}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<BarChart2 size={12} />}>Tableau comparatif</SectionTitle>
            {comp.lignes && comp.lignes.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fournisseur</th>
                      <th>Montant</th>
                      <th>Délai</th>
                      <th>Validité</th>
                      <th>Observations</th>
                      <th>Choix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp.lignes.map(l => (
                      <tr key={l.id} style={{ background: l.selectionne ? 'var(--red-light)' : '' }}>
                        <td style={{ fontWeight: 600 }}>{l.fournisseur || '—'}</td>
                        <td style={{ fontWeight: 700, color: best && l.id === best.id ? 'var(--red)' : 'var(--text)' }}>
                          {l.montant ? formatMAD(l.montant) : '—'}
                          {best && l.id === best.id && <span style={{ marginLeft: 4, fontSize: '0.7rem', color: 'var(--red)' }}>Meilleur prix</span>}
                        </td>
                        <td>{l.delai || '—'}</td>
                        <td>{l.validite || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{l.observations || '—'}</td>
                        <td>{l.selectionne && <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.8rem' }}>★ Sélectionné</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun devis enregistré.</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Détails</SectionTitle>
            <div style={{ fontSize: '0.84rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Référence</span><div style={{ fontWeight: 600 }}>{comp.ref}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Projet lié</span><div>{comp.projet_lie || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Catégorie</span><div>{comp.categorie_achat || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Date création</span><div>{comp.date_creation || '—'}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Nb. devis</span><div>{comp.lignes ? comp.lignes.length : 0}</div></div>
              {selected && <div><span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Fournisseur retenu</span><div style={{ fontWeight: 700, color: 'var(--red)' }}>{selected.fournisseur}</div></div>}
            </div>
          </div>
          {comp.description && (
            <div className="card">
              <SectionTitle>Description</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0 }}>{comp.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComparaisonDevis() {
  const [comps, setComps] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editComp, setEditComp] = useState(null);
  const [detailComp, setDetailComp] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback((data) => {
    if (editComp) {
      setComps(prev => prev.map(c => c.id === editComp.id ? { ...c, ...data } : c));
      if (detailComp && detailComp.id === editComp.id) setDetailComp(prev => ({ ...prev, ...data }));
    } else {
      const newComp = { ...data, id: genId(), ref: genRef('COMP'), date_creation: today };
      setComps(prev => [...prev, newComp]);
    }
    setShowModal(false);
    setEditComp(null);
  }, [editComp, detailComp, today]);

  function handleDelete(id) {
    if (window.confirm('Supprimer cette comparaison ?')) {
      setComps(prev => prev.filter(c => c.id !== id));
      if (detailComp && detailComp.id === id) setDetailComp(null);
    }
  }

  function openEdit(comp) {
    setEditComp(comp);
    setShowModal(true);
  }

  const filtered = comps.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.titre.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q) || (c.projet_lie || '').toLowerCase().includes(q);
    const matchS = !filterStatut || c.statut === filterStatut;
    return matchQ && matchS;
  });

  const total        = comps.length;
  const enCours      = comps.filter(c => c.statut === 'En cours').length;
  const finalisees   = comps.filter(c => c.statut === 'Finalisée').length;
  const avecSelectio = comps.filter(c => c.lignes && c.lignes.some(l => l.selectionne)).length;

  if (detailComp) {
    return (
      <DetailView
        comp={detailComp}
        onBack={() => setDetailComp(null)}
        onEdit={() => openEdit(detailComp)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">COMPARAISON DEVIS</h1>
          <p className="page-subtitle">Analyse comparative des offres fournisseurs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditComp(null); setShowModal(true); }}>
            <Plus size={15} /> Nouvelle comparaison
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<BarChart2 size={17} />} label="Total comparaisons" value={total}        color="grey"   />
        <KpiCard icon={<BarChart2 size={17} />} label="En cours"           value={enCours}      color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Finalisées"        value={finalisees}   color="green"  />
        <KpiCard icon={<Star size={17} />}      label="Avec sélection"    value={avecSelectio} color="blue"   />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Titre, référence, projet..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_COMP.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Barre recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une comparaison..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<BarChart2 size={24} />}
            title="Aucune comparaison"
            sub="Commencez par créer une comparaison de devis"
            action="Nouvelle comparaison"
            onAction={() => { setEditComp(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Titre</th>
                  <th>Projet lié</th>
                  <th>Nb. devis</th>
                  <th>Meilleur prix</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const best = c.lignes && c.lignes.reduce((b, l) => {
                    if (!l.montant) return b;
                    return (!b || Number(l.montant) < Number(b.montant)) ? l : b;
                  }, null);
                  const nbDevis = c.lignes ? c.lignes.filter(l => l.fournisseur).length : 0;
                  return (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetailComp(c)}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-2)' }}>{c.ref}</span>
                      </td>
                      <td data-label="Titre">
                        <span style={{ fontWeight: 600 }}>{c.titre}</span>
                      </td>
                      <td data-label="Projet">{c.projet_lie || '—'}</td>
                      <td data-label="Nb. devis">
                        <span style={{ fontWeight: 700, color: nbDevis > 0 ? 'var(--text)' : 'var(--text-3)' }}>{nbDevis}</span>
                      </td>
                      <td data-label="Meilleur prix">
                        {best ? <span style={{ fontWeight: 700, color: 'var(--red)' }}>{formatMAD(best.montant)}</span> : '—'}
                      </td>
                      <td data-label="Statut">
                        <span className={"badge " + (BADGE_COMP[c.statut] || 'badge-grey')}>{c.statut}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openEdit(c)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(c.id)} style={{ color: 'var(--red)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditComp(null); }} title={editComp ? "Modifier la comparaison" : "Nouvelle comparaison de devis"} width={780}>
        <CompForm initial={editComp} onSave={handleSave} onCancel={() => { setShowModal(false); setEditComp(null); }} />
      </Modal>
    </div>
  );
}
