import { proxyBackup } from '../_backupProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return proxyBackup(req, res, 'status/config');
}
