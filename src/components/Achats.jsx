/**
 * Achats.jsx — Router module Achats ERP CITYMO
 * L'état des fournisseurs est partagé ici pour être accessible par BonsCommande, OrdresAchat, etc.
 */
import { useState } from 'react';
import DemandesAchat    from './achats/DemandesAchat.jsx';
import BonsCommande     from './achats/BonsCommande.jsx';
import Fournisseurs     from './achats/Fournisseurs.jsx';
import ComparaisonDevis from './achats/ComparaisonDevis.jsx';
import OrdresAchat      from './achats/OrdresAchat.jsx';

export default function Achats({ activeTab }) {
  const tab = activeTab || 'demandes-achat';

  // État partagé : liste des fournisseurs enregistrés
  const [fournisseursList, setFournisseursList] = useState([]);

  return (
    <div>
      {tab === 'demandes-achat'    && <DemandesAchat />}
      {tab === 'bons-commande'     && <BonsCommande fournisseurs={fournisseursList} />}
      {tab === 'fournisseurs'      && <Fournisseurs onFournisseursChange={setFournisseursList} />}
      {tab === 'comparaison-devis' && <ComparaisonDevis fournisseurs={fournisseursList} />}
      {tab === 'ordres-achat'      && <OrdresAchat fournisseurs={fournisseursList} />}
    </div>
  );
}
