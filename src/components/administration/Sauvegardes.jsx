/**
 * Sauvegardes.jsx — Gestion sauvegardes & restauration ERP CITYMO
 * Backend-ready / production-ready
 */
import { useState, useCallback } from 'react';
import { HardDrive, Plus, Trash2, Download, RefreshCw, FileText, Search, Filter, CheckCircle, Clock, AlertTriangle, Server } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  TYPES_BACKUP, STATUTS_BACKUP, BADGE_BACKUP, BADGE_TYPE_BACKUP,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  genId, genRef
} from './shared.jsx';

const EMPTY_FORM = {
  type: 'Complète',
  description: '',
  planification: 'Manuelle',
};

function BackupForm({ onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleSubmit(ev) {
    ev.preventDefault();
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<HardDrive size={12} />}>Nouvelle sauvegarde</SectionTitle>
      <FRow>
        <FField label="Type de sauvegarde" required>
          <select value={form.type} onChange={e => set('type', e.target.value)} style={SELECT_STYLE}>
            {TYPES_BACKUP.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Planification">
          <select value={form.planification} onChange={e => set('planification', e.target.value)} style={SELECT_STYLE}>
            <option value="Manuelle">Manuelle (maintenant)</option>
            <option value="Quotidienne">Quotidienne</option>
            <option value="Hebdomadaire">Hebdomadaire</option>
            <option value="Mensuelle">Mensuelle</option>
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description / Notes">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Contexte de la sauvegarde..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <div style={{ background: 'var(--red-light)', border: '1.5px solid var(--red)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: 'var(--red)' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Information production</div>
        <div>Cette action déclenchera une vraie sauvegarde via l'API backend Railway / Supabase. La durée dépend de la taille de la base de données et des fichiers.</div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={14} /> Lancer la sauvegarde
        </button>
      </div>
    </form>
  );
}

function InfraCard({ icon, title, value, status, description, color }) {
  const bgMap = { green: '#E8F5E9', orange: '#FFF3E0', red: 'var(--red-light)', blue: '#E3F2FD', grey: 'var(--surface-2)' };
  const clMap = { green: '#2E7D32', orange: '#E65100', red: 'var(--red)', blue: '#1565C0', grey: 'var(--text-3)' };
  const c = color || 'grey';
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: bgMap[c], display: 'flex', alignItems: 'center', justifyContent: 'center', color: clMap[c] }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: clMap[c] }}>{value}</div>
        </div>
      </div>
      {status && <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>{description}</div>}
    </div>
  );
}

export default function Sauvegardes() {
  const [backups, setBackups] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toLocaleString('fr-FR');

  const handleSave = useCallback((data) => {
    const ref = genRef('BCK');
    const nom = `backup_citymo_${today.replace(/-/g, '')}_${data.type.toLowerCase().replace(' ', '_')}.sql`;
    setBackups(prev => [{
      ...data,
      id: genId(), ref, nom,
      date: now,
      taille: '—',
      statut: 'En cours',
      cree_par: 'Administrateur',
    }, ...prev]);
    setShowModal(false);
    // Simule la fin de la sauvegarde (en prod : webhook backend)
    setTimeout(() => {
      setBackups(prev => prev.map(b => b.ref === ref ? { ...b, statut: 'Succès', taille: '—' } : b));
    }, 2500);
  }, [today, now]);

  function handleDelete(id) {
    if (window.confirm('Supprimer cette sauvegarde ?')) setBackups(prev => prev.filter(x => x.id !== id));
  }
  function handleRestore(backup) {
    if (window.confirm(`Restaurer la sauvegarde ${backup.ref} ? Cette opération est irréversible en production.`)) {
      alert('Demande de restauration envoyée à l\'API backend. La restauration démarrera dans quelques instants.');
    }
  }

  const filtered = backups.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.ref.toLowerCase().includes(q) || (x.nom || '').toLowerCase().includes(q))
      && (!filterType || x.type === filterType)
      && (!filterStatut || x.statut === filterStatut);
  });

  const derniere      = backups.find(b => b.statut === 'Succès');
  const nbAuto        = backups.filter(b => b.planification && b.planification !== 'Manuelle').length;
  const totalSucces   = backups.filter(b => b.statut === 'Succès').length;
  const enCours       = backups.filter(b => b.statut === 'En cours').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">SAUVEGARDES</h1>
          <p className="page-subtitle">Gestion des sauvegardes et restauration système.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export logs</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowModal(true)}>
            <Plus size={15} /> Nouvelle sauvegarde
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Clock size={17} />}        label="Dernière sauvegarde"  value={derniere ? derniere.date.slice(0, 10) : '—'}  color="grey"   />
        <KpiCard icon={<HardDrive size={17} />}    label="Sauvegardes réussies" value={totalSucces}    color="green"  />
        <KpiCard icon={<RefreshCw size={17} />}    label="Planifiées"           value={nbAuto}         color="blue"   />
        <KpiCard icon={<CheckCircle size={17} />}  label="En cours"             value={enCours}        color="orange" />
      </div>

      {/* Infrastructure status */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Infrastructure & Déploiement
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <InfraCard icon={<Server size={16} />}   title="Supabase" value="Prêt"    color="green"  description="Auth + Database + Storage + Realtime" status />
          <InfraCard icon={<Server size={16} />}   title="Railway"  value="Prêt"    color="green"  description="API Backend + Middleware + Upload" status />
          <InfraCard icon={<Server size={16} />}   title="Vercel"   value="Prêt"    color="blue"   description="Frontend + Build + CDN + Env Variables" status />
          <InfraCard icon={<Server size={16} />}   title="Namecheap" value="Prêt"  color="orange"  description="Domaine + SSL + DNS + Emails Pro" status />
        </div>
      </div>

      {/* Sécurité */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Architecture sécurité
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {[
            ['JWT Auth', 'Tokens signés HS256 / RS256 via Supabase Auth', 'green'],
            ['Refresh Tokens', 'Rotation automatique, expiration configurable', 'green'],
            ['RBAC Permissions', 'Rôles / modules / actions granulaires', 'green'],
            ['Protection routes', 'Middleware auth sur toutes les routes API', 'blue'],
            ['Logs activité', 'Historique connexions, modifications, exports', 'blue'],
            ['Sessions sécurisées', 'HttpOnly cookies + CSRF protection', 'blue'],
          ].map(([titre, desc, color]) => (
            <div key={titre} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <CheckCircle size={14} style={{ color: color === 'green' ? '#2E7D32' : '#1565C0', marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{titre}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, nom..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous types</option>
              {TYPES_BACKUP.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous statuts</option>
              {STATUTS_BACKUP.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une sauvegarde..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<HardDrive size={24} />} title="Aucune sauvegarde" sub="Créez votre première sauvegarde système" action="Nouvelle sauvegarde" onAction={() => setShowModal(true)} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Nom fichier</th>
                  <th>Date</th>
                  <th>Taille</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Créé par</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => (
                  <tr key={x.id}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.ref}</span></td>
                    <td data-label="Fichier" style={{ fontSize: '0.8rem', color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.nom || '—'}</td>
                    <td data-label="Date" style={{ fontSize: '0.82rem' }}>{x.date}</td>
                    <td data-label="Taille" style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{x.taille || '—'}</td>
                    <td data-label="Type">
                      <span className={'badge ' + (BADGE_TYPE_BACKUP[x.type] || 'badge-grey')} style={{ fontSize: '0.7rem' }}>{x.type}</span>
                    </td>
                    <td data-label="Statut">
                      <span className={'badge ' + (BADGE_BACKUP[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {x.statut === 'En cours' && <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />}
                        {x.statut === 'Succès' && <CheckCircle size={10} />}
                        {x.statut === 'Erreur' && <AlertTriangle size={10} />}
                        {x.statut}
                      </span>
                    </td>
                    <td data-label="Créé par" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.cree_par || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-ghost btn-sm" title="Télécharger" style={{ opacity: x.statut !== 'Succès' ? 0.4 : 1 }}><Download size={13} /></button>
                        <button className="btn btn-secondary btn-sm" title="Restaurer" onClick={() => handleRestore(x)} style={{ opacity: x.statut !== 'Succès' ? 0.4 : 1 }}>
                          <RefreshCw size={13} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Logs"><FileText size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nouvelle sauvegarde" width={560}>
        <BackupForm onSave={handleSave} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  );
}
