import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserPermissions, Client } from '../types';
import { logUserActivity } from '../utils/activityLogger';

interface AuthContextType {
  user: User | { uid: string; email: string; displayName?: string } | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  loginWithLocalProfile: (identifier: string, role?: 'admin' | 'user', customName?: string) => Promise<UserProfile>;
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

/**
 * Searches Firestore 'users' collection to locate an existing profile
 * by UID, Email, or Name (case-insensitive).
 */
export async function findUserProfileInFirestore(
  identifier: string, 
  uid?: string
): Promise<UserProfile | null> {
  try {
    // 1. Direct document lookup by UID
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as UserProfile;
      }
    }

    const cleanInput = identifier.trim().toLowerCase();
    if (!cleanInput) return null;

    const safeUid = `local_user_${cleanInput.replace(/[^a-z0-9]/g, '_')}`;
    const safeSnap = await getDoc(doc(db, 'users', safeUid));
    let candidateSafeProfile: UserProfile | null = null;
    if (safeSnap.exists()) {
      candidateSafeProfile = { id: safeSnap.id, ...safeSnap.data() } as UserProfile;
    }

    // 2. Fetch all user profiles to perform a resilient search across all users
    const usersSnap = await getDocs(collection(db, 'users'));
    const allUsers: UserProfile[] = [];
    usersSnap.forEach(dSnap => {
      allUsers.push({ id: dSnap.id, ...dSnap.data() } as UserProfile);
    });

    // Priority matching:
    // A. Explicit email match
    const byEmail = allUsers.find(u => (u.email || '').trim().toLowerCase() === cleanInput);
    if (byEmail) return byEmail;

    // B. Explicit name match (e.g. "Ranjit" or "ranjit")
    const byName = allUsers.find(u => (u.name || '').trim().toLowerCase() === cleanInput);
    if (byName) return byName;

    // C. Name contains cleanInput (e.g. "ranjit" in "Ranjit Kumar" or email prefix)
    const byNamePartial = allUsers.find(u => {
      const uName = (u.name || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      return uName.includes(cleanInput) || uEmail.includes(cleanInput) || cleanInput.includes(uName);
    });
    if (byNamePartial) return byNamePartial;

    // Fallback to candidateSafeProfile if found
    if (candidateSafeProfile) return candidateSafeProfile;

    return null;
  } catch (err) {
    console.error('Error finding user profile in Firestore:', err);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | { uid: string; email: string; displayName?: string } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to fetch or create user profile from Firestore doc
  const fetchProfile = async (firebaseUser: { uid: string; email?: string | null; displayName?: string | null }) => {
    try {
      const emailOrName = firebaseUser.email || firebaseUser.displayName || firebaseUser.uid;
      const existing = await findUserProfileInFirestore(emailOrName, firebaseUser.uid);

      if (existing) {
        if (existing.role === 'user' && !existing.clientId && existing.assignedClientIds?.[0]) {
          existing.clientId = existing.assignedClientIds[0];
        }
        setUserProfile(existing);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
        return existing;
      }

      // If truly not found, create default profile
      const userRef = doc(db, 'users', firebaseUser.uid);
      const isDefaultAdminEmail = (firebaseUser.email || '').toLowerCase().includes('admin') || 
                                 firebaseUser.email === 'kumarailesh007@gmail.com' ||
                                 firebaseUser.email === 'admin@fleet.com';

      let defaultClient = 'all';
      if (!isDefaultAdminEmail) {
        try {
          const clientsSnap = await getDocs(collection(db, 'clients'));
          if (!clientsSnap.empty) {
            const firstClient = clientsSnap.docs[0].data() as Client;
            defaultClient = firstClient.clientId || firstClient.clientName || 'CL-01';
          }
        } catch (e) {
          defaultClient = 'CL-01';
        }
      }

      const defaultProfile: UserProfile = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Fleet User'),
        email: firebaseUser.email || '',
        role: isDefaultAdminEmail ? 'admin' : 'user',
        clientId: defaultClient,
        assignedClientIds: [defaultClient],
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
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultProfile));
      return defaultProfile;
    } catch (err) {
      console.error('Error in fetchProfile:', err);
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

        // Re-verify against latest Firestore data in the background to ensure fresh client assignments
        findUserProfileInFirestore(parsedProfile.email || parsedProfile.name, parsedProfile.uid).then((latestProfile) => {
          if (latestProfile) {
            setUserProfile(latestProfile);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(latestProfile));
          }
        });
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

  const loginWithLocalProfile = async (identifier: string, role?: 'admin' | 'user', customName?: string): Promise<UserProfile> => {
    const cleanInput = identifier.trim();
    const sanitizedEmail = cleanInput.toLowerCase();
    const isPrimaryAdmin = sanitizedEmail.includes('admin') || 
                           sanitizedEmail === 'kumarailesh007@gmail.com' || 
                           role === 'admin';
    const computedRole = isPrimaryAdmin ? 'admin' : (role || 'user');

    try {
      // 1. Check if user already exists in Firestore users collection
      const existingUser = await findUserProfileInFirestore(cleanInput);

      let profile: UserProfile;

      if (existingUser) {
        profile = existingUser;
        if (profile.role === 'user') {
          if (!profile.clientId && profile.assignedClientIds?.[0]) {
            profile.clientId = profile.assignedClientIds[0];
          }
          if (!profile.assignedClientIds || profile.assignedClientIds.length === 0) {
            profile.assignedClientIds = [profile.clientId || 'all'];
          }
        }
      } else {
        // Find default client from clients collection
        let defaultBoundClientId = computedRole === 'admin' ? 'all' : '';
        if (!defaultBoundClientId) {
          try {
            const clientsSnap = await getDocs(collection(db, 'clients'));
            if (!clientsSnap.empty) {
              const firstClient = clientsSnap.docs[0].data() as Client;
              defaultBoundClientId = firstClient.clientId || firstClient.clientName || 'CL-01';
            } else {
              defaultBoundClientId = 'CL-01';
            }
          } catch (e) {
            defaultBoundClientId = 'CL-01';
          }
        }

        const safeUid = `local_user_${sanitizedEmail.replace(/[^a-z0-9]/g, '_')}`;
        profile = {
          uid: safeUid,
          name: customName || (computedRole === 'admin' ? 'Fleet System Admin' : (cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput)),
          email: sanitizedEmail.includes('@') ? sanitizedEmail : `${sanitizedEmail}@fleet.local`,
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

        const userRef = doc(db, 'users', safeUid);
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
      const safeUid = `local_user_${sanitizedEmail.replace(/[^a-z0-9]/g, '_')}`;
      const defaultBoundClientId = computedRole === 'admin' ? 'all' : 'CL-01';
      const fallbackProfile: UserProfile = {
        uid: safeUid,
        name: customName || (computedRole === 'admin' ? 'Fleet System Admin' : cleanInput),
        email: sanitizedEmail.includes('@') ? sanitizedEmail : `${sanitizedEmail}@fleet.local`,
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
    if (userProfile) {
      const latest = await findUserProfileInFirestore(userProfile.email || userProfile.name, userProfile.uid);
      if (latest) {
        setUserProfile(latest);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(latest));
      }
    } else if (user) {
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
