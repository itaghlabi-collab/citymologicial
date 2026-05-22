import { createContext, useState, useEffect, useCallback } from 'react';
import { loginWithCredentials, restoreSession, logout as authLogout } from '../services/auth';

/**
 * AuthContext — CITYMO
 * Provides: { user, loading, login, logout }
 * Ready for Supabase / JWT backend drop-in.
 */
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring session

  // Restore session on mount
  useEffect(() => {
    const restored = restoreSession();
    setUser(restored || null);
    setLoading(false);
  }, []);

  /**
   * Login: calls auth service, sets user on success.
   * Returns { success, error }.
   */
  const login = useCallback(async (email, password) => {
    const result = await loginWithCredentials(email, password);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  }, []);

  /**
   * Logout: clears session, resets user.
   */
  const logout = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
