import React, { useState, useEffect, useCallback } from 'react';
import { View, UserProfile, UserRole, RolePermissions } from '../types';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { KNOWN_ACCOUNTS } from '../lib/accounts';

const DEFAULT_PERMISSIONS: RolePermissions = {
  [UserRole.ADMIN]: [
    View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.STICKERS,
    View.REPORTS, View.TRANSACTIONS, View.AUDIT, View.DATABASE, View.OFFICES, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.MAYOR]: [
    View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.STICKERS,
    View.REPORTS, View.TRANSACTIONS, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.OFFICE_HEAD]: [
    View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.STICKERS,
    View.REPORTS, View.TRANSACTIONS, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.SUPPLY]: [
    View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.STICKERS,
    View.REPORTS, View.TRANSACTIONS, View.OFFICES, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.ACCOUNTING]: [
    View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.STICKERS,
    View.REPORTS, View.TRANSACTIONS, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.STAFF]: [
    View.DASHBOARD, View.ITEMS, View.REQUESTS, View.PROFILE, View.NOTIFICATIONS
  ],
  [UserRole.UNAUTHORIZED]: []
};

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  userProfile: UserProfile;
  rolePermissions: RolePermissions;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  setRolePermissions: React.Dispatch<React.SetStateAction<RolePermissions>>;
  handleLogin: () => void;
  handleLogout: () => Promise<void>;
  handleBypassLogin: (role: string, email: string, name: string, officeOverride?: string, positionOverride?: string) => Promise<void>;
  addSystemLog: (action: string, module: string) => Promise<void>;
  addAccessLog: (status: string) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>({
    fullName: 'LGU Guest',
    username: 'guest',
    office: 'Municipal Hall - Guest',
    position: 'Guest Observer',
    role: UserRole.UNAUTHORIZED
  });
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS);

  const addSystemLog = useCallback(async (action: string, module: string) => {
    if (!db) {
      console.warn('Cannot add system log: db is not initialized');
      return;
    }
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'system_logs'), {
        timestamp: serverTimestamp(),
        user: userProfile.fullName,
        action,
        module
      });
    } catch (error) {
      console.error('Failed to log system activity:', error);
    }
  }, [userProfile.fullName]);

  const addAccessLog = useCallback(async (status: string) => {
    if (!db) {
      console.warn('Cannot add access log: db is not initialized');
      return;
    }
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, 'access_logs'), {
        timestamp: serverTimestamp(),
        user: userProfile.fullName,
        status,
        device: navigator.userAgent.split(')')[0].split('(')[1] || 'Web Browser',
        ip: 'Cloud Node'
      });
    } catch (error) {
      console.error('Failed to log access activity:', error);
    }
  }, [userProfile.fullName]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userEmail = user.email?.toLowerCase().trim() || '';
        const knownAccount = KNOWN_ACCOUNTS[userEmail];

        let finalRole = knownAccount ? knownAccount.role : UserRole.STAFF;
        let finalName = user.displayName || (knownAccount ? knownAccount.fullName : (userEmail.split('@')[0] || 'Staff User'));
        let finalPosition = knownAccount ? knownAccount.position : 'Staff End User';
        let finalOffice = knownAccount ? knownAccount.office : 'Municipal Hall - Guest';
        let finalProfilePic = '';

        try {
          if (!db) {
            console.warn('[User Record] Skipped: db not initialized');
            return;
          }
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            finalRole = (data.role as UserRole) || finalRole;
            finalName = data.fullName || finalName;
            finalPosition = data.position || finalPosition;
            finalOffice = data.office || finalOffice;
            finalProfilePic = data.profilePic || '';

            if (knownAccount) {
              if (finalRole !== knownAccount.role || finalOffice !== knownAccount.office) {
                finalRole = knownAccount.role;
                finalOffice = knownAccount.office;
                finalPosition = knownAccount.position;
                await updateDoc(doc(db, 'users', user.uid), {
                  role: finalRole, office: finalOffice, position: finalPosition, fullName: finalName
                });
              }
            } else if (finalRole === UserRole.UNAUTHORIZED || !finalRole) {
              finalRole = UserRole.OFFICE_HEAD;
              await updateDoc(doc(db, 'users', user.uid), { role: finalRole });
            }
          } else if (knownAccount) {
            await setDoc(doc(db, 'users', user.uid), {
              fullName: finalName, email: userEmail, role: finalRole,
              position: finalPosition, office: finalOffice,
              username: user.email?.split('@')[0] || 'user', profilePic: ''
            });
          } else {
            finalRole = UserRole.OFFICE_HEAD;
            finalPosition = 'Office Head';
            finalOffice = 'Municipal Engineering Office';
            await setDoc(doc(db, 'users', user.uid), {
              fullName: finalName, email: userEmail, role: finalRole,
              position: finalPosition, office: finalOffice,
              username: user.email?.split('@')[0] || 'staff', profilePic: ''
            });
          }
        } catch (e) {
          console.error("Error reading/writing dynamic user record:", e);
        }

        setIsAuthenticated(true);
        setUserProfile({
          fullName: finalName,
          username: user.email?.split('@')[0] || 'staff',
          office: finalOffice,
          position: finalPosition,
          role: finalRole,
          profilePic: finalProfilePic
        });

        if (finalRole === UserRole.UNAUTHORIZED) {
          addAccessLog('Unauthorized Login Attempt');
        } else {
          addAccessLog('Authorized Login');
        }
      } else {
        setIsAuthenticated(false);
        setUserProfile({
          fullName: 'LGU Guest',
          username: 'guest',
          office: 'Municipal Hall - Guest',
          position: 'Guest Observer',
          role: UserRole.UNAUTHORIZED
        });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback(() => {
    addSystemLog('Secure Cloud Session Initiated', 'Auth');
    addAccessLog('Authorized Login');
  }, [addSystemLog, addAccessLog]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setIsAuthenticated(false);
      setUserProfile({
        fullName: 'LGU Guest',
        username: 'guest',
        office: 'Municipal Hall - Guest',
        position: 'Guest Observer',
        role: UserRole.UNAUTHORIZED
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  const handleBypassLogin = useCallback(async (
    role: string,
    email: string,
    name: string,
    officeOverride?: string,
    positionOverride?: string
  ) => {
    setIsLoading(true);
    const safeEmail = (email || '').toLowerCase().trim();
    const knownAccount = KNOWN_ACCOUNTS[safeEmail];

    let finalRole = (knownAccount ? knownAccount.role : (role as UserRole)) || UserRole.STAFF;
    let finalOffice = officeOverride || (knownAccount ? knownAccount.office : 'Municipal Hall - Guest');
    let finalPosition = positionOverride || (knownAccount ? knownAccount.position : 'Staff End User');
    let finalName = name || (knownAccount ? knownAccount.fullName : (safeEmail.split('@')[0] || 'Official'));

    if (!officeOverride && !knownAccount) {
      if (role === 'ADMIN') {
        finalPosition = 'Municipal Administrator';
        finalOffice = 'Municipal Hall - Admin';
      } else if (role === 'ACCOUNTING') {
        finalPosition = 'Municipal Accountant';
        finalOffice = 'Accounting Office';
      } else if (role === 'OFFICE_HEAD') {
        finalPosition = 'Office Head';
        finalOffice = 'Municipal Engineering Office';
      } else if (role === 'MAYOR') {
        finalPosition = 'Municipal Mayor';
        finalOffice = "Mayor's Office";
      }
    }

    const fallbackToLocalState = () => {
      setIsAuthenticated(true);
      setUserProfile({
        fullName: finalName,
        username: safeEmail.split('@')[0],
        office: finalOffice,
        position: finalPosition,
        role: finalRole,
        profilePic: ''
      });
    };

    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      const bypassPassword = safeEmail.includes('officehead') ? "Password123" : "TibiaoLgu2026!";
      try {
        await signInWithEmailAndPassword(auth, safeEmail, bypassPassword);
      } catch (signInError: any) {
        if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential') {
          try {
            await createUserWithEmailAndPassword(auth, safeEmail, bypassPassword);
          } catch (createErr: any) {
            console.log("Bypass registration notice, falling back to local state:", createErr?.message || createErr);
            fallbackToLocalState();
          }
        } else {
          console.log("Bypass sign-in notice, falling back to local state:", signInError?.message || signInError);
          fallbackToLocalState();
        }
      }
    } catch (e) {
      console.log("Firebase auth bypass notice, falling back to local state:", e);
      fallbackToLocalState();
    } finally {
      setIsLoading(false);
      addSystemLog(`Authorized Demo Session Initiated for ${finalName} (${finalRole})`, 'Auth');
      addAccessLog('Authorized Demo Login');
    }
  }, [addSystemLog, addAccessLog]);

  return {
    isAuthenticated,
    isLoading,
    userProfile,
    rolePermissions,
    setUserProfile,
    setRolePermissions,
    handleLogin,
    handleLogout,
    handleBypassLogin,
    addSystemLog,
    addAccessLog,
  };
}
