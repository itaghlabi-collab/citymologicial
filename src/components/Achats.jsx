/**
 * Achats.jsx — Router module Achats ERP CITYMO
 * L'état des fournisseurs est partagé ici pour être accessible par BonsCommande, OrdresAchat, etc.
 */
import { useState } from 'react';
import DemandesAchat    from './achats/DemandesAchat.jsx';
import BonsCommande     from './achats/BonsCommande.jsx';
import Fournisseurs     from './achats/Fournisseurs.jsx';
import OrdresAchat      from './achats/OrdresAchat.jsx';
import OrdresPaiementAchats from './achats/OrdresPaiementAchats.jsx';

export default function Achats({ activeTab }) {
  const tab = activeTab || 'demandes-achat';

  // État partagé : liste des fournisseurs enregistrés
  const [fournisseursList, setFournisseursList] = useState([]);

  return (
    <div>
      {tab === 'demandes-achat'    && <DemandesAchat />}
      {tab === 'bons-commande'     && <BonsCommande />}
      {tab === 'fournisseurs'      && <Fournisseurs onFournisseursChange={setFournisseursList} />}
      {tab === 'ordres-achat'      && <OrdresAchat />}
      {tab === 'ordres-paiement-achats' && <OrdresPaiementAchats />}
    </div>
  );
}
