/**
 * BarcodeModal.jsx — Voir / télécharger / imprimer étiquette code-barres
 */
import { Barcode, Download, Printer } from 'lucide-react';
import { Modal } from './shared.jsx';
import BarcodeDisplay from './BarcodeDisplay';
import { getArticleBarcodeValue } from '../../services/inventaire/barcodeUtils';
import { downloadStockArticleLabel, printStockArticleLabel } from '../../services/inventaire/stockArticleLabelPdf';

export default function BarcodeModal({ open, article, categoryName, onClose }) {
  if (!open || !article) return null;
  const code = getArticleBarcodeValue(article);

  return (
    <Modal open={open} onClose={onClose} title="Code-barres article" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0 4px' }}>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: 'var(--red)' }}>CITYMO</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.95rem' }}>{code}</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', marginTop: 4 }}>{article.designation}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 6 }}>
            {[categoryName, article.etat, article.emplacement].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ width: '100%', maxWidth: 360, padding: '12px 16px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
          <BarcodeDisplay article={article} height={64} width={2} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadStockArticleLabel(article, categoryName)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={14} /> Télécharger étiquette
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => printStockArticleLabel(article, categoryName)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} /> Imprimer étiquette
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
          <Barcode size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Format CODE128 — valeur : {code}
        </p>
      </div>
    </Modal>
  );
}
