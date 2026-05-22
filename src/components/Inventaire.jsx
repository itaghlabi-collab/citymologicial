/**
 * Inventaire.jsx — Router module Inventaire & Dépôt ERP CITYMO
 * État partagé entre sous-modules : catégories, articles, dépôts
 */
import { useState } from 'react';
import CategoriesStock from './inventaire/CategoriesStock.jsx';
import ArticlesStock   from './inventaire/ArticlesStock.jsx';
import Depots          from './inventaire/Depots.jsx';
import BonsMouvements  from './inventaire/BonsMouvements.jsx';
import Stocks          from './inventaire/Stocks.jsx';

export default function Inventaire({ activeTab }) {
  const tab = activeTab || 'categories-stock';

  // États partagés entre sous-modules
  const [categories, setCategories] = useState([]);
  const [articles,   setArticles]   = useState([]);
  const [depots,     setDepots]     = useState([]);

  return (
    <div>
      {tab === 'categories-stock' && (
        <CategoriesStock
          articles={articles}
          onCategoriesChange={setCategories}
        />
      )}
      {tab === 'articles-stock' && (
        <ArticlesStock
          categories={categories}
          depots={depots}
          onArticlesChange={setArticles}
        />
      )}
      {tab === 'depots' && (
        <Depots
          articles={articles}
          onDepotsChange={setDepots}
        />
      )}
      {tab === 'bons-mouvements' && (
        <BonsMouvements
          depots={depots}
          articles={articles}
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
