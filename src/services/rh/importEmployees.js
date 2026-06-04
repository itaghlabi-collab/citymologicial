/**
 * importEmployees.js — Import batch RH employés (sans modifier le schéma Supabase).
 * Dédoublonnage : CIN (email technique) + téléphone normalisé.
 */
import { getSupabase } from '../../lib/supabase';
import { EMPLOYEE_IMPORT_SEED } from '../../data/employeeImportSeed';
import { listEmployees } from './employees';

const TABLE = 'employees';
const EMAIL_DOMAIN = 'employes.citymo.local';

export function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return !s || /^vide$/i.test(s);
}

export function normalizeCin(cin) {
  if (isEmptyValue(cin)) return '';
  return String(cin).trim().toUpperCase();
}

export function normalizePhone(phone) {
  if (isEmptyValue(phone)) return '';
  return String(phone).replace(/\D/g, '');
}

export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstname: '—', lastname: '—' };
  if (parts.length === 1) return { firstname: parts[0], lastname: parts[0] };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

/** Email technique requis par la table (non fourni dans la source) — dérivé du CIN ou du nom uniquement. */
export function buildImportEmail({ cin, firstname, lastname }) {
  const c = normalizeCin(cin);
  if (c) return `${c.toLowerCase()}@${EMAIL_DOMAIN}`;
  const slug = [firstname, lastname]
    .filter(Boolean)
    .join('.')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'employe'}@${EMAIL_DOMAIN}`;
}

export function parseEmbaucheDate(raw) {
  if (isEmptyValue(raw)) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function seedRowToEmployeeRow(seed, existingIndex) {
  const { firstname, lastname } = splitFullName(seed.fullName);
  const cin = normalizeCin(seed.cin);
  const phone = normalizePhone(seed.telephone);
  const email = (seed.email && String(seed.email).trim())
    ? String(seed.email).trim().toLowerCase()
    : buildImportEmail({ cin, firstname, lastname }).toLowerCase();

  const row = {
    firstname: firstname.trim(),
    lastname: lastname.trim(),
    email,
    poste: isEmptyValue(seed.poste) ? '—' : String(seed.poste).trim(),
    department: null,
    department_id: null,
    telephone: phone || null,
    salaire: 0,
    statut: 'Actif',
    date_embauche: parseEmbaucheDate(seed.date_embauche),
    adresse: isEmptyValue(seed.adresse) ? null : String(seed.adresse).trim(),
    numero_cin: cin || null,
    cnss: isEmptyValue(seed.cnss) ? null : String(seed.cnss).trim(),
    rib: isEmptyValue(seed.rib) ? null : String(seed.rib).trim(),
    banque: isEmptyValue(seed.banque) ? null : String(seed.banque).trim(),
    situation_familiale: isEmptyValue(seed.situation_familiale) ? null : String(seed.situation_familiale).trim(),
  };

  if (cin && existingIndex.byCin?.get(cin)) {
    return {
      action: 'update',
      id: existingIndex.byCin.get(cin).id,
      row,
      label: seed.fullName,
      cin,
      phone,
      email,
      reason: 'CIN',
    };
  }
  if (phone && existingIndex.byPhone?.get(phone)) {
    return {
      action: 'update',
      id: existingIndex.byPhone.get(phone).id,
      row,
      label: seed.fullName,
      cin,
      phone,
      email,
      reason: 'telephone',
    };
  }
  if (existingIndex.byEmail?.get(email)) {
    return {
      action: 'update',
      id: existingIndex.byEmail.get(email).id,
      row,
      label: seed.fullName,
      cin,
      phone,
      email,
      reason: 'email',
    };
  }

  return { action: 'insert', row, label: seed.fullName, cin, phone, email };
}

export function buildExistingIndex(existingEmployees) {
  const cins = new Set();
  const phones = new Set();
  const emails = new Set();
  const byCin = new Map();
  const byPhone = new Map();
  const byEmail = new Map();

  (existingEmployees || []).forEach((emp) => {
    const cin = normalizeCin(emp.numero_cin);
    if (cin) {
      cins.add(cin);
      byCin.set(cin, emp);
    }
    const ph = normalizePhone(emp.telephone);
    if (ph) {
      phones.add(ph);
      byPhone.set(ph, emp);
    }
    if (emp.email) {
      const em = String(emp.email).toLowerCase();
      emails.add(em);
      byEmail.set(em, emp);
    }
    const em = String(emp.email || '').toLowerCase();
    const m = em.match(/^([a-z0-9]+)@employes\.citymo\.local$/);
    if (m) cins.add(m[1].toUpperCase());
  });

  return { cins, phones, emails, byCin, byPhone, byEmail };
}

/**
 * Importe les employés du seed sans supprimer les existants.
 * @returns {Promise<{ imported: number, skipped: number, errors: string[] }>}
 */
function registerInIndex(index, { cin, phone, email }, emp) {
  if (cin) {
    index.cins.add(cin);
    index.byCin.set(cin, emp);
  }
  if (phone) {
    index.phones.add(phone);
    index.byPhone.set(phone, emp);
  }
  if (email) {
    index.emails.add(email);
    index.byEmail.set(email, emp);
  }
}

/**
 * Importe les employés du seed sans supprimer les existants.
 * Insertion ligne par ligne (évite l’échec du lot si un CIN est déjà pris).
 * @returns {Promise<{ imported: number, updated: number, skipped: number, errors: string[] }>}
 */
export async function importEmployeesFromSeed(seedRows = EMPLOYEE_IMPORT_SEED) {
  const existing = await listEmployees();
  const index = buildExistingIndex(existing);
  const skipped = [];
  const errors = [];
  let imported = 0;
  let updated = 0;

  const supabase = getSupabase();

  for (const seed of seedRows) {
    const result = seedRowToEmployeeRow(seed, index);
    const { row, cin, phone, email, label } = result;

    try {
      if (result.action === 'update') {
        const patch = { ...row };
        const existingEmp =
          (cin && index.byCin.get(cin))
          || (phone && index.byPhone.get(phone))
          || index.byEmail.get(email);
        if (
          existingEmp?.email
          && !/@employes\.citymo\.local$/i.test(String(existingEmp.email))
        ) {
          delete patch.email;
        }

        const { data, error } = await supabase
          .from(TABLE)
          .update(patch)
          .eq('id', result.id)
          .select('id, firstname, lastname, email, numero_cin')
          .single();

        if (error) throw error;

        updated += 1;
        registerInIndex(index, { cin, phone, email }, data);
        console.log('UPDATED EXISTING', {
          name: label,
          reason: result.reason,
          id: data.id,
          email: data.email,
        });
        continue;
      }

      const { data, error } = await supabase
        .from(TABLE)
        .insert([row])
        .select('id, firstname, lastname, email, numero_cin')
        .single();

      if (error) throw error;

      imported += 1;
      registerInIndex(index, { cin, phone, email }, data);
      console.log('IMPORTED', {
        name: label,
        id: data.id,
        email: data.email,
      });
    } catch (err) {
      const msg = err?.message || String(err);
      console.error('[CITYMO] import employee error', { name: label, msg });
      errors.push(`${label}: ${msg}`);

      if (/column|schema cache/i.test(msg)) {
        errors.push(
          'Colonnes RH manquantes : exécutez supabase/migrations/20260527120000_employees_extended_fields.sql dans le SQL Editor.',
        );
        break;
      }
    }
  }

  return { imported, updated, skipped: skipped.length, errors };
}
