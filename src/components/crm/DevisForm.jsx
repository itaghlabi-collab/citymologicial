import { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Copy, AlertCircle,
  FileText, Package, ChevronDown, ChevronUp, GripVertical, X, Download
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { generateCrmDevisReference } from '../../services/crm/crmDevis';
import { generateDevisPdf } from '../../services/crm/devisPdf';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL } from '../../constants/commercial';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n)) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}

function IS(err, extra = {}) {
  return {
    padding: '8px 11px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.86rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
    transition: 'border-color 0.15s',
    ...extra,
  };
}

function Label({ children, required }) {
  return (
    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>
      {children}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
    </label>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}

/* ── Constants ── */
const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_TAUX = [0, 7, 10, 14, 20];
const STATUTS = ['brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente'];
const STATUT_LABEL = { brouillon: 'Brouillon', envoye: 'Envoye', valide: 'Valide', refuse: 'Refuse', expire: 'Expire', en_attente: 'En attente' };
const MODALITES = ['30 jours net', '60 jours net', 'Comptant', 'A la commande', '50% avance / 50% livraison', 'Sur devis'];

function genRef() {
  const d = new Date();
  return 'DV-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 9000) + 1000);
}

function today() { return new Date().toISOString().slice(0, 10); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const EMPTY_LIGNE = () => ({
  _id: Date.now() + Math.random(),
  type: 'article', // 'article' | 'titre' | 'sous_titre' | 'note'
  designation: '',
  description: '',
  article_id: '',
  categorie_id: '',
  quantite: 1,
  unite: 'unite',
  prix_ht: 0,
  remise: 0,
  tva: 20,
});

const EMPTY_DEVIS = {
  reference: '',
  titre: '',
  statut: 'brouillon',
  date_creation: today(),
  date_validite: addDays(30),
  commercial: '',
  type_projet: '',
  client_id: '',
  modalites_paiement: '30 jours net',
  conditions: '',
  notes_internes: '',
  lignes: [EMPTY_LIGNE()],
};

/* ── Spinner ── */
function Spinner() {
  return (
    <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  );
}

/* ── Ligne article row ── */
function LigneRow({ ligne, idx, categories, articles, onChange, onDelete, onDuplicate }) {
  const [showDesc, setShowDesc] = useState(false);
  const catArticles = articles.filter(a => !ligne.categorie_id || String(a.categorie_id) === String(ligne.categorie_id));
  const sous_total_ht = Number(ligne.quantite) * Number(ligne.prix_ht) * (1 - Number(ligne.remise) / 100);
  const sous_total_ttc = sous_total_ht * (1 + Number(ligne.tva) / 100);

  function setField(k, v) { onChange({ ...ligne, [k]: v }); }

  function onArticleChange(articleId) {
    const art = articles.find(a => String(a.id) === String(articleId));
    if (art) {
      onChange({
        ...ligne,
        article_id: articleId,
        designation: art.nom || '',
        description: art.description || '',
        unite: art.unite || 'unite',
        prix_ht: art.prix_ht ?? art.prix ?? 0,
        remise: art.remise ?? 0,
        tva: art.tva ?? 20,
      });
    } else {
      setField('article_id', articleId);
    }
  }

  if (ligne.type === 'titre') {
    return (
      <tr style={{ background: '#F5F6F8' }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }} />
            <input value={ligne.designation} onChange={e => setField('designation', e.target.value)} placeholder="Titre de section..." style={{ ...IS(false), fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.92rem', flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Titre</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, flexShrink: 0 }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }

  if (ligne.type === 'note') {
    return (
      <tr style={{ background: '#FFFDE7' }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0, marginTop: 6 }} />
            <textarea value={ligne.designation} onChange={e => setField('designation', e.target.value)} placeholder="Note ou commentaire..." rows={2} style={{ ...IS(false), resize: 'vertical', flex: 1, fontSize: '0.82rem', background: 'transparent' }} />
            <span style={{ fontSize: '0.72rem', color: '#F57C00', background: '#FFF3E0', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Note</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, flexShrink: 0, marginTop: 2 }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr>
        <td style={{ padding: '8px 6px', width: 20 }}>
          <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab' }} />
        </td>
        <td style={{ padding: '6px 6px', minWidth: 200 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={ligne.categorie_id} onChange={e => setField('categorie_id', e.target.value)} style={{ ...IS(false), fontSize: '0.78rem', flex: 1, minWidth: 0 }}>
                <option value="">Categorie...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <select value={ligne.article_id} onChange={e => onArticleChange(e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
              <option value="">Choisir article...</option>
              {catArticles.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
            <input value={ligne.designation} onChange={e => setField('designation', e.target.value)} placeholder="Designation libre..." style={{ ...IS(false), fontSize: '0.82rem' }} />
            <button type="button" onClick={() => setShowDesc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.72rem', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
              {showDesc ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Description
            </button>
            {showDesc && (
              <textarea value={ligne.description} onChange={e => setField('description', e.target.value)} placeholder="Description technique..." rows={2} style={{ ...IS(false), resize: 'vertical', fontSize: '0.78rem' }} />
            )}
          </div>
        </td>
        <td style={{ padding: '6px 5px', width: 70 }}>
          <input type="number" min="0" step="0.01" value={ligne.quantite} onChange={e => setField('quantite', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
        </td>
        <td style={{ padding: '6px 5px', width: 80 }}>
          <select value={ligne.unite} onChange={e => setField('unite', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
            {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td style={{ padding: '6px 5px', width: 105 }}>
          <input type="number" min="0" step="0.01" value={ligne.prix_ht} onChange={e => setField('prix_ht', e.target.value)} style={{ ...IS(false), textAlign: 'right', fontSize: '0.85rem' }} />
        </td>
        <td style={{ padding: '6px 5px', width: 65 }}>
          <input type="number" min="0" max="100" step="1" value={ligne.remise} onChange={e => setField('remise', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
        </td>
        <td style={{ padding: '6px 5px', width: 72 }}>
          <select value={ligne.tva} onChange={e => setField('tva', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
            {TVA_TAUX.map(t => <option key={t} value={t}>{t}%</option>)}
          </select>
        </td>
        <td style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem' }}>{fmtMAD(sous_total_ht.toFixed(2))}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>TTC: {fmtMAD(sous_total_ttc.toFixed(2))}</div>
        </td>
        <td style={{ padding: '6px 5px', width: 52 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <button type="button" onClick={onDuplicate} title="Dupliquer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3 }}><Copy size={12} /></button>
            <button type="button" onClick={onDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 3 }}><Trash2 size={12} /></button>
          </div>
        </td>
      </tr>
    </>
  );
}

/* ════════════════════════════════════════════════
   DEVIS FORM — MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function DevisForm({ devis, onBack, onSaved, saving = false }) {
  const isEdit = !!devis;
  const [form, setForm] = useState(() => devis ? {
    ...EMPTY_DEVIS, ...devis,
    lignes: devis.lignes?.length ? devis.lignes.map(l => ({ ...EMPTY_LIGNE(), ...l, _id: l._id || Date.now() + Math.random() })) : [EMPTY_LIGNE()],
  } : { ...EMPTY_DEVIS, reference: genRef() });

  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError] = useState('');
  const isSaving = saving || savingLocal;

  /* Load reference data */
  useEffect(() => {
    Promise.all([listClients(), listArticles(), listCategories()]).then(([cl, ar, ca]) => {
      setClients(cl || []);
      setArticles(ar || []);
      setCategories(ca || []);
    }).catch(() => {});
    if (!isEdit) {
      generateCrmDevisReference()
        .then((ref) => setForm(p => ({ ...p, reference: ref })))
        .catch(() => {});
    }
  }, [isEdit]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  /* Selected client auto-fill */
  const selectedClient = clients.find(c => String(c.id) === String(form.client_id));

  /* Lignes CRUD */
  function addLigne(type = 'article') {
    const l = { ...EMPTY_LIGNE(), type };
    setForm(p => ({ ...p, lignes: [...p.lignes, l] }));
  }
  function updateLigne(idx, data) {
    setForm(p => { const ls = [...p.lignes]; ls[idx] = data; return { ...p, lignes: ls }; });
  }
  function deleteLigne(idx) {
    setForm(p => ({ ...p, lignes: p.lignes.filter((_, i) => i !== idx) }));
  }
  function duplicateLigne(idx) {
    setForm(p => {
      const ls = [...p.lignes];
      ls.splice(idx + 1, 0, { ...ls[idx], _id: Date.now() + Math.random() });
      return { ...p, lignes: ls };
    });
  }

  /* Totals */
  const articleLignes = form.lignes.filter(l => l.type === 'article');
  const totalHT = articleLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise) / 100), 0);
  const totalTVA = articleLignes.reduce((s, l) => {
    const ht = Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise) / 100);
    return s + ht * Number(l.tva) / 100;
  }, 0);
  const totalTTC = totalHT + totalTVA;
  const totalRemise = articleLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht) * (Number(l.remise) / 100), 0);

  /* Validate */
  function validate() {
    const e = {};
    if (!form.titre?.trim()) e.titre = 'Requis';
    if (!form.client_id) e.client_id = 'Requis';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSavingLocal(true);
    try {
      const payload = {
        ...form,
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
        lignes: form.lignes,
      };
      const result = await onSaved(payload, isEdit);
      if (result && result.success === false) {
        setApiError(result.error || "Erreur lors de l'enregistrement.");
      }
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSavingLocal(false);
    }
  }

  async function handlePdf() {
    if (!isEdit || !devis?.id) return;
    try {
      const catMap = Object.fromEntries(categories.map(c => [String(c.id), c.nom]));
      await generateDevisPdf({
        ...form,
        id: devis.id,
        client: selectedClient,
        client_nom: selectedClient ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom : '',
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
      }, catMap);
    } catch (err) {
      setApiError(err.message || 'Erreur generation PDF.');
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Back */}
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Retour aux devis
      </button>

      <form onSubmit={handleSave}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier devis' : 'Nouveau devis'}</h1>
            <p className="page-subtitle">
              {isEdit ? form.reference : 'Reference : ' + form.reference}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: 130 }}>
              {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Creer devis'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        {/* Grid 2-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Section: Infos devis */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Informations devis</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label required>Titre du devis</Label>
                  <input value={form.titre} onChange={e => setField('titre', e.target.value)} placeholder="Ex : Amenagement villa Amrani — phase 1" style={IS(errors.titre)} />
                  {errors.titre && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.titre}</span>}
                </div>
                <div className="form-group">
                  <Label>Reference</Label>
                  <input value={form.reference} onChange={e => setField('reference', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Statut</Label>
                  <select value={form.statut} onChange={e => setField('statut', e.target.value)} style={IS(false)}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <Label>Date de creation</Label>
                  <input type="date" value={form.date_creation} onChange={e => setField('date_creation', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Date de validite</Label>
                  <input type="date" value={form.date_validite} onChange={e => setField('date_validite', e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Commercial</Label>
                  <input type="text" value={form.commercial} onChange={e => setField('commercial', e.target.value)} placeholder="Nom du commercial" style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Type de projet</Label>
                  <select value={form.type_projet} onChange={e => setField('type_projet', e.target.value)} style={IS(false)}>
                    <option value="">Choisir...</option>
                    {TYPE_PROJET_VALUES.map(v => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Client */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Client</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <Label required>Client</Label>
                  <select value={form.client_id} onChange={e => setField('client_id', e.target.value)} style={IS(errors.client_id)}>
                    <option value="">Choisir un client...</option>
                    {clients.map(c => {
                      const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || '';
                      return <option key={c.id} value={c.id}>{nom}</option>;
                    })}
                  </select>
                  {errors.client_id && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.client_id}</span>}
                </div>
                {selectedClient && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.82rem' }}>
                    {[
                      ['Societe / Nom', [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom],
                      ['Email', selectedClient.email],
                      ['Telephone', selectedClient.telephone],
                      ['ICE', selectedClient.ice],
                      ['Ville', selectedClient.ville],
                      ['Adresse', selectedClient.adresse],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{label} : </span>
                        <span style={{ color: 'var(--text-2)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section: Lignes devis */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Lignes du devis</SectionTitle>

              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                      <th style={{ width: 20, padding: '6px 5px' }} />
                      <th style={{ textAlign: 'left', padding: '6px 6px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em' }}>Designation</th>
                      <th style={{ textAlign: 'center', padding: '6px 5px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 70 }}>Qte</th>
                      <th style={{ textAlign: 'left', padding: '6px 5px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 80 }}>Unite</th>
                      <th style={{ textAlign: 'right', padding: '6px 5px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 105 }}>Prix HT</th>
                      <th style={{ textAlign: 'center', padding: '6px 5px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 65 }}>Rem.</th>
                      <th style={{ textAlign: 'center', padding: '6px 5px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 72 }}>TVA</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', width: 110 }}>Total HT</th>
                      <th style={{ width: 52, padding: '6px 5px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.lignes.map((ligne, idx) => (
                      <LigneRow
                        key={ligne._id}
                        ligne={ligne}
                        idx={idx}
                        categories={categories}
                        articles={articles}
                        onChange={data => updateLigne(idx, data)}
                        onDelete={() => deleteLigne(idx)}
                        onDuplicate={() => duplicateLigne(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add line buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('article')} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={13} /> Article
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('titre')} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-2)' }}>
                  <Plus size={13} /> Titre section
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addLigne('note')} style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#F57C00' }}>
                  <Plus size={13} /> Note
                </button>
              </div>
            </div>

            {/* Section: Conditions */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Conditions commerciales</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Modalites de paiement</Label>
                  <select value={form.modalites_paiement} onChange={e => setField('modalites_paiement', e.target.value)} style={IS(false)}>
                    {MODALITES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Conditions generales</Label>
                  <textarea rows={3} value={form.conditions} onChange={e => setField('conditions', e.target.value)} placeholder="Conditions generales de vente, garanties, modalites de livraison..." style={{ ...IS(false), resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={e => setField('notes_internes', e.target.value)} placeholder="Notes internes (non visibles sur le PDF)..." style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>

            {/* Totaux */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Recapitulatif</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Total HT brut', fmtMAD(articleLignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_ht), 0).toFixed(2))],
                  ['Remises', '- ' + fmtMAD(totalRemise.toFixed(2))],
                  ['Total HT net', fmtMAD(totalHT.toFixed(2))],
                  ['TVA', fmtMAD(totalTVA.toFixed(2))],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: label === 'Remises' ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase' }}>Total TTC</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--red)' }}>{fmtMAD(totalTTC.toFixed(2))}</span>
                </div>
              </div>
            </div>

            {/* Lignes summary */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Resume</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-2)' }}>Nombre de lignes</span>
                  <span style={{ fontWeight: 700 }}>{articleLignes.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-2)' }}>Client</span>
                  <span style={{ fontWeight: 600, color: selectedClient ? 'var(--text)' : 'var(--text-3)' }}>
                    {selectedClient ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-2)' }}>Commercial</span>
                  <span style={{ fontWeight: 600 }}>{form.commercial || '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-2)' }}>Validite</span>
                  <span style={{ fontWeight: 600 }}>{form.date_validite || '—'}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Actions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ justifyContent: 'center' }}>
                  {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Creer le devis'}</>}
                </button>
                {isEdit && (
                  <button type="button" className="btn btn-ghost" onClick={handlePdf} style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={14} /> Telecharger PDF
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={onBack} style={{ justifyContent: 'center' }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
