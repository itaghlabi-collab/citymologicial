/**
 * Couche abstraite de stockage des sauvegardes.
 * Providers : local | supabase_storage | google_drive | composite (défaut)
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');
const localStorageProvider = require('./localStorageProvider');
const googleDriveStorageProvider = require('./googleDriveStorageProvider');
const { createCompositeStorageProvider } = require('./compositeStorageProvider');
const { isGoogleDriveEnabled } = require('./googleDriveConfig');

const PROVIDERS = {
  local: localStorageProvider,
  supabase_storage: supabaseStorageProvider,
  google_drive: googleDriveStorageProvider,
  composite: null,
};

function getBackupStorageProvider(name) {
  const normalized = (name || '').trim();

  // Provider enregistré en base après sauvegarde avec Drive
  if (
    normalized === 'supabase_storage+google_drive'
    || normalized === 'composite'
    || (!normalized && isGoogleDriveEnabled())
  ) {
    return createCompositeStorageProvider();
  }

  const envDefault = process.env.BACKUP_STORAGE_PROVIDER || 'supabase_storage';
  const useComposite = envDefault === 'supabase_storage' && isGoogleDriveEnabled();
  const providerName = normalized || (useComposite ? 'composite' : envDefault);

  if (providerName === 'composite' || (providerName === 'supabase_storage' && isGoogleDriveEnabled())) {
    return createCompositeStorageProvider();
  }

  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Provider de sauvegarde "${providerName}" non disponible.`);
  }
  return { name: providerName, ...provider };
}

module.exports = { getBackupStorageProvider, PROVIDERS, isGoogleDriveEnabled };
