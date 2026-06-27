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

/** Génère un code-barres net, ajusté à une largeur max (px). */
export function renderBarcodeForPrint(value, { maxWidthPx = 520, barHeight = 72, margin = 6 } = {}) {
  const code = String(value || '').trim();
  if (!code) return null;

  let moduleW = 3;
  let canvas = renderBarcodeCanvas(code, {
    width: moduleW,
    height: barHeight,
    displayValue: false,
    margin,
    textMargin: 0,
  });

  for (let i = 0; i < 8 && canvas && canvas.width > maxWidthPx; i += 1) {
    moduleW = Math.max(1, moduleW * (maxWidthPx / canvas.width));
    canvas = renderBarcodeCanvas(code, {
      width: moduleW,
      height: barHeight,
      displayValue: false,
      margin,
      textMargin: 0,
    });
  }

  if (!canvas) return null;
  return {
    dataUrl: canvas.toDataURL('image/png'),
    pxW: canvas.width,
    pxH: canvas.height,
  };
}

export function renderBarcodeDataUrl(value, options = {}) {
  const scale = options.scale || 1;
  const { scale: _s, ...barcodeOpts } = options;
  const base = {
    width: (barcodeOpts.width ?? 2) * scale,
    height: (barcodeOpts.height ?? 56) * scale,
    margin: (barcodeOpts.margin ?? 10) * scale,
    ...barcodeOpts,
  };
  const canvas = renderBarcodeCanvas(value, base);
  return canvas ? canvas.toDataURL('image/png') : null;
}

function containSize(naturalW, naturalH, maxW, maxH) {
  if (!naturalW || !naturalH) return { width: maxW, height: maxH };
  const ratio = naturalW / naturalH;
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width, height };
}

export function containBarcodeMm(barcodeMeta, maxWmm, maxHmm) {
  if (!barcodeMeta?.pxW || !barcodeMeta?.pxH) return { width: maxWmm, height: maxHmm };
  return containSize(barcodeMeta.pxW, barcodeMeta.pxH, maxWmm, maxHmm);
}

export function normalizeScannedCode(raw) {
  return String(raw || '')
    .trim()
    .replace(/[\r\n\t]/g, '')
    .replace(/\s+/g, '');
}

/** Chemin relatif fiche article (pour QR code). */
export function getArticleSharePath(code) {
  const c = normalizeScannedCode(code);
  if (!c) return '';
  return `/inventaire/articles/${encodeURIComponent(c)}`;
}

/** URL complète fiche article (QR code étiquette). */
export function getArticlePublicUrl(code) {
  const path = getArticleSharePath(code);
  if (!path) return '';
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/**
 * Extrait le code article depuis un scan douchette (CODE128) ou QR (URL).
 * Ex. TYJ2X8GA ou https://citymo.app/inventaire/articles/TYJ2X8GA
 */
export function parseScannedArticleCode(raw) {
  let s = normalizeScannedCode(raw);
  if (!s) return '';

  const pathMatch = s.match(/\/inventaire\/articles\/([^/?#]+)/i);
  if (pathMatch) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }

  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const m = url.pathname.match(/\/inventaire\/articles\/([^/]+)/i);
      if (m) {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          return m[1];
        }
      }
    } catch {
      /* pas une URL valide */
    }
  }

  return s;
}

/** Code article depuis l’URL /inventaire/articles/CODE (ouverture QR mobile). */
export function parseInventaireArticlePath(pathname) {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const m = String(path).match(/^\/inventaire\/articles\/([^/]+)\/?$/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Met à jour l’URL navigateur pour la fiche article (SPA). */
export function syncArticleRoute(code, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (!code) {
    if (window.location.pathname.startsWith('/inventaire/articles/')) {
      window.history.replaceState({}, '', '/');
    }
    return;
  }
  const path = getArticleSharePath(code);
  if (window.location.pathname === path) return;
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
}
