/**
 * workerEngagementDoc.js — Engagement ouvrier (Word) pré-rempli depuis la fiche :
 * nom complet, CIN, fonction, lieu/date. Modèle : public/templates/engagement_ouvrier.docx
 * (archive ZIP non compressée : lecture / réécriture sans bibliothèque).
 */
const TEMPLATE_URL = '/templates/engagement_ouvrier.docx';
const DOCUMENT_XML = 'word/document.xml';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayFr() {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function buildEngagementFields(worker) {
  const nomComplet = `${worker?.prenom || ''} ${worker?.nom || ''}`.trim().toUpperCase();
  return {
    NOM_COMPLET: nomComplet || '—',
    CIN: String(worker?.cin || worker?.numero_cin || '').trim().toUpperCase() || '—',
    FONCTION: String(worker?.fonction || '').trim() || '—',
    LIEU_DATE: `الدار البيضاء في ${todayFr()}`,
  };
}

let crcTable = null;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Entrées d'une archive ZIP « stored » (méthode 0), via le répertoire central. */
function readStoredZip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Modèle d’engagement invalide.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Modèle d’engagement invalide.');
    const method = view.getUint16(p + 10, true);
    const time = view.getUint16(p + 12, true);
    const date = view.getUint16(p + 14, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    if (method !== 0) throw new Error('Modèle d’engagement compressé non pris en charge.');
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({
      name: new TextDecoder().decode(nameBytes),
      nameBytes,
      time,
      date,
      data: buf.subarray(start, start + size),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function writeStoredZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  entries.forEach((e) => {
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + e.nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, e.time, true);
    lv.setUint16(12, e.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, e.nameBytes.length, true);
    local.set(e.nameBytes, 30);

    const cd = new Uint8Array(46 + e.nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, e.time, true);
    cv.setUint16(14, e.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, e.nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(e.nameBytes, 46);

    parts.push(local, e.data);
    central.push(cd);
    offset += local.length + e.data.length;
  });
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function buildWorkerEngagementBlob(worker, templateBytes) {
  const entries = readStoredZip(templateBytes);
  const doc = entries.find((e) => e.name === DOCUMENT_XML);
  if (!doc) throw new Error('Modèle d’engagement invalide.');
  let xml = new TextDecoder().decode(doc.data);
  Object.entries(buildEngagementFields(worker)).forEach(([key, value]) => {
    xml = xml.split(`{{${key}}}`).join(escapeXml(value));
  });
  doc.data = new TextEncoder().encode(xml);
  return writeStoredZip(entries);
}

export async function downloadWorkerEngagement(worker) {
  const res = await fetch(TEMPLATE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Modèle d’engagement introuvable.');
  const blob = await buildWorkerEngagementBlob(worker, new Uint8Array(await res.arrayBuffer()));
  const safeName = `${worker?.nom || 'ouvrier'}_${worker?.prenom || ''}`.replace(/[^\w-]+/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `engagement_${safeName}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
