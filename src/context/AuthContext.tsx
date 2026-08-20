import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SunnyUser, UserRole } from '../types';

interface GoogleOAuthConfig {
  configured: boolean;
  clientId: string | null;
  devCallbackUrl: string;
  sharedCallbackUrl: string;
}

interface AuthContextType {
  currentUser: SunnyUser | null;
  allUsers: SunnyUser[];
  isAdmin: boolean;
  googleConfig: GoogleOAuthConfig | null;
  signUp: (email: string, displayName: string) => Promise<{ user: SunnyUser; isNew: boolean }>;
  signIn: (email: string) => Promise<SunnyUser>;
  loginUser: (email: string, displayName: string) => Promise<SunnyUser>;
  loginWithGoogle: (customClientId?: string) => Promise<{ success: boolean; requiresConfig?: boolean; error?: string }>;
  logout: () => void;
  switchUser: (user: SunnyUser) => void;
  toggleRole: (userId: string, newRole: UserRole) => Promise<void>;
  refreshUsers: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SunnyUser | null>(null);
  const [allUsers, setAllUsers] = useState<SunnyUser[]>([]);
  const [googleConfig, setGoogleConfig] = useState<GoogleOAuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchGoogleConfig = async () => {
    try {
      const res = await fetch('/api/auth/google/config');
      if (res.ok) {
        const config = await res.json();
        setGoogleConfig(config);
      }
    } catch (e) {
      console.error('Failed to load Google OAuth config:', e);
    }
  };

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const users: SunnyUser[] = await res.json();
        setAllUsers(users);
        
        const storedEmail = localStorage.getItem('sunny_active_user_email');
        
        setCurrentUser((prev) => {
          if (prev) {
            const found = users.find((u) => u.id === prev.id);
            if (found) return found;
          }
          if (storedEmail) {
            const storedUser = users.find((u) => u.email.toLowerCase() === storedEmail.toLowerCase());
            if (storedUser) return storedUser;
          }
          return null;
        });
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
    fetchGoogleConfig();
  }, [refreshUsers]);

  // Listen for OAuth callback message from popup and cross-tab/storage events
  useEffect(() => {
    const handleAuthMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data?.user) {
        const authedUser: SunnyUser = event.data.user;
        setCurrentUser(authedUser);
        localStorage.setItem('sunny_active_user_email', authedUser.email);
        localStorage.setItem('sunny_active_user', JSON.stringify(authedUser));
        await refreshUsers();
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'sunny_active_user_email' || e.key === 'sunny_active_user') {
        refreshUsers();
      }
    };

    const handleFocus = () => {
      refreshUsers();
    };

    window.addEventListener('message', handleAuthMessage);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel('sunny_auth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'GOOGLE_AUTH_SUCCESS' && event.data?.user) {
            const authedUser: SunnyUser = event.data.user;
            setCurrentUser(authedUser);
            localStorage.setItem('sunny_active_user_email', authedUser.email);
            refreshUsers();
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization:', err);
      }
    }

    return () => {
      window.removeEventListener('message', handleAuthMessage);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      if (bc) bc.close();
    };
  }, [refreshUsers]);

  const signUp = async (email: string, displayName: string): Promise<{ user: SunnyUser; isNew: boolean }> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign up');
      }
      setCurrentUser(data.user);
      localStorage.setItem('sunny_active_user_email', data.user.email);
      await refreshUsers();
      return data;
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string): Promise<SunnyUser> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign in');
      }
      setCurrentUser(data.user);
      localStorage.setItem('sunny_active_user_email', data.user.email);
      await refreshUsers();
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const loginUser = async (email: string, displayName: string): Promise<SunnyUser> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      });
      const user: SunnyUser = await res.json();
      setCurrentUser(user);
      localStorage.setItem('sunny_active_user_email', user.email);
      await refreshUsers();
      return user;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (customClientId?: string): Promise<{ success: boolean; requiresConfig?: boolean; error?: string }> => {
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const queryParams = new URLSearchParams({ redirectUri });
      if (customClientId) {
        queryParams.append('clientId', customClientId);
      }

      const res = await fetch(`/api/auth/google/url?${queryParams.toString()}`);
      const data = await res.json();

      if (!data.configured && !customClientId) {
        return { success: false, requiresConfig: true };
      }

      if (!data.url) {
        return { success: false, error: data.message || 'Could not generate Google auth URL' };
      }

      // Open Google OAuth Provider URL directly in popup
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      if (!popup) {
        return {
          success: false,
          error: 'Popup was blocked by your browser. Please allow popups to complete Google sign-in.',
        };
      }

      // Monitor popup closure and check for auth resolution
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          refreshUsers();
        }
      }, 500);

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to start Google sign-in' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('sunny_active_user_email');
  };

  const switchUser = (user: SunnyUser) => {
    setCurrentUser(user);
    localStorage.setItem('sunny_active_user_email', user.email);
  };

  const toggleRole = async (userId: string, newRole: UserRole) => {
    try {
      const res = await fetch(`/api/auth/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const updated: SunnyUser = await res.json();
        setAllUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        if (currentUser?.id === updated.id) {
          setCurrentUser(updated);
        }
      }
    } catch (e) {
      console.error('Failed to toggle role:', e);
    }
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers,
        isAdmin,
        googleConfig,
        signUp,
        signIn,
        loginUser,
        loginWithGoogle,
        logout,
        switchUser,
        toggleRole,
        refreshUsers,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
