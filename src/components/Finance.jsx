/**
 * Finance.jsx — Routeur module Finance & Trésorerie ERP CITYMO
 */
import { useEffect } from 'react';
import FinanceDashboard from './finance/FinanceDashboard.jsx';
import CategoriesCharge from './finance/CategoriesCharge.jsx';
import Charges from './finance/Charges.jsx';
import FeuilleCaisse from './finance/FeuilleCaisse.jsx';
import OrdresPaiement from './finance/OrdresPaiement.jsx';
import { useChargeCategories } from '../hooks/useChargeCategories';

export default function Finance({ activeTab }) {
  const { records: categories, reload: reloadCategories } = useChargeCategories();

  useEffect(() => {
    if (activeTab === 'charges' || activeTab === 'ordres-paiement') reloadCategories();
  }, [activeTab, reloadCategories]);

  const tab = activeTab || 'finance-dashboard';

  return (
    <div className="finance-module">
      {tab === 'finance-dashboard' && <FinanceDashboard />}
      {tab === 'categories-charge' && <CategoriesCharge />}
      {tab === 'charges' && <Charges categories={categories} />}
      {tab === 'feuille-caisse' && <FeuilleCaisse />}
      {tab === 'ordres-paiement' && <OrdresPaiement categories={categories} />}
    </div>
  );
}
