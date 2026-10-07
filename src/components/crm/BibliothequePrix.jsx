/**
 * BibliothequePrix.jsx — CRM › Bibliothèque de prix.
 * Lecture seule : prix issus de tous les devis et factures, export Excel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, Loader2, Search, FileText, ScrollText, RefreshCw } from 'lucide-react';
import { loadPriceLines, buildPriceLibrary, exportPriceLibraryExcel } from '../../services/crm/priceLibrary';
import { INPUT_STYLE, KpiCard } from '../achats/shared.jsx';

const PREVIEW_LIMIT = 300;

function fmtMad(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

function normQuery(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function BibliothequePrix() {
  const [data, setData] = useState({ lines: [], nbDevis: 0, nbFactures: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loadPriceLines());
    } catch (err) {
      setError(err?.message || 'Impossible de charger les devis et factures.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const library = useMemo(() => buildPriceLibrary(data.lines), [data.lines]);
  const filtered = useMemo(() => {
    const q = normQuery(search);
    if (!q) return library;
    return library.filter((r) => normQuery(`${r.designation} ${r.categorie} ${r.unite}`).includes(q));
  }, [library, search]);

  function handleExport() {
    setExporting(true);
    try {
      exportPriceLibraryExcel(library, data.lines);
    } catch (err) {
      setError(err?.message || 'Erreur export Excel.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-fade-in recup-page">
      <div className="page-header recup-header" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="recup-header-text" style={{ minWidth: 0 }}>
          <h1 className="page-title">Bibliothèque de prix</h1>
          <p className="page-subtitle recup-page-sub">
            Prix pratiqués dans tous les devis et factures, regroupés par désignation et unité.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading} title="Actualiser">
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
          </button>
          <button type="button" className="btn btn-primary recup-new-btn" onClick={handleExport} disabled={loading || exporting || !library.length}>
            {exporting ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            <span className="recup-new-btn-long">Exporter Excel</span><span className="recup-new-btn-short">Excel</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#C62828' }}>
          {error}
        </div>
      )}

      <div className="stat-grid recup-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 12 }}>
        <KpiCard icon={<BookOpen size={17} />} label="Articles / prestations" value={loading ? '—' : library.length} color="red" />
        <KpiCard icon={<FileText size={17} />} label="Devis analysés" value={loading ? '—' : data.nbDevis} color="blue" />
        <KpiCard icon={<ScrollText size={17} />} label="Factures analysées" value={loading ? '—' : data.nbFactures} color="green" />
        <KpiCard icon={<BookOpen size={17} />} label="Lignes de prix" value={loading ? '—' : data.lines.length} color="grey" />
      </div>

      <div className="card recup-filters" style={{ padding: '10px 12px', marginBottom: 12 }}>
        <div className="recup-filters-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="recup-filter-search" style={{ position: 'relative', flex: '1 1 260px', minWidth: 0, maxWidth: 420 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une désignation, une catégorie…"
              style={{ ...INPUT_STYLE, paddingLeft: 30, minHeight: 36, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
            />
          </div>
        </div>
      </div>

      <div className="card recup-list-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
            <Loader2 size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
            Analyse des devis et factures…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Aucun résultat.</div>
        ) : (
          <>
            <div className="table-wrap recup-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Catégorie</th>
                    <th>Unité</th>
                    <th style={{ textAlign: 'right' }}>Min HT</th>
                    <th style={{ textAlign: 'right' }}>Moyen HT</th>
                    <th style={{ textAlign: 'right' }}>Max HT</th>
                    <th style={{ textAlign: 'right' }}>Dernier HT</th>
                    <th>Dernier document</th>
                    <th style={{ textAlign: 'right' }}>Occ.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, PREVIEW_LIMIT).map((r) => (
                    <tr key={`${r.designation}|${r.unite}`}>
                      <td style={{ maxWidth: 360, fontWeight: 600, fontSize: '0.84rem' }}>{r.designation}</td>
                      <td style={{ fontSize: '0.82rem' }}>{r.categorie || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{r.unite}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>{fmtMad(r.prixMin)}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700 }}>{fmtMad(r.prixMoyen)}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>{fmtMad(r.prixMax)}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>{fmtMad(r.dernierPrix)}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
                        {r.dernierRef || '—'}
                        <div style={{ color: 'var(--text-3)' }}>{fmtDate(r.dernierDate)}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.82rem' }}>{r.nb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="recup-mobile-list">
              {filtered.slice(0, PREVIEW_LIMIT).map((r) => (
                <li key={`${r.designation}|${r.unite}`} className="recup-mobile-row">
                  <div className="recup-mobile-main">
                    <span className="recup-mobile-quoi" title={r.designation}>{r.designation}</span>
                    <span className="recup-mobile-trajet">
                      {[r.unite, r.categorie, `${r.nb} occ.`].filter(Boolean).join(' · ')}
                    </span>
                    <span className="recup-mobile-trajet">
                      Min {fmtMad(r.prixMin)} · Max {fmtMad(r.prixMax)} · Dernier {fmtMad(r.dernierPrix)}
                    </span>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: '0.86rem', whiteSpace: 'nowrap' }}>{fmtMad(r.prixMoyen)}</span>
                </li>
              ))}
            </ul>

            {filtered.length > PREVIEW_LIMIT && (
              <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
                Aperçu limité à {PREVIEW_LIMIT} lignes sur {filtered.length} — l’export Excel contient tout.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
