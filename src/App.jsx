import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { initNotificationSoundUnlock, unlockNotificationSound } from './utils/notificationSound';
import './App.css';
import NotificationCenter from './components/notifications/NotificationCenter';
import UserProfileMenu from './components/dashboard/UserProfileMenu';
import ForcePasswordChangeModal from './components/dashboard/ForcePasswordChangeModal';
import PwaInstallButton from './pwa/PwaInstallButton';
import PwaSafeBoundary from './pwa/PwaSafeBoundary';
import { navigateFromPushUrl, parseModuleFromSearch } from './pwa/pushNavigate';

import Dashboard from './components/Dashboard';
import RH from './components/RH';
import Taches from './components/Taches';
import RendezVous from './components/RendezVous';
import AgendaDirection from './components/AgendaDirection';
import Departements from './components/Departements';
import Conges from './components/Conges';
import DemandesRessources from './components/DemandesRessources';
import OuvriersListe from './components/OuvriersListe';
import Presence from './components/Presence';
import HeuresSupp from './components/HeuresSupp';
import PaiementHebdo from './components/PaiementHebdo';
import SituationSousTraitants from './components/SituationSousTraitants';
import SousTraitants from './components/SousTraitants';
import Clients from './components/crm/Clients';
import Articles from './components/crm/Articles';
import Categories from './components/crm/Categories';
import Devis from './components/crm/Devis';
import Factures from './components/crm/Factures';
import BonLivraison from './components/crm/BonLivraison';
import Prospects from './components/commercial/Prospects';
import DevisAttente from './components/commercial/DevisAttente';
import PlanningCommercial from './components/commercial/PlanningCommercial';
import ActionsMarketing from './components/commercial/ActionsMarketing';
import ComptesRendus from './components/commercial/ComptesRendus';
import DepensesCom from './components/commercial/Depenses';
import PropositionsMarketing from './components/commercial/PropositionsMarketing';
import Projets from './components/Projets';
import Logistique from './components/Logistique';
import Achats from './components/Achats';
import Finance from './components/Finance';
import Inventaire from './components/Inventaire';
import Documents from './components/Documents';
import SAV from './components/SAV';
import Administration from './components/Administration';
import { usePermissions } from './hooks/usePermissions';
import { canAccessExecutiveCalendar } from './services/auth/executiveCalendarAccess';
import { parseInventaireArticlePath } from './services/inventaire/barcodeUtils';

import {
  LayoutDashboard, CheckSquare, CalendarDays, CalendarClock,
  Building2, Users, CalendarOff,
  HardHat, ClockIcon, Banknote, BarChart3, Handshake,
  UserSquare, FileEdit, CalendarRange, Megaphone,
  NotebookPen, Receipt, Lightbulb,
  Contact, ShoppingBag, Tag, FileText, ScrollText, PackageCheck,
  Truck, Wrench, History,
  FolderOpen, AlertCircle, ClipboardCheck,
  MessageSquare,
  FolderClosed, Share2, Link, Trash2,
  ListFilter, TrendingDown, CreditCard, PiggyBank, Wallet, BarChart2,
  ClipboardList, ShoppingCart, UserCog, FileCheck,
  Boxes, Package, ArrowUpDown,
  Database,
  Search, Menu, ChevronRight, X as XIcon
} from 'lucide-react';

/* =============================================
   NAV STRUCTURE
   ============================================= */
const NAV = [
  {
    section: 'Organisation Interne',
    items: [
      { id: 'dashboard',          label: 'Tableau de bord',      icon: LayoutDashboard },
      { id: 'taches',             label: "Taches a faire",        icon: CheckSquare },
      { id: 'rendezvous',         label: 'Rendez-vous',          icon: CalendarDays },
      { id: 'agenda-direction',   label: 'Agenda de Direction',  icon: CalendarClock },
    ],
  },
  {
    section: 'Ressources Humaines',
    items: [
      { id: 'departements',       label: 'Departements',         icon: Building2 },
      { id: 'employes',           label: 'Employes',             icon: Users },
      { id: 'conges',             label: 'Demande de conge',     icon: CalendarOff },
      { id: 'demandes-ressources', label: 'Demandes ressources', icon: ClipboardList },
    ],
  },
  {
    section: 'Employes Externes',
    items: [
      { id: 'ouvriers',           label: 'Ouvriers externes',    icon: HardHat },
      { id: 'presence',           label: 'Presence ouvriers',    icon: ClockIcon },
      { id: 'heures-sup',         label: 'Heures supplementaires', icon: BarChart3 },
      { id: 'paiement-hebdo',     label: 'Paiement hebdo. ouvriers', icon: Banknote },
    ],
  },
  {
    section: 'Sous-traitants',
    items: [
      { id: 'sous-traitants',     label: 'Sous-traitants',       icon: Handshake },
      { id: 'situation-sous-traitants', label: 'Situation sous-traitants', icon: ClipboardList },
    ],
  },
  {
    section: 'Commercial / Marketing',
    items: [
      { id: 'prospects',          label: 'Prospects',            icon: UserSquare },
      { id: 'devis-attente',      label: 'Devis en attente',     icon: FileEdit },
      { id: 'planning-commercial',label: 'Planning commercial',  icon: CalendarRange },
      { id: 'actions-marketing',  label: 'Actions marketing',    icon: Megaphone },
      { id: 'compte-rendu-com',   label: 'Compte rendu',         icon: NotebookPen },
      { id: 'depenses-com',       label: 'Depenses',             icon: Receipt },
      { id: 'propositions',       label: 'Propositions',         icon: Lightbulb },
    ],
  },
  {
    section: 'CRM',
    items: [
      { id: 'clients',            label: 'Clients',              icon: Contact },
      { id: 'articles',           label: 'Articles',             icon: ShoppingBag },
      { id: 'categories',         label: 'Categories',           icon: Tag },
      { id: 'devis',              label: 'Devis',                icon: FileText },
      { id: 'factures',           label: 'Factures',             icon: ScrollText },
      { id: 'bon-livraison',      label: 'Bon de livraison',     icon: PackageCheck },
    ],
  },
  {
    section: 'Logistique',
    items: [
      { id: 'vehicules',          label: 'Vehicules',            icon: Truck },
      { id: 'interventions',      label: "Demandes d'intervention", icon: Wrench },
      { id: 'historique-interv',  label: "Historique d'intervention", icon: History },
    ],
  },
  {
    section: 'Projets',
    items: [
      { id: 'projets',            label: 'Projets',              icon: FolderOpen      },
      { id: 'sav-projets',        label: 'SAV',                  icon: AlertCircle     },
      { id: 'cr-sav',             label: 'Comptes rendus SAV',   icon: ClipboardCheck  },
    ],
  },
  {
    section: 'Documents',
    items: [
      { id: 'mes-documents',      label: 'Mes documents',        icon: FolderClosed },
      { id: 'docs-partages',      label: 'Documents partages',   icon: Share2 },
      { id: 'liens-publics',      label: 'Liens publics',        icon: Link },
      { id: 'corbeille',          label: 'Corbeille',            icon: Trash2 },
    ],
  },
  {
    section: 'Finance & Tresorerie',
    items: [
      { id: 'finance-dashboard',  label: 'Tableau finance',      icon: PiggyBank },
      { id: 'feuille-caisse',     label: 'Feuille de caisse',    icon: Wallet },
      { id: 'categories-charge',  label: 'Categories charge',    icon: ListFilter },
      { id: 'charges',            label: 'Dépenses générales',   icon: TrendingDown },
      { id: 'depenses-par-projet', label: 'Dépenses par projet', icon: BarChart2 },
      { id: 'ordres-paiement',    label: 'Ordre de paiement',    icon: CreditCard },
    ],
  },
  {
    section: 'Achats',
    items: [
      { id: 'demandes-achat',     label: "Demandes d'achat",     icon: ClipboardList },
      { id: 'bons-commande',      label: 'Bon de commande',      icon: ShoppingCart },
      { id: 'fournisseurs',       label: 'Fournisseurs',         icon: UserCog },
      { id: 'ordres-achat',       label: "Ordre d'achat",        icon: FileCheck },
    ],
  },
  {
    section: 'Inventaire & Depot',
    items: [
      { id: 'categories-stock',   label: 'Categories stock',     icon: Tag },
      { id: 'articles-stock',     label: 'Articles de stock',    icon: Package },
      { id: 'depots',             label: 'Emplacements',         icon: Boxes },
      { id: 'bons-mouvements',    label: 'Bons de mouvements',   icon: ArrowUpDown },
      { id: 'demandes-chantier', label: 'Demandes chantier',    icon: ClipboardList },
      { id: 'stocks',             label: 'Stocks',               icon: BarChart3 },
    ],
  },
  {
    section: 'Administration',
    items: [
      { id: 'utilisateurs',       label: 'Utilisateurs',         icon: Users },
      { id: 'sauvegardes',        label: 'Sauvegardes',          icon: Database },
    ],
  },
];

/* =============================================
   MODULE LABELS (breadcrumb)
   ============================================= */
const MODULE_LABELS = {
  dashboard:           'Tableau de Bord',
  taches:              'Taches a faire',
  rendezvous:          'Rendez-vous',
  'agenda-direction':  'Agenda de Direction',
  departements:        'Departements',
  employes:            'Employes',
  conges:              'Demande de conge',
  ouvriers:            'Ouvriers externes',
  presence:            'Presence ouvriers',
  'heures-sup':        'Heures supplementaires',
  'paiement-hebdo':    'Paiement hebdo. ouvriers',
  'situation-sous-traitants': 'Situation sous-traitants',
  'sous-traitants':    'Sous-traitants',
  prospects:           'Prospects',
  'devis-attente':     'Devis en attente',
  'planning-commercial': 'Planning commercial',
  'actions-marketing': 'Actions marketing',
  'compte-rendu-com':  'Compte rendu',
  'depenses-com':      'Depenses',
  propositions:        'Propositions',
  clients:             'Clients',
  articles:            'Articles',
  categories:          'Categories',
  devis:               'Devis',
  factures:            'Factures',
  'bon-livraison':     'Bon de livraison',
  vehicules:           'Vehicules',
  interventions:       "Demandes d'intervention",
  'historique-interv': "Historique d'intervention",
  projets:             'Projets',
  'sav-projets':       'Service Apres-Vente',
  'cr-sav':            'Comptes rendus SAV',
  'mes-documents':     'Mes documents',
  'docs-partages':     'Documents partages',
  'liens-publics':     'Liens publics',
  corbeille:           'Corbeille',
  'finance-dashboard': 'Tableau finance',
  'feuille-caisse':    'Feuille de caisse',
  'categories-charge': 'Categories charge',
  charges:             'Dépenses générales',
  'depenses-par-projet': 'Dépenses par projet',
  'ordres-paiement':   'Ordre de paiement',
  'demandes-achat':    "Demandes d'achat",
  'bons-commande':     'Bon de commande',
  fournisseurs:        'Fournisseurs',
  'ordres-achat':      "Ordre d'achat",
  'ordres-paiement-achats': "Ordre de paiement",
  'categories-stock':  'Categories stock',
  'articles-stock':    'Articles de stock',
  depots:              'Emplacements',
  'bons-mouvements':   'Bons de mouvements',
  'demandes-chantier': 'Demandes chantier',
  stocks:              'Stocks',
  utilisateurs:        'Utilisateurs',
  sauvegardes:         'Sauvegardes',
};

/* =============================================
   PAGE RENDERER  (map new IDs to existing components)
   ============================================= */
function PageContent({ module, onNavigate, inventaireArticleCode, onInventaireArticleCodeConsumed }) {
  switch (module) {
    case 'dashboard':           return <Dashboard onNavigate={onNavigate} />;
    /* Organisation interne */
    case 'taches':              return <Taches />;
    case 'rendezvous':          return <RendezVous />;
    case 'agenda-direction':    return <AgendaDirection />;
    /* RH */
    case 'departements':        return <Departements />;
    case 'employes':            return <RH />;
    case 'conges':              return <Conges />;
    case 'demandes-ressources': return <DemandesRessources />;
    /* Ouvriers */
    case 'ouvriers':            return <OuvriersListe />;
    case 'presence':            return <Presence />;
    case 'heures-sup':          return <HeuresSupp />;
    case 'paiement-hebdo':      return <PaiementHebdo />;
    case 'situation-sous-traitants': return <SituationSousTraitants />;
    case 'sous-traitants':      return <SousTraitants />;
    /* Commercial / Marketing */
    case 'prospects':           return <Prospects />;
    case 'devis-attente':       return <DevisAttente />;
    case 'planning-commercial': return <PlanningCommercial />;
    case 'actions-marketing':   return <ActionsMarketing />;
    case 'compte-rendu-com':    return <ComptesRendus />;
    case 'depenses-com':        return <DepensesCom />;
    case 'propositions':        return <PropositionsMarketing />;
    /* CRM */
    case 'clients':             return <Clients />;
    case 'articles':            return <Articles />;
    case 'categories':          return <Categories />;
    case 'devis':               return <Devis />;
    case 'factures':            return <Factures />;
    case 'bon-livraison':       return <BonLivraison />;
    /* Logistique */
    case 'vehicules':           return <Logistique activeTab="vehicules" />;
    case 'interventions':       return <Logistique activeTab="interventions" />;
    case 'historique-interv':   return <Logistique activeTab="historique-interv" />;
    /* Projets */
    case 'projets':             return <Projets activeTab="projets" />;
    case 'sav-projets':         return <Projets activeTab="sav-projets" />;
    case 'cr-sav':              return <Projets activeTab="cr-sav" />;
    /* SAV legacy */
    case 'sav':                 return <SAV />;
    /* Documents */
    case 'mes-documents':       return <Documents activeTab="mes-documents" />;
    case 'docs-partages':       return <Documents activeTab="docs-partages" />;
    case 'liens-publics':       return <Documents activeTab="liens-publics" />;
    case 'corbeille':           return <Documents activeTab="corbeille" />;
    /* Finance */
    case 'finance-dashboard':   return <Finance activeTab="finance-dashboard" />;
    case 'feuille-caisse':      return <Finance activeTab="feuille-caisse" />;
    case 'categories-charge':   return <Finance activeTab="categories-charge" />;
    case 'charges':             return <Finance activeTab="charges" />;
    case 'depenses-par-projet': return <Finance activeTab="depenses-par-projet" />;
    case 'ordres-paiement-achats':
    case 'ordres-paiement':     return <Finance activeTab="ordres-paiement" />;
    /* Achats */
    case 'demandes-achat':      return <Achats activeTab="demandes-achat" />;
    case 'bons-commande':       return <Achats activeTab="bons-commande" />;
    case 'fournisseurs':        return <Achats activeTab="fournisseurs" />;
    case 'comparaison-devis':   return <Achats activeTab="demandes-achat" />;
    case 'ordres-achat':        return <Achats activeTab="ordres-achat" />;
    /* Inventaire & Depot */
    case 'categories-stock':    return <Inventaire activeTab="categories-stock" />;
    case 'articles-stock':      return (
      <Inventaire
        activeTab="articles-stock"
        initialArticleCode={inventaireArticleCode}
        onArticleCodeConsumed={onInventaireArticleCodeConsumed}
      />
    );
    case 'depots':              return <Inventaire activeTab="depots" />;
    case 'bons-mouvements':     return <Inventaire activeTab="bons-mouvements" />;
    case 'demandes-chantier':   return <Inventaire activeTab="demandes-chantier" />;
    case 'stocks':              return <Inventaire activeTab="stocks" />;
    case 'inventaire-physique': return <Inventaire activeTab="inventaire-physique" />;
    case 'affectation-materiel': return <Inventaire activeTab="affectation-materiel" />;
    /* Administration */
    case 'utilisateurs':        return <Administration activeTab="utilisateurs" />;
    case 'sauvegardes':         return <Administration activeTab="sauvegardes" />;
    default:                    return <Dashboard />;
  }
}

/* =============================================
   LOGIN PAGE
   ============================================= */
function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    unlockNotificationSound();
    setError('');
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      let msg = result.error || 'Erreur de connexion.';
      if (result.errorCode) msg += ` [${result.errorCode}]`;
      setError(msg);
    }
    // On success, AuthContext updates user → App re-renders automatically
  }

  return (
    <div className="login-page">
      <div className="login-bg-photo" />
      <div className="login-bg-overlay" />
      <div className="login-bg-grid" />

      <div className="login-center">
        <div className="login-brand">
          <img src="https://i.ibb.co/1tszCjBk/CITYMO-LOGO-2.png" alt="CITYMO" className="login-brand-logo" />
          <div className="login-brand-sep" />
          <div className="login-brand-tagline">CITYMO APP</div>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <h2 className="login-card-title">Bienvenue</h2>
            <p className="login-card-sub">Connectez-vous a votre espace de gestion</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label>Adresse Email</label>
              <input
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label>Mot de passe</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                <>Se connecter <span className="btn-arrow">&#8594;</span></>
              )}
            </button>

            <p className="login-forgot">
              <a href="#forgot" onClick={e => e.preventDefault()}>Mot de passe oublie ?</a>
            </p>
          </form>
        </div>

        <div className="login-badges">
          <span className="login-badge-item">Securise SSL</span>
          <span className="login-badge-dot" />
          <span className="login-badge-item">Acces RBAC</span>
          <span className="login-badge-dot" />
          <span className="login-badge-item">&#169; 2026 CITYMO</span>
        </div>
      </div>
    </div>
  );
}

/* =============================================
   SIDEBAR
   ============================================= */
function Sidebar({ active, onNavigate, collapsed, mobileOpen, onMobileClose, user, canShowRoute }) {
  // Build className: desktop collapsed vs mobile open
  const cls = [
    'sidebar',
    collapsed ? 'collapsed' : '',
    mobileOpen ? 'mobile-open' : '',
  ].filter(Boolean).join(' ');

  function handleNavigate(id) {
    onNavigate(id);
    onMobileClose(); // auto-close drawer on navigation (mobile)
  }

  return (
    <nav className={cls}>
      {/* Mobile close button */}
      <button className="sidebar-close-btn" onClick={onMobileClose} aria-label="Fermer le menu">
        <XIcon size={18} />
      </button>

      {/* Logo */}
      <div className={'sidebar-logo' + (collapsed ? ' sidebar-logo--collapsed' : '')}>
        <img src="https://i.ibb.co/1tszCjBk/CITYMO-LOGO-2.png" alt="CITYMO" className="sidebar-logo-img" />
      </div>

      {/* Nav */}
      <div className="sidebar-scroll">
        {NAV.map((group) => {
          const items = group.items.filter((item) => {
            if (item.id === 'agenda-direction') return canAccessExecutiveCalendar(user);
            return canShowRoute(item.id);
          });
          if (!items.length) return null;
          return (
          <div key={group.section}>
            {!collapsed && <div className="sidebar-section-label">{group.section}</div>}
            {items.map((item) => (
              <div
                key={item.id}
                className={'nav-item' + (active === item.id ? ' active' : '')}
                onClick={() => handleNavigate(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={15} />
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </div>
            ))}
          </div>
          );
        })}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="avatar-circle">
              {user.initiales || user.nom.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div className="footer-user-info">
              <div className="footer-user-name">{user.nom}</div>
              <div className="footer-user-role">{user.role}</div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

/* =============================================
   HEADER
   ============================================= */
function Header({ module, onToggleSidebar, user, onLogout, onNavigate, mobileMenuOpen }) {
  const moduleLabel = MODULE_LABELS[module] || 'Tableau de Bord';
  return (
    <header className="header">
      <button
        type="button"
        className="header-toggle"
        onClick={onToggleSidebar}
        aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={Boolean(mobileMenuOpen)}
      >
        <Menu size={20} aria-hidden />
      </button>
      <div className="header-breadcrumb">
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>CITYMO</span>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} aria-hidden />
        <span className="header-module" title={moduleLabel}>{moduleLabel}</span>
      </div>
      <div className="header-right">
        <button type="button" className="icon-btn header-search-btn" aria-label="Rechercher">
          <Search size={18} aria-hidden />
        </button>
        <NotificationCenter user={user} onNavigate={onNavigate} />
        <PwaSafeBoundary>
          <PwaInstallButton />
        </PwaSafeBoundary>
        <UserProfileMenu user={user} onLogout={onLogout} onNavigate={onNavigate} />
      </div>
    </header>
  );
}

/* =============================================
   APP ROOT
   ============================================= */
export default function App() {
  const { user, loading, logout, refreshUser } = useAuth();
  const [module, setModule] = useState(() => {
    if (parseInventaireArticlePath()) return 'articles-stock';
    return parseModuleFromSearch() || 'dashboard';
  });
  const [inventaireArticleCode, setInventaireArticleCode] = useState(() => parseInventaireArticlePath());
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { canShowRoute } = usePermissions(user);
  const mustChangePassword = Boolean(user?.must_change_password);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    function onSwMessage(event) {
      const msg = event?.data;
      if (!msg || msg.type !== 'CITYMO_PUSH_NAVIGATE') return;
      try {
        navigateFromPushUrl(msg.url || msg.data?.action_url || msg.data?.url, setModule);
      } catch {
        /* ignore */
      }
    }
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, []);

  useEffect(() => {
    function onPopState() {
      const code = parseInventaireArticlePath();
      if (code) {
        setModule('articles-stock');
        setInventaireArticleCode(code);
      } else {
        setInventaireArticleCode(null);
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => initNotificationSoundUnlock(), []);

  // While restoring session — même fond login Codia (spinner visible)
  if (loading) {
    return (
      <div className="login-page">
        <div className="login-bg-photo" />
        <div className="login-bg-overlay" />
        <div className="login-bg-grid" />
        <div className="login-center">
          <span className="login-spinner" />
        </div>
      </div>
    );
  }

  // Not authenticated → show login screen
  if (!user) {
    return <LoginPage />;
  }

  if (mustChangePassword) {
    return (
      <ForcePasswordChangeModal
        user={user}
        onComplete={() => refreshUser?.()}
      />
    );
  }

  function toggleSidebar() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      {/* Mobile overlay — tap to close sidebar */}
      <div
        className={'sidebar-overlay' + (mobileOpen ? ' visible' : '')}
        onClick={closeMobile}
        aria-hidden="true"
      />

      <Sidebar
        active={module}
        onNavigate={setModule}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
        user={user}
        canShowRoute={canShowRoute}
      />
      <div className="main-area">
        <Header
          module={module}
          onToggleSidebar={toggleSidebar}
          user={user}
          onLogout={logout}
          onNavigate={setModule}
          mobileMenuOpen={mobileOpen}
        />
        <main className="page-content">
          <PageContent
            module={module}
            onNavigate={setModule}
            inventaireArticleCode={inventaireArticleCode}
            onInventaireArticleCodeConsumed={() => setInventaireArticleCode(null)}
          />
        </main>
      </div>
    </div>
  );
}
