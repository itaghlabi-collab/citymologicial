import { useState, useRef } from 'react';
import PaiementSousTraitantsSection from './PaiementSousTraitantsSection';

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
}

/** Rubrique dédiée au suivi des paiements sous-traitants. */
export default function SituationSousTraitants() {
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Situation sous-traitants</h1>
          <p className="page-subtitle">
            Suivi des paiements par projet — mètre / tâche / service, avances, retenues et historique
          </p>
        </div>
      </div>

      <PaiementSousTraitantsSection onNotify={notify} standalone />
    </div>
  );
}
