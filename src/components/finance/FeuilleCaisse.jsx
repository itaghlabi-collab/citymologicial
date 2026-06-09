/**
 * FeuilleCaisse.jsx — Feuille de caisse mensuelle
 */
import { useState } from 'react';
import { Loader2, Plus, Download, FileSpreadsheet, Wallet, Edit2, Trash2, TrendingDown, RefreshCw } from 'lucide-react';
import { useFinanceTransactions } from '../../hooks/useFinanceTransactions';
import { TYPES_ENTREE, TYPES_SORTIE } from '../../services/finance/financeTransactions';
import { exportCashSheetPdf } from '../../services/finance/cashSheetPdf';
import { exportCashSheetExcel } from '../../services/finance/cashSheetExport';
import {
  INPUT_STYLE, SELECT_STYLE, MODES_PAIEMENT,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, genRef,
} from './shared.jsx';

const MOIS_OPTS = [
  { v: 1, l: 'Janvier' }, { v: 2, l: 'Février' }, { v: 3, l: 'Mars' }, { v: 4, l: 'Avril' },
  { v: 5, l: 'Mai' }, { v: 6, l: 'Juin' }, { v: 7, l: 'Juillet' }, { v: 8, l: 'Août' },
  { v: 9, l: 'Septembre' }, { v: 10, l: 'Octobre' }, { v: 11, l: 'Novembre' }, { v: 12, l: 'Décembre' },
];

const EMPTY_TX = {
  date: '', sens: 'entree', type_operation: 'alimentation_caisse',
  contrepartie: '', description: '', montant: '', mode_paiement: 'Espèces',
};

function TxForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_TX);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const types = form.sens === 'entree' ? TYPES_ENTREE : TYPES_SORTIE;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ ...form, montant: parseFloat(form.montant) || 0 }); }}>
      <FRow>
        <FField label="Date" required>
          <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} style={INPUT_STYLE} required />
        </FField>
        <FField label="Sens">
          <select value={form.sens} onChange={(e) => set('sens', e.target.value)} style={SELECT_STYLE}>
            <option value="entree">Entrée de caisse</option>
            <option value="sortie">Sortie de caisse</option>
          </select>
        </FField>
        <FField label="Type">
          <select value={form.type_operation} onChange={(e) => set('type_operation', e.target.value)} style={SELECT_STYLE}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </FField>
        <FField label="Montant (MAD)" required>
          <input type="number" min="0" step="0.01" value={form.montant} onChange={(e) => set('montant', e.target.value)} style={INPUT_STYLE} required />
        </FField>
      </FRow>
      <FRow>
        <FField label="Client / Fournisseur">
          <input value={form.contrepartie} onChange={(e) => set('contrepartie', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Type paiement">
          <select value={form.mode_paiement} onChange={(e) => set('mode_paiement', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
      </FRow>
      <FField label="Description" required>
        <input value={form.description} onChange={(e) => set('description', e.target.value)} style={INPUT_STYLE} required />
      </FField>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary">Enregistrer</button>
      </div>
    </form>
  );
}

const MOIS_LABELS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function FeuilleCaisse() {
  const now = new Date();
  // Feuille Excel de référence : juin 2026
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(6);
  const [showModal, setShowModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showBalance, setShowBalance] = useState(false);
  const [balForm, setBalForm] = useState({ solde_initial: '', alimentation: '', notes: '' });

  const {
    records, balance, totals, loading, saving, error, configured, reload,
    saveTransaction, removeTransaction, saveBalance,
  } = useFinanceTransactions(year, month);

  const periodLabel = `${MOIS_LABELS[month] || month} ${year}`;

  function openBalanceModal() {
    setBalForm({
      solde_initial: balance?.solde_initial ?? '',
      alimentation: balance?.alimentation ?? '',
      notes: balance?.notes ?? '',
    });
    setShowBalance(true);
  }

  async function handleSaveTx(data) {
    const payload = { ...data, ref: data.ref || genRef('CA') };
    const res = editTx
      ? await saveTransaction(payload, editTx.id)
      : await saveTransaction(payload);
    if (res.success) { setShowModal(false); setEditTx(null); }
  }

  async function handleSaveBalance(e) {
    e.preventDefault();
    const res = await saveBalance({
      solde_initial: parseFloat(balForm.solde_initial) || 0,
      alimentation: parseFloat(balForm.alimentation) || 0,
      notes: balForm.notes,
    });
    if (res.success) setShowBalance(false);
  }

  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(y);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">FEUILLE DE CAISSE</h1>
          <p className="page-subtitle">Suivi chronologique des entrées et sorties de caisse.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCashSheetExcel({ year, month, transactions: records, totals })}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCashSheetPdf({ year, month, transactions: records, totals, balance })}>
            <Download size={14} /> PDF
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={openBalanceModal}>
            <Wallet size={14} /> Solde initial
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { setEditTx(null); setShowModal(true); }}>
            <Plus size={15} /> Opération
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
            {MOIS_OPTS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...SELECT_STYLE, maxWidth: 120 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
            Période affichée : <strong>{periodLabel}</strong>
            {!loading && records.length > 0 ? ` — ${records.length} opération(s)` : ''}
          </span>
        </div>
      </div>

      {!configured && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--red)', padding: 14, fontSize: '0.86rem' }}>
          Supabase non configuré. Ajoutez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans votre fichier <code>.env</code>, puis redémarrez l&apos;application.
        </div>
      )}
      {error && <div className="card" style={{ marginBottom: 16, color: 'var(--red)', padding: 14, fontSize: '0.86rem' }}>{error}</div>}

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Wallet size={17} />} label="Solde initial" value={formatMAD(totals.soldeInitial)} color="grey" />
        <KpiCard icon={<Plus size={17} />} label="Alimentation" value={formatMAD(totals.alimentation)} color="purple" />
        <KpiCard icon={<Plus size={17} />} label="Total entrées" value={formatMAD(totals.totalEntrees)} color="green" />
        <KpiCard icon={<TrendingDown size={17} />} label="Total sorties" value={formatMAD(totals.totalSorties)} color="red" />
        <KpiCard icon={<Wallet size={17} />} label="Solde caisse du mois" value={formatMAD(totals.soldeMois)} color="blue" sub="solde_initial + alimentation + entrées − sorties" />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
      ) : records.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet size={22} />}
            title={`Aucune opération — ${periodLabel}`}
            sub={configured && !error
              ? 'Exécutez supabase/RUN_FINANCE_COMPLET.sql dans Supabase, sélectionnez Juin 2026, puis Actualiser.'
              : 'Connectez-vous et vérifiez la configuration Supabase + les tables finance_transactions et cash_monthly_balances.'}
            action="Ajouter opération"
            onAction={() => setShowModal(true)}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client / Fournisseur</th>
                  <th>Description</th>
                  <th>Sortie</th>
                  <th>Entrée</th>
                  <th>Paiement</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Date">{t.date}</td>
                    <td data-label="Contrepartie">{t.contrepartie || '—'}</td>
                    <td data-label="Description">{t.description}</td>
                    <td data-label="Sortie" style={{ color: 'var(--red)', fontWeight: 600 }}>
                      {t.sens === 'sortie' ? formatMAD(t.montant) : '—'}
                    </td>
                    <td data-label="Entrée" style={{ color: '#2E7D32', fontWeight: 600 }}>
                      {t.sens === 'entree' ? formatMAD(t.montant) : '—'}
                    </td>
                    <td data-label="Paiement">{t.mode_paiement}</td>
                    <td data-label="Actions">
                      {!t.charge_id && !t.payment_order_id && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditTx(t); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeTransaction(t.id)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditTx(null); }} title={editTx ? 'Modifier opération' : 'Nouvelle opération caisse'}>
        <TxForm initial={editTx || { ...EMPTY_TX, date: new Date().toISOString().slice(0, 10) }} onSave={handleSaveTx} onCancel={() => { setShowModal(false); setEditTx(null); }} />
      </Modal>

      <Modal open={showBalance} onClose={() => setShowBalance(false)} title="Paramètres du mois" width={480}>
        <form onSubmit={handleSaveBalance}>
          <FRow>
            <FField label="Solde caisse mois précédent">
              <input type="number" step="0.01" value={balForm.solde_initial} onChange={(e) => setBalForm((p) => ({ ...p, solde_initial: e.target.value }))} style={INPUT_STYLE} />
            </FField>
            <FField label="Alimentation caisse">
              <input type="number" step="0.01" value={balForm.alimentation} onChange={(e) => setBalForm((p) => ({ ...p, alimentation: e.target.value }))} style={INPUT_STYLE} />
            </FField>
          </FRow>
          <FField label="Notes">
            <textarea value={balForm.notes} onChange={(e) => setBalForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...INPUT_STYLE, minHeight: 64 }} />
          </FField>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowBalance(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
