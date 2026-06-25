/**
 * pdfUnicode.js — Police Noto Sans pour PDF CITYMO (accents français, caractères spéciaux)
 */
const NOTO_REGULAR =
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
const NOTO_BOLD =
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf';

let fontsLoaded = false;

async function fetchTtfBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Police PDF indisponible (${url})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Enregistre Noto Sans dans le document jsPDF (une seule fois par session). */
export async function setupPdfUnicodeFont(doc) {
  if (!fontsLoaded) {
    const [regular, bold] = await Promise.all([
      fetchTtfBase64(NOTO_REGULAR),
      fetchTtfBase64(NOTO_BOLD),
    ]);
    doc.addFileToVFS('NotoSans-Regular.ttf', regular);
    doc.addFileToVFS('NotoSans-Bold.ttf', bold);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    fontsLoaded = true;
  }
  doc.setFont('NotoSans', 'normal');
}

export function setPdfFont(doc, style = 'normal') {
  doc.setFont('NotoSans', style);
}
