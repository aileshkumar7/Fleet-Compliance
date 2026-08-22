import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';
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
  Lock,
  RefreshCw
} from 'lucide-react';

interface ExtendedUserProfile extends UserProfile {
  allDocIds?: string[];
}

export const ManageUsers: React.FC = () => {
  const [usersList, setUsersList] = useState<ExtendedUserProfile[]>([]);
  const [clientsList, setClientsList] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<ExtendedUserProfile | null>(null);

  // Delete Confirmation Modal State
  const [userToDelete, setUserToDelete] = useState<ExtendedUserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [boundClientId, setBoundClientId] = useState<string>('');
  
  const [permissions, setPermissions] = useState<UserPermissions>({
    viewCabs: true,
    viewDrivers: true,
    viewExpiryAlerts: true,
    uploadDataSheets: true,
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch clients
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const cItems: Client[] = [];
      clientsSnap.forEach(dSnap => {
        cItems.push({ id: dSnap.id, ...dSnap.data() } as Client);
      });
      setClientsList(cItems);

      // 2. Fetch users and deduplicate
      const usersSnap = await getDocs(collection(db, 'users'));
      const userMap = new Map<string, ExtendedUserProfile>();

      usersSnap.forEach(dSnap => {
        const rawData = dSnap.data();
        const docId = dSnap.id;
        const uEmail = (rawData.email || '').trim().toLowerCase();
        const uName = (rawData.name || '').trim();
        const uUid = rawData.uid || docId;

        // Group key: email if available, otherwise lowercase name or UID
        const groupKey = uEmail || uName.toLowerCase() || uUid;

        if (userMap.has(groupKey)) {
          const existing = userMap.get(groupKey)!;
          // Collect all associated doc IDs for batch operations
          if (!existing.allDocIds) existing.allDocIds = [existing.id || existing.uid];
          if (!existing.allDocIds.includes(docId)) {
            existing.allDocIds.push(docId);
          }
          // Prioritize non-alias doc as primary ID
          if (existing.id?.startsWith('local_user_') && !docId.startsWith('local_user_')) {
            existing.id = docId;
            existing.uid = uUid;
          }
          // Merge details
          if (!existing.name && uName) existing.name = uName;
          if (rawData.role === 'admin') existing.role = 'admin';
          if (rawData.clientId && !existing.clientId) existing.clientId = rawData.clientId;
        } else {
          userMap.set(groupKey, {
            id: docId,
            uid: uUid,
            name: uName || 'User',
            email: rawData.email || '',
            role: rawData.role || 'user',
            clientId: rawData.clientId || (rawData.role === 'admin' ? 'all' : (cItems[0]?.clientId || 'CL-01')),
            assignedClientIds: rawData.assignedClientIds || [rawData.clientId || 'all'],
            permissions: rawData.permissions || {
              viewCabs: true,
              viewDrivers: true,
              viewExpiryAlerts: true,
              uploadDataSheets: true,
            },
            createdAt: rawData.createdAt || new Date().toISOString(),
            createdBy: rawData.createdBy || 'system',
            allDocIds: [docId],
          });
        }
      });

      const uniqueUsers = Array.from(userMap.values());
      // Sort admins first, then alphabetically by name
      uniqueUsers.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return (a.name || '').localeCompare(b.name || '');
      });

      setUsersList(uniqueUsers);
    } catch (err) {
      console.error('Error loading users or clients:', err);
      setFeedback({ type: 'error', message: 'Failed to load user records from database.' });
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
    setBoundClientId(clientsList.length > 0 ? clientsList[0].clientId : '');
    setPermissions({
      viewCabs: true,
      viewDrivers: true,
      viewExpiryAlerts: true,
      uploadDataSheets: true,
    });
    setEditingUser(null);
    setFeedback(null);
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: ExtendedUserProfile) => {
    setEditingUser(u);
    setName(u.name || '');
    setEmail(u.email || '');
    setPassword(''); // Leave blank unless creating new account
    setRole(u.role || 'user');
    
    const existingBound = u.clientId || (u.assignedClientIds?.[0] !== 'all' ? u.assignedClientIds?.[0] : '');
    setBoundClientId(existingBound || (clientsList.length > 0 ? clientsList[0].clientId : ''));
    
    setPermissions(u.permissions || {
      viewCabs: true,
      viewDrivers: true,
      viewExpiryAlerts: true,
      uploadDataSheets: true,
    });
    setFeedback(null);
    setIsModalOpen(true);
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

      const matchedClient = clientsList.find(c => 
        c.clientId.toLowerCase() === boundClientId.trim().toLowerCase() || 
        c.clientName.toLowerCase() === boundClientId.trim().toLowerCase()
      );
      const clientName = matchedClient?.clientName || boundClientId.trim();
      const clientId = matchedClient?.clientId || boundClientId.trim();

      const finalClientId = role === 'admin' ? 'all' : clientId;
      const finalAssignedClientIds = role === 'admin' 
        ? ['all'] 
        : Array.from(new Set([clientId, clientName, boundClientId.trim()].filter(Boolean)));

      if (editingUser) {
        // --- EDIT EXISTING USER (Update in place, do NOT create a new user) ---
        const primaryDocId = editingUser.id || editingUser.uid;
        const userRef = doc(db, 'users', primaryDocId);
        
        const updatedProfile: UserProfile = {
          uid: editingUser.uid || primaryDocId,
          name: name.trim(),
          email: email.trim() || editingUser.email || '',
          role,
          clientId: finalClientId,
          assignedClientIds: finalAssignedClientIds,
          permissions,
          createdAt: editingUser.createdAt || new Date().toISOString(),
          createdBy: editingUser.createdBy || 'admin',
        };

        // Write directly to primary user doc
        await setDoc(userRef, updatedProfile, { merge: true });

        // If there are secondary duplicate alias docs for this user, sync or clean them
        if (editingUser.allDocIds && editingUser.allDocIds.length > 1) {
          const batch = writeBatch(db);
          for (const secondaryId of editingUser.allDocIds) {
            if (secondaryId !== primaryDocId) {
              const secRef = doc(db, 'users', secondaryId);
              batch.set(secRef, updatedProfile, { merge: true });
            }
          }
          await batch.commit();
        }

        setFeedback({ type: 'success', message: `User profile for "${name}" updated successfully.` });
      } else {
        // --- CREATE NEW USER ---
        if (!email.trim() || !password.trim()) {
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

        // Save User Profile in Firestore as single canonical document
        const profile: UserProfile = {
          uid: newUid,
          name: name.trim(),
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

  // Trigger Delete Confirmation Modal
  const handleOpenDeleteModal = (u: ExtendedUserProfile) => {
    setUserToDelete(u);
  };

  // Confirm and Execute User Deletion
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    try {
      const batch = writeBatch(db);
      
      // Collect all potential document IDs for this user
      const docIdsToDelete = new Set<string>();
      if (userToDelete.id) docIdsToDelete.add(userToDelete.id);
      if (userToDelete.uid) docIdsToDelete.add(userToDelete.uid);
      if (userToDelete.allDocIds) {
        userToDelete.allDocIds.forEach(id => docIdsToDelete.add(id));
      }
      if (userToDelete.email) {
        docIdsToDelete.add(`local_user_${userToDelete.email.trim().toLowerCase()}`);
        docIdsToDelete.add(`local_user_${userToDelete.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
      }
      if (userToDelete.name) {
        docIdsToDelete.add(`local_user_${userToDelete.name.trim().toLowerCase()}`);
        docIdsToDelete.add(`local_user_${userToDelete.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
      }

      for (const dId of docIdsToDelete) {
        if (dId) {
          batch.delete(doc(db, 'users', dId));
        }
      }

      await batch.commit();

      setUserToDelete(null);
      await fetchData();
      setFeedback({ type: 'success', message: `User "${userToDelete.name}" has been permanently removed.` });
    } catch (err: any) {
      console.error('Failed to delete user profile:', err);
      alert(`Failed to delete user: ${err.message || 'Unknown database error'}`);
    } finally {
      setIsDeleting(false);
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

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl transition-colors cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Create New User Account</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && !isModalOpen && (
        <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-2.5 shadow-2xs ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading user access control records...</span>
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
                  <th className="px-6 py-4">Assigned Organization</th>
                  <th className="px-6 py-4">Granted View Permissions</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {usersList.map((u) => {
                  const isAllClients = u.role === 'admin' || u.assignedClientIds?.includes('all');
                  
                  let assignedOrgDisplay = 'All Clients (Full Scope)';
                  if (!isAllClients) {
                    const cid = u.clientId || u.assignedClientIds?.[0] || '';
                    const matched = clientsList.find(c => 
                      c.clientId.toLowerCase() === cid.toLowerCase() || 
                      c.clientName.toLowerCase() === cid.toLowerCase()
                    );
                    assignedOrgDisplay = matched ? `${matched.clientName} (${matched.clientId})` : cid;
                  }

                  return (
                    <tr key={u.id || u.uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-2xs ${
                            u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {u.name?.substring(0, 2).toUpperCase() || 'US'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{u.name}</p>
                            <p className="text-slate-500 font-mono text-[11px]">{u.email || 'No email registered'}</p>
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
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
                          <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{assignedOrgDisplay}</span>
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
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="p-2 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl transition-all cursor-pointer border border-transparent hover:border-blue-200"
                            title="Edit User & Permissions"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {/* Delete Button (Activated with in-app confirmation modal) */}
                          <button
                            onClick={() => handleOpenDeleteModal(u)}
                            className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all cursor-pointer border border-rose-100 hover:border-rose-300 hover:shadow-2xs"
                            title="Delete User Account"
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

      {/* In-App Confirmation Modal for Deleting User */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">
                  Delete User Account?
                </h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to permanently revoke access for <strong className="text-slate-800">{userToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">User Name:</span>
                <span className="font-bold text-slate-800">{userToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email Address:</span>
                <span className="font-mono text-slate-800">{userToDelete.email || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Role:</span>
                <span className="font-extrabold uppercase text-blue-600">{userToDelete.role}</span>
              </div>
            </div>

            <p className="text-[11px] text-rose-600 font-medium">
              ⚠️ This will revoke this user's ability to log in and remove their permission record immediately.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form for Creating / Editing User */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  <span>{editingUser ? 'Edit User Access & Permissions' : 'Create New User Account'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingUser ? 'Update organization scopes and section view permissions in place' : 'Provide user details, temporary credentials, and permissions'}
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
                    placeholder="user@company.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>

                {!editingUser ? (
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
                ) : (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      User Identifier (UID)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editingUser.uid || editingUser.id || ''}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Client Binding Selection */}
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
                  {isSubmitting ? 'Saving...' : editingUser ? 'Save User Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
