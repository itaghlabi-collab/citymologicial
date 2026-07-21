/**
 * FournisseursAnnuaire.jsx — Vue annuaire (cartes + recherche) — complémentaire à la liste.
 * Ne remplace pas la liste existante ; lecture/actions via callbacks parents.
 */
import { useMemo, useState } from 'react';
import {
  Search, Star, Phone, Mail, MessageCircle, Eye, Edit2, MoreHorizontal,
  Truck, Wrench, ShieldCheck, BadgeCheck, MapPin, X,
} from 'lucide-react';
import { INPUT_STYLE, SELECT_STYLE } from './shared.jsx';
import { mailHref, telHref, whatsappHref } from '../../services/achats/supplierAnnuaire';

function badgeStatut(statut) {
  if (statut === 'Actif') return 'badge-green';
  if (statut === 'Archivé') return 'badge-orange';
  return 'badge-grey';
}

function SupplierCard({
  item,
  isFavorite,
  onView,
  onEdit,
  onToggleFavorite,
  onCreateBC,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wa = whatsappHref(item.whatsapp || item.phone);
  const tel = telHref(item.phone);
  const mail = mailHref(item.email);
  const brands = String(item.brands || '').split(/[,;]/).map((b) => b.trim()).filter(Boolean).slice(0, 3);

  return (
    <article className="achats-annuaire-card">
      <header className="achats-annuaire-card-head">
        <div className="achats-annuaire-card-titles">
          <h3 className="achats-annuaire-card-name">{item.company_name}</h3>
          {item.trade_name && <p className="achats-annuaire-card-trade">{item.trade_name}</p>}
        </div>
        <button
          type="button"
          className={`achats-annuaire-fav ${isFavorite ? 'is-on' : ''}`}
          title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={() => onToggleFavorite(item)}
        >
          <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      <div className="achats-annuaire-meta">
        <span className="achats-annuaire-cat">{item.supplier_category || 'Sans catégorie'}</span>
        {item.city && (
          <span className="achats-annuaire-city">
            <MapPin size={12} /> {item.city}
          </span>
        )}
        <span className={`badge ${badgeStatut(item.statut)}`}>{item.statut}</span>
      </div>

      <div className="achats-annuaire-contacts">
        {item.phone && <div><Phone size={12} /> {item.phone}</div>}
        {item.whatsapp && <div><MessageCircle size={12} /> {item.whatsapp}</div>}
        {item.email && <div className="achats-annuaire-email"><Mail size={12} /> {item.email}</div>}
        {item.main_contact && <div>Contact : {item.main_contact}</div>}
      </div>

      {brands.length > 0 && (
        <div className="achats-annuaire-brands">
          {brands.map((b) => <span key={b} className="achats-annuaire-chip">{b}</span>)}
        </div>
      )}

      <div className="achats-annuaire-badges">
        {item.is_recommended && <span className="achats-annuaire-flag achats-annuaire-flag--rec"><BadgeCheck size={12} /> Recommandé</span>}
        {item.delivery_available && <span className="achats-annuaire-flag"><Truck size={12} /> Livraison</span>}
        {item.installation_available && <span className="achats-annuaire-flag"><Wrench size={12} /> Installation</span>}
        {item.sav_available && <span className="achats-annuaire-flag"><ShieldCheck size={12} /> SAV</span>}
      </div>

      <footer className="achats-annuaire-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onView(item)}><Eye size={13} /> Voir</button>
        {tel && <a className="btn btn-ghost btn-sm" href={tel}><Phone size={13} /> Appeler</a>}
        {wa && <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
        {mail && <a className="btn btn-ghost btn-sm" href={mail}><Mail size={13} /> Email</a>}
        <div className="achats-annuaire-more">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMenuOpen((v) => !v)} aria-label="Plus d’actions">
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="achats-annuaire-menu">
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(item); }}><Edit2 size={12} /> Modifier</button>
              <button type="button" onClick={() => { setMenuOpen(false); onCreateBC?.(item); }}>Créer un bon de commande</button>
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}

export default function FournisseursAnnuaire({
  items,
  categories,
  favoriteIds,
  onView,
  onEdit,
  onToggleFavorite,
  onCreateBC,
}) {
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatut, setFilterStatut] = useState('Actif');
  const [filterRec, setFilterRec] = useState('');
  const [filterDelivery, setFilterDelivery] = useState(false);
  const [filterInstall, setFilterInstall] = useState(false);
  const [filterSav, setFilterSav] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [sortBy, setSortBy] = useState('name');

  const cities = useMemo(() => {
    const set = new Set();
    (items || []).forEach((x) => { if (x.city?.trim()) set.add(x.city.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = (items || []).filter((x) => {
      if (onlyFav && !favoriteIds?.has(x.id)) return false;
      if (filterStatut && x.statut !== filterStatut) return false;
      if (filterCity && (x.city || '') !== filterCity) return false;
      if (filterRec === 'yes' && !x.is_recommended) return false;
      if (filterRec === 'no' && x.is_recommended) return false;
      if (filterDelivery && !x.delivery_available) return false;
      if (filterInstall && !x.installation_available) return false;
      if (filterSav && !x.sav_available) return false;
      if (filterCat) {
        const byId = x.primary_category_id === filterCat || (x.category_ids || []).includes(filterCat);
        const byName = x.supplier_category === filterCat
          || (x.categories || []).some((c) => c.id === filterCat || c.name === filterCat);
        if (!byId && !byName) return false;
      }
      if (!query) return true;
      const hay = [
        x.company_name, x.trade_name, x.supplier_category, x.products_services, x.brands,
        x.city, x.region, x.main_contact, x.phone, x.whatsapp, x.email,
        ...(x.categories || []).map((c) => c.name),
      ].join(' ').toLowerCase();
      return hay.includes(query);
    });

    list = list.slice().sort((a, b) => {
      if (sortBy === 'city') return String(a.city || '').localeCompare(String(b.city || ''), 'fr') || String(a.company_name).localeCompare(String(b.company_name), 'fr');
      if (sortBy === 'category') return String(a.supplier_category || '').localeCompare(String(b.supplier_category || ''), 'fr') || String(a.company_name).localeCompare(String(b.company_name), 'fr');
      if (sortBy === 'recommended') return (b.is_recommended ? 1 : 0) - (a.is_recommended ? 1 : 0) || String(a.company_name).localeCompare(String(b.company_name), 'fr');
      return String(a.company_name || '').localeCompare(String(b.company_name || ''), 'fr');
    });
    return list;
  }, [items, q, filterCat, filterCity, filterStatut, filterRec, filterDelivery, filterInstall, filterSav, onlyFav, favoriteIds, sortBy]);

  function resetFilters() {
    setQ('');
    setFilterCat('');
    setFilterCity('');
    setFilterStatut('Actif');
    setFilterRec('');
    setFilterDelivery(false);
    setFilterInstall(false);
    setFilterSav(false);
    setOnlyFav(false);
    setSortBy('name');
  }

  return (
    <div className="achats-annuaire">
      <div className="achats-annuaire-search card">
        <div className="achats-annuaire-search-row">
          <Search size={16} className="achats-annuaire-search-icon" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher nom, catégorie, produit, marque, ville, contact, téléphone, email…"
            style={{ ...INPUT_STYLE, paddingLeft: 36 }}
          />
        </div>
        <div className="achats-annuaire-filters">
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={SELECT_STYLE}>
            <option value="">Toutes catégories</option>
            {(categories || []).map((c) => <option key={c.id || c} value={c.id || c}>{c.name || c}</option>)}
          </select>
          <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)} style={SELECT_STYLE}>
            <option value="">Toutes villes</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={SELECT_STYLE}>
            <option value="">Tous statuts</option>
            <option value="Actif">Actif</option>
            <option value="Inactif">Inactif</option>
            <option value="Archivé">Archivé</option>
          </select>
          <select value={filterRec} onChange={(e) => setFilterRec(e.target.value)} style={SELECT_STYLE}>
            <option value="">Recommandé : tous</option>
            <option value="yes">Recommandés</option>
            <option value="no">Non recommandés</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={SELECT_STYLE}>
            <option value="name">Tri : nom</option>
            <option value="city">Tri : ville</option>
            <option value="category">Tri : catégorie</option>
            <option value="recommended">Tri : recommandé</option>
          </select>
          <label className="achats-annuaire-check"><input type="checkbox" checked={filterDelivery} onChange={(e) => setFilterDelivery(e.target.checked)} /> Livraison</label>
          <label className="achats-annuaire-check"><input type="checkbox" checked={filterInstall} onChange={(e) => setFilterInstall(e.target.checked)} /> Installation</label>
          <label className="achats-annuaire-check"><input type="checkbox" checked={filterSav} onChange={(e) => setFilterSav(e.target.checked)} /> SAV</label>
          <label className="achats-annuaire-check"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favoris seuls</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}><X size={13} /> Réinitialiser les filtres</button>
        </div>
        <div className="achats-annuaire-count">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
          Aucun fournisseur ne correspond aux filtres.
        </div>
      ) : (
        <div className="achats-annuaire-grid">
          {filtered.map((item) => (
            <SupplierCard
              key={item.id}
              item={item}
              isFavorite={favoriteIds?.has(item.id)}
              onView={onView}
              onEdit={onEdit}
              onToggleFavorite={onToggleFavorite}
              onCreateBC={onCreateBC}
            />
          ))}
        </div>
      )}
    </div>
  );
}
