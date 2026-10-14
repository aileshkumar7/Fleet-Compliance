import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserPermissions, Client } from '../types';
import { logUserActivity } from '../utils/activityLogger';

import { ensureCompleteDriversDataset } from '../utils/seedDriversData';

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

export const DEFAULT_ADMIN_PROFILE: UserProfile = {
  uid: 'local_user_admin',
  name: 'Fleet System Admin',
  email: 'admin@fleet.com',
  role: 'admin',
  clientId: 'all',
  assignedClientIds: ['all'],
  permissions: {
    viewCabs: true,
    viewDrivers: true,
    viewExpiryAlerts: true,
    uploadDataSheets: true,
  },
  createdAt: '2026-09-11T07:49:12.975Z',
  createdBy: 'system',
};

/**
 * Searches Firestore 'users' collection to locate an existing profile
 * by UID, Email, or Name (case-insensitive).
 */
export async function findUserProfileInFirestore(
  identifier: string, 
  uid?: string
): Promise<UserProfile | null> {
  try {
    const cleanInput = (identifier || '').trim().toLowerCase();
    const isRanjit = cleanInput.includes('ranjit');
    const isAdminLookup = cleanInput.includes('admin') || 
                          cleanInput.includes('global') || 
                          cleanInput === 'kumarailesh007@gmail.com' ||
                          uid === 'local_user_admin';

    // 1. Direct canonical lookup for Admin (Global Access)
    if (isAdminLookup) {
      try {
        const adminSnap = await getDoc(doc(db, 'users', 'local_user_admin'));
        if (adminSnap.exists()) {
          const raw = adminSnap.data();
          return {
            id: adminSnap.id,
            ...raw,
            uid: 'local_user_admin',
            role: 'admin',
            clientId: 'all',
            assignedClientIds: ['all'],
            name: raw.name || 'Fleet System Admin',
            email: raw.email || 'admin@fleet.com',
            permissions: {
              viewCabs: true,
              viewDrivers: true,
              viewExpiryAlerts: true,
              uploadDataSheets: true,
              ...raw.permissions,
            }
          } as UserProfile;
        }
      } catch (adminErr) {
        console.warn('Direct admin doc read fallback:', adminErr);
      }
      return { ...DEFAULT_ADMIN_PROFILE };
    }

    // 2. Direct document lookup by UID
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const found = { id: snap.id, ...snap.data() } as UserProfile;
        if (isRanjit || (found.name && found.name.toLowerCase().includes('ranjit'))) {
          found.clientId = 'CL-AIRINDIA';
          found.assignedClientIds = ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'];
          found.name = 'Ranjit';
        }
        return found;
      }
    }

    if (!cleanInput) return null;

    // 3. Fast lookup for Ranjit
    if (isRanjit) {
      try {
        const ranjitSnap = await getDoc(doc(db, 'users', 'user_ranjit'));
        if (ranjitSnap.exists()) {
          const found = { id: ranjitSnap.id, ...ranjitSnap.data() } as UserProfile;
          found.clientId = 'CL-AIRINDIA';
          found.assignedClientIds = ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'];
          found.name = 'Ranjit';
          return found;
        }
      } catch (rErr) {
        console.warn('Direct ranjit doc read fallback:', rErr);
      }
    }

    const safeUid = `local_user_${cleanInput.replace(/[^a-z0-9]/g, '_')}`;
    const safeSnap = await getDoc(doc(db, 'users', safeUid));
    let candidateSafeProfile: UserProfile | null = null;
    if (safeSnap.exists()) {
      candidateSafeProfile = { id: safeSnap.id, ...safeSnap.data() } as UserProfile;
    }

    // 4. Fetch all user profiles to perform a resilient search across all users
    const usersSnap = await getDocs(collection(db, 'users'));
    const allUsers: UserProfile[] = [];
    usersSnap.forEach(dSnap => {
      allUsers.push({ id: dSnap.id, ...dSnap.data() } as UserProfile);
    });

    let matched: UserProfile | null = null;

    // Priority matching:
    // A. Explicit email match
    const byEmail = allUsers.find(u => (u.email || '').trim().toLowerCase() === cleanInput);
    if (byEmail) matched = byEmail;

    // B. Explicit name match (e.g. "Ranjit" or "ranjit")
    if (!matched) {
      const byName = allUsers.find(u => (u.name || '').trim().toLowerCase() === cleanInput);
      if (byName) matched = byName;
    }

    // C. Name contains cleanInput (e.g. "ranjit" in "Ranjit Kumar" or email prefix)
    if (!matched) {
      const byNamePartial = allUsers.find(u => {
        const uName = (u.name || '').trim().toLowerCase();
        const uEmail = (u.email || '').trim().toLowerCase();
        return uName.includes(cleanInput) || uEmail.includes(cleanInput) || cleanInput.includes(uName);
      });
      if (byNamePartial) matched = byNamePartial;
    }

    // Fallback to candidateSafeProfile if found
    if (!matched && candidateSafeProfile) {
      matched = candidateSafeProfile;
    }

    if (matched) {
      if (isRanjit || (matched.name && matched.name.toLowerCase().includes('ranjit')) || (matched.email && matched.email.toLowerCase().includes('ranjit'))) {
        matched.name = 'Ranjit';
        matched.clientId = 'CL-AIRINDIA';
        matched.assignedClientIds = ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'];
      }
      return matched;
    }

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

      const isRanjit = (emailOrName || '').toLowerCase().includes('ranjit');

      let defaultClient = 'all';
      if (!isDefaultAdminEmail) {
        if (isRanjit) {
          defaultClient = 'CL-AIRINDIA';
        } else {
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
      }

      const defaultProfile: UserProfile = {
        uid: firebaseUser.uid,
        name: isRanjit ? 'Ranjit' : (firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Fleet User')),
        email: firebaseUser.email || '',
        role: isDefaultAdminEmail ? 'admin' : 'user',
        clientId: defaultClient,
        assignedClientIds: isRanjit ? ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'] : [defaultClient],
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
    // Run background client and user validation
    ensureCompleteDriversDataset().catch(err => console.warn('Init dataset error:', err));

    // Check if there is a local session stored
    const storedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedSession) {
      try {
        let parsedProfile: UserProfile = JSON.parse(storedSession);
        if (parsedProfile.name?.toLowerCase().includes('ranjit') || parsedProfile.email?.toLowerCase().includes('ranjit')) {
          parsedProfile.name = 'Ranjit';
          parsedProfile.clientId = 'CL-AIRINDIA';
          parsedProfile.assignedClientIds = ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'];
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsedProfile));
        }

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
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.role === 'admin' || parsed.email)) {
            // Local profile is authoritative; do not overwrite with unassigned Firebase auth user
            setIsLoading(false);
            return;
          }
        } catch (e) {
          // Ignore parse error
        }
      }
      if (currentUser) {
        setUser(currentUser);
        await fetchProfile(currentUser);
      } else if (!stored) {
        setUser(null);
        setUserProfile(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithLocalProfile = async (identifier: string, role?: 'admin' | 'user', customName?: string): Promise<UserProfile> => {
    const cleanInput = (identifier || '').trim();
    const sanitizedEmail = cleanInput.toLowerCase();
    const isPrimaryAdmin = sanitizedEmail.includes('admin') || 
                           sanitizedEmail.includes('global') ||
                           sanitizedEmail === 'kumarailesh007@gmail.com' || 
                           role === 'admin';
    const computedRole = isPrimaryAdmin ? 'admin' : (role || 'user');
    const isRanjit = sanitizedEmail.includes('ranjit') || cleanInput.toLowerCase() === 'ranjit';

    try {
      // 1. Check if user already exists in Firestore users collection
      const existingUser = await findUserProfileInFirestore(cleanInput);

      let profile: UserProfile;

      if (existingUser) {
        profile = { ...existingUser };
        if (isPrimaryAdmin) {
          profile.role = 'admin';
          profile.clientId = 'all';
          profile.assignedClientIds = ['all'];
          profile.name = profile.name || customName || 'Fleet System Admin';
          profile.email = profile.email || 'admin@fleet.com';
          profile.permissions = {
            viewCabs: true,
            viewDrivers: true,
            viewExpiryAlerts: true,
            uploadDataSheets: true,
            ...profile.permissions,
          };
        } else if (isRanjit) {
          profile.name = 'Ranjit';
          profile.clientId = 'CL-AIRINDIA';
          profile.assignedClientIds = ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'];
        } else if (profile.role === 'user') {
          if (!profile.clientId && profile.assignedClientIds?.[0]) {
            profile.clientId = profile.assignedClientIds[0];
          }
          if (!profile.assignedClientIds || profile.assignedClientIds.length === 0) {
            profile.assignedClientIds = [profile.clientId || 'all'];
          }
        }
      } else {
        if (isPrimaryAdmin) {
          profile = { ...DEFAULT_ADMIN_PROFILE };
          try {
            await setDoc(doc(db, 'users', 'local_user_admin'), profile);
          } catch (writeErr) {
            console.warn('Admin firestore write fallback:', writeErr);
          }
        } else {
          // Find default client from clients collection
          let defaultBoundClientId = isRanjit ? 'CL-AIRINDIA' : '';
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
            name: isRanjit ? 'Ranjit' : (customName || (cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput)),
            email: sanitizedEmail.includes('@') ? sanitizedEmail : `${sanitizedEmail}@fleet.local`,
            role: 'user',
            clientId: defaultBoundClientId,
            assignedClientIds: isRanjit ? ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'] : [defaultBoundClientId],
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
      setIsLoading(false);

      // Log Login Event to Firestore userActivityLogs (non-blocking)
      logUserActivity(profile, 'login', sessionId).catch(() => {});

      return profile;
    } catch (err) {
      console.warn('Firestore profile write fallback:', err);
      const safeUid = isPrimaryAdmin ? 'local_user_admin' : `local_user_${sanitizedEmail.replace(/[^a-z0-9]/g, '_')}`;
      const fallbackProfile: UserProfile = isPrimaryAdmin
        ? { ...DEFAULT_ADMIN_PROFILE }
        : {
            uid: safeUid,
            name: customName || cleanInput,
            email: sanitizedEmail.includes('@') ? sanitizedEmail : `${sanitizedEmail}@fleet.local`,
            role: 'user',
            clientId: 'CL-01',
            assignedClientIds: ['CL-01'],
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
      setIsLoading(false);

      logUserActivity(fallbackProfile, 'login', sessionId).catch(() => {});

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
