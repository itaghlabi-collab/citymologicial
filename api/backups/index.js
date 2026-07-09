import { proxyBackup } from './_backupProxy.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  return proxyBackup(req, res);
}
