// Login state shared by the whole website: who is logged in, log in / register / log out
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getMe, getToken, googleLogin, loginUser, logoutUser, registerUser, setToken } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  checking: boolean; // true while a saved login is being verified on page load
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<boolean>; // true = a new account was made
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: User) => void; // after editing the profile
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);

  // a token saved from an earlier visit: ask the backend whose it is (it may have expired)
  useEffect(() => {
    if (!getToken()) return;
    getMe()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await loginUser(email, password);
    setToken(r.token);
    setUser(r.user);
  };

  // Feature 5: the backend checks Google's ID token and returns our own login token
  const loginWithGoogle = async (credential: string) => {
    const r = await googleLogin(credential);
    setToken(r.token);
    setUser(r.user);
    return r.created;
  };

  const register = async (name: string, email: string, password: string) => {
    const r = await registerUser(name, email, password);
    setToken(r.token);
    setUser(r.user);
  };

  const logout = async () => {
    await logoutUser().catch(() => {}); // log out locally even if the backend is down
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, checking, login, loginWithGoogle, register, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
