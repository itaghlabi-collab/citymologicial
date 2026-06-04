/**
 * Projets.jsx — Routeur principal du module Projets ERP CITYMO
 * Expose 3 sous-modules : Projets / SAV / Comptes rendus SAV
 */

import { useState, useEffect } from 'react';
import ProjetsList from './projets/ProjetsList';
import SAVModule from './projets/SAVModule';
import ComptesRendusSAV from './projets/ComptesRendusSAV';

/**
 * Ce composant reçoit la prop `activeTab` transmise par App.jsx
 * selon l'ID de navigation actif : 'projets' | 'sav-projets' | 'cr-sav'
 */
export default function Projets({ activeTab }) {
  const resolvedTab = activeTab || 'projets';

  // Navigation interne (ex. bouton SAV depuis un projet) — ne doit pas bloquer la sidebar
  const [internalTab, setInternalTab] = useState(null);
  const [prefillSAVProjet, setPrefillSAVProjet] = useState(null);
  const [prefillCRSAV, setPrefillCRSAV] = useState(null);

  // Sidebar = source de vérité : réinitialiser l'override interne au changement d'onglet
  useEffect(() => {
    setInternalTab(null);
    setPrefillSAVProjet(null);
    setPrefillCRSAV(null);
  }, [resolvedTab]);

  const tab = internalTab || resolvedTab;

  function handleGoSAV(projet) {
    setPrefillSAVProjet(projet);
    setInternalTab('sav-projets');
  }

  function handleGoCompteRendu(sav) {
    setPrefillCRSAV(sav);
    setInternalTab('cr-sav');
  }

  return (
    <div>
      {tab === 'projets' && (
        <ProjetsList key="projets-list" onCreateSAV={handleGoSAV} />
      )}
      {tab === 'sav-projets' && (
        <SAVModule
          key={prefillSAVProjet?.id ? `sav-prefill-${prefillSAVProjet.id}` : 'sav-list'}
          prefillProjet={prefillSAVProjet}
          onGoCompteRendu={handleGoCompteRendu}
        />
      )}
      {tab === 'cr-sav' && (
        <ComptesRendusSAV
          key={prefillCRSAV?.id ? `cr-prefill-${prefillCRSAV.id}` : 'cr-list'}
          prefillSAV={prefillCRSAV}
        />
      )}
    </div>
  );
}
