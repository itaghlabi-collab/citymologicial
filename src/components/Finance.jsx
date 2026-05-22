/**
 * Finance.jsx — Routeur module Finance & Trésorerie ERP CITYMO
 * Gère les 3 sous-modules: CategoriesCharge, Charges, OrdresPaiement
 */
import { useState } from 'react';
import CategoriesCharge from './finance/CategoriesCharge.jsx';
import Charges from './finance/Charges.jsx';
import OrdresPaiement from './finance/OrdresPaiement.jsx';

export default function Finance({ activeTab }) {
  // Shared state: categories propagated to Charges module
  const [categories, setCategories] = useState([]);

  const tab = activeTab || 'categories-charge';

  return (
    <div>
      {tab === 'categories-charge' && (
        <CategoriesCharge
          charges={[]}
          onCategoriesChange={setCategories}
        />
      )}
      {tab === 'charges' && (
        <Charges categories={categories} />
      )}
      {tab === 'ordres-paiement' && (
        <OrdresPaiement />
      )}
    </div>
  );
}
