/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Cab, Client } from '../types';
import { analyzeCabExpiry } from '../utils/expiryEngine';
import { matchesCabSearch } from '../utils/searchUtils';
import { Truck, Search, RefreshCw, ShieldAlert, ShieldCheck, Calendar, Fuel, User, AlertTriangle, Building2 } from 'lucide-react';

export const CabsList: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchCabs = () => {
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

      const accessible = items.filter(isAccessible);
      setCabs(accessible);
      setIsLoading(false);
    }, (err) => {
      console.error('Error listening to cabs:', err);
      setIsLoading(false);
    });

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (clientSnap) => {
      const cItems: Client[] = [];
      clientSnap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Client));
      setClients(cItems);
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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
            onClick={fetchCabs}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredCabs.map((c) => {
                  const audit = analyzeCabExpiry(c);
                  return (
                    <tr key={c.id} className={`transition-colors ${audit.hasAlert ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50/80'}`}>
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
