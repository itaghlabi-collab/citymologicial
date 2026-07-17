import { useState, useEffect } from 'react';
import {
  ChevronLeft, FileText, AlertCircle, Check,
  User, Hash, Calendar, DollarSign, Percent,
  ChevronRight, RefreshCw
} from 'lucide-react';
import { listCrmDevis } from '../../services/crm/crmDevis';
import { generateCrmAcompteNumero } from '../../services/crm/crmFactures';
import { clientDisplayName } from '../../services/crm/clients';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n)) return '0 MAD';
  return n.toLocaleString('fr-MA') + ' MAD';
}
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function genNumAcompte() {
  return '';
}

/* ── Input style helper ── */
function IS(err, extra = {}) {
  return {
    padding: '9px 12px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.875rem',
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
    <div style={{
      fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.1em',
      marginBottom: 16, paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

/* ── Spinner ── */
function Spinner() {
  return (
    <div style={{
      display: 'inline-block', width: 16, height: 16,
      border: '2px solid rgba(255,255,255,0.35)',
      borderTopColor: '#fff', borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

/* ── Summary Row ── */
function SummaryRow({ label, value, highlight, muted, large, separator }) {
  return (
    <>
      {separator && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 0',
      }}>
        <span style={{ fontSize: large ? '0.9rem' : '0.82rem', color: muted ? 'var(--text-3)' : 'var(--text-2)', fontWeight: large ? 800 : 500, fontFamily: large ? 'var(--font-head)' : 'var(--font-body)', textTransform: large ? 'uppercase' : 'none' }}>
          {label}
        </span>
        <span style={{ fontSize: large ? '1rem' : '0.85rem', fontWeight: large ? 800 : 600, color: highlight ? 'var(--red)' : muted ? 'var(--text-3)' : 'var(--text)', fontFamily: large ? 'var(--font-head)' : 'var(--font-body)' }}>
          {value}
        </span>
      </div>
    </>
  );
}

/* ── Mode Toggle Button ── */
function ModeBtn({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: '9px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
      fontWeight: 700, fontSize: '0.82rem', fontFamily: 'var(--font-body)',
      background: active ? 'var(--red)' : 'transparent',
      color: active ? '#fff' : 'var(--text-2)',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════
   FACTURE ACOMPTE — MAIN COMPONENT
   ════════════════════════════════════════════════ */
export default function FactureAcompte({ onBack, onCreated, createAcompte, fetchDevisSummary, configured = true, saving: savingProp = false }) {
  const [devisList, setDevisList] = useState([]);
  const [loadingDevis, setLoadingDevis] = useState(false);
  const [devisSummary, setDevisSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  /* Form state */
  const [devisId, setDevisId]             = useState('');
  const [numero, setNumero]               = useState('');
  const [dateEmission, setDateEmission]   = useState(today());
  const [dateEcheance, setDateEcheance]   = useState(addDays(15));
  const [devise, setDevise]               = useState('MAD');
  const [mode, setMode]                   = useState('pct');
  const [valeur, setValeur]               = useState('');
  const [errors, setErrors]               = useState({});
  const [savingLocal, setSavingLocal]       = useState(false);
  const [apiError, setApiError]           = useState('');
  const isSaving = savingProp || savingLocal;

  const selectedDevis = devisSummary?.devis || devisList.find(d => String(d.id) === String(devisId));
  const devisTTC      = Number(selectedDevis?.total_ttc || 0);
  const devisHT       = Number(selectedDevis?.total_ht  || 0);
  const devisTVA      = Number(selectedDevis?.total_tva || 0);
  const devisTVAPct   = devisHT > 0 ? (devisTVA / devisHT) * 100 : 20;

  const acomptesExistants = devisSummary?.acomptes || [];
  const totalAcomptesExist = devisSummary?.dejaFacture ?? 0;
  const resteAvantCet     = devisSummary?.resteAFacturer ?? Math.max(0, devisTTC - totalAcomptesExist);

  /* Computed acompte amounts */
  const valeurNum = Number(valeur) || 0;
  const acompteTTC = mode === 'pct'
    ? devisTTC * (valeurNum / 100)
    : valeurNum;
  const acompteHT  = acompteTTC > 0 && (1 + devisTVAPct / 100) > 0
    ? acompteTTC / (1 + devisTVAPct / 100)
    : 0;
  const acompteTVA = acompteTTC - acompteHT;
  const resteApres = Math.max(0, resteAvantCet - acompteTTC);

  const isValid = !!devisId && acompteTTC > 0 && acompteTTC <= resteAvantCet;

  /* Load devis list */
  useEffect(() => {
    if (!configured) return;
    setLoadingDevis(true);
    listCrmDevis()
      .then((rows) => setDevisList(rows.filter((d) => Number(d.total_ttc) > 0)))
      .catch(() => setDevisList([]))
      .finally(() => setLoadingDevis(false));
    generateCrmAcompteNumero()
      .then(setNumero)
      .catch(() => setNumero(genNumAcompte()));
  }, [configured]);

  useEffect(() => {
    if (!devisId || !fetchDevisSummary) {
      setDevisSummary(null);
      return;
    }
    setLoadingSummary(true);
    fetchDevisSummary(devisId)
      .then(setDevisSummary)
      .catch(() => setDevisSummary(null))
      .finally(() => setLoadingSummary(false));
  }, [devisId, fetchDevisSummary]);

  function clientLabel(d) {
    if (!d) return '—';
    return d.client_nom || clientDisplayName(d.client) || '—';
  }

  function validate() {
    const e = {};
    if (!devisId) e.devisId = 'Veuillez selectionner un devis.';
    if (!valeur || valeurNum <= 0) e.valeur = 'Montant requis et > 0.';
    if (acompteTTC > resteAvantCet) e.valeur = 'Le montant depasse le reste a facturer.';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!configured || !createAcompte) {
      setApiError('Supabase non configuré.');
      return;
    }
    setSavingLocal(true);
    try {
      const result = await createAcompte({
        devis_id: devisId,
        numero,
        date_emission: dateEmission,
        date_echeance: dateEcheance,
        devise,
        mode,
        valeur: valeurNum,
        acompte_ttc: acompteTTC,
        statut: 'brouillon',
      });
      if (!result.success) {
        setApiError(result.error || 'Erreur lors de la creation.');
        onCreated?.(false, result.error || 'Erreur lors de la creation.');
        return;
      }
      onCreated?.(true, 'Facture acompte creee avec succes.');
      onBack();
    } catch (err) {
      const msg = err.message || "Erreur lors de la creation.";
      setApiError(msg);
      onCreated?.(false, msg);
    } finally {
      setSavingLocal(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Back */}
      <button type="button" className="crm-back-btn" onClick={onBack} aria-label="Retour aux factures">
        <ChevronLeft size={16} /> Retour aux factures
      </button>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Facture d'acompte</h1>
          <p className="page-subtitle">Generez une facture d'acompte liee a un devis existant.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid || isSaving || !configured}
            onClick={handleSubmit}
            style={{ minWidth: 180, opacity: (!isValid || isSaving || !configured) ? 0.55 : 1 }}
          >
            {isSaving ? <Spinner /> : <><FileText size={14} /> Créer facture acompte</>}
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {apiError && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 2-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

          {/* ══ LEFT — FORM ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Devis source */}
            <div className="card" style={{ padding: '22px 24px' }}>
              <SectionTitle>Devis source</SectionTitle>

              <div className="form-group">
                <Label required>Selectionner un devis</Label>
                <div style={{ position: 'relative' }}>
                  {loadingDevis && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                      <RefreshCw size={14} style={{ color: 'var(--text-3)', animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                  <select
                    value={devisId}
                    onChange={e => { setDevisId(e.target.value); setErrors({}); }}
                    style={{ ...IS(errors.devisId), paddingRight: 32, appearance: 'auto' }}
                  >
                    <option value="">-- Choisir un devis --</option>
                    {devisList.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.reference} — {d.titre}{clientLabel(d) !== '—' ? ' (' + clientLabel(d) + ')' : ''}
                        </option>
                      ))}
                  </select>
                </div>
                {errors.devisId && <span style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>{errors.devisId}</span>}
              </div>

              {selectedDevis && (
                <div style={{ marginTop: 14, background: 'var(--bg)', borderRadius: 8, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: '0.82rem' }}>
                  {loadingSummary && (
                    <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: 'var(--text-3)' }}>Chargement du recapitulatif...</div>
                  )}
                  {[
                    ['Client',       clientLabel(selectedDevis)],
                    ['Reference',    selectedDevis.reference || '—'],
                    ['Commercial',   selectedDevis.commercial || '—'],
                    ['Total HT',     fmtMAD(devisHT)],
                    ['Total TTC',    fmtMAD(devisTTC)],
                    ['Deja facture', fmtMAD(totalAcomptesExist)],
                    ['Reste',        fmtMAD(resteAvantCet)],
                  ].map(([lbl, val]) => (
                    <div key={lbl}>
                      <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{lbl} : </span>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Infos facture */}
            <div className="card" style={{ padding: '22px 24px' }}>
              <SectionTitle>Informations facture</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <Label>Numero</Label>
                  <input value={numero} onChange={e => setNumero(e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Devise</Label>
                  <select value={devise} onChange={e => setDevise(e.target.value)} style={IS(false)}>
                    <option value="MAD">MAD — Dirham marocain</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dollar US</option>
                  </select>
                </div>
                <div className="form-group">
                  <Label>Date d'emission</Label>
                  <input type="date" value={dateEmission} onChange={e => setDateEmission(e.target.value)} style={IS(false)} />
                </div>
                <div className="form-group">
                  <Label>Date d'echeance</Label>
                  <input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} style={IS(false)} />
                </div>
              </div>
            </div>

            {/* Mode acompte */}
            <div className="card" style={{ padding: '22px 24px' }}>
              <SectionTitle>Calcul de l'acompte</SectionTitle>

              {/* Toggle */}
              <div style={{ display: 'flex', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, padding: 4, gap: 4, marginBottom: 18 }}>
                <ModeBtn active={mode === 'pct'} onClick={() => { setMode('pct'); setValeur(''); setErrors({}); }}>
                  <Percent size={13} style={{ display: 'inline', marginRight: 5 }} />
                  Pourcentage
                </ModeBtn>
                <ModeBtn active={mode === 'ttc'} onClick={() => { setMode('ttc'); setValeur(''); setErrors({}); }}>
                  <DollarSign size={13} style={{ display: 'inline', marginRight: 5 }} />
                  Montant TTC
                </ModeBtn>
              </div>

              <div className="form-group">
                <Label required>
                  {mode === 'pct' ? 'Pourcentage du devis (%)' : 'Montant TTC (' + devise + ')'}
                </Label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min="0"
                    step={mode === 'pct' ? '1' : '0.01'}
                    max={mode === 'pct' ? '100' : undefined}
                    value={valeur}
                    onChange={e => { setValeur(e.target.value); setErrors(p => ({ ...p, valeur: '' })); }}
                    placeholder={mode === 'pct' ? 'Ex : 30' : 'Ex : 15000'}
                    style={{ ...IS(!!errors.valeur), paddingRight: 48 }}
                    disabled={!devisId}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-3)', pointerEvents: 'none' }}>
                    {mode === 'pct' ? '%' : devise}
                  </span>
                </div>
                {errors.valeur && <span style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>{errors.valeur}</span>}
                {!devisId && <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>Selectionnez d'abord un devis.</span>}
              </div>

              {/* Quick % shortcuts */}
              {mode === 'pct' && devisId && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {[10, 20, 30, 40, 50].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setValeur(String(pct))}
                      style={{
                        padding: '5px 14px', border: '1.5px solid ' + (Number(valeur) === pct ? 'var(--red)' : 'var(--border)'),
                        borderRadius: 6, background: Number(valeur) === pct ? '#FFEBEE' : '#fff',
                        color: Number(valeur) === pct ? 'var(--red)' : 'var(--text-2)',
                        cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                        transition: 'all 0.12s',
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}

              {/* Validation alert */}
              {devisId && acompteTTC > resteAvantCet && acompteTTC > 0 && (
                <div style={{ marginTop: 14, background: '#FFEBEE', color: 'var(--red)', borderRadius: 7, padding: '10px 13px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={14} />
                  Le montant ({fmtMAD(acompteTTC.toFixed(2))}) depasse le reste a facturer ({fmtMAD(resteAvantCet.toFixed(2))}).
                </div>
              )}
            </div>
          </div>

          {/* ══ RIGHT — SUMMARY ══ */}
          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Main recap card */}
            <div className="card" style={{ padding: '22px 22px' }}>
              <SectionTitle>Recapitulatif</SectionTitle>

              {!selectedDevis ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <FileText size={36} style={{ color: 'var(--border)', marginBottom: 10 }} />
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
                    Selectionnez un devis pour voir le recapitulatif.
                  </p>
                </div>
              ) : (
                <div>
                  {/* Client + Devis info */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
                        {clientLabel(selectedDevis).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                          {clientLabel(selectedDevis)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: 'var(--font-head)', letterSpacing: '0.04em' }}>
                          {selectedDevis.reference}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '12px 14px', marginBottom: 14 }}>
                    <SummaryRow label="Montant devis HT"    value={fmtMAD(devisHT.toFixed(2))}   muted />
                    <SummaryRow label="TVA"                 value={fmtMAD(devisTVA.toFixed(2))}  muted />
                    <SummaryRow label="Total TTC devis"     value={fmtMAD(devisTTC.toFixed(2))}  separator />
                    {totalAcomptesExist > 0 && (
                      <SummaryRow label="Acomptes existants" value={'- ' + fmtMAD(totalAcomptesExist.toFixed(2))} muted />
                    )}
                    <SummaryRow label="Reste a facturer"    value={fmtMAD(resteAvantCet.toFixed(2))} separator />
                  </div>

                  {acompteTTC > 0 && acompteTTC <= resteAvantCet && (
                    <div style={{ background: '#FFEBEE', borderRadius: 7, padding: '12px 14px', marginBottom: 14, border: '1px solid rgba(211,47,47,0.2)' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Cet acompte
                      </div>
                      <SummaryRow label="HT"   value={fmtMAD(acompteHT.toFixed(2))}  />
                      <SummaryRow label="TVA"  value={fmtMAD(acompteTVA.toFixed(2))} />
                      <div style={{ height: 1, background: 'rgba(211,47,47,0.2)', margin: '6px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.88rem', textTransform: 'uppercase', color: 'var(--red)' }}>TTC acompte</span>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--red)' }}>{fmtMAD(acompteTTC.toFixed(2))}</span>
                      </div>
                      {mode === 'pct' && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--red)', opacity: 0.75, marginTop: 4, textAlign: 'right' }}>
                          {valeur}% du total TTC
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reste apres acompte */}
                  {acompteTTC > 0 && acompteTTC <= resteAvantCet && (
                    <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '10px 14px' }}>
                      <SummaryRow label="Reste apres cet acompte" value={fmtMAD(resteApres.toFixed(2))} large={resteApres <= 0} />
                      {resteApres <= 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#388E3C', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={11} /> Devis entierement couvert
                        </div>
                      )}
                      {/* Progress bar */}
                      {devisTTC > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: 4 }}>
                            <span>Couverture devis</span>
                            <span>{Math.min(100, Math.round(((totalAcomptesExist + acompteTTC) / devisTTC) * 100))}%</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 3, background: 'var(--red)', width: Math.min(100, ((totalAcomptesExist + acompteTTC) / devisTTC) * 100) + '%', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Acomptes existants */}
                  {acomptesExistants.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Acomptes precedents
                      </div>
                      {acomptesExistants.map((a, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text-2)' }}>{a.numero || 'AC-' + (i + 1)} — {a.date || '—'}</span>
                          <span style={{ fontWeight: 700 }}>{fmtMAD(a.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CTA card */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isValid || isSaving || !configured}
                style={{ width: '100%', justifyContent: 'center', opacity: (!isValid || isSaving || !configured) ? 0.55 : 1 }}
                onClick={handleSubmit}
              >
                {isSaving ? <Spinner /> : <><FileText size={14} /> Créer facture acompte</>}
              </button>
              {!isValid && !isSaving && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
                  {!devisId ? 'Selectionnez un devis pour continuer.' : !valeur ? 'Saisissez un montant d\'acompte.' : 'Verifiez les donnees saisies.'}
                </p>
              )}
              <button type="button" className="btn btn-ghost" onClick={onBack} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
