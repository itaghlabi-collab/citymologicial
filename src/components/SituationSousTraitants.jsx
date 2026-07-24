import { useEffect, useRef, useState } from 'react';
import PaiementSousTraitantsSection from './PaiementSousTraitantsSection';
import SituationSousTraitantCompte from './SituationSousTraitantCompte';
import SituationCalculPage from './SituationCalculPage';
import {
  parseSousTraitantPath,
  syncSousTraitantRoute,
} from '../services/rh/sousTraitantRoutes';

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
}

/** Situation sous-traitants = compte courant + fiche 5 onglets + URL /sous-traitants/:id */
export default function SituationSousTraitants({
  initialCompteId = null,
  initialTab = 'finance',
}) {
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const [compteId, setCompteId] = useState(initialCompteId);
  const [ficheTab, setFicheTab] = useState(initialTab || 'finance');
  const [calculForId, setCalculForId] = useState(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Sync props → state (deep link App)
  useEffect(() => {
    if (initialCompteId) {
      setCompteId(initialCompteId);
      setFicheTab(initialTab || 'finance');
    }
  }, [initialCompteId, initialTab]);

  // Bootstrap from URL if opened directly
  useEffect(() => {
    const parsed = parseSousTraitantPath();
    if (parsed?.id) {
      setCompteId(parsed.id);
      setFicheTab(parsed.tab || 'finance');
    }
  }, []);

  // Keep URL in sync with fiche
  useEffect(() => {
    if (calculForId) return;
    if (compteId) {
      syncSousTraitantRoute(compteId, ficheTab);
    } else if (parseSousTraitantPath()) {
      syncSousTraitantRoute(null);
    }
  }, [compteId, ficheTab, calculForId]);

  // Browser back/forward
  useEffect(() => {
    function onPop() {
      const parsed = parseSousTraitantPath();
      if (parsed?.id) {
        setCalculForId(null);
        setCompteId(parsed.id);
        setFicheTab(parsed.tab || 'finance');
      } else {
        setCalculForId(null);
        setCompteId(null);
      }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function openCompte(id, tab = 'finance') {
    setCalculForId(null);
    setCompteId(id);
    setFicheTab(tab);
  }

  function closeCompte() {
    setCompteId(null);
    syncSousTraitantRoute(null);
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
            if (backId) openCompte(backId);
          }}
          onNotify={notify}
          onSaved={() => {
            if (calculForId && calculForId !== '__new__') openCompte(calculForId);
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
          initialTab={ficheTab}
          onTabChange={setFicheTab}
          onBack={closeCompte}
          onNotify={notify}
          onNewSituation={(id) => setCalculForId(id || compteId)}
          onNewPayment={(id) => setCalculForId(id || compteId)}
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
            Compte courant — situation financière, travaux, documents, historique et performance
          </p>
        </div>
        <div className="finance-page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCalculForId('__new__')}>
            Situation / Travaux
          </button>
        </div>
      </div>

      <PaiementSousTraitantsSection
        onNotify={notify}
        standalone
        variant="accounts"
        onOpenAccount={(id) => openCompte(id)}
      />
    </div>
  );
}
