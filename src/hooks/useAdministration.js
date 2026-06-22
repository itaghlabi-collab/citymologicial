/**
 * useAdministration — chargement centralisé Administration ERP.
 */
import { useCallback, useEffect, useState } from 'react';
import { listRoles } from '../services/admin/roles';
import { listAdminUsers, listEmployeesForLink } from '../services/admin/users';
import { listBackups } from '../services/admin/backups';
import { isSupabaseConfigured } from '../lib/supabase';

export function useAdministration() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [backups, setBackups] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const reload = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [u, r, b, e] = await Promise.all([
        listAdminUsers(),
        listRoles(),
        listBackups(),
        listEmployeesForLink(),
      ]);
      setUsers(u);
      setRoles(r);
      setBackups(b);
      setEmployees(e);
    } catch (err) {
      setError(err.message || 'Erreur chargement Administration');
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    users,
    setUsers,
    roles,
    setRoles,
    backups,
    setBackups,
    employees,
    loading,
    error,
    configured,
    reload,
  };
}
