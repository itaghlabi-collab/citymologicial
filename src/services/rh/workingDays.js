/**
 * workingDays.js — Calcul jours ouvrés congés (règle CITYMO : dimanches exclus + fériés exclus)
 */
import { listActiveHolidayDates } from './holidays';

export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatLocalDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Compte les jours ouvrés entre deux dates (inclusives).
 * Règle actuelle ERP : exclut les dimanches ; exclut les jours fériés du calendrier RH.
 * Les samedis restent comptés (comportement historique Conges.jsx).
 */
export function countWorkingDaysSync(startStr, endStr, holidaySet = new Set()) {
  if (!startStr || !endStr) return { days: 0, holidaysInRange: [] };
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  if (!start || !end || end < start) return { days: 0, holidaysInRange: [] };

  let days = 0;
  const holidaysInRange = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = formatLocalDate(cur);
    const isSunday = cur.getDay() === 0;
    const isHoliday = holidaySet.has(iso);
    if (isHoliday) holidaysInRange.push(iso);
    if (!isSunday && !isHoliday) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return { days, holidaysInRange };
}

export function nextWorkingDaySync(dateStr, holidaySet = new Set()) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || holidaySet.has(formatLocalDate(d))) {
    d.setDate(d.getDate() + 1);
  }
  return formatLocalDate(d);
}

export async function countWorkingDays(startStr, endStr) {
  const holidays = await listActiveHolidayDates(startStr, endStr);
  const set = new Set(holidays.map((h) => h.date));
  const result = countWorkingDaysSync(startStr, endStr, set);
  return {
    ...result,
    holidayLabels: holidays.filter((h) => result.holidaysInRange.includes(h.date)),
  };
}

export async function nextWorkingDay(dateStr) {
  // Charger une fenêtre courte autour de la date
  const start = dateStr;
  const endDate = parseLocalDate(dateStr);
  if (!endDate) return '';
  endDate.setDate(endDate.getDate() + 21);
  const holidays = await listActiveHolidayDates(start, formatLocalDate(endDate));
  const set = new Set(holidays.map((h) => h.date));
  return nextWorkingDaySync(dateStr, set);
}

export const WORKING_DAYS_RULE_LABEL =
  'Jours calendaires hors dimanches et hors jours fériés du calendrier RH CITYMO';
