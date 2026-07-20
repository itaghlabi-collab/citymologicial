/**
 * ProformaForm — même UX/lignes/totaux que FactureForm,
 * sans paiements / acomptes / sync caisse. Numérotation PF.
 */
import { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Copy, AlertCircle,
  FileText, ChevronDown, ChevronUp, GripVertical, X, Check, Download,
} from 'lucide-react';
import { listClients } from '../../services/crm/clients';
import { listArticles } from '../../services/crm/articles';
import { listCategories } from '../../services/crm/categories';
import { listCrmDevis, getCrmDevisById } from '../../services/crm/crmDevis';
import {
  generateCrmProformaNumero,
  CRM_PROFORMA_STATUTS,
  CRM_PROFORMA_STATUT_LABEL,
} from '../../services/crm/crmProformas';
import { generateProformaPdf } from '../../services/crm/proformaPdf';
import Big from 'big.js';
import { moneyLineHt, moneyLineTtc, moneyComputeDocumentTotals, moneyToNumber, moneyFormatMAD } from '../../utils/decimalMoney';
import { hydrateDocLigneFromSource } from '../../utils/crm/docLigneHydrate';

function fmtMAD(v) {
  return moneyFormatMAD(v);
}
function IS(err, extra = {}) {
  return {
    padding: '8px 11px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6, fontSize: '0.86rem', background: '#fff',
    outline: 'none', width: '100%', boxSizing: 'border-box',
    fontFamily: 'var(--font-body)', color: 'var(--text)',
    transition: 'border-color 0.15s', ...extra,
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
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_TAUX = [0, 7, 10, 14, 20];
const MODALITES = ['30 jours net', '60 jours net', 'Comptant', 'A la commande', '50% avance / 50% livraison', 'Sur devis'];

const EMPTY_LIGNE = () => ({
  _id: Date.now() + Math.random(),
  type: 'article',
  designation: '', description: '', article_id: '', categorie_id: '',
  quantite: 1, unite: 'unite', prix_ht: 0, remise: 0, tva: 20,
});

const EMPTY_PROFORMA = {
  numero: '',
  titre: '',
  statut: 'brouillon',
  date_emission: today(),
  date_validite: addDays(30),
  date_echeance: addDays(30),
  commercial: '',
  type_projet: '',
  client_id: '',
  devis_id: '',
  modalites_paiement: '30 jours net',
  conditions: '',
  notes_internes: '',
  lignes: [EMPTY_LIGNE()],
};

function Spinner() {
  return <div style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

/** Même logique que facture : copie ligne devis + hydratation prix (ligne / article / total_ht). */
// hydrateDocLigneFromSource importé depuis utils/crm/docLigneHydrate

function LigneRow({ ligne, categories, articles, onChange, onDelete, onDuplicate }) {
  const [showDesc, setShowDesc] = useState(false);
  const catArticles = articles.filter(a => !ligne.categorie_id || String(a.categorie_id) === String(ligne.categorie_id));
  const stHT = moneyLineHt({ qty: ligne.quantite, unitPriceHt: ligne.prix_ht, remisePct: ligne.remise });
  const stTTC = moneyLineTtc({ qty: ligne.quantite, unitPriceHt: ligne.prix_ht, tvaPct: ligne.tva, remisePct: ligne.remise });

  function set(k, v) { onChange({ ...ligne, [k]: v }); }

  function onArticleChange(articleId) {
    const art = articles.find(a => String(a.id) === String(articleId));
    if (art) {
      onChange({
        ...ligne,
        article_id: articleId,
        designation: art.nom || art.designation || '',
        description: art.description || '',
        unite: art.unite || 'unite',
        prix_ht: art.prix_ht ?? art.prix ?? 0,
        remise: art.remise ?? 0,
        tva: art.tva ?? 20,
      });
    } else {
      set('article_id', articleId);
    }
  }

  if (ligne.type === 'titre' || ligne.type === 'sous_titre') {
    return (
      <tr style={{ background: '#F5F6F8' }}>
        <td colSpan={9} style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab', flexShrink: 0 }} />
            <input value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Titre de section..." style={{ ...IS(false), fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.92rem', flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'var(--border)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Titre</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3 }}><X size={13} /></button>
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
            <textarea value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Note ou commentaire..." rows={2} style={{ ...IS(false), resize: 'vertical', flex: 1, fontSize: '0.82rem', background: 'transparent' }} />
            <span style={{ fontSize: '0.72rem', color: '#F57C00', background: '#FFF3E0', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>Note</span>
            <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, marginTop: 2 }}><X size={13} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ padding: '8px 6px', width: 20 }}><GripVertical size={13} style={{ color: 'var(--text-3)', cursor: 'grab' }} /></td>
      <td style={{ padding: '6px 6px', minWidth: 200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <select value={ligne.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={{ ...IS(false), fontSize: '0.78rem' }}>
            <option value="">Categorie...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <select value={ligne.article_id} onChange={e => onArticleChange(e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
            <option value="">Choisir article...</option>
            {catArticles.map(a => <option key={a.id} value={a.id}>{a.nom || a.designation}</option>)}
          </select>
          <input value={ligne.designation} onChange={e => set('designation', e.target.value)} placeholder="Designation libre..." style={{ ...IS(false), fontSize: '0.82rem' }} />
          <button type="button" onClick={() => setShowDesc(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.72rem', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            {showDesc ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Description
          </button>
          {showDesc && <textarea value={ligne.description || ''} onChange={e => set('description', e.target.value)} placeholder="Description technique..." rows={2} style={{ ...IS(false), resize: 'vertical', fontSize: '0.78rem' }} />}
        </div>
      </td>
      <td style={{ padding: '6px 5px', width: 70 }}>
        <input type="number" min="0" step="0.01" value={ligne.quantite} onChange={e => set('quantite', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 80 }}>
        <select value={ligne.unite} onChange={e => set('unite', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 5px', width: 105 }}>
        <input type="number" min="0" step="0.01" value={ligne.prix_ht} onChange={e => set('prix_ht', e.target.value)} style={{ ...IS(false), textAlign: 'right', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 65 }}>
        <input type="number" min="0" max="100" step="1" value={ligne.remise} onChange={e => set('remise', e.target.value)} style={{ ...IS(false), textAlign: 'center', fontSize: '0.85rem' }} />
      </td>
      <td style={{ padding: '6px 5px', width: 72 }}>
        <select value={ligne.tva} onChange={e => set('tva', e.target.value)} style={{ ...IS(false), fontSize: '0.82rem' }}>
          {TVA_TAUX.map(t => <option key={t} value={t}>{t}%</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px', width: 110, textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem' }}>{fmtMAD(stHT)}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>TTC: {fmtMAD(stTTC)}</div>
      </td>
      <td style={{ padding: '6px 5px', width: 52 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button type="button" onClick={onDuplicate} title="Dupliquer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3 }}><Copy size={12} /></button>
          <button type="button" onClick={onDelete} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 3 }}><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  );
}

export default function ProformaForm({ proforma, initialClientId = '', onBack, onSaved, saving = false }) {
  const isEdit = !!proforma?.id;
  const locked = proforma?.statut === 'convertie' || proforma?.statut === 'annulee';

  const [form, setForm] = useState(() => {
    if (proforma) {
      return {
        ...EMPTY_PROFORMA,
        ...proforma,
        client_id: proforma.client_id || initialClientId || '',
        date_validite: proforma.date_validite || proforma.date_echeance || addDays(30),
        lignes: proforma.lignes?.length
          ? proforma.lignes.map((l) => hydrateDocLigneFromSource(l, []))
          : [EMPTY_LIGNE()],
      };
    }
    return { ...EMPTY_PROFORMA, client_id: initialClientId || '', numero: '' };
  });

  const [clients, setClients] = useState([]);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [devisList, setDevisList] = useState([]);
  const [errors, setErrors] = useState({});
  const [savingLocal, setSavingLocal] = useState(false);
  const [apiError, setApiError] = useState('');
  const isSaving = saving || savingLocal;

  useEffect(() => {
    Promise.all([listClients(), listArticles(), listCategories(), listCrmDevis()]).then(([cl, ar, ca, dv]) => {
      setClients(cl || []);
      setArticles(ar || []);
      setCategories(ca || []);
      setDevisList(dv || []);
      // Si des lignes article n'ont pas de PU, compléter depuis le catalogue
      if (ar?.length) {
        setForm((p) => {
          const needs = (p.lignes || []).some(
            (l) => (l.type || 'article') === 'article' && moneyToNumber(l.prix_ht) <= 0 && (l.article_id || l.designation),
          );
          if (!needs) return p;
          return { ...p, lignes: p.lignes.map((l) => hydrateDocLigneFromSource(l, ar)) };
        });
      }
    }).catch(() => {});
    if (!isEdit) {
      generateCrmProformaNumero()
        .then((num) => setForm(p => ({ ...p, numero: num })))
        .catch(() => {});
    }
  }, [isEdit]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function loadFromDevis(devisId) {
    if (!devisId) {
      setField('devis_id', '');
      return;
    }
    try {
      const dv = await getCrmDevisById(devisId);
      const arts = articles.length ? articles : await listArticles().catch(() => []);
      if (arts.length && !articles.length) setArticles(arts);
      setForm(p => ({
        ...p,
        devis_id: devisId,
        client_id: dv.client_id || p.client_id,
        commercial: dv.commercial || p.commercial,
        type_projet: dv.type_projet || p.type_projet,
        modalites_paiement: dv.modalites_paiement || p.modalites_paiement,
        conditions: dv.conditions || p.conditions,
        notes_internes: dv.notes_internes || p.notes_internes,
        date_validite: dv.date_validite || p.date_validite,
        date_echeance: dv.date_validite || p.date_echeance,
        lignes: dv.lignes?.length
          ? dv.lignes.map((l) => hydrateDocLigneFromSource(l, arts))
          : p.lignes,
        titre: dv.titre ? 'Proforma — ' + dv.titre : p.titre,
      }));
    } catch {
      const dv = devisList.find(d => String(d.id) === String(devisId));
      if (dv) {
        setForm(p => ({
          ...p,
          devis_id: devisId,
          client_id: dv.client_id || p.client_id,
          commercial: dv.commercial || p.commercial,
          titre: dv.titre ? 'Proforma — ' + dv.titre : p.titre,
        }));
      }
    }
  }

  const selectedClient = clients.find(c => String(c.id) === String(form.client_id));

  function addLigne(type = 'article') {
    setForm(p => ({ ...p, lignes: [...p.lignes, { ...EMPTY_LIGNE(), type }] }));
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

  const artLignes = form.lignes.filter(l => l.type === 'article');
  const { subtotal_ht: totalHT, total_vat: totalTVA, total_ttc: totalTTC } = moneyComputeDocumentTotals(
    form.lignes,
    (l) => {
      if (l.type !== 'article') return null;
      return {
        qty: l.quantite,
        unitPriceHt: l.prix_ht,
        tvaPct: l.tva,
        remisePct: l.remise,
      };
    },
  );
  const totalRemise = moneyToNumber(artLignes.reduce(
    (s, l) => {
      const brut = moneyLineHt({ qty: l.quantite, unitPriceHt: l.prix_ht, remisePct: 0 });
      return s.plus(brut.times(new Big(l.remise || 0).div(100)));
    },
    new Big(0),
  ));
  const totalBrut = moneyToNumber(artLignes.reduce(
    (s, l) => s.plus(moneyLineHt({ qty: l.quantite, unitPriceHt: l.prix_ht, remisePct: 0 })),
    new Big(0),
  ));

  function validate() {
    const e = {};
    if (!form.titre?.trim()) e.titre = 'Requis';
    if (!form.client_id) e.client_id = 'Requis';
    return e;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (locked) {
      setApiError('Cette proforma ne peut plus être modifiée.');
      return;
    }
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSavingLocal(true);
    try {
      const payload = {
        ...form,
        date_validite: form.date_validite || form.date_echeance,
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
    if (!isEdit || !proforma?.id) return;
    try {
      const catMap = Object.fromEntries(categories.map((c) => [String(c.id), c.nom]));
      await generateProformaPdf({
        ...form,
        id: proforma.id,
        client: selectedClient,
        client_nom: selectedClient
          ? [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom
          : '',
        devis_reference: devisList.find((d) => String(d.id) === String(form.devis_id))?.reference || '',
        total_ht: totalHT,
        total_tva: totalTVA,
        total_ttc: totalTTC,
      }, catMap);
    } catch (err) {
      setApiError(err.message || 'Erreur génération PDF.');
    }
  }

  return (
    <div className="animate-fade-in">
      <button type="button" className="crm-back-btn" onClick={onBack} aria-label="Retour aux proformas">
        <ChevronLeft size={16} /> Retour aux proformas
      </button>

      <form onSubmit={handleSave}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isEdit ? 'Modifier proforma' : 'Nouvelle proforma'}</h1>
            <p className="page-subtitle">{isEdit ? form.numero : 'Numero : ' + form.numero} · Document commercial (hors comptabilité)</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || locked} style={{ minWidth: 130 }}>
              {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer proforma'}</>}
            </button>
          </div>
        </div>

        {apiError && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> {apiError}
          </div>
        )}

        <div className="crm-form-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Informations proforma</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label required>Titre de la proforma</Label>
                  <input value={form.titre} onChange={e => setField('titre', e.target.value)} disabled={locked} placeholder="Ex : Travaux villa Amrani — phase 2" style={IS(errors.titre)} />
                  {errors.titre && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.titre}</span>}
                </div>

                <div className="form-group">
                  <Label>Numero (PF)</Label>
                  <input value={form.numero} onChange={e => setField('numero', e.target.value)} disabled={locked || isEdit} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Statut</Label>
                  <select value={form.statut} onChange={e => setField('statut', e.target.value)} disabled={locked} style={IS(false)}>
                    {CRM_PROFORMA_STATUTS.filter(s => s !== 'convertie').map(s => (
                      <option key={s} value={s}>{CRM_PROFORMA_STATUT_LABEL[s]}</option>
                    ))}
                    {form.statut === 'convertie' && <option value="convertie">{CRM_PROFORMA_STATUT_LABEL.convertie}</option>}
                  </select>
                </div>

                <div className="form-group">
                  <Label>Date d'emission</Label>
                  <input type="date" value={form.date_emission} onChange={e => setField('date_emission', e.target.value)} disabled={locked} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Date de validite</Label>
                  <input type="date" value={form.date_validite || form.date_echeance || ''} onChange={e => { setField('date_validite', e.target.value); setField('date_echeance', e.target.value); }} disabled={locked} style={IS(false)} />
                </div>

                <div className="form-group">
                  <Label>Commercial</Label>
                  <input type="text" value={form.commercial} onChange={e => setField('commercial', e.target.value)} disabled={locked} placeholder="Nom du commercial" style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Modalites de paiement</Label>
                  <select value={form.modalites_paiement} onChange={e => setField('modalites_paiement', e.target.value)} disabled={locked} style={IS(false)}>
                    {MODALITES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <Label>Créer depuis un devis</Label>
                  <select value={form.devis_id} onChange={e => loadFromDevis(e.target.value)} disabled={locked} style={IS(false)}>
                    <option value="">Aucun devis lie...</option>
                    {devisList.map(d => <option key={d.id} value={d.id}>{d.reference} — {d.titre}</option>)}
                  </select>
                  {form.devis_id && (
                    <div style={{ fontSize: '0.72rem', color: '#388E3C', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={11} /> Donnees importees depuis le devis
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Client</SectionTitle>
              <div className="form-group">
                <Label required>Client</Label>
                <select value={form.client_id} onChange={e => setField('client_id', e.target.value)} disabled={locked} style={IS(errors.client_id)}>
                  <option value="">Choisir un client...</option>
                  {clients.map(c => {
                    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom || '';
                    return <option key={c.id} value={c.id}>{nom}</option>;
                  })}
                </select>
                {errors.client_id && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.client_id}</span>}
              </div>
              {selectedClient && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.82rem', marginTop: 10 }}>
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

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Lignes</SectionTitle>
              <div className="crm-form-lignes-wrap">
                <table style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
                      <th style={{ width: 20, padding: '6px 5px' }} />
                      {['Designation', 'Qte', 'Unite', 'Prix HT', 'Rem.', 'TVA', 'Total HT', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 4 ? (i === 5 ? 'right' : 'center') : 'left', padding: '6px 6px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.lignes.map((ligne, idx) => (
                      <LigneRow
                        key={ligne._id}
                        ligne={ligne}
                        categories={categories}
                        articles={articles}
                        onChange={data => !locked && updateLigne(idx, data)}
                        onDelete={() => !locked && deleteLigne(idx)}
                        onDuplicate={() => !locked && duplicateLigne(idx)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {!locked && (
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
              )}
            </div>

            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Conditions et notes</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div className="form-group">
                  <Label>Conditions generales</Label>
                  <textarea rows={3} value={form.conditions} onChange={e => setField('conditions', e.target.value)} disabled={locked} placeholder="Conditions generales..." style={{ ...IS(false), resize: 'vertical', lineHeight: 1.6 }} />
                </div>
                <div className="form-group">
                  <Label>Notes internes</Label>
                  <textarea rows={2} value={form.notes_internes} onChange={e => setField('notes_internes', e.target.value)} disabled={locked} placeholder="Notes internes (non visibles sur le PDF)..." style={{ ...IS(false, { background: '#FFFDE7' }), resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="crm-form-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 80 }}>
            <div className="card" style={{ padding: '20px 22px' }}>
              <SectionTitle>Recapitulatif</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Total HT brut', fmtMAD(totalBrut)],
                  ['Remises', '- ' + fmtMAD(totalRemise)],
                  ['Total HT net', fmtMAD(totalHT)],
                  ['TVA', fmtMAD(totalTVA)],
                ].map(([label, val], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: label === 'Remises' ? 'var(--red)' : 'var(--text)' }}>{val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', textTransform: 'uppercase' }}>Total TTC</span>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--red)' }}>{fmtMAD(totalTTC)}</span>
                </div>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
                Aucun paiement ni écriture comptable — document commercial uniquement.
              </p>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Resume</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                {[
                  ['Lignes article', artLignes.length],
                  ['Client', selectedClient ? ([selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ') || selectedClient.nom) : '—'],
                  ['Commercial', form.commercial || '—'],
                  ['Validite', form.date_validite || form.date_echeance || '—'],
                  ['Devis lie', form.devis_id ? (devisList.find(d => String(d.id) === String(form.devis_id))?.reference || form.devis_id) : 'Aucun'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-2)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionTitle>Actions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={isSaving || locked} style={{ justifyContent: 'center' }}>
                  {isSaving ? <Spinner /> : <><FileText size={14} /> {isEdit ? 'Enregistrer' : 'Créer la proforma'}</>}
                </button>
                {isEdit && (
                  <button type="button" className="btn btn-ghost" onClick={handlePdf} style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={14} /> Telecharger PDF
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={onBack} style={{ justifyContent: 'center' }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
