import { proxyBackup } from '../_backupProxy.mjs';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const { id } = req.query;
  return proxyBackup(req, res, `${id}/restore`);
}
