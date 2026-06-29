import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listAcquisitionOrders, getAcquisitionOrder } from '../services/achats/purchaseAcquisitionOrders';

export function useAcquisitionOrders() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listAcquisitionOrders());
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur chargement ordres d\'achat.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  return { records, loading, error, configured, reload: load, getById: getAcquisitionOrder };
}
