/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Driver, Cab, Client, UploadLog } from '../types';
import { analyzeDriverExpiry } from '../utils/expiryEngine';
import { matchesDriverSearch } from '../utils/searchUtils';
import { 
  Users, Search, RefreshCw, ShieldAlert, ShieldCheck, Phone, MapPin, 
  AlertTriangle, Building2, CheckCircle2, FileText, ArrowRight, Info
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

  const fetchDrivers = () => {
    setIsLoading(true);

    const userClientKeys = Array.from(new Set([
      userProfile?.clientId,
      ...(userProfile?.assignedClientIds || [])
    ].filter(Boolean).map(s => String(s).trim().toLowerCase())));

    const isAllClients = isAdmin || userClientKeys.includes('all');

    const isAccessible = (item: { clientId?: string; clientName?: string }) => {
      if (isAllClients) return true;
      if (userClientKeys.length === 0) return true;
      const cId = (item.clientId || '').trim().toLowerCase();
      const cName = (item.clientName || '').trim().toLowerCase();
      return userClientKeys.some(k => k === cId || k === cName);
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

      const accessible = items.filter(isAccessible);
      setDrivers(accessible);
      setIsLoading(false);
    }, (err) => {
      console.error('Error listening to drivers:', err);
      setIsLoading(false);
    });

    // Fetch Clients for dropdown filter
    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (clientSnap) => {
      const cItems: Client[] = [];
      clientSnap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Client));
      setClients(cItems);
    }, (err) => console.error('Error listening to clients in DriversList:', err));

    // Fetch Cabs for vehicle search cross-referencing
    const unsubscribeCabs = onSnapshot(collection(db, 'cabs'), (cabSnap) => {
      const cabItems: Cab[] = [];
      cabSnap.forEach(c => cabItems.push({ id: c.id, ...c.data() } as Cab));
      setCabs(cabItems);
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

          <button
            onClick={fetchDrivers}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDrivers.map((d) => {
                  const audit = analyzeDriverExpiry(d);
                  const isInactive = (d.status || '').toLowerCase() === 'inactive';
                  
                  return (
                    <tr key={d.id} className={`transition-colors ${isInactive ? 'bg-amber-50/30 hover:bg-amber-50/50' : audit.hasAlert ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{d.name || 'N/A'}</p>
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
                          <span className="font-mono text-slate-700 font-medium">{d.bgvExpiryDate || 'N/A'}</span>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
