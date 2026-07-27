/**
 * Zones OCR CIN marocaine — miroir de ocr-service/app/zones.py
 * Coordonnées relatives 0–1 sur la carte (après redressement / crop cadre).
 */
export const RECTO_ZONES = [
  { field: 'nom_arabe', x: 0.30, y: 0.06, w: 0.64, h: 0.12, lang: 'ara', psm: 7, whitelist: '', pad: 0.01, minHeight: 48 },
  { field: 'prenom_arabe', x: 0.30, y: 0.14, w: 0.64, h: 0.10, lang: 'ara', psm: 7, whitelist: '', pad: 0.01, minHeight: 48 },
  { field: 'nom', x: 0.30, y: 0.22, w: 0.64, h: 0.11, lang: 'fra', psm: 7, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ-' ", pad: 0.012, minHeight: 48 },
  { field: 'prenom', x: 0.30, y: 0.32, w: 0.64, h: 0.11, lang: 'fra', psm: 7, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ-' ", pad: 0.012, minHeight: 48 },
  { field: 'date_naissance', x: 0.30, y: 0.42, w: 0.42, h: 0.10, lang: 'digits', psm: 7, whitelist: '0123456789./- ', pad: 0.012, minHeight: 48 },
  { field: 'lieu_naissance', x: 0.30, y: 0.51, w: 0.58, h: 0.10, lang: 'fra', psm: 7, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸÆŒ-' ", pad: 0.012, minHeight: 48 },
  { field: 'sexe', x: 0.30, y: 0.60, w: 0.22, h: 0.09, lang: 'fra', psm: 7, whitelist: 'MF ', pad: 0.012, minHeight: 40 },
  { field: 'nationalite', x: 0.50, y: 0.60, w: 0.44, h: 0.09, lang: 'fra', psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ ', pad: 0.012, minHeight: 40 },
  { field: 'numero_cin', x: 0.30, y: 0.70, w: 0.55, h: 0.14, lang: 'digits', psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', pad: 0.012, minHeight: 48 },
  { field: 'numero_cin_alt', x: 0.04, y: 0.78, w: 0.28, h: 0.14, lang: 'digits', psm: 7, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', pad: 0.012, minHeight: 48 },
];

export const VERSO_ZONES = [
  { field: 'adresse', x: 0.05, y: 0.06, w: 0.90, h: 0.22, lang: 'mixed', psm: 6, whitelist: '', pad: 0.01, minHeight: 48 },
  { field: 'autorite', x: 0.05, y: 0.28, w: 0.90, h: 0.14, lang: 'fra', psm: 7, whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ-' ", pad: 0.012, minHeight: 48 },
  { field: 'date_emission', x: 0.05, y: 0.42, w: 0.42, h: 0.12, lang: 'digits', psm: 7, whitelist: '0123456789./- ', pad: 0.012, minHeight: 48 },
  { field: 'date_expiration', x: 0.48, y: 0.42, w: 0.46, h: 0.12, lang: 'digits', psm: 7, whitelist: '0123456789./- ', pad: 0.012, minHeight: 48 },
  { field: 'mrz', x: 0.02, y: 0.60, w: 0.96, h: 0.36, lang: 'mrz', psm: 6, whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<', pad: 0.005, minHeight: 64 },
];

export function zonesForSide(side) {
  return side === 'verso' ? VERSO_ZONES : RECTO_ZONES;
}
