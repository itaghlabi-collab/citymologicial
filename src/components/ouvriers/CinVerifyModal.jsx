/**
 * CinVerifyModal — vérification manuelle des champs OCR avant remplissage fiche.
 */
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';

const FIELD_DEFS = [
  { key: 'numero_cin', formKey: 'cin', label: 'Numéro de CIN' },
  { key: 'prenom', formKey: 'prenom', label: 'Prénom' },
  { key: 'nom', formKey: 'nom', label: 'Nom' },
  { key: 'prenom_arabe', formKey: 'prenom_arabe', label: 'Prénom (arabe)' },
  { key: 'nom_arabe', formKey: 'nom_arabe', label: 'Nom (arabe)' },
  { key: 'date_naissance', formKey: 'date_naissance', label: 'Date de naissance' },
  { key: 'lieu_naissance', formKey: 'ville_naissance', label: 'Lieu de naissance' },
  { key: 'nationalite', formKey: 'nationalite', label: 'Nationalité' },
  { key: 'sexe', formKey: 'sexe', label: 'Sexe' },
  { key: 'date_expiration', formKey: 'date_expiration', label: 'Date de validité' },
];

const CONF_LABEL = {
  elevee: 'Confiance élevée',
  moyenne: 'Confiance moyenne — à vérifier',
  faible: 'Confiance faible — validation obligatoire',
  non_detecte: 'Non détecté',
};

function confOf(fields, key) {
  return fields?.[key]?.confidence || (fields?.[key]?.value ? 'moyenne' : 'non_detecte');
}

function valueOf(fields, key, fallback) {
  const f = fields?.[key];
  if (f?.value) return f.value;
  if (fallback) return fallback;
  return '';
}

export default function CinVerifyModal({
  result,
  rectoPreview,
  versoPreview,
  currentForm,
  onConfirm,
  onRetry,
  onCancel,
}) {
  const fields = result?.fields || {};
  const [imagesOpen, setImagesOpen] = useState(true);
  const [edits, setEdits] = useState(() => {
    const init = {};
    FIELD_DEFS.forEach(({ key, formKey }) => {
      const fromField = valueOf(fields, key);
      const fromForm = result?.[formKey] || result?.worker_form?.[formKey] || '';
      const cands = fields?.[key]?.candidates || [];
      init[formKey] = fromField || fromForm || '';
      init[`_cand_${formKey}`] = cands;
    });
    return init;
  });

  const lowKeys = useMemo(() => {
    return FIELD_DEFS.filter(({ key, formKey }) => {
      const c = confOf(fields, key);
      const v = edits[formKey];
      return v && (c === 'faible' || c === 'moyenne');
    }).map((f) => f.formKey);
  }, [fields, edits]);

  function setVal(formKey, v) {
    setEdits((p) => ({ ...p, [formKey]: v }));
  }

  function handleConfirm() {
    const payload = {};
    FIELD_DEFS.forEach(({ formKey }) => {
      const v = String(edits[formKey] || '').trim();
      if (v) payload[formKey] = formKey === 'cin' ? v.toUpperCase() : v;
    });
    onConfirm(payload, { correctedKeys: Object.keys(payload) });
  }

  return (
    <div className="cin-verify-overlay" role="dialog" aria-modal="true" aria-label="Vérifier les informations détectées">
      <div className="cin-verify-box">
        <div className="cin-verify-header">
          <div>
            <h2>Vérifier les informations détectées</h2>
            <p className="cin-verify-sub">
              Moteur {result?.engine_used || 'citymo'}
              {result?.confidence_globale ? ` · ${CONF_LABEL[result.confidence_globale] || result.confidence_globale}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Fermer"><X size={18} /></button>
        </div>

        {(result?.warnings || []).length > 0 && (
          <div className="cin-verify-warnings">
            {(result.warnings || []).map((w, i) => (
              <div key={i}><AlertTriangle size={14} /> {w}</div>
            ))}
          </div>
        )}

        <div className="cin-verify-layout">
          <div className="cin-verify-images">
            <button type="button" className="cin-verify-images-toggle" onClick={() => setImagesOpen((v) => !v)}>
              Images CIN {imagesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {imagesOpen && (
              <div className="cin-verify-thumbs">
                <div>
                  <span>Recto</span>
                  {(result?.recto?.corrected_preview || rectoPreview) ? (
                    <img src={result?.recto?.corrected_preview || rectoPreview} alt="CIN recto" />
                  ) : <div className="cin-verify-empty">—</div>}
                  {result?.recto?.quality?.label && (
                    <small>Qualité : {result.recto.quality.label}</small>
                  )}
                </div>
                <div>
                  <span>Verso</span>
                  {(result?.verso?.corrected_preview || versoPreview) ? (
                    <img src={result?.verso?.corrected_preview || versoPreview} alt="CIN verso" />
                  ) : <div className="cin-verify-empty">Verso manquant</div>}
                  {result?.verso?.quality?.label && (
                    <small>Qualité : {result.verso.quality.label}</small>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="cin-verify-fields">
            {FIELD_DEFS.map(({ key, formKey, label }) => {
              const conf = confOf(fields, key);
              const cands = edits[`_cand_${formKey}`] || fields?.[key]?.candidates || [];
              const low = conf === 'faible' || conf === 'moyenne';
              const empty = !edits[formKey];
              return (
                <div
                  key={formKey}
                  className={
                    'cin-verify-field'
                    + (low && edits[formKey] ? ' cin-verify-field--warn' : '')
                    + (empty ? ' cin-verify-field--empty' : '')
                  }
                >
                  <div className="cin-verify-field-head">
                    <label>{label}</label>
                    <span className={'cin-conf cin-conf--' + conf}>
                      {empty ? 'Non détecté' : CONF_LABEL[conf]}
                      {low && edits[formKey] ? <AlertTriangle size={12} /> : null}
                      {conf === 'elevee' ? <CheckCircle size={12} /> : null}
                    </span>
                  </div>
                  {cands.length > 1 && (
                    <div className="cin-verify-cands">
                      {cands.map((c) => (
                        <button key={c} type="button" className="btn btn-ghost btn-sm" onClick={() => setVal(formKey, c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    value={edits[formKey] || ''}
                    onChange={(e) => setVal(formKey, formKey === 'cin' ? e.target.value.toUpperCase() : e.target.value)}
                    placeholder="Non détecté — saisie manuelle"
                  />
                  {currentForm?.[formKey] && currentForm[formKey] !== edits[formKey] && edits[formKey] && (
                    <small className="cin-verify-conflict">
                      Valeur actuelle fiche : {currentForm[formKey]}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cin-verify-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button type="button" className="btn btn-ghost" onClick={onRetry}>
            <RefreshCw size={14} /> Relancer l&apos;analyse
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm}>
            Confirmer et remplir la fiche
          </button>
        </div>
        {lowKeys.length > 0 && (
          <p className="cin-verify-hint">Vérifiez les champs en orange avant de confirmer.</p>
        )}
      </div>
    </div>
  );
}
