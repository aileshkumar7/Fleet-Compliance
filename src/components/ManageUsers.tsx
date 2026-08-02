import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, Client, UserPermissions } from '../types';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Building2, 
  CheckSquare, 
  Square, 
  X, 
  Trash2, 
  Edit3, 
  Mail, 
  Key, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Truck,
  FileSpreadsheet,
  AlertTriangle,
  Lock
} from 'lucide-react';

export const ManageUsers: React.FC = () => {
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [boundClientId, setBoundClientId] = useState<string>('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  
  const [permissions, setPermissions] = useState<UserPermissions>({
    viewCabs: true,
    viewDrivers: true,
    viewExpiryAlerts: false,
    uploadDataSheets: false,
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch users
      const usersSnap = await getDocs(collection(db, 'users'));
      const uItems: UserProfile[] = [];
      usersSnap.forEach(dSnap => {
        uItems.push({ id: dSnap.id, ...dSnap.data() } as UserProfile);
      });
      setUsersList(uItems);

      // Fetch clients
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const cItems: Client[] = [];
      clientsSnap.forEach(dSnap => {
        cItems.push({ id: dSnap.id, ...dSnap.data() } as Client);
      });
      setClientsList(cItems);
    } catch (err) {
      console.error('Error loading users or clients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setBoundClientId('');
    setSelectedClientIds([]);
    setPermissions({
      viewCabs: true,
      viewDrivers: true,
      viewExpiryAlerts: true,
      uploadDataSheets: true,
    });
    setEditingUserId(null);
    setFeedback(null);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    if (clientsList.length > 0) {
      setBoundClientId(clientsList[0].clientId);
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: UserProfile) => {
    setEditingUserId(u.uid);
    setName(u.name || '');
    setEmail(u.email || '');
    setPassword(''); // Leave blank unless updating
    setRole(u.role || 'user');
    const existingBound = u.clientId || (u.assignedClientIds?.[0] !== 'all' ? u.assignedClientIds?.[0] : '');
    setBoundClientId(existingBound || (clientsList.length > 0 ? clientsList[0].clientId : ''));
    setSelectedClientIds(u.assignedClientIds || []);
    setPermissions(u.permissions || {
      viewCabs: true,
      viewDrivers: true,
      viewExpiryAlerts: true,
      uploadDataSheets: true,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  const toggleClientSelection = (cId: string) => {
    if (cId === 'all') {
      setSelectedClientIds(['all']);
      return;
    }

    const withoutAll = selectedClientIds.filter(id => id !== 'all');
    if (withoutAll.includes(cId)) {
      const updated = withoutAll.filter(id => id !== cId);
      setSelectedClientIds(updated);
    } else {
      setSelectedClientIds([...withoutAll, cId]);
    }
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (role === 'user' && !boundClientId.trim()) {
        throw new Error('CLIENT BINDING: Every User account must be bound to exactly one Client Organization.');
      }

      const finalClientId = role === 'admin' ? 'all' : boundClientId.trim();
      const finalAssignedClientIds = role === 'admin' ? ['all'] : [finalClientId];

      if (editingUserId) {
        // Update existing user profile in Firestore
        const userRef = doc(db, 'users', editingUserId);
        await updateDoc(userRef, {
          name,
          role,
          clientId: finalClientId,
          assignedClientIds: finalAssignedClientIds,
          permissions,
        });

        setFeedback({ type: 'success', message: `User profile for "${name}" updated successfully.` });
      } else {
        // Creating NEW User
        if (!email || !password) {
          throw new Error('Email and temporary password are required for new accounts.');
        }

        let newUid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        try {
          // Secondary Auth App pattern so current admin stays logged in
          const secAppName = `SecApp_${Date.now()}`;
          const secApp = initializeApp(firebaseConfig, secAppName);
          const secAuth = getAuth(secApp);

          const userCred = await createUserWithEmailAndPassword(secAuth, email.trim(), password);
          newUid = userCred.user.uid;

          await secondarySignOut(secAuth);
          await deleteApp(secApp);
        } catch (authErr: any) {
          console.warn('Firebase secondary auth notice, creating profile directly:', authErr);
        }

        // Save User Profile in Firestore
        const profile: UserProfile = {
          uid: newUid,
          name,
          email: email.trim(),
          role,
          clientId: finalClientId,
          assignedClientIds: finalAssignedClientIds,
          permissions,
          createdAt: new Date().toISOString(),
          createdBy: 'admin',
        };

        await setDoc(doc(db, 'users', newUid), profile);
        setFeedback({ type: 'success', message: `New user account "${name}" created successfully!` });
      }

      await fetchData();
      setTimeout(() => {
        setIsModalOpen(false);
        resetForm();
      }, 1000);
    } catch (err: any) {
      console.error('Error saving user account:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to save user account.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (!confirm(`Are you sure you want to revoke access and delete user profile for "${u.name}"?`)) return;

    try {
      await deleteDoc(doc(db, 'users', u.uid));
      await fetchData();
    } catch (err) {
      console.error('Failed to delete user profile:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <span>User Access & Role Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Create user accounts, grant client-level access scopes, and define operational section permissions.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Create New User Account</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Loading user access control records...
          </div>
        ) : usersList.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <User className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No user accounts found.</p>
            <p className="text-slate-400">Click "+ Create New User Account" above to invite regional users.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Assigned Clients</th>
                  <th className="px-6 py-4">Granted View Permissions</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {usersList.map((u) => {
                  const isAllClients = u.assignedClientIds?.includes('all');
                  const assignedClientNames = isAllClients 
                    ? ['All Clients (Full Scope)'] 
                    : u.assignedClientIds?.map(cid => clientsList.find(c => c.clientId === cid)?.clientName || cid);

                  return (
                    <tr key={u.id || u.uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {u.name?.substring(0, 2).toUpperCase() || 'US'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{u.name}</p>
                            <p className="text-slate-500 font-mono text-[11px]">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          u.role === 'admin' 
                            ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}>
                          {u.role === 'admin' ? <ShieldCheck className="w-3 h-3 text-amber-600" /> : <User className="w-3 h-3 text-blue-600" />}
                          {u.role?.toUpperCase()}
                        </span>
                      </td>

                      <td className="px-6 py-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {assignedClientNames?.map((cName, i) => (
                            <span key={i} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 text-[11px] font-medium">
                              {cName}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {u.permissions?.viewCabs && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                              ✓ Cabs
                            </span>
                          )}
                          {u.permissions?.viewDrivers && (
                            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                              ✓ Drivers
                            </span>
                          )}
                          {u.permissions?.viewExpiryAlerts && (
                            <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">
                              ✓ Expiry Alerts
                            </span>
                          )}
                          {u.permissions?.uploadDataSheets && (
                            <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">
                              ✓ Upload Sheets
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                            title="Edit Permissions"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Revoke Access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Form for Creating / Editing User */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  <span>{editingUserId ? 'Edit User Access & Permissions' : 'Create New User Account'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingUserId ? 'Update client scopes and section view grants' : 'Provide user details, temporary credentials, and permissions'}
                </p>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback && (
              <div className={`p-4 rounded-2xl border text-xs flex items-center gap-2.5 ${
                feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{feedback.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmitUser} className="space-y-5">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    User Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    System Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="user">Standard User (Restricted Scope)</option>
                    <option value="admin">Admin (Full Access & User Management)</option>
                  </select>
                </div>
              </div>

              {!editingUserId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="rahul@company.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Temporary Password
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Client Binding Selection (Rule 1) */}
              {role === 'user' ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center justify-between">
                    <span>Bound Client Organization <span className="text-rose-600">*</span></span>
                    <span className="text-[10px] text-blue-600 font-bold uppercase">(1 Account = 1 Client)</span>
                  </label>
                  <select
                    value={boundClientId}
                    onChange={(e) => setBoundClientId(e.target.value)}
                    required
                    className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="" disabled>-- Select Bound Client Organization --</option>
                    {clientsList.map((c) => (
                      <option key={c.id || c.clientId} value={c.clientId}>
                        🏢 {c.clientName} ({c.clientId})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    This user will strictly be restricted to viewing and managing records for this single client organization only.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Client Access Scope:</span>
                  <span className="bg-blue-600 text-white px-2.5 py-1 rounded-lg text-[11px]">All Clients (Admin Unrestricted)</span>
                </div>
              )}

              {/* Granted Permissions Toggles */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Choose Allowed View Sections
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => togglePermission('viewCabs')}
                    className={`p-3 rounded-2xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      permissions.viewCabs ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <Truck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs">View Cabs</span>
                  </div>

                  <div
                    onClick={() => togglePermission('viewDrivers')}
                    className={`p-3 rounded-2xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      permissions.viewDrivers ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs">View Drivers</span>
                  </div>

                  <div
                    onClick={() => togglePermission('viewExpiryAlerts')}
                    className={`p-3 rounded-2xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      permissions.viewExpiryAlerts ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">View Expiry Alerts</span>
                  </div>

                  <div
                    onClick={() => togglePermission('uploadDataSheets')}
                    className={`p-3 rounded-2xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                      permissions.uploadDataSheets ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Upload Data Sheets</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingUserId ? 'Save User Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
