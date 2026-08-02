import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserPermissions } from '../types';
import { logUserActivity } from '../utils/activityLogger';

interface AuthContextType {
  user: User | { uid: string; email: string; displayName?: string } | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  loginWithLocalProfile: (email: string, role?: 'admin' | 'user', customName?: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canAccess: (permissionKey: keyof UserPermissions) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  isLoading: true,
  isAdmin: false,
  loginWithLocalProfile: async () => ({
    uid: '',
    name: '',
    email: '',
    role: 'user',
    assignedClientIds: ['all'],
    permissions: { viewCabs: true, viewDrivers: true, viewExpiryAlerts: false, uploadDataSheets: false }
  }),
  logout: async () => {},
  refreshProfile: async () => {},
  canAccess: () => false,
});

const LOCAL_STORAGE_KEY = 'fleet_local_auth_profile';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | { uid: string; email: string; displayName?: string } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to fetch or create user profile from Firestore doc
  const fetchProfile = async (firebaseUser: { uid: string; email?: string | null; displayName?: string | null }) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setUserProfile(data);
        return data;
      } else {
        const isDefaultAdminEmail = (firebaseUser.email || '').toLowerCase().includes('admin') || 
                                   firebaseUser.email === 'kumarailesh007@gmail.com' ||
                                   firebaseUser.email === 'admin@fleet.com';
        const defaultProfile: UserProfile = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Fleet User'),
          email: firebaseUser.email || '',
          role: isDefaultAdminEmail ? 'admin' : 'user',
          assignedClientIds: ['all'],
          permissions: {
            viewCabs: true,
            viewDrivers: true,
            viewExpiryAlerts: true,
            uploadDataSheets: true,
          },
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        };

        await setDoc(userRef, defaultProfile);
        setUserProfile(defaultProfile);
        return defaultProfile;
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return null;
    }
  };

  useEffect(() => {
    // Check if there is a local session stored
    const storedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedSession) {
      try {
        const parsedProfile: UserProfile = JSON.parse(storedSession);
        setUserProfile(parsedProfile);
        setUser({
          uid: parsedProfile.uid,
          email: parsedProfile.email,
          displayName: parsedProfile.name,
        });
        setIsLoading(false);
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }

    // Also listen to Firebase Auth changes if Firebase Auth is used
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await fetchProfile(currentUser);
      } else if (!localStorage.getItem(LOCAL_STORAGE_KEY)) {
        setUser(null);
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithLocalProfile = async (email: string, role?: 'admin' | 'user', customName?: string): Promise<UserProfile> => {
    const sanitizedEmail = email.trim().toLowerCase();
    const isPrimaryAdmin = sanitizedEmail.includes('admin') || 
                           sanitizedEmail === 'kumarailesh007@gmail.com' || 
                           role === 'admin';
    const computedRole = isPrimaryAdmin ? 'admin' : (role || 'user');

    // Create stable UID from email
    const safeUid = `local_user_${sanitizedEmail.replace(/[^a-z0-9]/g, '_')}`;

    try {
      const userRef = doc(db, 'users', safeUid);
      const docSnap = await getDoc(userRef);

      let profile: UserProfile;

      if (docSnap.exists()) {
        profile = docSnap.data() as UserProfile;
        // Ensure standard user has single client binding structure
        if (profile.role === 'user' && (!profile.clientId && profile.assignedClientIds?.[0])) {
          profile.clientId = profile.assignedClientIds[0];
        }
      } else {
        const defaultBoundClientId = computedRole === 'admin' ? 'all' : 'CL-01';
        profile = {
          uid: safeUid,
          name: customName || (computedRole === 'admin' ? 'Fleet System Admin' : 'Fleet Operations User'),
          email: sanitizedEmail,
          role: computedRole,
          clientId: defaultBoundClientId,
          assignedClientIds: [defaultBoundClientId],
          permissions: {
            viewCabs: true,
            viewDrivers: true,
            viewExpiryAlerts: true,
            uploadDataSheets: true,
          },
          createdAt: new Date().toISOString(),
          createdBy: 'system',
        };
        await setDoc(userRef, profile);
      }

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('fleet_session_id', sessionId);

      setUser({
        uid: profile.uid,
        email: profile.email,
        displayName: profile.name,
      });
      setUserProfile(profile);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profile));

      // Log Login Event to Firestore userActivityLogs
      logUserActivity(profile, 'login', sessionId);

      return profile;
    } catch (err) {
      console.warn('Firestore profile write fallback:', err);
      const defaultBoundClientId = computedRole === 'admin' ? 'all' : 'CL-01';
      const fallbackProfile: UserProfile = {
        uid: safeUid,
        name: customName || (computedRole === 'admin' ? 'Fleet System Admin' : 'Fleet Operations User'),
        email: sanitizedEmail,
        role: computedRole,
        clientId: defaultBoundClientId,
        assignedClientIds: [defaultBoundClientId],
        permissions: {
          viewCabs: true,
          viewDrivers: true,
          viewExpiryAlerts: true,
          uploadDataSheets: true,
        },
        createdAt: new Date().toISOString(),
        createdBy: 'system',
      };

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('fleet_session_id', sessionId);

      setUser({
        uid: fallbackProfile.uid,
        email: fallbackProfile.email,
        displayName: fallbackProfile.name,
      });
      setUserProfile(fallbackProfile);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fallbackProfile));

      logUserActivity(fallbackProfile, 'login', sessionId);

      return fallbackProfile;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  const logout = async () => {
    const currentSessionId = sessionStorage.getItem('fleet_session_id') || `sess_${Date.now()}`;
    if (userProfile) {
      await logUserActivity(userProfile, 'logout', currentSessionId);
    }

    try {
      await firebaseSignOut(auth);
    } catch (e) {
      // Ignore firebase logout error if auth wasn't active
    }
    sessionStorage.removeItem('fleet_session_id');
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setUser(null);
    setUserProfile(null);
  };

  const isAdmin = userProfile?.role === 'admin';

  const canAccess = (permissionKey: keyof UserPermissions): boolean => {
    if (!userProfile) return false;
    if (isAdmin) return true;
    return Boolean(userProfile.permissions?.[permissionKey]);
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, isLoading, isAdmin, loginWithLocalProfile, logout, refreshProfile, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
