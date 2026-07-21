/**
 * FournisseurFiche.jsx — Fiche détaillée enrichie (complément annuaire).
 * Liens achats en lecture seule uniquement.
 */
import { useEffect, useState } from 'react';
import {
  UserCog, Edit2, Archive, Phone, Mail, MapPin, Tag, Star,
  MessageCircle, Truck, Wrench, ShieldCheck, BadgeCheck, ExternalLink, Loader2,
} from 'lucide-react';
import { SectionTitle } from './shared.jsx';
import {
  listExpensesForSupplierName,
  listPurchaseOrdersForSupplier,
  mailHref,
  pushRecentSupplier,
  telHref,
  whatsappHref,
} from '../../services/achats/supplierAnnuaire';

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)', gap: 12 }}>
      <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

function yn(v) {
  return v ? 'Oui' : 'Non';
}

function badgeStatut(statut) {
  if (statut === 'Actif') return 'badge-green';
  if (statut === 'Archivé') return 'badge-orange';
  return 'badge-grey';
}

export default function FournisseurFiche({
  item,
  isFavorite,
  onBack,
  onEdit,
  onArchive,
  onToggleFavorite,
  onCreateBC,
  onNavigate,
}) {
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  useEffect(() => {
    if (!item?.id) return undefined;
    pushRecentSupplier(item.id);
    let cancelled = false;
    (async () => {
      setLoadingLinks(true);
      const [o, e] = await Promise.all([
        listPurchaseOrdersForSupplier(item.id),
        listExpensesForSupplierName(item.company_name),
      ]);
      if (!cancelled) {
        setOrders(o);
        setExpenses(e);
        setLoadingLinks(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item?.id, item?.company_name]);

  if (!item) return null;

  const secondaryNames = (item.secondary_categories || []).map((c) => c.name).filter(Boolean).join(', ');
  const wa = whatsappHref(item.whatsapp || item.phone);
  const tel = telHref(item.phone);
  const mail = mailHref(item.email);

  return (
    <div className="animate-fade-in achats-fourn-fiche">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={onBack}>← Retour</button>

      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCog size={22} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{item.company_name}</h1>
            <p className="page-subtitle">
              {item.trade_name ? `${item.trade_name} · ` : ''}
              {item.supplier_category || 'Fournisseur'}
              {' · '}
              <span className={`badge ${badgeStatut(item.statut)}`} style={{ fontSize: '0.72rem' }}>{item.statut}</span>
              {item.is_recommended && <span className="badge badge-green" style={{ fontSize: '0.72rem', marginLeft: 6 }}>Recommandé</span>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggleFavorite?.(item)}>
            <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? 'Retirer favori' : 'Favori'}
          </button>
          {tel && <a className="btn btn-ghost btn-sm" href={tel}><Phone size={13} /> Appeler</a>}
          {wa && <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
          {mail && <a className="btn btn-ghost btn-sm" href={mail}><Mail size={13} /> Email</a>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onCreateBC?.(item)}>Créer un BC</button>
          {item.status !== 'archived' && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onArchive(item.id)}>
              <Archive size={13} /> Archiver
            </button>
          )}
        </div>
      </div>

      <div className="achats-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<UserCog size={13} />}>Informations générales</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Raison sociale" value={item.company_name} />
            <DetailRow label="Nom commercial" value={item.trade_name} />
            <DetailRow label="ICE" value={item.ice} />
            <DetailRow label="IF" value={item.tax_id} />
            <DetailRow label="RC" value={item.rc} />
            <DetailRow label="CNSS" value={item.cnss} />
            <DetailRow label="Site web" value={item.website ? <a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer">{item.website}</a> : null} />
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={<MapPin size={13} />}>Adresse & zone</SectionTitle>
          <DetailRow label="Adresse" value={item.address} />
          <DetailRow label="Ville" value={item.city} />
          <DetailRow label="Région" value={item.region} />
          <DetailRow label="Zone livraison" value={item.delivery_zone} />
          <DetailRow label="Délai moyen" value={item.avg_delivery_delay} />
        </div>

        <div className="card">
          <SectionTitle icon={<Phone size={13} />}>Contacts</SectionTitle>
          <DetailRow label="Tél. principal" value={item.phone} />
          <DetailRow label="Tél. secondaire" value={item.phone_secondary} />
          <DetailRow label="WhatsApp" value={item.whatsapp} />
          <DetailRow label="Email" value={item.email} />
          <DetailRow label="Contact" value={item.main_contact} />
          <DetailRow label="Fonction" value={item.contact_role} />
          <DetailRow label="Tél. contact" value={item.contact_phone} />
          <DetailRow label="Email contact" value={item.contact_email} />
        </div>

        <div className="card">
          <SectionTitle icon={<Tag size={13} />}>Catégories & offre</SectionTitle>
          <DetailRow label="Principale" value={item.supplier_category} />
          <DetailRow label="Secondaires" value={secondaryNames} />
          <DetailRow label="Produits / services" value={item.products_services} />
          <DetailRow label="Marques" value={item.brands} />
        </div>

        <div className="card">
          <SectionTitle icon={<Truck size={13} />}>Conditions commerciales</SectionTitle>
          <DetailRow label="Délai paiement" value={item.payment_terms} />
          <DetailRow label="Mode règlement" value={item.preferred_payment_method} />
          <DetailRow label="Min. commande" value={item.min_order_amount !== '' && item.min_order_amount != null ? String(item.min_order_amount) : ''} />
          <DetailRow label="Banque" value={item.bank} />
          <DetailRow label="RIB" value={item.rib} />
          <DetailRow label="Livraison" value={yn(item.delivery_available)} />
          <DetailRow label="Installation" value={yn(item.installation_available)} />
          <DetailRow label="SAV" value={yn(item.sav_available)} />
          <DetailRow label="Recommandé" value={yn(item.is_recommended)} />
        </div>

        <div className="card">
          <SectionTitle icon={<BadgeCheck size={13} />}>Suivi</SectionTitle>
          <DetailRow label="Créé le" value={item.date_creation} />
          <DetailRow label="Mis à jour" value={item.updated_at ? String(item.updated_at).slice(0, 16).replace('T', ' ') : ''} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {item.delivery_available && <span className="achats-annuaire-flag"><Truck size={12} /> Livraison</span>}
            {item.installation_available && <span className="achats-annuaire-flag"><Wrench size={12} /> Installation</span>}
            {item.sav_available && <span className="achats-annuaire-flag"><ShieldCheck size={12} /> SAV</span>}
          </div>
        </div>

        {item.notes && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <SectionTitle icon={<UserCog size={13} />}>Notes internes</SectionTitle>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{item.notes}</p>
          </div>
        )}

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <SectionTitle icon={<ExternalLink size={13} />}>Historique achats (lecture seule)</SectionTitle>
          {loadingLinks ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
              <Loader2 size={14} className="cin-spin" /> Chargement…
            </div>
          ) : (
            <div className="achats-fourn-fiche-links">
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>Bons de commande ({orders.length})</h4>
                {orders.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.8rem' }}>Aucun BC lié à ce fournisseur.</p>
                ) : (
                  <ul className="achats-fourn-fiche-list">
                    {orders.map((o) => (
                      <li key={o.id}>
                        <strong>{o.ref || o.id.slice(0, 8)}</strong>
                        <span>{o.date || '—'}</span>
                        <span>{o.status || '—'}</span>
                        <span>{o.total_ttc != null ? `${Number(o.total_ttc).toLocaleString('fr-FR')} MAD` : '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => onNavigate?.('bons-commande')}>
                  Voir les bons de commande
                </button>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>Dépenses liées ({expenses.length})</h4>
                {expenses.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: '0.8rem' }}>Aucune dépense nommée exactement comme ce fournisseur.</p>
                ) : (
                  <ul className="achats-fourn-fiche-list">
                    {expenses.map((e) => (
                      <li key={e.id}>
                        <strong>{e.categorie || 'Dépense'}</strong>
                        <span>{e.date || '—'}</span>
                        <span>{e.montant != null ? `${Number(e.montant).toLocaleString('fr-FR')} MAD` : '—'}</span>
                        <span>{e.statut || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: 'var(--text-3)' }}>
            Aucune logique de commande, paiement ou dépense n’est modifiée ici — affichage uniquement.
          </p>
        </div>
      </div>
    </div>
  );
}
