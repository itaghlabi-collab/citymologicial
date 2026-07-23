import { useState, useRef } from 'react';
import PaiementSousTraitantsSection from './PaiementSousTraitantsSection';
import SituationSousTraitantCompte from './SituationSousTraitantCompte';
import SituationCalculPage from './SituationCalculPage';

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
}

/** Situation sous-traitants = compte courant + situations + avances + calcul. */
export default function SituationSousTraitants() {
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const [compteId, setCompteId] = useState(null);
  const [calculForId, setCalculForId] = useState(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  if (calculForId) {
    return (
      <>
        <Toast toast={toast} />
        <SituationCalculPage
          initialSubcontractorId={calculForId === '__new__' ? '' : calculForId}
          onBack={() => {
            const backId = calculForId === '__new__' ? null : calculForId;
            setCalculForId(null);
            if (backId) setCompteId(backId);
          }}
          onNotify={notify}
          onSaved={() => {
            if (calculForId && calculForId !== '__new__') setCompteId(calculForId);
          }}
        />
      </>
    );
  }

  if (compteId) {
    return (
      <>
        <Toast toast={toast} />
        <SituationSousTraitantCompte
          subcontractorId={compteId}
          onBack={() => setCompteId(null)}
          onNotify={notify}
          onNewSituation={(id) => setCalculForId(id || compteId)}
        />
      </>
    );
  }

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">Situation sous-traitants</h1>
          <p className="page-subtitle finance-sub-hide-mobile">
            Compte courant — situations multi-projets, avances globales, reliquat et historique
          </p>
        </div>
        <div className="finance-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCalculForId('__new__')}>
            Nouvelle situation
          </button>
        </div>
      </div>

      <PaiementSousTraitantsSection
        onNotify={notify}
        standalone
        variant="accounts"
        onOpenAccount={setCompteId}
      />
    </div>
  );
}
