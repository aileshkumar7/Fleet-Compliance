/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Driver, Cab, Client, UploadLog } from '../types';
import { analyzeDriverExpiry, isBgvExemptedByPoliceVerification } from '../utils/expiryEngine';
import { matchesDriverSearch } from '../utils/searchUtils';
import { getDriverCabNumber } from '../utils/cabDriverUtils';
import { resolveUserClientScope, isRecordAccessible } from '../utils/clientUtils';
import { deletePreviousFleetData } from '../utils/fleetDeletionUtils';
import { 
  Users, Search, RefreshCw, ShieldAlert, ShieldCheck, Phone, MapPin, 
  AlertTriangle, Building2, CheckCircle2, FileText, ArrowRight, Info, Truck,
  Trash2, X, AlertCircle
} from 'lucide-react';

export const DriversList: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [lastUploadLog, setLastUploadLog] = useState<UploadLog | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Deletion States
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState<boolean>(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState<boolean>(false);
  const [bulkScope, setBulkScope] = useState<'all' | 'client'>('all');
  const [isDeletingBulk, setIsDeletingBulk] = useState<boolean>(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const fetchDrivers = () => {
    setIsLoading(true);

    let rawDrivers: Driver[] = [];
    let rawCabs: Cab[] = [];
    let rawClients: Client[] = [];

    const applyScope = () => {
      const scope = resolveUserClientScope(userProfile, rawClients);
      setDrivers(rawDrivers.filter(d => isRecordAccessible(d, scope)));
      setCabs(rawCabs.filter(c => isRecordAccessible(c, scope)));
      setClients(rawClients.filter(c => isRecordAccessible(c, scope)));
      setIsLoading(false);
    };

    // Real-time Drivers listener
    const q = query(collection(db, 'drivers'));
    const unsubscribeDrivers = onSnapshot(q, (snap) => {
      const items: Driver[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        items.push({ 
          id: docSnap.id, 
          ...data,
          name: data.name || data.driverName || 'N/A',
          driverId: data.driverId || data.id || 'N/A',
          phoneNumbers: data.phoneNumbers || data.phone || data.mobile || data.driverMobileNumber || '',
          clientName: data.clientName || data.client || 'N/A',
        } as Driver);
      });
      rawDrivers = items;
      applyScope();
    }, (err) => {
      console.error('Error listening to drivers:', err);
      setIsLoading(false);
    });

    // Fetch Clients for dropdown filter
    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (clientSnap) => {
      const cItems: Client[] = [];
      clientSnap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Client));
      rawClients = cItems;
      applyScope();
    }, (err) => console.error('Error listening to clients in DriversList:', err));

    // Fetch Cabs for vehicle search cross-referencing
    const unsubscribeCabs = onSnapshot(collection(db, 'cabs'), (cabSnap) => {
      const cabItems: Cab[] = [];
      cabSnap.forEach(c => cabItems.push({ id: c.id, ...c.data() } as Cab));
      rawCabs = cabItems;
      applyScope();
    }, (err) => console.error('Error listening to cabs in DriversList:', err));

    // Fetch Latest Upload Log
    const qLog = query(collection(db, 'uploadLogs'), orderBy('uploadedAt', 'desc'), limit(1));
    const unsubscribeLogs = onSnapshot(qLog, (logSnap) => {
      if (!logSnap.empty) {
        const firstDoc = logSnap.docs[0];
        setLastUploadLog({ id: firstDoc.id, ...firstDoc.data() } as UploadLog);
      } else {
        setLastUploadLog(null);
      }
    }, (err) => console.error('Error listening to upload logs in DriversList:', err));

    return () => {
      unsubscribeDrivers();
      unsubscribeClients();
      unsubscribeCabs();
      unsubscribeLogs();
    };
  };

  useEffect(() => {
    const cleanup = fetchDrivers();
    return () => {
      if (cleanup) cleanup();
    };
  }, [userProfile, isAdmin]);

  const filteredDrivers = drivers.filter(d => {
    const matchesClient = selectedClient === 'all' || 
      (d.clientId || '').toLowerCase() === selectedClient.toLowerCase() ||
      (d.clientName || '').toLowerCase() === selectedClient.toLowerCase();

    const matchesSearch = matchesDriverSearch(d, searchTerm, cabs);
    
    // When a search term is entered, search across ALL statuses (Active & Inactive)
    if (searchTerm.trim().length > 0) {
      return matchesSearch && (selectedClient === 'all' || matchesClient);
    }

    if (statusFilter === 'all') return matchesSearch && matchesClient;
    return matchesSearch && matchesClient && (d.status || '').toLowerCase() === statusFilter;
  });

  const activeCount = drivers.filter(d => (d.status || '').toLowerCase() === 'active').length;
  const inactiveCount = drivers.filter(d => (d.status || '').toLowerCase() === 'inactive').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <span>Drivers Compliance Registry</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Displaying <span className="font-bold text-slate-800">{filteredDrivers.length}</span> driver records (<span className="font-bold text-emerald-600">{activeCount} Active</span>, <span className="font-bold text-amber-600">{inactiveCount} Inactive</span>) across database.
            {lastUploadLog && (
              <span className="ml-2 text-slate-400">
                • Latest sheet uploaded: <span className="font-mono text-blue-700 font-semibold">{lastUploadLog.fileName}</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search driver name, ID, license, client..."
              className="bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-52 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
            />
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
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
            <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-bold text-blue-900">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Client: {userProfile?.clientId || userProfile?.assignedClientIds?.[0] || 'Bound Client'}</span>
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500'}`}
            >
              All ({drivers.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'active' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'text-slate-500'}`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${statusFilter === 'inactive' ? 'bg-amber-600 text-white shadow-2xs font-bold' : 'text-slate-500'}`}
            >
              Inactive ({inactiveCount})
            </button>
          </div>

          {isAdmin && (
            <button
              onClick={() => {
                setBulkScope(selectedClient !== 'all' ? 'client' : 'all');
                setIsBulkDeleteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Delete previous driver records from database"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete Previous Drivers</span>
            </button>
          )}

          <button
            onClick={fetchDrivers}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Action Notice */}
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

      {/* Summary KPI Bar */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Drivers</span>
            <span className="text-2xl font-black text-slate-900 font-mono mt-0.5 block">{drivers.length}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Active Drivers</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-emerald-900 font-mono">{activeCount}</span>
              <span className="text-xs text-emerald-700 font-medium">Ready for deployment</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">Inactive Drivers</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-amber-900 font-mono">{inactiveCount}</span>
              <span className="text-xs text-amber-700 font-semibold">Action required</span>
            </div>
          </div>
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl border border-amber-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Inactive Driver Analysis Panel */}
      {inactiveCount > 0 && (statusFilter === 'inactive' || statusFilter === 'all') && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-900">
                Inactive Drivers Analysis ({inactiveCount} Drivers Pending Rectification)
              </h3>
            </div>
            <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
              Review reasons below to resolve ASAP
            </span>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">
            Every inactive driver profile listed below contains the exact reason for non-compliance or deactivation. Review the issues (e.g. DL expiry, BGV pending, Police Verification expired, Doctor Medical Fitness) and upload renewed certificates to restore active status.
          </p>

          <div className="bg-amber-100/70 border border-amber-300/80 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-950 font-medium">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              <strong className="text-amber-900">Checklist Checkpoint:</strong> If Police Verification Date is mentioned and certificate is uploaded, please don't consider the BGV Date and certificate.
            </span>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Fetching driver records...</span>
          </div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-3">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No driver data uploaded yet.</p>
            <p className="text-slate-500 max-w-md mx-auto">Upload a Drivers Sheet to get started.</p>
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No driver records found matching current search filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Driver Info</th>
                  <th className="px-6 py-3.5">Client & City</th>
                  <th className="px-6 py-3.5">License / Expiry</th>
                  <th className="px-6 py-3.5">Verification Expiries</th>
                  <th className="px-6 py-3.5">Status & Inactivity Reason</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDrivers.map((d) => {
                  const audit = analyzeDriverExpiry(d);
                  const isInactive = (d.status || '').toLowerCase() === 'inactive';
                  const cabNo = getDriverCabNumber(d, cabs);
                  
                  return (
                    <tr key={d.id} className={`transition-colors ${audit.hasAlert ? (!isInactive ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'bg-rose-50/40 hover:bg-rose-50/60') : (isInactive ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-slate-50/80')}`}>
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 text-sm">{d.name || 'N/A'}</p>
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                              <Truck className="w-3 h-3 text-blue-600" />
                              <span>{cabNo}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 mt-0.5 font-mono text-[11px]">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{d.driverId}</span>
                            {d.phoneNumbers && (
                              <span className="flex items-center gap-1 text-slate-600">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {d.phoneNumbers}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">{d.clientName || 'N/A'}</p>
                        {d.city && (
                          <p className="text-slate-500 flex items-center gap-1 text-[11px] mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {d.city}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-mono text-slate-800 font-medium">{d.driverLicenseNumber || 'N/A'}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Exp: <span className="font-bold text-slate-700">{d.driverLicenseExpiryDate || 'N/A'}</span>
                        </p>
                      </td>

                      <td className="px-6 py-4 space-y-1 text-[11px]">
                        <div>
                          <span className="text-slate-400">BGV: </span>
                          {isBgvExemptedByPoliceVerification(d) ? (
                            <span className="font-mono text-blue-700 font-medium">
                              {d.bgvExpiryDate || 'N/A'}{' '}
                              <span className="text-[10px] bg-blue-50 text-blue-800 font-semibold px-1 py-0.2 rounded border border-blue-200">
                                Bypassed (PV Active)
                              </span>
                            </span>
                          ) : (
                            <span className="font-mono text-slate-700 font-medium">{d.bgvExpiryDate || 'N/A'}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-400">Police: </span>
                          <span className="font-mono text-slate-700 font-medium">{d.policeVerificationExpiryDate || 'N/A'}</span>
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
                        <div className="flex flex-col items-start gap-1.5 max-w-xs">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                              !isInactive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300'
                            }`}
                          >
                            {!isInactive ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                            )}
                            <span>{isInactive ? 'INACTIVE' : 'ACTIVE'}</span>
                          </span>

                          {isInactive && (
                            <div className="bg-amber-100/80 p-2 rounded-xl border border-amber-200 text-[11px] text-amber-950 font-medium space-y-0.5 w-full">
                              <p className="font-bold text-amber-900 flex items-center gap-1">
                                <Info className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>Reason for Inactiveness:</span>
                              </p>
                              <p className="text-slate-800 leading-snug">
                                {d.inactivityReason || d.comments || 'Deactivated due to non-compliant document verification status.'}
                              </p>
                            </div>
                          )}

                          {!isInactive && audit.hasAlert && (
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
                          onClick={() => setDriverToDelete(d)}
                          className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Delete Driver Record"
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

      {/* Single Driver Deletion Modal */}
      {driverToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete Driver Record</h3>
                <p className="text-xs text-slate-500">Remove driver from active registry</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1 text-xs">
              <p className="font-bold text-slate-900">{driverToDelete.name}</p>
              <p className="text-slate-600 font-mono">ID: {driverToDelete.driverId || driverToDelete.id}</p>
              <p className="text-slate-600">Client: {driverToDelete.clientName || 'N/A'}</p>
            </div>

            <p className="text-xs text-rose-700 font-medium">
              Are you sure you want to permanently delete this driver record?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDriverToDelete(null)}
                disabled={isDeletingSingle}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!driverToDelete.id) return;
                  setIsDeletingSingle(true);
                  try {
                    await deleteDoc(doc(db, 'drivers', driverToDelete.id));
                    setDeleteNotice(`Driver "${driverToDelete.name}" deleted successfully.`);
                    setDriverToDelete(null);
                  } catch (err: any) {
                    alert('Failed to delete driver: ' + err.message);
                  } finally {
                    setIsDeletingSingle(false);
                  }
                }}
                disabled={isDeletingSingle}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
              >
                {isDeletingSingle ? 'Deleting...' : 'Delete Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Drivers Modal */}
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
                    Delete Previous Drivers Data
                  </h3>
                  <p className="text-xs text-slate-500">
                    Purge driver records to prepare for a new spreadsheet upload
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
                  This will permanently delete driver records from Firestore. Action is logged in the audit trail.
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
                      name="bulkScopeRadio"
                      value="all"
                      checked={bulkScope === 'all'}
                      onChange={() => setBulkScope('all')}
                      disabled={isDeletingBulk}
                      className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="text-xs">Delete ALL driver records in database</span>
                  </div>
                  <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                    {drivers.length} records
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
                        name="bulkScopeRadio"
                        value="client"
                        checked={bulkScope === 'client'}
                        onChange={() => setBulkScope('client')}
                        disabled={isDeletingBulk}
                        className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <span className="text-xs">
                        Delete only drivers for {clients.find(c => c.clientId === selectedClient)?.clientName || selectedClient}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800">
                      {filteredDrivers.length} records
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
                      target: 'drivers',
                      scope: bulkScope,
                      clientId: selectedClient !== 'all' ? selectedClient : undefined,
                      clientName: matchedC?.clientName,
                      deletedBy: userProfile?.name || userProfile?.email || 'Admin'
                    });
                    setIsBulkDeleteOpen(false);
                    setDeleteNotice(`Successfully deleted ${res.deletedCount} driver records.`);
                  } catch (err: any) {
                    alert('Error deleting drivers: ' + err.message);
                  } finally {
                    setIsDeletingBulk(false);
                  }
                }}
                disabled={isDeletingBulk}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md cursor-pointer"
              >
                {isDeletingBulk ? 'Deleting Drivers...' : 'Yes, Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
