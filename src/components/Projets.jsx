/**
 * Projets.jsx — Routeur principal du module Projets ERP CITYMO
 * Expose 3 sous-modules : Projets / SAV / Comptes rendus SAV
 */

import { useState } from 'react';
import ProjetsList from './projets/ProjetsList';
import SAVModule from './projets/SAVModule';
import ComptesRendusSAV from './projets/ComptesRendusSAV';

/**
 * Ce composant reçoit la prop `activeTab` transmise par App.jsx
 * selon l'ID de navigation actif : 'projets' | 'sav-projets' | 'cr-sav'
 */
export default function Projets({ activeTab }) {
  // État croisé entre sous-modules (workflow SAV → CR)
  const [prefillSAVProjet, setPrefillSAVProjet] = useState(null);
  const [prefillCRSAV, setPrefillCRSAV] = useState(null);
  const [forceTab, setForceTab] = useState(null);

  const tab = forceTab || activeTab || 'projets';

  function handleGoSAV(projet) {
    setPrefillSAVProjet(projet);
    setForceTab('sav-projets');
  }

  function handleGoCompteRendu(sav) {
    setPrefillCRSAV(sav);
    setForceTab('cr-sav');
  }

  function handleTabChange(t) {
    setForceTab(t);
    if (t !== 'sav-projets') setPrefillSAVProjet(null);
    if (t !== 'cr-sav') setPrefillCRSAV(null);
  }

  return (
    <div>
      {tab === 'projets'     && <ProjetsList       onGoSAV={handleGoSAV} />}
      {tab === 'sav-projets' && <SAVModule         prefillProjet={prefillSAVProjet} onGoCompteRendu={handleGoCompteRendu} />}
      {tab === 'cr-sav'      && <ComptesRendusSAV  prefillSAV={prefillCRSAV} />}
    </div>
  );
}
