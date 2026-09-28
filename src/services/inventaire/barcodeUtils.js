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

function getBarcodeModules(code) {
  const target = {};
  JsBarcode(target, code, { format: 'CODE128' });
  return (target.encodings || []).map((e) => e.data || '').join('');
}

/**
 * Code-barres vectoriel (barres + SVG), ajusté à une largeur max (px).
 * bars : positions dans le repère pxW × pxH.
 */
export function renderBarcodeForPrint(value, { maxWidthPx = 520, barHeight = 72, margin = 6 } = {}) {
  const code = String(value || '').trim();
  if (!code) return null;

  let modules;
  try {
    modules = getBarcodeModules(code);
  } catch {
    return null;
  }
  if (!modules) return null;

  const moduleW = Math.min(3, (maxWidthPx - margin * 2) / modules.length);
  const pxW = modules.length * moduleW + margin * 2;
  const pxH = barHeight + margin * 2;

  const bars = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] !== '1') { i += 1; continue; }
    let j = i;
    while (j < modules.length && modules[j] === '1') j += 1;
    bars.push({ x: margin + i * moduleW, w: (j - i) * moduleW });
    i = j;
  }

  const rects = bars
    .map((b) => `<rect x="${b.x}" y="${margin}" width="${b.w}" height="${barHeight}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pxW} ${pxH}" width="${pxW}" height="${pxH}" shape-rendering="crispEdges">`
    + `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;

  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    pxW,
    pxH,
    bars,
    barTop: margin,
    barHeight,
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
 * Douchette configurée en clavier QWERTY sur un poste AZERTY :
 * « QRT)éàé§)à§'( » → « ART-2026-0645 ». Les codes articles ne contiennent jamais
 * ces caractères AZERTY, donc un scan correct n'est jamais modifié.
 */
const AZERTY_TO_QWERTY = {
  '&': '1', 'é': '2', '"': '3', "'": '4', '’': '4', '(': '5',
  '§': '6', 'è': '7', '!': '8', 'ç': '9', 'à': '0',
  ')': '-', '_': '8', '?': 'M',
  a: 'q', q: 'a', z: 'w', w: 'z', A: 'Q', Q: 'A', Z: 'W', W: 'Z',
};
const AZERTY_MARKERS = /[&é"'’(§èçà]/;

function fixAzertyScan(s) {
  if (!AZERTY_MARKERS.test(s)) return s;
  return Array.from(s).map((ch) => (ch === '-' ? '6' : (AZERTY_TO_QWERTY[ch] ?? ch))).join('');
}

/**
 * Extrait le code article depuis un scan douchette (CODE128) ou QR (URL).
 * Ex. TYJ2X8GA ou https://citymo.app/inventaire/articles/TYJ2X8GA
 */
export function parseScannedArticleCode(raw) {
  let s = normalizeScannedCode(raw);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = fixAzertyScan(s);

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
