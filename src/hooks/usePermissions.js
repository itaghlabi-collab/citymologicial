/**
 * usePermissions — accès menu selon rôle / sous-rubriques.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAccessibleRouteIds, clearPermissionCache } from '../services/admin/permissions';

export function usePermissions(user) {
  const [allowedRoutes, setAllowedRoutes] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setAllowedRoutes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    clearPermissionCache();
    try {
      const routes = await getAccessibleRouteIds(user);
      setAllowedRoutes(routes);
    } catch {
      setAllowedRoutes(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const canShowRoute = useCallback((routeId) => {
    if (allowedRoutes === null) return true;
    return allowedRoutes.includes(routeId);
  }, [allowedRoutes]);

  return { allowedRoutes, loading, canShowRoute, reload };
}
