/**
 * useArticleScanner.js — Recherche article par scan (douchette / QR)
 */
import { useState, useCallback } from 'react';
import { parseScannedArticleCode } from '../services/inventaire/barcodeUtils';
import { findStockArticleByBarcode, recordStockArticleScan } from '../services/inventaire/stockArticles';
import { playScanBeep, articleScanLabel } from '../services/inventaire/scanFeedback';

const NOT_FOUND_MSG = '❌ Article introuvable';

export function useArticleScanner({ articles = [], onFound, onNotFound, validateFound } = {}) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanSuccess, setScanSuccess] = useState('');

  const clearScanFeedback = useCallback(() => {
    setScanError('');
    setScanSuccess('');
  }, []);

  const handleScan = useCallback(async (rawCode) => {
    const code = parseScannedArticleCode(rawCode);
    if (!code) return null;

    setScanning(true);
    setScanError('');
    setScanSuccess('');

    try {
      const article = await findStockArticleByBarcode(code, articles);
      if (!article) {
        setScanError(NOT_FOUND_MSG);
        playScanBeep('error');
        onNotFound?.(code);
        return null;
      }

      if (validateFound && !validateFound(article)) {
        setScanError('❌ Article introuvable dans cette opération');
        playScanBeep('error');
        onNotFound?.(code);
        return null;
      }

      await recordStockArticleScan(article.id).catch(() => {});

      const label = articleScanLabel(article);
      setScanSuccess(`✓ ${label}`);
      playScanBeep('success');
      onFound?.(article, code);

      setTimeout(() => setScanSuccess(''), 2800);
      return article;
    } catch {
      setScanError(NOT_FOUND_MSG);
      playScanBeep('error');
      onNotFound?.(code);
      return null;
    } finally {
      setScanning(false);
    }
  }, [articles, onFound, onNotFound, validateFound]);

  return {
    handleScan,
    scanning,
    scanError,
    scanSuccess,
    clearScanFeedback,
    notFoundMessage: NOT_FOUND_MSG,
  };
}
