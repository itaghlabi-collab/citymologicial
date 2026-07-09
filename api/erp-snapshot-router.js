import { handleErpSnapshotProxy } from '../lib/erpSnapshotProxyVercel.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return handleErpSnapshotProxy(req, res);
}
