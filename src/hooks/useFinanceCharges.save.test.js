/**
 * node src/hooks/useFinanceCharges.save.test.js
 */
import { withTimeout, upsertChargeRecord } from './financeChargeSave.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

{
  const list = upsertChargeRecord(
    [{ id: 'a', date: '2026-09-18', libelle: 'Ancienne' }],
    { id: 'b', date: '2026-09-19', libelle: 'Nouvelle' },
  );
  assert(list.length === 2, 'upsert ajoute la nouvelle ligne');
  assert(list[0].id === 'b', 'la dépense récente est en tête');
}

{
  const list = upsertChargeRecord(
    [{ id: 'a', date: '2026-09-19', libelle: 'Avant', montant: 100 }],
    { id: 'a', date: '2026-09-19', libelle: 'Après', montant: 150 },
  );
  assert(list.length === 1, 'upsert remplace la ligne existante');
  assert(list[0].libelle === 'Après' && list[0].montant === 150, 'la ligne locale est mise à jour');
}

{
  const value = await withTimeout(Promise.resolve('ok'), 200, 'timeout');
  assert(value === 'ok', 'withTimeout laisse passer une requête rapide');
}

{
  try {
    await withTimeout(wait(80), 20, 'L’enregistrement a pris trop de temps. Vérifiez votre connexion et réessayez.');
    throw new Error('devait expirer');
  } catch (err) {
    assert(err.code === 'TIMEOUT', 'withTimeout signale TIMEOUT');
    assert(/trop de temps/.test(err.message), 'message timeout visible');
  }
}

{
  try {
    await withTimeout(Promise.reject(new Error('API down')), 200, 'timeout');
    throw new Error('devait remonter l’erreur API');
  } catch (err) {
    assert(err.message === 'API down', 'erreur API non masquée');
  }
}

console.log('useFinanceCharges.save.test.js ok');
