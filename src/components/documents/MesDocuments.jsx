/**
 * MesDocuments.jsx — Sous-module Mes Documents ERP CITYMO
 * GED personnelle — Backend-ready / Storage-ready
 */

import {
  FileText, Plus, Eye, Download, Share2, Trash2, Search, Filter,
  Folder, FolderOpen, Edit2, Archive, Link, Star, MoreHorizontal,
  Upload, ChevronRight, RefreshCw, X, Move
} from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  TYPE_COLORS, TYPES_FICHIER, CATEGORIES_DOC, NIVEAUX_ACCES,
  formatBytes, genId
} from './shared.jsx';

const EMPTY_FORM = {
  nom: '', categorie: '', dossier: '', projet_lie: '', client_lie: '',
  departement: '', tags: '', description: '', niveau_acces: 'Équipe',
  type: 'PDF', taille: 0
};

function FileTypeIcon({ type }) {
  const colors = { PDF: 'var(--red)', Excel: '#2E7D32', Word: '#1565C0', Image: '#E65100', ZIP: '#6A1B9A', Video: '#00838F', Autre: 'var(--text-3)' };
  return (
    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: colors[type] || 'var(--text-3)' }}>
      <FileText size={17} />
    </div>
  );
}

function DossierNode({ nom, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      data-active={active ? 'true' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: active ? 'var(--red-light)' : 'transparent', color: active ? 'var(--red)' : 'var(--text-2)', fontWeight: active ? 700 : 500, fontSize: '0.85rem', transition: 'background 0.15s' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'var(--red-light)' : 'transparent'; }}
    >
      {active ? <FolderOpen size={15} /> : <Folder size={15} />}
      <span style={{ flex: 1 }}>{nom}</span>
      {count > 0 && <span style={{ fontSize: '0.7rem', background: 'var(--border)', color: 'var(--text-3)', borderRadius: 10, padding: '1px 7px' }}>{count}</span>}
    </div>
  );
}

function UploadZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  function handleChange(e) {
    const files = Array.from(e.target.files);
    if (files.length) onFiles(files);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      style={{ border: '2px dashed ' + (dragging ? 'var(--red)' : 'var(--border)'), borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: dragging ? 'var(--red-light)' : 'var(--surface-2)', transition: 'all 0.2s', marginBottom: 20 }}
    >
      <Upload size={24} style={{ color: dragging ? 'var(--red)' : 'var(--text-3)', margin: '0 auto 10px', display: 'block' }} />
      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: dragging ? 'var(--red)' : 'var(--text-2)', marginBottom: 4 }}>
        {dragging ? 'Déposer pour uploader' : 'Glisser-déposer ou cliquer pour sélectionner'}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>PDF, Word, Excel, Images, ZIP, Vidéos — Max 50 MB</div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={handleChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.mp4,.mov" />
    </div>
  );
}

function DocumentForm({ initial, dossiers, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [uploadedFile, setUploadedFile] = useState(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleFormFiles(files) {
    const f = files[0];
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    const typeMap = { pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', zip: 'ZIP', mp4: 'Video', mov: 'Video' };
    setUploadedFile(f);
    setForm(p => ({
      ...p,
      nom: p.nom || f.name,
      type: typeMap[ext] || 'Autre',
      taille: f.size,
    }));
  }

  function validate() {
    const e = {};
    if (!form.nom.trim()) e.nom = 'Requis';
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
      {/* Zone upload en haut du formulaire */}
      {!initial && (
        <div style={{ marginBottom: 20 }}>
          <UploadZone onFiles={handleFormFiles} />
          {uploadedFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-2)', marginTop: -12 }}>
              <FileText size={14} style={{ color: 'var(--red)', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedFile.name}</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => { setUploadedFile(null); set('taille', 0); }}><X size={12} /></button>
            </div>
          )}
        </div>
      )}
      <SectionTitle icon={<FileText size={12} />}>Informations document</SectionTitle>
      <FRow>
        <FField label="Nom du document" required>
          <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Nom du fichier..." style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Type">
          <select value={form.type} onChange={e => set('type', e.target.value)} style={SELECT_STYLE}>
            {TYPES_FICHIER.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Catégorie">
          <select value={form.categorie} onChange={e => set('categorie', e.target.value)} style={SELECT_STYLE}>
            <option value="">Choisir...</option>
            {CATEGORIES_DOC.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
      </FRow>
      <FRow>
        <FField label="Dossier">
          <select value={form.dossier} onChange={e => set('dossier', e.target.value)} style={SELECT_STYLE}>
            <option value="">Racine</option>
            {dossiers.map(d => <option key={d.id} value={d.nom}>{d.nom}</option>)}
          </select>
        </FField>
        <FField label="Projet lié"><input value={form.projet_lie} onChange={e => set('projet_lie', e.target.value)} placeholder="Réf. projet..." style={INPUT_STYLE} /></FField>
        <FField label="Client lié"><input value={form.client_lie} onChange={e => set('client_lie', e.target.value)} placeholder="Nom client..." style={INPUT_STYLE} /></FField>
      </FRow>
      <FRow>
        <FField label="Département"><input value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Département..." style={INPUT_STYLE} /></FField>
        <FField label="Tags"><input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="tag1, tag2..." style={INPUT_STYLE} /></FField>
        <FField label="Niveau d'accès">
          <select value={form.niveau_acces} onChange={e => set('niveau_acces', e.target.value)} style={SELECT_STYLE}>
            {NIVEAUX_ACCES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description, contexte..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

function DetailDocument({ doc, onBack, onEdit, onDelete, onShare }) {
  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        ← Retour
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FileTypeIcon type={doc.type} />
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{doc.nom}</h1>
            <p className="page-subtitle">{doc.categorie || '—'} {doc.dossier ? ` — ${doc.dossier}` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Télécharger</button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onShare(doc)}><Share2 size={13} /> Partager</button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)' }} onClick={() => onDelete(doc.id)}><Trash2 size={13} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div>
          {/* Aperçu */}
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<Eye size={13} />}>Aperçu</SectionTitle>
            <div style={{ background: 'var(--surface-2)', borderRadius: 8, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-3)' }}>
              <FileText size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-2)' }}>Aperçu {doc.type}</div>
              <div style={{ fontSize: '0.78rem', marginTop: 4 }}>Connexion stockage cloud requise</div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={13} /> Télécharger</button>
            </div>
          </div>

          {/* Versions */}
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<RefreshCw size={13} />}>Historique des versions</SectionTitle>
            <EmptyState icon={<RefreshCw size={20} />} title="Version unique" sub="Les versions précédentes apparaîtront ici" />
          </div>

          {/* Activité */}
          <div className="card">
            <SectionTitle icon={<Archive size={13} />}>Activité récente</SectionTitle>
            <EmptyState icon={<Archive size={20} />} title="Aucune activité" sub="Les actions sur ce document apparaîtront ici" />
          </div>
        </div>

        {/* Métadonnées */}
        <div className="card">
          <SectionTitle icon={<FileText size={13} />}>Informations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Type', <span className={'badge ' + (TYPE_COLORS[doc.type] || 'badge-grey')}>{doc.type}</span>],
              ['Taille', formatBytes(doc.taille)],
              ['Catégorie', doc.categorie || '—'],
              ['Dossier', doc.dossier || 'Racine'],
              ['Projet lié', doc.projet_lie || '—'],
              ['Client lié', doc.client_lie || '—'],
              ['Département', doc.departement || '—'],
              ['Accès', doc.niveau_acces || '—'],
              ['Uploadé le', doc.date_upload || '—'],
              ['Modifié le', doc.date_modif || '—'],
              ['Tags', doc.tags || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</span>
                <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: 180, wordBreak: 'break-word' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MesDocuments() {
  const [docs, setDocs] = useState([]);
  const [dossiers, setDossiers] = useState([]);
  const [dossierActif, setDossierActif] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [newFolderNom, setNewFolderNom] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  function handleFiles(files) {
    const newDocs = files.map(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      const typeMap = { pdf: 'PDF', doc: 'Word', docx: 'Word', xls: 'Excel', xlsx: 'Excel', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', zip: 'ZIP', mp4: 'Video', mov: 'Video' };
      return {
        id: genId(), nom: f.name, type: typeMap[ext] || 'Autre',
        taille: f.size, date_upload: today, date_modif: today,
        categorie: '', dossier: dossierActif, projet_lie: '', client_lie: '',
        departement: '', tags: '', description: '', niveau_acces: 'Équipe',
        favori: false, archive: false
      };
    });
    setDocs(prev => [...prev, ...newDocs]);
    setShowUpload(false);
  }

  const handleSave = useCallback((data) => {
    if (editDoc) {
      setDocs(prev => prev.map(d => d.id === editDoc.id ? { ...d, ...data, date_modif: today } : d));
    } else {
      setDocs(prev => [...prev, { ...data, id: genId(), date_upload: today, date_modif: today, favori: false, archive: false }]);
    }
    setShowModal(false);
    setEditDoc(null);
  }, [editDoc, today]);

  function handleDelete(id) {
    if (window.confirm('Envoyer ce document à la corbeille ?')) {
      setDocs(prev => prev.filter(d => d.id !== id));
      setDetailDoc(null);
    }
  }

  function handleNewFolder(e) {
    e.preventDefault();
    if (!newFolderNom.trim()) return;
    setDossiers(prev => [...prev, { id: genId(), nom: newFolderNom.trim() }]);
    setNewFolderNom('');
    setShowNewFolder(false);
  }

  const filtered = docs.filter(d => {
    // Vue Favoris : uniquement les favoris non archivés
    if (dossierActif === '__favoris__') {
      if (!d.favori || d.archive) return false;
    // Vue Archivés : uniquement les archivés
    } else if (dossierActif === '__archives__') {
      if (!d.archive) return false;
    // Vue dossier normal : non archivés, dans ce dossier
    } else {
      if (d.archive) return false;
      if (dossierActif && d.dossier !== dossierActif) return false;
    }
    const q = search.toLowerCase();
    const matchQ = !q || d.nom.toLowerCase().includes(q) || (d.tags || '').toLowerCase().includes(q) || (d.client_lie || '').toLowerCase().includes(q);
    const matchT = !filterType || d.type === filterType;
    const matchC = !filterCat || d.categorie === filterCat;
    return matchQ && matchT && matchC;
  });

  const total     = docs.filter(d => !d.archive).length;
  const recents   = docs.filter(d => !d.archive && d.date_upload === today).length;
  const partages  = docs.filter(d => !d.archive && d.niveau_acces !== 'Privé').length;
  const favoris   = docs.filter(d => !d.archive && d.favori).length;
  const archives  = docs.filter(d => d.archive).length;
  const totalSize = docs.filter(d => !d.archive).reduce((s, d) => s + (d.taille || 0), 0);

  if (detailDoc) {
    const d = docs.find(x => x.id === detailDoc);
    if (!d) { setDetailDoc(null); return null; }
    return <DetailDocument doc={d} onBack={() => setDetailDoc(null)} onEdit={() => { setEditDoc(d); setShowModal(true); setDetailDoc(null); }} onDelete={handleDelete} onShare={() => {}} />;
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">MES DOCUMENTS</h1>
          <p className="page-subtitle">Gestion et organisation de vos fichiers et dossiers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowUpload(true)}><Upload size={14} /> Upload</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowNewFolder(true)}><Folder size={14} /> Nouveau dossier</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditDoc(null); setShowModal(true); }}><Plus size={15} /> Nouveau document</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<FileText size={17} />} label="Total documents" value={total}                        color="grey"   />
        <KpiCard icon={<RefreshCw size={17} />} label="Ajoutés aujourd'hui" value={recents}                color="blue"   />
        <KpiCard icon={<Upload size={17} />} label="Espace utilisé"   value={formatBytes(totalSize)}        color="orange" />
        <KpiCard icon={<Share2 size={17} />} label="Partagés"          value={partages}                     color="blue"   />
        <KpiCard icon={<Star size={17} />}   label="Favoris"           value={favoris}                      color="green"  />
        <KpiCard icon={<Archive size={17} />} label="Archivés"         value={archives}                     color="grey"   />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, tags, client..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 150 }}>
              <option value="">Tous les types</option>
              {TYPES_FICHIER.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 170 }}>
              <option value="">Toutes catégories</option>
              {CATEGORIES_DOC.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); setFilterCat(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Layout: sidebar + contenu */}
      <div className={sidebarOpen ? 'docs-layout-with-sidebar' : 'docs-layout-full'}>
        {sidebarOpen && (
          <div className="card docs-sidebar-card" style={{ padding: '14px 10px' }}>
            <div className="docs-sidebar-label" style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, paddingLeft: 4 }}>Dossiers</div>
            <DossierNode nom="Tous les fichiers" count={docs.filter(d => !d.archive).length} active={dossierActif === ''} onClick={() => setDossierActif('')} />
            {dossiers.map(d => (
              <DossierNode key={d.id} nom={d.nom} count={docs.filter(x => !x.archive && x.dossier === d.nom).length} active={dossierActif === d.nom} onClick={() => setDossierActif(d.nom)} />
            ))}
            <DossierNode nom="Favoris"  count={favoris}  active={dossierActif === '__favoris__'}  onClick={() => setDossierActif('__favoris__')}  />
            <DossierNode nom="Archivés" count={archives} active={dossierActif === '__archives__'} onClick={() => setDossierActif('__archives__')} />
          </div>
        )}

        <div>
          {/* Barre recherche rapide (si filtres fermés) */}
          {!showFilters && (
            <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {/* Upload inline */}
            {showUpload && (
              <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Uploader des fichiers</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowUpload(false)}><X size={14} /></button>
                </div>
                <UploadZone onFiles={handleFiles} />
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyState icon={<FileText size={24} />} title="Aucun document" sub={dossierActif ? `Dossier "${dossierActif}" vide` : "Uploadez votre premier document"} action="Uploader un fichier" onAction={() => setShowUpload(true)} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Catégorie</th>
                      <th>Taille</th>
                      <th>Département</th>
                      <th>Uploadé le</th>
                      <th>Accès</th>
                      <th>Modifié</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileTypeIcon type={d.type} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{d.nom}</div>
                              {d.tags && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{d.tags}</div>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Catégorie">{d.categorie ? <span className="badge badge-grey" style={{ fontSize: '0.7rem' }}>{d.categorie}</span> : '—'}</td>
                        <td data-label="Taille">{formatBytes(d.taille)}</td>
                        <td data-label="Département">{d.departement || '—'}</td>
                        <td data-label="Uploadé le">{d.date_upload || '—'}</td>
                        <td data-label="Accès"><span className="badge badge-grey" style={{ fontSize: '0.72rem' }}>{d.niveau_acces}</span></td>
                        <td data-label="Modifié">{d.date_modif || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailDoc(d.id)}><Eye size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Télécharger"><Download size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditDoc(d); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title={d.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => setDocs(prev => prev.map(x => x.id === d.id ? { ...x, favori: !x.favori } : x))} style={{ color: d.favori ? '#E65100' : undefined }}><Star size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title={d.archive ? 'Désarchiver' : 'Archiver'} onClick={() => setDocs(prev => prev.map(x => x.id === d.id ? { ...x, archive: !x.archive } : x))} style={{ color: d.archive ? 'var(--red)' : undefined }}><Archive size={13} /></button>
                            <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(d.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal formulaire */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditDoc(null); }} title={editDoc ? 'Modifier le document' : 'Nouveau document'} width={680}>
        <DocumentForm initial={editDoc} dossiers={dossiers} onSave={handleSave} onCancel={() => { setShowModal(false); setEditDoc(null); }} />
      </Modal>

      {/* Modal nouveau dossier */}
      <Modal open={showNewFolder} onClose={() => setShowNewFolder(false)} title="Nouveau dossier" width={380}>
        <form onSubmit={handleNewFolder}>
          <FField label="Nom du dossier" required>
            <input autoFocus value={newFolderNom} onChange={e => setNewFolderNom(e.target.value)} placeholder="Ex: Chantiers 2026" style={INPUT_STYLE} />
          </FField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Folder size={14} /> Créer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
