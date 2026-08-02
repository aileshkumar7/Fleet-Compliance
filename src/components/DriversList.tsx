/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Driver, Client } from '../types';
import { analyzeDriverExpiry } from '../utils/expiryEngine';
import { Users, Search, RefreshCw, ShieldAlert, ShieldCheck, Phone, MapPin, BadgeAlert, AlertTriangle, Building2 } from 'lucide-react';

export const DriversList: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const fetchDrivers = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'drivers'));
      const snap = await getDocs(q);
      const items: Driver[] = [];
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Driver);
      });

      const clientSnap = await getDocs(collection(db, 'clients'));
      const cItems: Client[] = [];
      clientSnap.forEach(c => cItems.push({ id: c.id, ...c.data() } as Client));
      setClients(cItems);

      // Filter by assigned client if standard user
      const isAllClients = isAdmin || userProfile?.assignedClientIds?.includes('all');
      const userClientId = userProfile?.clientId || userProfile?.assignedClientIds?.[0] || '';

      const accessible = isAllClients
        ? items
        : items.filter(d => (d.clientId || '').toLowerCase() === userClientId.toLowerCase() || (d.clientName || '').toLowerCase() === userClientId.toLowerCase());

      setDrivers(accessible);
    } catch (err) {
      console.error('Error fetching drivers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [userProfile]);

  const filteredDrivers = drivers.filter(d => {
    const matchesClient = selectedClient === 'all' || 
      (d.clientId || '').toLowerCase() === selectedClient.toLowerCase() ||
      (d.clientName || '').toLowerCase() === selectedClient.toLowerCase();

    const matchesSearch = 
      (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.driverId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.driverLicenseNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.city || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch && matchesClient;
    return matchesSearch && matchesClient && (d.status || '').toLowerCase() === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <span>Drivers Compliance Registry</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {drivers.length} total drivers recorded in Firestore database.
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
              className="bg-slate-100 border-none rounded-xl pl-9 pr-4 py-2 text-xs w-56 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
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
            onClick={fetchDrivers}
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
            <span>Fetching driver records...</span>
          </div>
        ) : filteredDrivers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No driver records found.</p>
            <p>Upload a data sheet to populate driver compliance profiles.</p>
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
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredDrivers.map((d) => {
                  const audit = analyzeDriverExpiry(d);
                  return (
                    <tr key={d.id} className={`transition-colors ${audit.hasAlert ? 'bg-rose-50/30 hover:bg-rose-50/50' : 'hover:bg-slate-50/80'}`}>
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
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                              (d.status || '').toLowerCase() === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {(d.status || '').toLowerCase() === 'active' ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            <span>{d.status || 'Active'}</span>
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
