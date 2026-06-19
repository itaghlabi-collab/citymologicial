/**
 * barcodeUtils.js — Génération CODE128 à partir du code article
 */
import JsBarcode from 'jsbarcode';

export function getArticleBarcodeValue(article) {
  if (!article) return '';
  return String(article.barcode_value || article.code || article.reference || '').trim();
}

export function renderBarcodeCanvas(value, options = {}) {
  const code = String(value || '').trim();
  if (!code) return null;
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, {
    format: 'CODE128',
    width: options.width ?? 2,
    height: options.height ?? 56,
    displayValue: options.displayValue ?? true,
    fontSize: options.fontSize ?? 13,
    margin: options.margin ?? 10,
    textMargin: options.textMargin ?? 4,
    fontOptions: 'bold',
    ...options,
  });
  return canvas;
}

export function renderBarcodeDataUrl(value, options = {}) {
  const canvas = renderBarcodeCanvas(value, options);
  return canvas ? canvas.toDataURL('image/png') : null;
}

export function normalizeScannedCode(raw) {
  return String(raw || '')
    .trim()
    .replace(/[\r\n\t]/g, '')
    .replace(/\s+/g, '');
}
