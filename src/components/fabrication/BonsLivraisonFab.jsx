/**
 * BonsLivraisonFab.jsx — Bon de livraison Fabrication (isolé du CRM)
 */
import { useEffect, useState } from 'react';
import {
  Plus, Eye, Edit2, Trash2, Download, Truck, Loader2, RefreshCw, ChevronLeft, Package,
} from 'lucide-react';
import { useFabricationDeliveryNotes } from '../../hooks/useFabricationDeliveryNotes';
import { generateFabricationDeliveryNotePdf } from '../../services/fabrication/fabricationDeliveryNotePdf';
import {
  FAB_INPUT, FAB_TEXTAREA, FabField, FabEmpty, fmtDate,
} from './shared';

const BADGE = {
  Brouillon: 'badge-grey',
  Émis: 'badge-green',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, designation: '', quantite: '' };
}

function toForm(item, numeroHint) {
  if (!item) {
    return {
      numero: numeroHint || '',
      date_bl: todayISO(),
      client_societe: '',
      destinataire_nom: '',
      adresse: '',
      telephone: '',
      lines: [emptyLine()],
      statut: 'Brouillon',
      note: '',
    };
  }
  const lines = (item.lines || item.lignes || []).map((l) => ({
    id: l.id || emptyLine().id,
    designation: l.designation || '',
    quantite: l.quantite ?? '',
  }));
  return {
    numero: item.numero || '',
    date_bl: item.date_bl || todayISO(),
    client_societe: item.client_societe || '',
    destinataire_nom: item.destinataire_nom || '',
    adresse: item.adresse || '',
    telephone: item.telephone || '',
    lines: lines.length ? lines : [emptyLine()],
    statut: item.statut || 'Brouillon',
    note: item.note || '',
  };
}

function BlForm({ initial, numeroHint, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => toForm(initial, numeroHint));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(toForm(initial, numeroHint));
    setErrors({});
  }, [initial?.id, numeroHint]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function setLine(id, key, value) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((l) => (l.id === id ? { ...l, [key]: value } : l)),
    }));
  }

  function addLine() {
    setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }));
  }

  function removeLine(id) {
    setForm((p) => {
      const next = p.lines.filter((l) => l.id !== id);
      return { ...p, lines: next.length ? next : [emptyLine()] };
    });
  }

  async function submit(statut) {
    const meaningful = form.lines.filter((l) => String(l.designation || '').trim());
    const nextErrors = {};
    if (!form.date_bl) nextErrors.date_bl = 'Requis';
    if (!form.client_societe.trim() && !form.destinataire_nom.trim()) {
      nextErrors.destinataire = 'Indiquez au moins la société ou le nom du destinataire.';
    }
    if (!meaningful.length) nextErrors.lines = 'Ajoutez au moins une désignation.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    await onSave({
      ...form,
      lines: meaningful,
      statut: statut || form.statut || 'Brouillon',
    });
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
        }}>
          Informations du bon
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <FabField label="N° Bon de livraison">
            <input value={form.numero} readOnly style={{ ...FAB_INPUT, background: 'var(--surface-2)' }} />
          </FabField>
          <FabField label="Date" required error={errors.date_bl}>
            <input type="date" value={form.date_bl} onChange={(e) => set('date_bl', e.target.value)} style={FAB_INPUT} />
          </FabField>
          <FabField label="Statut">
            <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={FAB_INPUT}>
              <option value="Brouillon">Brouillon</option>
              <option value="Émis">Émis</option>
            </select>
          </FabField>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
        }}>
          Informations destinataire
        </div>
        {errors.destinataire ? (
          <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: 8 }}>{errors.destinataire}</div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <FabField label="Client / Société">
            <input
              value={form.client_societe}
              onChange={(e) => set('client_societe', e.target.value)}
              placeholder="Société"
              style={FAB_INPUT}
            />
          </FabField>
          <FabField label="Nom du destinataire">
            <input
              value={form.destinataire_nom}
              onChange={(e) => set('destinataire_nom', e.target.value)}
              placeholder="Nom"
              style={FAB_INPUT}
            />
          </FabField>
          <FabField label="Téléphone">
            <input
              value={form.telephone}
              onChange={(e) => set('telephone', e.target.value)}
              placeholder="Téléphone"
              style={FAB_INPUT}
            />
          </FabField>
          <div style={{ gridColumn: '1 / -1' }}>
            <FabField label="Adresse">
              <textarea
                value={form.adresse}
                onChange={(e) => set('adresse', e.target.value)}
                placeholder="Adresse de livraison"
                style={FAB_TEXTAREA}
              />
            </FabField>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 10, flexWrap: 'wrap', marginBottom: 12,
        }}>
          <div style={{
            fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Éléments livrés
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
            <Plus size={13} /> Ajouter une ligne
          </button>
        </div>
        {errors.lines ? (
          <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginBottom: 8 }}>{errors.lines}</div>
        ) : null}

        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}>N°</th>
                <th>Désignation</th>
                <th style={{ width: 120 }}>Quantité</th>
                <th style={{ width: 70 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => (
                <tr key={l.id}>
                  <td data-label="N°" style={{ fontWeight: 700, color: 'var(--text-3)' }}>{i + 1}</td>
                  <td data-label="Désignation">
                    <input
                      value={l.designation}
                      onChange={(e) => setLine(l.id, 'designation', e.target.value)}
                      placeholder="Ex. Structure métallique"
                      style={FAB_INPUT}
                    />
                  </td>
                  <td data-label="Quantité">
                    <input
                      value={l.quantite}
                      onChange={(e) => setLine(l.id, 'quantite', e.target.value)}
                      placeholder="Qté"
                      style={FAB_INPUT}
                    />
                  </td>
                  <td data-label="Action">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Supprimer la ligne"
                      onClick={() => removeLine(l.id)}
                      style={{ color: 'var(--red)' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FabField label="Note (optionnel)">
        <textarea
          value={form.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Note interne..."
          style={FAB_TEXTAREA}
        />
      </FabField>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="button" className="btn btn-secondary" onClick={() => submit('Brouillon')} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : null} Enregistrer brouillon
        </button>
        <button type="button" className="btn btn-primary" onClick={() => submit('Émis')} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Enregistrer
        </button>
      </div>
    </div>
  );
}

function DetailBl({ item, onBack, onEdit, onDelete, onPdf, pdfLoading, deleting }) {
  const lines = item.lines || item.lignes || [];
  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        <ChevronLeft size={14} /> Retour
      </button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{item.numero}</h1>
          <p className="page-subtitle">{item.client_societe || item.destinataire_nom || '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPdf(item)} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 size={13} className="spin" /> : <Download size={13} />} Télécharger PDF
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>
            <Edit2 size={13} /> Modifier
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(item.id)} disabled={deleting} style={{ color: 'var(--red)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: 16,
      }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Éléments livrés
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>N°</th><th>Désignation</th><th>Quantité</th></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id || i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{l.designation || '—'}</td>
                    <td>{l.quantite === '' || l.quantite == null ? '—' : l.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.78rem', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Synthèse
          </div>
          {[
            ['Date', fmtDate(item.date_bl)],
            ['Société', item.client_societe || '—'],
            ['Destinataire', item.destinataire_nom || '—'],
            ['Adresse', item.adresse || '—'],
            ['Téléphone', item.telephone || '—'],
            ['Lignes', String(item.nb_lignes ?? lines.length)],
            ['Statut', <span className={`badge ${BADGE[item.statut] || 'badge-grey'}`}>{item.statut}</span>],
          ].map(([label, value]) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border)', fontSize: '0.83rem',
            }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BonsLivraisonFab() {
  const {
    records, loading, saving, error, configured, reload, save, remove, nextNumero,
  } = useFabricationDeliveryNotes();
  const [view, setView] = useState('liste'); // liste | form | detail
  const [editItem, setEditItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [numeroHint, setNumeroHint] = useState('');
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  async function openNew() {
    setEditItem(null);
    setNumeroHint(await nextNumero());
    setView('form');
  }

  function openEdit(item) {
    setEditItem(item);
    setNumeroHint(item.numero || '');
    setView('form');
  }

  function openDetail(item) {
    setDetailItem(item);
    setView('detail');
  }

  async function handleSave(form) {
    const res = await save(form, editItem?.id);
    if (res.success) {
      setView('liste');
      setEditItem(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce bon de livraison ?')) return;
    const res = await remove(id);
    if (res.success) {
      setView('liste');
      setDetailItem(null);
    }
  }

  async function handlePdf(item) {
    setPdfLoadingId(item.id);
    try {
      await generateFabricationDeliveryNotePdf(item);
    } catch (err) {
      console.error('[CITYMO] PDF BL Fabrication', err);
      window.alert(err?.message || 'Erreur génération PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }

  if (view === 'form') {
    return (
      <div className="animate-fade-in">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setView('liste'); setEditItem(null); }}
        >
          <ChevronLeft size={14} /> Retour
        </button>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          {editItem ? 'Modifier le bon de livraison' : 'Nouveau bon de livraison'}
        </h1>
        <p className="page-subtitle" style={{ marginBottom: 16 }}>Fabrication — document libre (sans stock)</p>
        {error ? <div className="card" style={{ padding: 12, marginBottom: 12, color: 'var(--red)' }}>{error}</div> : null}
        <BlForm
          initial={editItem}
          numeroHint={numeroHint}
          onSave={handleSave}
          onCancel={() => { setView('liste'); setEditItem(null); }}
          saving={saving}
        />
      </div>
    );
  }

  if (view === 'detail' && detailItem) {
    const fresh = records.find((r) => r.id === detailItem.id) || detailItem;
    return (
      <DetailBl
        item={fresh}
        onBack={() => { setView('liste'); setDetailItem(null); }}
        onEdit={openEdit}
        onDelete={handleDelete}
        onPdf={handlePdf}
        pdfLoading={pdfLoadingId === fresh.id}
        deleting={saving}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>BON DE LIVRAISON</h1>
          <p className="page-subtitle">Fabrication — création libre et PDF CITYMO</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualiser
          </button>
          <button type="button" className="btn btn-primary" onClick={openNew} disabled={!configured}>
            <Plus size={14} /> Nouveau bon de livraison
          </button>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 14, marginBottom: 14, color: 'var(--red)', fontSize: '0.86rem' }}>
          {error}
        </div>
      ) : null}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement...
          </div>
        ) : records.length === 0 ? (
          <FabEmpty
            icon={<Truck size={24} />}
            title="Aucun bon de livraison"
            sub="Créez un BL libre pour livraison atelier / client"
            hint="Aucune liaison stock, CRM ou facturation"
          />
        ) : (
          <div className="table-wrap table-wrap--wide">
            <table>
              <thead>
                <tr>
                  <th>N° BL</th>
                  <th>Date</th>
                  <th>Destinataire / Client</th>
                  <th>Nombre de lignes</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>
                        {x.numero}
                      </span>
                    </td>
                    <td data-label="Date">{fmtDate(x.date_bl)}</td>
                    <td data-label="Destinataire" style={{ fontWeight: 600 }}>
                      {x.client_societe || x.destinataire_nom || '—'}
                      {x.client_societe && x.destinataire_nom ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>{x.destinataire_nom}</div>
                      ) : null}
                    </td>
                    <td data-label="Lignes">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Package size={12} /> {x.nb_lignes ?? (x.lines || []).length}
                      </span>
                    </td>
                    <td data-label="Statut">
                      <span className={`badge ${BADGE[x.statut] || 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(x)}>
                          <Eye size={13} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEdit(x)}>
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="PDF"
                          onClick={() => handlePdf(x)}
                          disabled={pdfLoadingId === x.id}
                        >
                          {pdfLoadingId === x.id ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Supprimer"
                          onClick={() => handleDelete(x.id)}
                          style={{ color: 'var(--red)' }}
                        >
                          <Trash2 size={13} />
                        </button>
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
  );
}
