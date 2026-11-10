import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useState,
} from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);
const USER_KEY = 'ehr_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return tokenStore.get()
        ? JSON.parse(localStorage.getItem(USER_KEY))
        : null;
    } catch {
      return null;
    }
  });

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    tokenStore.set(data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  // Token expired / rejected anywhere in the app -> back to login
  useEffect(() => {
    window.addEventListener('auth:expired', logout);
    return () => window.removeEventListener('auth:expired', logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
