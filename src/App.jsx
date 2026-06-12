import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import './App.css';

import Dashboard from './components/Dashboard';
import RH from './components/RH';
import Taches from './components/Taches';
import RendezVous from './components/RendezVous';
import AgendaDirection from './components/AgendaDirection';
import Departements from './components/Departements';
import Conges from './components/Conges';
import OuvriersListe from './components/OuvriersListe';
import Presence from './components/Presence';
import HeuresSupp from './components/HeuresSupp';
import PaiementHebdo from './components/PaiementHebdo';
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
import { canAccessExecutiveCalendar } from './services/auth/executiveCalendarAccess';

import {
  LayoutDashboard, CheckSquare, CalendarDays, CalendarClock,
  Building2, Users, CalendarOff,
  HardHat, ClockIcon, Banknote, BarChart3,
  UserSquare, FileEdit, CalendarRange, Megaphone,
  NotebookPen, Receipt, Lightbulb,
  Contact, ShoppingBag, Tag, FileText, ScrollText, PackageCheck,
  Truck, Wrench, History,
  FolderOpen, AlertCircle, ClipboardCheck,
  MessageSquare,
  FolderClosed, Share2, Link, Trash2,
  ListFilter, TrendingDown, CreditCard, PiggyBank, Wallet,
  ClipboardList, ShoppingCart, UserCog, Scale, FileCheck,
  Boxes, Package, ArrowUpDown,
  ShieldCheck, Database,
  Bell, Search, Menu, ChevronRight, X as XIcon
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
    ],
  },
  {
    section: 'Employes Externes',
    items: [
      { id: 'ouvriers',           label: 'Ouvriers',             icon: HardHat },
      { id: 'presence',           label: 'Presence ouvriers',    icon: ClockIcon },
      { id: 'heures-sup',         label: 'Heures supplementaires', icon: BarChart3 },
      { id: 'paiement-hebdo',     label: 'Paiement hebdomadaire', icon: Banknote },
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
      { id: 'charges',            label: 'Charges',              icon: TrendingDown },
      { id: 'ordres-paiement',    label: 'Ordre de paiement',    icon: CreditCard },
    ],
  },
  {
    section: 'Achats',
    items: [
      { id: 'demandes-achat',     label: "Demandes d'achat",     icon: ClipboardList },
      { id: 'bons-commande',      label: 'Bon de commande',      icon: ShoppingCart },
      { id: 'fournisseurs',       label: 'Fournisseurs',         icon: UserCog },
      { id: 'comparaison-devis',  label: 'Comparaison devis',    icon: Scale },
      { id: 'ordres-achat',       label: "Ordre d'achat",        icon: FileCheck },
    ],
  },
  {
    section: 'Inventaire & Depot',
    items: [
      { id: 'categories-stock',   label: 'Categories stock',     icon: Tag },
      { id: 'articles-stock',     label: 'Articles de stock',    icon: Package },
      { id: 'depots',             label: 'Depots & Projets',     icon: Boxes },
      { id: 'bons-mouvements',    label: 'Bons de mouvements',   icon: ArrowUpDown },
      { id: 'stocks',             label: 'Stocks',               icon: BarChart3 },
    ],
  },
  {
    section: 'Administration',
    items: [
      { id: 'utilisateurs',       label: 'Utilisateurs',         icon: Users },
      { id: 'roles',              label: 'Roles',                icon: ShieldCheck },
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
  ouvriers:            'Ouvriers',
  presence:            'Presence ouvriers',
  'heures-sup':        'Heures supplementaires',
  'paiement-hebdo':    'Paiement hebdomadaire',
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
  charges:             'Charges',
  'ordres-paiement':   'Ordre de paiement',
  'demandes-achat':    "Demandes d'achat",
  'bons-commande':     'Bon de commande',
  fournisseurs:        'Fournisseurs',
  'comparaison-devis': 'Comparaison devis',
  'ordres-achat':      "Ordre d'achat",
  'categories-stock':  'Categories stock',
  'articles-stock':    'Articles de stock',
  depots:              'Depots & Projets',
  'bons-mouvements':   'Bons de mouvements',
  stocks:              'Stocks',
  utilisateurs:        'Utilisateurs',
  roles:               'Roles',
  sauvegardes:         'Sauvegardes',
};

/* =============================================
   PAGE RENDERER  (map new IDs to existing components)
   ============================================= */
function PageContent({ module }) {
  switch (module) {
    case 'dashboard':           return <Dashboard />;
    /* Organisation interne */
    case 'taches':              return <Taches />;
    case 'rendezvous':          return <RendezVous />;
    case 'agenda-direction':    return <AgendaDirection />;
    /* RH */
    case 'departements':        return <Departements />;
    case 'employes':            return <RH />;
    case 'conges':              return <Conges />;
    /* Ouvriers */
    case 'ouvriers':            return <OuvriersListe />;
    case 'presence':            return <Presence />;
    case 'heures-sup':          return <HeuresSupp />;
    case 'paiement-hebdo':      return <PaiementHebdo />;
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
    case 'ordres-paiement':     return <Finance activeTab="ordres-paiement" />;
    /* Achats */
    case 'demandes-achat':      return <Achats activeTab="demandes-achat" />;
    case 'bons-commande':       return <Achats activeTab="bons-commande" />;
    case 'fournisseurs':        return <Achats activeTab="fournisseurs" />;
    case 'comparaison-devis':   return <Achats activeTab="comparaison-devis" />;
    case 'ordres-achat':        return <Achats activeTab="ordres-achat" />;
    /* Inventaire & Depot */
    case 'categories-stock':    return <Inventaire activeTab="categories-stock" />;
    case 'articles-stock':      return <Inventaire activeTab="articles-stock" />;
    case 'depots':              return <Inventaire activeTab="depots" />;
    case 'bons-mouvements':     return <Inventaire activeTab="bons-mouvements" />;
    case 'stocks':              return <Inventaire activeTab="stocks" />;
    /* Administration */
    case 'utilisateurs':        return <Administration activeTab="utilisateurs" />;
    case 'roles':               return <Administration activeTab="roles" />;
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
          <div className="login-brand-tagline">Plateforme ERP Construction</div>
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
function Sidebar({ active, onNavigate, collapsed, mobileOpen, onMobileClose, user }) {
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
            return true;
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
function Header({ module, onToggleSidebar, user, onLogout }) {
  return (
    <header className="header">
      <button className="header-toggle" onClick={onToggleSidebar}>
        <Menu size={20} />
      </button>
      <div className="header-breadcrumb">
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>CITYMO</span>
        <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
        <span className="header-module">{MODULE_LABELS[module] || 'Tableau de Bord'}</span>
      </div>
      <div className="header-right">
        <button className="icon-btn">
          <Search size={18} />
        </button>
        <button className="icon-btn">
          <Bell size={18} />
          <span className="notif-badge" />
        </button>
        <div className="header-avatar" title={user.nom} onClick={onLogout} style={{ cursor: 'pointer' }}>
          {user.initiales || user.nom.split(' ').map(n => n[0]).slice(0, 2).join('')}
        </div>
      </div>
    </header>
  );
}

/* =============================================
   APP ROOT
   ============================================= */
export default function App() {
  const { user, loading, logout } = useAuth();
  const [module, setModule] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Detect mobile (≤768px) to decide toggle behaviour
  function toggleSidebar() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      setMobileOpen(o => !o);
    } else {
      setCollapsed(c => !c);
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
      />
      <div className="main-area">
        <Header
          module={module}
          onToggleSidebar={toggleSidebar}
          user={user}
          onLogout={logout}
        />
        <main className="page-content">
          <PageContent module={module} />
        </main>
      </div>
    </div>
  );
}
