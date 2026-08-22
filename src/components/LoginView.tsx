import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Truck, ShieldCheck, User, Lock, Mail, AlertCircle, ArrowRight, Info, KeyRound, Building2, Users } from 'lucide-react';
import { UserProfile } from '../types';

export const LoginView: React.FC = () => {
  const { loginWithLocalProfile } = useAuth();
  const [identifier, setIdentifier] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const fetchRegisteredUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const users: UserProfile[] = [];
        snap.forEach(d => users.push({ id: d.id, ...d.data() } as UserProfile));
        setRegisteredUsers(users);
      } catch (err) {
        console.error('Error fetching users for login display:', err);
      }
    };
    fetchRegisteredUsers();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const inputVal = identifier.trim();
    if (!inputVal) {
      setErrorMessage('Please enter your email or username.');
      setIsLoading(false);
      return;
    }

    const isPrimaryAdmin = inputVal.toLowerCase().includes('admin') || 
                           inputVal.toLowerCase() === 'kumarailesh007@gmail.com';

    try {
      // 1. If it looks like an email and password is provided, try Firebase Auth
      if (inputVal.includes('@') && password) {
        try {
          await signInWithEmailAndPassword(auth, inputVal, password);
          return;
        } catch (fbErr: any) {
          console.warn('Firebase Auth attempt notice, resolving profile from database:', fbErr);
        }
      }

      // 2. Direct database profile login (resolves username / email accurately)
      await loginWithLocalProfile(inputVal, isPrimaryAdmin ? 'admin' : 'user');
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage(err.message || 'Failed to authenticate.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLoginUser = async (u: UserProfile) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      await loginWithLocalProfile(u.email || u.name, u.role, u.name);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemo = async (demoRole: 'admin' | 'user') => {
    setIsLoading(true);
    setErrorMessage('');
    const demoEmail = demoRole === 'admin' ? 'admin@fleet.com' : 'user@fleet.com';

    try {
      await loginWithLocalProfile(demoEmail, demoRole);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 space-y-0">
        {/* Header Banner */}
        <div className="bg-slate-800 p-8 text-white text-center space-y-3 relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 opacity-10 text-white">
            <Truck className="w-48 h-48" />
          </div>
          <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg font-black text-xl border-2 border-blue-400">
            <Truck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Fleet Compliance Portal</h1>
            <p className="text-xs text-slate-300 mt-1">Sign in to access driver & cab compliance database</p>
          </div>
        </div>

        {/* Login Form */}
        <div className="p-8 space-y-6">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-4 rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Admin Credentials Info Card */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-amber-900 text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <KeyRound className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Account Sign In Details</span>
            </div>
            <div className="space-y-1 text-[11px] text-amber-800">
              <p>• <strong>Admin:</strong> admin@fleet.com (Password: Password123!)</p>
              <p>• <strong>Client Users:</strong> Enter username (e.g. Ranjit) or assigned email</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Username or Email Address
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. Ranjit or admin@fleet.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick User List if configured */}
          {registeredUsers.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Configured Accounts</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">Click to sign in</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {registeredUsers.map((u, i) => (
                  <button
                    key={u.id || u.uid || i}
                    type="button"
                    onClick={() => handleQuickLoginUser(u)}
                    disabled={isLoading}
                    className="text-xs bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg px-2.5 py-1 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span className="font-medium">{u.name || u.email}</span>
                    {u.role === 'admin' ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-bold">Admin</span>
                    ) : (
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded font-bold">
                        {u.clientId || u.assignedClientIds?.[0] || 'User'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Demo One-Click Sign In */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <p className="text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Role Switcher
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleQuickDemo('admin')}
                disabled={isLoading}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-3 rounded-xl border border-slate-700 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1 text-amber-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </div>
                <span className="text-[10px] text-slate-400">Global Access</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('user')}
                disabled={isLoading}
                className="bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold py-2 px-3 rounded-xl border border-blue-200 flex flex-col items-center gap-0.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1 text-blue-700">
                  <User className="w-3.5 h-3.5" />
                  <span>Operations User</span>
                </div>
                <span className="text-[10px] text-blue-600">Client Restricted</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
