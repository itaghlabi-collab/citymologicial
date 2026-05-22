import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * useAuth — CITYMO
 * Convenience hook to access auth state anywhere in the app.
 *
 * Usage:
 *   const { user, loading, login, logout } = useAuth();
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
