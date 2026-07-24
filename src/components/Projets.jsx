/**
 * Projets.jsx — Routeur principal du module Projets ERP CITYMO
 * Expose : Projets / Demande d'engin de location / SAV / Comptes rendus SAV
 */

import { useState, useEffect } from 'react';
import ProjetsList from './projets/ProjetsList';
import SAVModule from './projets/SAVModule';
import ComptesRendusSAV from './projets/ComptesRendusSAV';
import DemandesEnginsLocation from './projets/DemandesEnginsLocation';

/**
 * Ce composant reçoit la prop `activeTab` transmise par App.jsx
 * selon l'ID de navigation actif : 'projets' | 'demandes-engins' | 'sav-projets' | 'cr-sav'
 */
export default function Projets({ activeTab }) {
  const resolvedTab = activeTab || 'projets';

  const [internalTab, setInternalTab] = useState(null);
  const [prefillSAVProjet, setPrefillSAVProjet] = useState(null);
  const [prefillCRSAV, setPrefillCRSAV] = useState(null);

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
      {tab === 'demandes-engins' && (
        <DemandesEnginsLocation key="demandes-engins" />
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
