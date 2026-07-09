export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  return res.status(200).json({ route: 'erp-snapshot-status-config', method: req.method });
}
