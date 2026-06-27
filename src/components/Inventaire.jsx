/**
 * Inventaire.jsx — Router module Inventaire & Dépôt ERP CITYMO
 * État partagé entre sous-modules : articles (sync Supabase), dépôts (UI local)
 */
import { useState, useEffect, useCallback } from 'react';
import CategoriesStock from './inventaire/CategoriesStock.jsx';
import ArticlesStock   from './inventaire/ArticlesStock.jsx';
import Depots          from './inventaire/Depots.jsx';
import BonsMouvements  from './inventaire/BonsMouvements.jsx';
import DemandesChantier from './inventaire/DemandesChantier.jsx';
import Stocks          from './inventaire/Stocks.jsx';
import { listStockArticles } from '../services/inventaire/stockArticles';
import { listStockCategories } from '../services/inventaire/stockCategories';
import { ensureStockWarehousesSeeded } from '../services/inventaire/stockWarehouses';
import { EMPLACEMENTS_STOCK } from './inventaire/shared.jsx';

export default function Inventaire({ activeTab, initialArticleCode, onArticleCodeConsumed }) {
  const tab = activeTab || 'categories-stock';

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [depots, setDepots] = useState([]);
  const [emplacementNoms, setEmplacementNoms] = useState(EMPLACEMENTS_STOCK);

  useEffect(() => {
    listStockArticles()
      .then((rows) => setArticles(rows || []))
      .catch(() => {});
    listStockCategories()
      .then((rows) => setCategories(rows || []))
      .catch(() => {});
    ensureStockWarehousesSeeded(EMPLACEMENTS_STOCK)
      .then((rows) => {
        if (rows?.length) setEmplacementNoms(rows.map((r) => r.nom));
      })
      .catch(() => {});
  }, [tab]);

  const handleDepotsChange = useCallback((list) => {
    setDepots(list);
    if (list?.length) setEmplacementNoms(list.map((d) => d.nom));
  }, []);

  return (
    <div className="inventaire-module">
      {tab === 'categories-stock' && <CategoriesStock />}
      {tab === 'articles-stock' && (
        <ArticlesStock
          onArticlesChange={setArticles}
          emplacementsList={emplacementNoms}
          initialArticleCode={initialArticleCode}
          onArticleCodeConsumed={onArticleCodeConsumed}
        />
      )}
      {tab === 'depots' && (
        <Depots
          articles={articles}
          onDepotsChange={handleDepotsChange}
        />
      )}
      {tab === 'bons-mouvements' && (
        <BonsMouvements
          articles={articles}
          onArticlesChange={setArticles}
        />
      )}
      {tab === 'demandes-chantier' && <DemandesChantier />}
      {tab === 'stocks' && (
        <Stocks
          articles={articles}
          categories={categories}
          depots={depots}
        />
      )}
    </div>
  );
}
