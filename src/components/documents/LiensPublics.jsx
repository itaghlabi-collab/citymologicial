/**
 * LiensPublics.jsx — Liens publics sécurisés ERP CITYMO
 * Backend-ready / Storage-ready
 */

import {
  Link, Plus, Eye, Download, Trash2, Search, Filter,
  Copy, RefreshCw, Lock, X, Clock, Globe, ShieldCheck
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, genId
} from './shared.jsx';

const EMPTY_LINK = {
  document: '', date_creation: new Date().toISOString().slice(0, 10),
  expiration: '', mot_de_passe: '', acces_unique: false, telechargement: true,
  lecture_seule: true, notes: ''
};

function genToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function LienForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_LINK);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.document.trim()) e.document = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Link size={12} />}>Générer un lien public</SectionTitle>
      <FRow>
        <div style={{ gridColumn: '1 / -1' }}>
          <FField label="Document" required>
            <input value={form.document} onChange={e => set('document', e.target.value)} placeholder="Nom ou référence du document..." style={{ ...INPUT_STYLE, borderColor: errors.document ? 'var(--red)' : 'var(--border)' }} />
            {errors.document && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.document}</div>}
          </FField>
        </div>
      </FRow>
      <SectionTitle icon={<Lock size={12} />}>Paramètres du lien</SectionTitle>
      <FRow>
        <FField label="Date expiration">
          <input type="date" value={form.expiration} onChange={e => set('expiration', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Mot de passe (optionnel)">
          <input type="password" value={form.mot_de_passe} onChange={e => set('mot_de_passe', e.target.value)} placeholder="Laisser vide pour aucun" style={INPUT_STYLE} />
        </FField>
      </FRow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {[
          ['acces_unique', 'Accès unique (expire après un accès)'],
          ['telechargement', 'Téléchargement autorisé'],
          ['lecture_seule', 'Lecture seule'],
        ].map(([k, lbl]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text-2)' }}>
            <input type="checkbox" checked={!!form[k]} onChange={e => set(k, e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--red)' }} />
            {lbl}
          </label>
        ))}
      </div>
      <div style={{ marginBottom: 20 }}>
        <FField label="Notes internes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Destinataire, contexte..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link size={14} /> {initial ? 'Enregistrer' : 'Générer le lien'}
        </button>
      </div>
    </form>
  );
}

export default function LiensPublics() {
  const [liens, setLiens] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editLien, setEditLien] = useState(null);
  const [copied, setCopied] = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const handleSave = useCallback((data) => {
    if (editLien) {
      setLiens(prev => prev.map(l => l.id === editLien.id ? { ...l, ...data } : l));
    } else {
      setLiens(prev => [...prev, { ...data, id: genId(), token: genToken(), acces_count: 0, statut: 'actif' }]);
    }
    setShowModal(false);
    setEditLien(null);
  }, [editLien]);

  function handleDelete(id) {
    if (window.confirm('Supprimer ce lien public ?')) setLiens(prev => prev.filter(l => l.id !== id));
  }

  function handleCopy(l) {
    const url = 'https://citymo.share/' + l.token;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(l.id);
    setTimeout(() => setCopied(null), 1800);
  }

  function handleToggle(id) {
    setLiens(prev => prev.map(l => l.id === id ? { ...l, statut: l.statut === 'actif' ? 'desactive' : 'actif' } : l));
  }

  const filtered = liens.filter(l => {
    const q = search.toLowerCase();
    const matchQ = !q || l.document.toLowerCase().includes(q) || l.token.includes(q);
    const isExpired = l.expiration && l.expiration < today;
    const st = l.statut === 'desactive' ? 'desactive' : isExpired ? 'expire' : 'actif';
    const matchS = !filterStatut || st === filterStatut;
    return matchQ && matchS;
  });

  const actifs   = liens.filter(l => l.statut === 'actif' && (!l.expiration || l.expiration >= today)).length;
  const expires  = liens.filter(l => l.expiration && l.expiration < today).length;
  const totalDL  = liens.reduce((s, l) => s + (l.acces_count || 0), 0);
  const total    = liens.length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">LIENS PUBLICS</h1>
          <p className="page-subtitle">Gestion des liens de partage externes sécurisés.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditLien(null); setShowModal(true); }}><Plus size={15} /> Générer un lien</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Link size={17} />}       label="Liens actifs"    value={actifs}   color="green"  />
        <KpiCard icon={<Clock size={17} />}       label="Liens expirés"   value={expires}  color="red"    />
        <KpiCard icon={<Download size={17} />}    label="Téléchargements" value={totalDL}  color="blue"   />
        <KpiCard icon={<Globe size={17} />}       label="Accès externes"  value={totalDL}  color="orange" />
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Document, token..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous les statuts</option>
              <option value="actif">Actif</option>
              <option value="expire">Expiré</option>
              <option value="desactive">Désactivé</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un lien..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Link size={24} />} title="Aucun lien public" sub="Générez des liens de partage sécurisés pour vos documents" action="Générer un lien" onAction={() => { setEditLien(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Lien / Token</th>
                  <th>Créé le</th>
                  <th>Expiration</th>
                  <th>Accès</th>
                  <th>Téléch.</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const isExpired = l.expiration && l.expiration < today;
                  const st = l.statut === 'desactive' ? 'desactive' : isExpired ? 'expire' : 'actif';
                  const stBadge = st === 'actif' ? 'badge-green' : st === 'expire' ? 'badge-red' : 'badge-grey';
                  const stLabel = st === 'actif' ? 'Actif' : st === 'expire' ? 'Expiré' : 'Désactivé';
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.document}</td>
                      <td data-label="Token">
                        <span style={{ fontFamily: 'var(--font-head)', fontSize: '0.78rem', color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>
                          citymo.share/{l.token?.slice(0, 8)}…
                        </span>
                      </td>
                      <td data-label="Créé le">{l.date_creation}</td>
                      <td data-label="Expiration">
                        {l.expiration
                          ? <span style={{ color: isExpired ? 'var(--red)' : 'inherit' }}>{l.expiration}</span>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td data-label="Accès">{l.acces_count || 0}</td>
                      <td data-label="Téléch.">{l.telechargement ? <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>Oui</span> : <span className="badge badge-grey" style={{ fontSize: '0.7rem' }}>Non</span>}</td>
                      <td data-label="Statut"><span className={'badge ' + stBadge} style={{ fontSize: '0.7rem' }}>{stLabel}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" title={copied === l.id ? 'Copié !' : 'Copier le lien'} onClick={() => handleCopy(l)} style={{ color: copied === l.id ? '#2E7D32' : undefined }}>
                            <Copy size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditLien(l); setShowModal(true); }}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title={l.statut === 'actif' ? 'Désactiver' : 'Activer'} onClick={() => handleToggle(l.id)}>
                            <RefreshCw size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(l.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditLien(null); }} title={editLien ? 'Modifier le lien' : 'Générer un lien public'} width={580}>
        <LienForm initial={editLien} onSave={handleSave} onCancel={() => { setShowModal(false); setEditLien(null); }} />
      </Modal>
    </div>
  );
}
