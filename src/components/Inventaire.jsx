/**
 * Inventaire.jsx — Router module Inventaire & Dépôt ERP CITYMO
 * État partagé entre sous-modules : articles (sync Supabase), dépôts (UI local)
 */
import { useState, useEffect } from 'react';
import CategoriesStock from './inventaire/CategoriesStock.jsx';
import ArticlesStock   from './inventaire/ArticlesStock.jsx';
import Depots          from './inventaire/Depots.jsx';
import BonsMouvements  from './inventaire/BonsMouvements.jsx';
import Stocks          from './inventaire/Stocks.jsx';
import { listStockArticles } from '../services/inventaire/stockArticles';
import { listStockCategories } from '../services/inventaire/stockCategories';

export default function Inventaire({ activeTab }) {
  const tab = activeTab || 'categories-stock';

  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [depots, setDepots] = useState([]);

  useEffect(() => {
    listStockArticles()
      .then((rows) => setArticles(rows || []))
      .catch(() => {});
    listStockCategories()
      .then((rows) => setCategories(rows || []))
      .catch(() => {});
  }, [tab]);

  return (
    <div>
      {tab === 'categories-stock' && <CategoriesStock />}
      {tab === 'articles-stock' && (
        <ArticlesStock onArticlesChange={setArticles} />
      )}
      {tab === 'depots' && (
        <Depots
          articles={articles}
          onDepotsChange={setDepots}
        />
      )}
      {tab === 'bons-mouvements' && (
        <BonsMouvements
          articles={articles}
          onArticlesChange={setArticles}
        />
      )}
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
