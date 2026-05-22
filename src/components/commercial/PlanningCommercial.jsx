import { useState, useEffect, useRef } from 'react';
import { CalendarRange, Plus, ChevronLeft, ChevronRight, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle, Edit2, Trash2, FileText, Zap } from 'lucide-react';

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: '0.83rem' }}>{sub}</div>
    </div>
  );
}
import { getRDV, createRDV, updateRDV, deleteRDV, getProspects, createCompteRendu } from '../../services/api';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL } from '../../constants/commercial';

/* ── Constants ── */
const TYPE_RDV = ['Presentation', 'Visite chantier', 'Negociation', 'Signature', 'Suivi', 'Autre'];
const STATUTS = ['planifie', 'confirme', 'realise', 'annule', 'reporte'];
const STATUT_BADGE = { planifie: 'badge-blue', confirme: 'badge-green', realise: 'badge-grey', annule: 'badge-red', reporte: 'badge-orange' };
const STATUT_LABEL = { planifie: 'Planifie', confirme: 'Confirme', realise: 'Realise', annule: 'Annule', reporte: 'Reporte' };

/* rdv_type: 'prevu' | 'rapide' */
const EMPTY_PREVU  = { rdv_type: 'prevu',  titre: '', type_rdv: 'Presentation', date: '', heure: '09:00', lieu: '', prospect_id: '', type_projet: '', statut: 'planifie', notes: '', actions_suivantes: '' };
const EMPTY_RAPIDE = { rdv_type: 'rapide', secteur: '', societe: '', date: '', heure: '09:00', lieu: '', notes: '', actions_suivantes: '' };

const SECTEURS = ['Immobilier', 'BTP', 'Promotion immobiliere', 'Architecture', 'Travaux publics', 'Autre'];

function isStale(rdv) {
  if (!rdv.updated_at) return false;
  return (Date.now() - new Date(rdv.updated_at).getTime()) > 48 * 60 * 60 * 1000 && rdv.statut === 'planifie';
}

/* Calendar pill color by rdv_type */
function rdvPillStyle(r) {
  if (r.rdv_type === 'rapide') {
    return { background: r.statut === 'realise' ? '#e8f5e9' : r.statut === 'annule' ? '#fce4e4' : '#455A64', color: (r.statut === 'realise' || r.statut === 'annule') ? 'var(--text-2)' : '#fff' };
  }
  return { background: r.statut === 'realise' ? '#e8f5e9' : r.statut === 'annule' ? '#fce4e4' : 'var(--red)', color: (r.statut === 'realise' || r.statut === 'annule') ? 'var(--text-2)' : '#fff' };
}


function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => { t.current = setTimeout(onClose, 3000); return () => clearTimeout(t.current); }, [onClose]);
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 340 }}>{msg}</div>
  );
}

function IS(err) {
  return { padding: '9px 12px', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 6, fontSize: '0.875rem', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
}

const MONTHS_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function PlanningCommercial() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState('month');
  const [rdvList, setRdvList] = useState([]);
  const [prospects, setProspects] = useState([]);

  /* Modal state: null | 'prevu' | 'rapide' */
  const [modalType, setModalType] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formPrevu, setFormPrevu] = useState(EMPTY_PREVU);
  const [formRapide, setFormRapide] = useState(EMPTY_RAPIDE);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterRdvType, setFilterRdvType] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [crModalRdv, setCrModalRdv] = useState(null);
  const [crForm, setCrForm] = useState({ resume: '', decision: '', prochaine_action: '' });

  useEffect(() => {
    getRDV().then(d => { if (d && d.length) setRdvList(d); }).catch(() => {});
    getProspects().then(d => { if (d && d.length) setProspects(d); }).catch(() => {});
  }, []);

  function prospectLabel(id) {
    const p = prospects.find(x => x.id === Number(id));
    if (!p) return '-';
    return p.type === 'btob' ? p.nom : `${p.prenom} ${p.nom}`;
  }

  function rdvDisplayTitle(r) {
    if (r.rdv_type === 'rapide') return r.societe ? `${r.societe}${r.secteur ? ' - ' + r.secteur : ''}` : (r.titre || 'RDV terrain');
    return r.titre || '-';
  }

  /* ── Open modals ── */
  function openCreatePrevu(dateStr) {
    setEditing(null);
    setFormPrevu({ ...EMPTY_PREVU, date: dateStr || '' });
    setErrors({});
    setModalType('prevu');
  }

  function openCreateRapide(dateStr) {
    setEditing(null);
    setFormRapide({ ...EMPTY_RAPIDE, date: dateStr || '' });
    setErrors({});
    setModalType('rapide');
  }

  function openEdit(rdv) {
    setEditing(rdv);
    setErrors({});
    if (rdv.rdv_type === 'rapide') {
      setFormRapide({ rdv_type: 'rapide', secteur: rdv.secteur || '', societe: rdv.societe || '', date: rdv.date || '', heure: rdv.heure || '09:00', lieu: rdv.lieu || '', notes: rdv.notes || '', actions_suivantes: rdv.actions_suivantes || '' });
      setModalType('rapide');
    } else {
      setFormPrevu({ rdv_type: 'prevu', titre: rdv.titre || '', type_rdv: rdv.type_rdv || 'Presentation', date: rdv.date || '', heure: rdv.heure || '09:00', lieu: rdv.lieu || '', prospect_id: rdv.prospect_id || '', type_projet: rdv.type_projet || '', statut: rdv.statut || 'planifie', notes: rdv.notes || '', actions_suivantes: rdv.actions_suivantes || '' });
      setModalType('prevu');
    }
  }

  function closeModal() { setModalType(null); setEditing(null); }

  /* ── Validation ── */
  function validatePrevu() {
    const e = {};
    if (!formPrevu.titre.trim()) e.titre = true;
    if (!formPrevu.date) e.date = true;
    return e;
  }

  function validateRapide() {
    const e = {};
    if (!formRapide.date) e.date = true;
    return e;
  }

  /* ── Save ── */
  async function handleSavePrevu() {
    const e = validatePrevu();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const payload = { ...formPrevu, rdv_type: 'prevu', prospect_id: formPrevu.prospect_id ? Number(formPrevu.prospect_id) : null };
    const now = new Date().toISOString();
    try {
      if (editing) {
        await updateRDV(editing.id, payload).catch(() => null);
        setRdvList(prev => prev.map(r => r.id === editing.id ? { ...r, ...payload, updated_at: now } : r));
        setToast('RDV prevu mis a jour.');
        if (payload.statut === 'realise' && editing.statut !== 'realise') {
          setCrModalRdv({ ...editing, ...payload });
          setCrForm({ resume: '', decision: '', prochaine_action: payload.actions_suivantes || '' });
        }
      } else {
        const created = await createRDV(payload).catch(() => null);
        setRdvList(prev => [...prev, { id: created?.id || Date.now(), ...payload, updated_at: now }]);
        setToast('RDV prevu cree.');
      }
    } catch (_) {}
    setSaving(false);
    closeModal();
  }

  async function handleSaveRapide() {
    const e = validateRapide();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const titre = formRapide.societe ? `Terrain - ${formRapide.societe}` : 'Nouveau RDV terrain';
    const payload = { ...formRapide, rdv_type: 'rapide', titre, statut: 'planifie' };
    const now = new Date().toISOString();
    try {
      if (editing) {
        await updateRDV(editing.id, payload).catch(() => null);
        setRdvList(prev => prev.map(r => r.id === editing.id ? { ...r, ...payload, updated_at: now } : r));
        setToast('RDV terrain mis a jour.');
      } else {
        const created = await createRDV(payload).catch(() => null);
        setRdvList(prev => [...prev, { id: created?.id || Date.now(), ...payload, updated_at: now }]);
        setToast('RDV terrain cree.');
      }
    } catch (_) {}
    setSaving(false);
    closeModal();
  }

  async function handleDelete(rdv) {
    if (!window.confirm('Supprimer ce RDV ?')) return;
    try { await deleteRDV(rdv.id); } catch (_) {}
    setRdvList(prev => prev.filter(r => r.id !== rdv.id));
    setToast('RDV supprime.');
  }

  async function saveCR() {
    if (!crForm.resume.trim()) { setToast('Le resume est obligatoire.'); return; }
    const payload = { rdv_id: crModalRdv.id, prospect_id: crModalRdv.prospect_id, resume: crForm.resume, decision: crForm.decision, prochaine_action: crForm.prochaine_action };
    try { await createCompteRendu(payload); } catch (_) {}
    setToast('Compte rendu cree automatiquement.');
    setCrModalRdv(null);
  }

  /* ── Filtering ── */
  const filtered = rdvList.filter(r => {
    if (filterStatut && r.statut !== filterStatut) return false;
    if (filterRdvType && r.rdv_type !== filterRdvType) return false;
    const q = search.toLowerCase();
    if (q && !rdvDisplayTitle(r).toLowerCase().includes(q) && !prospectLabel(r.prospect_id).toLowerCase().includes(q)) return false;
    return true;
  });

  const calDays = getCalendarDays(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function rdvsForDay(d) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return filtered.filter(r => r.date === dateStr);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  }

  /* ── Stats ── */
  const nbPlanifie = rdvList.filter(r => r.statut === 'planifie' || r.statut === 'confirme').length;
  const nbRealise  = rdvList.filter(r => r.statut === 'realise').length;
  const nbAujourdhui = rdvList.filter(r => r.date === todayStr && r.statut !== 'annule').length;
  const nbStale    = rdvList.filter(isStale).length;
  const nbTerrain  = rdvList.filter(r => r.rdv_type === 'rapide').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Planning Commercial</h1>
          <p className="page-subtitle">Rendez-vous structures et visites terrain</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ border: '1.5px solid #455A64', color: '#455A64', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }} onClick={() => openCreateRapide('')}>
            <Zap size={14} /> Nouveau RDV
          </button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openCreatePrevu('')}>
            <Plus size={14} /> RDV prevu
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon blue"><CalendarRange size={18} /></div><div className="stat-body"><div className="stat-value">{nbPlanifie}</div><div className="stat-label">A venir</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value">{nbRealise}</div><div className="stat-label">Realises</div></div></div>
        <div className="stat-card"><div className="stat-icon"><Clock size={18} /></div><div className="stat-body"><div className="stat-value">{nbAujourdhui}</div><div className="stat-label">Aujourd'hui</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#ECEFF1' }}><Zap size={18} style={{ color: '#455A64' }} /></div><div className="stat-body"><div className="stat-value">{nbTerrain}</div><div className="stat-label">Terrain</div></div></div>
        {nbStale > 0 && <div className="stat-card"><div className="stat-icon orange"><AlertCircle size={18} /></div><div className="stat-body"><div className="stat-value" style={{ color: '#E65100' }}>{nbStale}</div><div className="stat-label">En retard</div></div></div>}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Legende :</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--red)', display: 'inline-block' }} /> RDV Prevu (pipeline CRM)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#455A64', display: 'inline-block' }} /> RDV Terrain (rapide)
        </span>
      </div>

      {/* Filters + View toggle */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...IS(false), width: 200 }} />
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...IS(false), width: 150 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          <select value={filterRdvType} onChange={e => setFilterRdvType(e.target.value)} style={{ ...IS(false), width: 150 }}>
            <option value="">Tous types RDV</option>
            <option value="prevu">Prevu</option>
            <option value="rapide">Terrain</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {['month', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} className={'btn ' + (view === v ? 'btn-primary' : 'btn-ghost btn-sm')} style={{ fontSize: '0.8rem' }}>
                {v === 'month' ? 'Calendrier' : 'Liste'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'month' ? (
        <div className="card">
          {/* Month nav */}
          <div className="flex-between mb-4">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={prevMonth}><ChevronLeft size={16} /></button>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem', minWidth: 160, textAlign: 'center' }}>{MONTHS_FR[month]} {year}</span>
              <button className="btn btn-ghost btn-sm" onClick={nextMonth}><ChevronRight size={16} /></button>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}>Aujourd'hui</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS_FR.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0', fontFamily: 'var(--font-head)' }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayRdvs = rdvsForDay(d);
              const isToday = dateStr === todayStr;
              return (
                <div key={i} onClick={() => setSelectedDay(selectedDay === d ? null : d)} style={{ minHeight: 72, background: isToday ? 'rgba(211,47,47,0.06)' : 'var(--bg)', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', border: isToday ? '1.5px solid var(--red)' : '1.5px solid var(--border)', position: 'relative' }}>
                  <div style={{ fontWeight: isToday ? 800 : 600, fontSize: '0.8rem', color: isToday ? 'var(--red)' : 'var(--text)', marginBottom: 3 }}>{d}</div>
                  {dayRdvs.slice(0, 2).map((r, ri) => {
                    const ps = rdvPillStyle(r);
                    return (
                      <div key={ri} onClick={e => { e.stopPropagation(); openEdit(r); }} style={{ ...ps, borderRadius: 3, padding: '1px 5px', marginBottom: 1, fontSize: '0.68rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title={rdvDisplayTitle(r)}>
                        {r.heure && <span style={{ opacity: 0.8 }}>{r.heure} </span>}{rdvDisplayTitle(r)}
                      </div>
                    );
                  })}
                  {dayRdvs.length > 2 && <div style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 600 }}>+{dayRdvs.length - 2} autre{dayRdvs.length - 2 > 1 ? 's' : ''}</div>}
                </div>
              );
            })}
          </div>

          {/* Empty hint when no RDVs */}
          {rdvList.length === 0 && (
            <div style={{ marginTop: 16, textAlign: 'center', padding: '18px 24px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)' }}>
              <CalendarRange size={20} style={{ color: 'var(--text-3)', marginBottom: 6 }} />
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-2)', marginBottom: 4 }}>Aucun rendez-vous planifie</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Planifiez un RDV prevu ou enregistrez une visite terrain via les boutons en haut de page</div>
            </div>
          )}

          {/* Selected day detail */}
          {selectedDay && (() => {
            const dayRdvs = rdvsForDay(selectedDay);
            if (!dayRdvs.length) return null;
            return (
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', marginBottom: 10 }}>RDV du {selectedDay} {MONTHS_FR[month]}</div>
                {dayRdvs.map((r, ri) => (
                  <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: ri < dayRdvs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span className={'badge ' + (STATUT_BADGE[r.statut] || 'badge-grey')}>{STATUT_LABEL[r.statut] || r.statut}</span>
                    <span className={'badge ' + (r.rdv_type === 'rapide' ? 'badge-grey' : 'badge-red')} style={{ background: r.rdv_type === 'rapide' ? '#455A64' : undefined, color: '#fff' }}>
                      {r.rdv_type === 'rapide' ? 'Terrain' : 'Prevu'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{rdvDisplayTitle(r)}</div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 2, fontSize: '0.78rem', color: 'var(--text-3)' }}>
                        {r.heure && <span><Clock size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{r.heure}</span>}
                        {r.lieu && <span><MapPin size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{r.lieu}</span>}
                        {r.rdv_type === 'prevu' && r.prospect_id && <span><User size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />{prospectLabel(r.prospect_id)}</span>}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(r)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="card">
          <div className="card-title"><CalendarRange size={16} /> Tous les RDV ({filtered.length})</div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarRange size={22} style={{ color: 'var(--text-3)' }} />}
              title={rdvList.length === 0 ? "Aucun rendez-vous planifie" : "Aucun RDV pour ces filtres"}
              sub={rdvList.length === 0 ? "Planifiez un RDV prevu ou enregistrez une visite terrain via les boutons ci-dessus" : "Modifiez vos criteres de recherche"}
            />
          ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Titre / Contact</th><th>Type RDV</th><th>Date</th><th>Heure</th><th>Lieu</th><th>Statut</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={{ background: isStale(r) ? 'rgba(230,81,0,0.04)' : undefined }}>
                    <td style={{ fontWeight: 600 }}>
                      {isStale(r) && <AlertCircle size={13} style={{ color: '#E65100', marginRight: 5, verticalAlign: 'middle' }} />}
                      {rdvDisplayTitle(r)}
                      {r.rdv_type === 'prevu' && r.prospect_id && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 400 }}>{prospectLabel(r.prospect_id)}</div>}
                    </td>
                    <td>
                      <span className={'badge ' + (r.rdv_type === 'rapide' ? 'badge-grey' : 'badge-red')} style={{ background: r.rdv_type === 'rapide' ? '#455A64' : undefined, color: r.rdv_type === 'rapide' ? '#fff' : undefined }}>
                        {r.rdv_type === 'rapide' ? 'Terrain' : 'Prevu'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{r.date}</td>
                    <td>{r.heure || '-'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{r.lieu || '-'}</td>
                    <td><span className={'badge ' + (STATUT_BADGE[r.statut] || 'badge-grey')}>{STATUT_LABEL[r.statut] || r.statut}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(r)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* ── MODAL: RDV PREVU ── */}
      {modalType === 'prevu' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <div>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem', margin: 0 }}>{editing ? 'Modifier le RDV prevu' : 'RDV prevu'}</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '3px 0 0' }}>Lie au pipeline CRM — prospect requis</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Titre *</label>
                <input style={IS(errors.titre)} value={formPrevu.titre} onChange={e => setFormPrevu(f => ({ ...f, titre: e.target.value }))} placeholder="Intitule du RDV" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Type</label>
                  <select style={IS(false)} value={formPrevu.type_rdv} onChange={e => setFormPrevu(f => ({ ...f, type_rdv: e.target.value }))}>
                    {TYPE_RDV.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Statut</label>
                  <select style={IS(false)} value={formPrevu.statut} onChange={e => setFormPrevu(f => ({ ...f, statut: e.target.value }))}>
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date *</label>
                  <input type="date" style={IS(errors.date)} value={formPrevu.date} onChange={e => setFormPrevu(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Heure</label>
                  <input type="time" style={IS(false)} value={formPrevu.heure} onChange={e => setFormPrevu(f => ({ ...f, heure: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Lieu</label>
                <input style={IS(false)} value={formPrevu.lieu} onChange={e => setFormPrevu(f => ({ ...f, lieu: e.target.value }))} placeholder="Ex: Bureaux CITYMO, Chantier..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Prospect</label>
                  <select style={IS(false)} value={formPrevu.prospect_id} onChange={e => setFormPrevu(f => ({ ...f, prospect_id: e.target.value }))}>
                    <option value="">-- Selectionner --</option>
                    {prospects.map(p => <option key={p.id} value={p.id}>{p.type === 'btob' ? p.nom : `${p.prenom} ${p.nom}`}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Type de projet</label>
                  <select style={IS(false)} value={formPrevu.type_projet} onChange={e => setFormPrevu(f => ({ ...f, type_projet: e.target.value }))}>
                    <option value="">-- Selectionner --</option>
                    {TYPE_PROJET_VALUES.map(v => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Notes</label>
                <textarea style={{ ...IS(false), resize: 'vertical', minHeight: 70 }} value={formPrevu.notes} onChange={e => setFormPrevu(f => ({ ...f, notes: e.target.value }))} placeholder="Preparation, documents a apporter..." />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Actions suivantes</label>
                <input style={IS(false)} value={formPrevu.actions_suivantes} onChange={e => setFormPrevu(f => ({ ...f, actions_suivantes: e.target.value }))} placeholder="Ex: Envoyer devis sous 48h" />
              </div>
              {formPrevu.statut === 'realise' && (
                <div style={{ padding: '10px 14px', background: '#e8f5e9', borderRadius: 6, fontSize: '0.8rem', color: '#2E7D32', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={14} /> Un compte rendu sera cree automatiquement pour ce RDV.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSavePrevu} disabled={saving}>{saving ? 'Sauvegarde...' : editing ? 'Mettre a jour' : 'Creer le RDV'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NOUVEAU RDV (RAPIDE TERRAIN) ── */}
      {modalType === 'rapide' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <div>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem', margin: 0 }}>{editing ? 'Modifier le RDV terrain' : 'Nouveau RDV'}</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '3px 0 0' }}>Visite rapide terrain — independant du CRM</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Societe / Nom</label>
                  <input style={IS(false)} value={formRapide.societe} onChange={e => setFormRapide(f => ({ ...f, societe: e.target.value }))} placeholder="Ex: Atlas BTP" />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Secteur</label>
                  <select style={IS(false)} value={formRapide.secteur} onChange={e => setFormRapide(f => ({ ...f, secteur: e.target.value }))}>
                    <option value="">-- Choisir --</option>
                    {SECTEURS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date *</label>
                  <input type="date" style={IS(errors.date)} value={formRapide.date} onChange={e => setFormRapide(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Heure</label>
                  <input type="time" style={IS(false)} value={formRapide.heure} onChange={e => setFormRapide(f => ({ ...f, heure: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Lieu</label>
                <input style={IS(false)} value={formRapide.lieu} onChange={e => setFormRapide(f => ({ ...f, lieu: e.target.value }))} placeholder="Adresse ou zone" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Notes</label>
                <textarea style={{ ...IS(false), resize: 'vertical', minHeight: 70 }} value={formRapide.notes} onChange={e => setFormRapide(f => ({ ...f, notes: e.target.value }))} placeholder="Contexte, observations..." />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Actions suivantes</label>
                <input style={IS(false)} value={formRapide.actions_suivantes} onChange={e => setFormRapide(f => ({ ...f, actions_suivantes: e.target.value }))} placeholder="Ex: Rappeler sous 48h, envoyer brochure..." />
              </div>
              <div style={{ padding: '10px 14px', background: '#ECEFF1', borderRadius: 6, fontSize: '0.8rem', color: '#455A64', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={14} /> Ce RDV sera identifie comme "Terrain". Il pourra etre converti en prospect ulterieurment.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Annuler</button>
              <button className="btn btn-primary" style={{ background: '#455A64', borderColor: '#455A64' }} onClick={handleSaveRapide} disabled={saving}>{saving ? 'Sauvegarde...' : editing ? 'Mettre a jour' : 'Enregistrer RDV'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auto Compte Rendu Modal ── */}
      {crModalRdv && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>Compte rendu automatique</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 14 }}>Ce RDV est marque comme "Realise". Saisissez un compte rendu rapide.</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Resume *</label>
                <textarea style={{ ...IS(!crForm.resume), resize: 'vertical', minHeight: 80 }} value={crForm.resume} onChange={e => setCrForm(f => ({ ...f, resume: e.target.value }))} placeholder="Ce qui a ete discute..." />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Decision prise</label>
                <input style={IS(false)} value={crForm.decision} onChange={e => setCrForm(f => ({ ...f, decision: e.target.value }))} placeholder="Ex: Client interesse, devis a envoyer" />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Prochaine action</label>
                <input style={IS(false)} value={crForm.prochaine_action} onChange={e => setCrForm(f => ({ ...f, prochaine_action: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setCrModalRdv(null)}>Passer</button>
              <button className="btn btn-primary" onClick={saveCR}>Enregistrer CR</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} onClose={() => setToast('')} />
    </div>
  );
}
