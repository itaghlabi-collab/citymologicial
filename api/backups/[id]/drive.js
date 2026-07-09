import { proxyBackup } from '../_backupProxy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const { id } = req.query;
  return proxyBackup(req, res, `${id}/drive`);
}
