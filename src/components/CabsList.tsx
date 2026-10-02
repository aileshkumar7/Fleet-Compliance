/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Cab, Client } from '../types';
import { analyzeCabExpiry } from '../utils/expiryEngine';
import { matchesCabSearch } from '../utils/searchUtils';
import { runCabDeduplicationCleanup, CabCleanupReport } from '../utils/cabDeduplicator';
import { resolveUserClientScope, isRecordAccessible } from '../utils/clientUtils';
import { deletePreviousFleetData } from '../utils/fleetDeletionUtils';
import { Truck, Search, RefreshCw, ShieldAlert, ShieldCheck, Calendar, Fuel, User, AlertTriangle, Building2, Sparkles, CheckCircle2, Trash2, X, AlertCircle } from 'lucide-react';

export const CabsList: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);
  const [cleanupReport, setCleanupReport] = useState<CabCleanupReport | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Deletion States
  const [cabToDelete, setCabToDelete] = useState<Cab | null>(null);
  const [isDeletingSingleCab, setIsDeletingSingleCab] = useState<boolean>(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState<boolean>(false);
  const [bulkScope, setBulkScope] = useState<'all' | 'client'>('all');
  const [isDeletingBulk, setIsDeletingBulk] = useState<boolean>(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const fetchCabs = () => {
    setIsLoading(true);

    let rawCabs: Cab[] = [];
    let rawClients: Client[] = [];

    const applyScope = () => {
      const scope = resolveUserClientScope(userProfile, rawClients);
      setCabs(rawCabs.filter(c => isRecordAccessible(c, scope)));
      setClients(rawClients.filter(c => isRecordAccessible(c, scope)));
      setIsLoading(false);
    };

    const q = query(collection(db, 'cabs'));
    const unsubscribeCabs = onSnapshot(q, (snap) => {
      const items: Cab[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        items.push({ 
          id: docSnap.id, 
          ...data,
          registrationNumber: data.registrationNumber || data.regNumber || data.vehicleNumber || 'N/A',
          etsVehicleId: data.etsVehicleId || data.vehicleId || data.id || 'N/A',
          clientName: data.clientName || data.client || 'N/A',
        } as Cab);
      });
      rawCabs = items;
      applyScope();
    }, (err) => {
      console.error('Error listening to cabs:', err);
      setIsLoading(false);
    });

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (clientSnap) => {
      const cItems: Client[] = [];
      clientSnap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Client));
      rawClients = cItems;
      applyScope();
    }, (err) => console.error('Error listening to clients in CabsList:', err));

    return () => {
      unsubscribeCabs();
      unsubscribeClients();
    };
  };

  useEffect(() => {
    const cleanup = fetchCabs();
    return () => {
      if (cleanup) cleanup();
    };
  }, [userProfile, isAdmin]);

  const filteredCabs = cabs.filter(c => {
    const matchesClient = selectedClient === 'all' || 
      (c.clientId || '').toLowerCase() === selectedClient.toLowerCase() ||
      (c.clientName || '').toLowerCase() === selectedClient.toLowerCase();

    const matchesSearch = matchesCabSearch(c, searchTerm);

    if (statusFilter === 'all') return matchesSearch && matchesClient;
    return matchesSearch && matchesClient && (c.status || '').toLowerCase() === statusFilter;
  });

  const handleRunDeduplication = async () => {
    setIsDeduplicating(true);
    try {
      const report = await runCabDeduplicationCleanup();
      setCleanupReport(report);
    } catch (err) {
      console.error('Failed to run cab deduplication cleanup:', err);
    } finally {
      setIsDeduplicating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Cleanup Result Notification Banner */}
      {cleanupReport && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-emerald-900 animate-fadeIn">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Cab Deduplication Engine Sync Complete</p>
              <p className="mt-0.5 text-emerald-800">
                Processed <strong>{cleanupReport.totalCabsProcessed}</strong> cabs. Found and merged <strong>{cleanupReport.duplicateGroupsFound}</strong> duplicate groups ({cleanupReport.duplicateDocsDeleted} redundant documents deleted). Normalized registration fields synced for {cleanupReport.normalizedFieldUpdatedCount} records.
              </p>
              {cleanupReport.mergedGroups.length > 0 && (
                <div className="mt-2 space-y-1">
                  {cleanupReport.mergedGroups.map((g, idx) => (
                    <div key={idx} className="bg-white/80 p-2 rounded-lg border border-emerald-200 text-[11px] font-mono">
                      <span>Merged normalized key <strong className="text-emerald-900">{g.registrationNormalized}</strong> ({g.primaryReg}) — Deleted duplicate doc ID(s): {g.deletedIds.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setCleanupReport(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold px-2 py-1 bg-emerald-100/60 rounded-lg cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <Truck className="w-5 h-5" />
            </div>
            <span>Cabs Compliance Registry</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {cabs.length} total vehicles registered in Firestore database.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search registration, ETS ID, type, client..."
              className="bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-56 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
            />
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
              >
                <option value="all">All Clients</option>
                {clients.map((c) => (
                  <option key={c.id || c.clientId} value={c.clientId}>
                    {c.clientName} ({c.clientId})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-900">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Client: {userProfile?.clientId || userProfile?.assignedClientIds?.[0] || 'Bound Client'}</span>
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'inactive' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Inactive
            </button>
          </div>

          <button
            onClick={handleRunDeduplication}
            disabled={isDeduplicating}
            title="Auto-merge duplicate cab records"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-emerald-600 ${isDeduplicating ? 'animate-spin' : ''}`} />
            <span>{isDeduplicating ? 'Merging...' : 'Auto-Merge'}</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setBulkScope(selectedClient !== 'all' ? 'client' : 'all');
                setIsBulkDeleteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Delete previous cab records from database"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete Previous Cabs</span>
            </button>
          )}

          <button
            onClick={fetchCabs}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Delete Action Notice */}
      {deleteNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs text-emerald-950 font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{deleteNotice}</span>
          </div>
          <button
            onClick={() => setDeleteNotice(null)}
            className="p-1 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Fetching vehicle records...</span>
          </div>
        ) : cabs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-3">
            <Truck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No cab data uploaded yet.</p>
            <p className="text-slate-500 max-w-md mx-auto">Upload a Cabs Sheet to get started.</p>
          </div>
        ) : filteredCabs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Truck className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No cab records found matching search filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Vehicle Details</th>
                  <th className="px-6 py-3.5">Client & Type</th>
                  <th className="px-6 py-3.5">Assigned Driver</th>
                  <th className="px-6 py-3.5">Expiries (Insurance / PUC)</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCabs.map((c) => {
                  const isActive = (c.status || '').toLowerCase() === 'active';
                  const audit = analyzeCabExpiry(c);
                  return (
                    <tr key={c.id} className={`transition-colors ${audit.hasAlert ? (isActive ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'bg-rose-50/40 hover:bg-rose-50/60') : (!isActive ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-slate-50/80')}`}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900 text-sm font-mono">{c.registrationNumber || 'N/A'}</p>
                          <div className="flex items-center gap-2 text-slate-500 mt-0.5 font-mono text-[11px]">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{c.etsVehicleId}</span>
                            {c.fuelType && (
                              <span className="flex items-center gap-1 text-slate-600">
                                <Fuel className="w-3 h-3 text-slate-400" />
                                {c.fuelType}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">{c.clientName || 'N/A'}</p>
                        <p className="text-slate-500 text-[11px] mt-0.5">{c.vehicleType || 'N/A'}</p>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{c.driverName || 'Unassigned'}</span>
                        </div>
                        {c.driverMobileNumber && (
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{c.driverMobileNumber}</p>
                        )}
                      </td>

                      <td className="px-6 py-4 space-y-1 text-[11px]">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Insurance: </span>
                          <span className="font-mono text-slate-700 font-medium">{c.insuranceExpiryDate || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">PUC / Pollution: </span>
                          <span className="font-mono text-slate-700 font-medium">{c.pollutionCertificateExpiryDate || 'N/A'}</span>
                        </div>
                        {audit.hasAlert && (
                          <div className="mt-1 space-y-0.5">
                            {audit.alerts.map((al, idx) => (
                              <div key={idx} className="text-[10px] font-bold font-mono text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{al.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                              (c.status || '').toLowerCase() === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {(c.status || '').toLowerCase() === 'active' ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            <span>{c.status || 'Active'}</span>
                          </span>

                          {audit.hasAlert && (
                            <span className="inline-flex items-center gap-1 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider animate-pulse">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                              </span>
                              <span>{audit.worstStatus === 'expired' ? 'EXPIRED DOC' : 'EXPIRING SOON'}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={() => setCabToDelete(c)}
                          className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Delete Cab Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Cab Deletion Modal */}
      {cabToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Cab Record</h3>
                <p className="text-xs text-slate-500">Remove vehicle from fleet registry</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <p className="font-bold text-slate-900 font-mono">{cabToDelete.registrationNumber}</p>
              <p className="text-slate-600 font-mono">ETS ID: {cabToDelete.etsVehicleId || 'N/A'}</p>
              <p className="text-slate-600">Client: {cabToDelete.clientName || 'N/A'}</p>
            </div>

            <p className="text-xs text-rose-700 font-medium">
              Are you sure you want to permanently delete this vehicle record?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCabToDelete(null)}
                disabled={isDeletingSingleCab}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!cabToDelete.id) return;
                  setIsDeletingSingleCab(true);
                  try {
                    await deleteDoc(doc(db, 'cabs', cabToDelete.id));
                    setDeleteNotice(`Cab "${cabToDelete.registrationNumber}" deleted successfully.`);
                    setCabToDelete(null);
                  } catch (err: any) {
                    alert('Failed to delete cab: ' + err.message);
                  } finally {
                    setIsDeletingSingleCab(false);
                  }
                }}
                disabled={isDeletingSingleCab}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
              >
                {isDeletingSingleCab ? 'Deleting...' : 'Delete Cab'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Cabs Modal */}
      {isBulkDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    Delete Previous Cabs Data
                  </h3>
                  <p className="text-xs text-slate-500">
                    Purge vehicle records to prepare for a new spreadsheet upload
                  </p>
                </div>
              </div>

              {!isDeletingBulk && (
                <button
                  onClick={() => setIsBulkDeleteOpen(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Permanent Deletion Warning</p>
                <p className="text-rose-800 mt-0.5">
                  This will permanently delete cab records from Firestore. Action is logged in the audit trail.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Select Scope:
              </span>

              <div className="space-y-2">
                <label className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  bulkScope === 'all' 
                    ? 'border-rose-400 bg-rose-50/50 text-rose-950 font-bold' 
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="bulkCabScopeRadio"
                      value="all"
                      checked={bulkScope === 'all'}
                      onChange={() => setBulkScope('all')}
                      disabled={isDeletingBulk}
                      className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="text-xs">Delete ALL cab records in database</span>
                  </div>
                  <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                    {cabs.length} records
                  </span>
                </label>

                {selectedClient !== 'all' && (
                  <label className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                    bulkScope === 'client' 
                      ? 'border-rose-400 bg-rose-50/50 text-rose-950 font-bold' 
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/60'
                  }`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="bulkCabScopeRadio"
                        value="client"
                        checked={bulkScope === 'client'}
                        onChange={() => setBulkScope('client')}
                        disabled={isDeletingBulk}
                        className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <span className="text-xs">
                        Delete only cabs for {clients.find(c => c.clientId === selectedClient)?.clientName || selectedClient}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                      {filteredCabs.length} records
                    </span>
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(false)}
                disabled={isDeletingBulk}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  setIsDeletingBulk(true);
                  try {
                    const matchedC = clients.find(c => c.clientId === selectedClient);
                    const res = await deletePreviousFleetData({
                      target: 'cabs',
                      scope: bulkScope,
                      clientId: selectedClient !== 'all' ? selectedClient : undefined,
                      clientName: matchedC?.clientName,
                      deletedBy: userProfile?.name || userProfile?.email || 'Admin'
                    });
                    setIsBulkDeleteOpen(false);
                    setDeleteNotice(`Successfully deleted ${res.deletedCount} cab records.`);
                  } catch (err: any) {
                    alert('Error deleting cabs: ' + err.message);
                  } finally {
                    setIsDeletingBulk(false);
                  }
                }}
                disabled={isDeletingBulk}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {isDeletingBulk ? 'Deleting Cabs...' : 'Yes, Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
