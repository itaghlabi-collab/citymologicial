/**
 * usePermissions — accès menu selon rôle / sous-rubriques.
 * Fail-closed sans cache ; instantané si routes déjà en sessionStorage.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getAccessibleRouteIds,
  persistAccessibleRoutes,
  readPersistedAccessibleRoutes,
} from '../services/admin/permissions';

function initialRoutes(user) {
  if (!user?.id) return { routes: [], ready: true };
  const cached = readPersistedAccessibleRoutes(user.id);
  if (cached === undefined) return { routes: undefined, ready: false };
  return { routes: cached, ready: true };
}

export function usePermissions(user) {
  const boot = initialRoutes(user);
  const [allowedRoutes, setAllowedRoutes] = useState(boot.routes);
  const [loading, setLoading] = useState(!boot.ready);
  const [ready, setReady] = useState(boot.ready);

  const reload = useCallback(async ({ blockUi = false } = {}) => {
    if (!user?.id) {
      setAllowedRoutes([]);
      setLoading(false);
      setReady(true);
      return;
    }

    const cached = readPersistedAccessibleRoutes(user.id);
    const hasCache = cached !== undefined;

    // Affichage immédiat depuis le cache — pas d’attente réseau
    if (hasCache) {
      setAllowedRoutes(cached);
      setReady(true);
      setLoading(false);
    } else if (blockUi || !ready) {
      setLoading(true);
      setReady(false);
    }

    try {
      const routes = await getAccessibleRouteIds(user);
      setAllowedRoutes(routes);
      persistAccessibleRoutes(user.id, routes);
    } catch {
      if (!hasCache) setAllowedRoutes([]);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [user?.id, user?.role_id, ready]);

  useEffect(() => {
    if (!user?.id) {
      setAllowedRoutes([]);
      setLoading(false);
      setReady(true);
      return;
    }
    const cached = readPersistedAccessibleRoutes(user.id);
    if (cached !== undefined) {
      setAllowedRoutes(cached);
      setReady(true);
      setLoading(false);
    }
    reload({ blockUi: cached === undefined });
  }, [user?.id, user?.role_id]); // eslint-disable-line react-hooks/exhaustive-deps -- reload volontairement hors deps

  const canShowRoute = useCallback((routeId) => {
    if (!ready || allowedRoutes === undefined) return false;
    if (allowedRoutes === null) return true;
    return allowedRoutes.includes(routeId);
  }, [allowedRoutes, ready]);

  return { allowedRoutes, loading, ready, canShowRoute, reload };
}
