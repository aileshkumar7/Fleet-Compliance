/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Client, Driver, Cab } from '../types';
import { Building2, Search, RefreshCw, Layers, Plus, Trash2, CheckCircle2, AlertCircle, ShieldCheck, Sparkles, Truck, Users } from 'lucide-react';

export const ClientsList: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Add Client Modal / Form State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientId, setNewClientId] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);

    const userClientKeys = Array.from(new Set([
      userProfile?.clientId,
      ...(userProfile?.assignedClientIds || [])
    ].filter(Boolean).map(s => String(s).trim().toLowerCase())));

    const isAllClients = isAdmin || userClientKeys.includes('all');

    const isAccessible = (c: { clientId?: string; clientName?: string }) => {
      if (isAllClients) return true;
      if (userClientKeys.length === 0) return true;
      const cId = (c.clientId || '').trim().toLowerCase();
      const cName = (c.clientName || '').trim().toLowerCase();
      return userClientKeys.some(k => k === cId || k === cName);
    };

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      const items: Client[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as Client;
        // Exclude unwanted old clients
        const nameLower = (data.clientName || '').toLowerCase();
        if (nameLower.includes('tech corp') || nameLower.includes('techcorp') || nameLower.includes('global logistics') || nameLower.includes('alpha retail')) {
          return;
        }
        items.push({ id: docSnap.id, ...data });
      });
      setClients(items.filter(isAccessible));
      setIsLoading(false);
    }, err => console.error('Clients listener error:', err));

    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      const dItems: Driver[] = [];
      snap.forEach(d => dItems.push({ id: d.id, ...d.data() } as Driver));
      setDrivers(dItems);
    });

    const unsubCabs = onSnapshot(collection(db, 'cabs'), (snap) => {
      const cItems: Cab[] = [];
      snap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Cab));
      setCabs(cItems);
    });

    return () => {
      unsubClients();
      unsubDrivers();
      unsubCabs();
    };
  }, [userProfile, isAdmin]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    const name = newClientName.trim();
    const rawId = newClientId.trim();

    if (!name || !rawId) {
      setActionError('Client Name and Client ID are required.');
      return;
    }

    const sanitizedId = rawId.toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Check duplicate
    if (clients.some(c => c.clientId.toLowerCase() === sanitizedId)) {
      setActionError(`Client ID "${sanitizedId}" already exists.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'clients'), {
        clientName: name,
        clientId: sanitizedId,
        createdAt: new Date().toISOString(),
      });

      setActionSuccess(`Successfully added client organization "${name}" (${sanitizedId})`);
      setNewClientName('');
      setNewClientId('');
      setShowAddModal(false);
    } catch (err: any) {
      console.error('Error adding client:', err);
      setActionError(err.message || 'Failed to add client.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (clientId: string, clientDocId?: string, clientName?: string) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to delete client "${clientName || clientId}"?`)) return;

    try {
      if (clientDocId) {
        await deleteDoc(doc(db, 'clients', clientDocId));
      }
      setActionSuccess(`Deleted client "${clientName || clientId}".`);
    } catch (err: any) {
      console.error('Error deleting client:', err);
      setActionError('Failed to delete client: ' + err.message);
    }
  };

  const filteredClients = clients.filter(c =>
    (c.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.clientId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-violet-100 text-violet-700 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <span>Manage Client Organizations</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {clients.length} active client accounts registered in Firestore database.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search client name or ID..."
              className="bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-52 focus:ring-2 focus:ring-violet-500 outline-none text-slate-800"
            />
          </div>

          <button
            onClick={() => {
              setIsLoading(true);
              setTimeout(() => setIsLoading(false), 300);
            }}
            title="Refresh"
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Client</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Banners */}
      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Add Client Form Modal / Section */}
      {showAddModal && (
        <div className="bg-white rounded-2xl border border-violet-200 shadow-md p-6 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-600" />
              <span>Add New Client Organization</span>
            </h3>
            <button
              onClick={() => setShowAddModal(false)}
              className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleAddClient} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Client Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Apex Tech Solutions"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Client ID (Unique Identifier) *
                </label>
                <input
                  type="text"
                  required
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  placeholder="e.g. client-apex or CL-04"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Client Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Grid View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-violet-600" />
            <span>Loading client directories...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No client records found matching search.</p>
            {isAdmin && (
              <p className="text-slate-500">Click "Add Client" or "+ Dummy Client" above to register new accounts.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-6">
            {filteredClients.map((client) => {
              const clientDriversCount = drivers.filter(
                d => (d.clientId || '').toLowerCase() === (client.clientId || '').toLowerCase() ||
                     (d.clientName || '').toLowerCase() === (client.clientName || '').toLowerCase()
              ).length;

              const clientCabsCount = cabs.filter(
                c => (c.clientId || '').toLowerCase() === (client.clientId || '').toLowerCase() ||
                     (c.clientName || '').toLowerCase() === (client.clientName || '').toLowerCase()
              ).length;

              return (
                <div
                  key={client.id || client.clientId}
                  className="p-5 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-4 hover:bg-white hover:shadow-md transition-all relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-2.5 bg-violet-100 text-violet-700 rounded-xl">
                      <Building2 className="w-5 h-5" />
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-md border border-slate-200 text-slate-800">
                        {client.clientId || 'N/A'}
                      </span>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteClient(client.clientId, client.id, client.clientName)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Client"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{client.clientName}</h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <Layers className="w-3 h-3 text-violet-500" />
                      <span>Registered Firestore Client</span>
                    </p>
                  </div>

                  {/* Summary Badges for associated Cabs & Drivers */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/60">
                      <Truck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold text-slate-800">{clientCabsCount} Cabs</span>
                    </div>

                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/60">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-bold text-slate-800">{clientDriversCount} Drivers</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
