/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Cab, Driver, Client } from '../types';
import { 
  analyzeCabExpiry, 
  analyzeDriverExpiry, 
  EntityExpiryAnalysis 
} from '../utils/expiryEngine';
import { 
  AlertTriangle, 
  Truck, 
  Users, 
  Search, 
  RefreshCw, 
  Clock, 
  ShieldAlert, 
  Calendar, 
  Phone, 
  Building2,
  CheckCircle2,
  Flame,
  Filter,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { ReportDownloadModal } from './ReportDownloadModal';

export const ExpiringAlertsView: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'expired' | 'expiring_soon'>('all');
  const [categoryTab, setCategoryTab] = useState<'all' | 'cabs' | 'drivers'>('all');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  useEffect(() => {
    setIsLoading(true);

    const unsubCabs = onSnapshot(collection(db, 'cabs'), (snap) => {
      const items: Cab[] = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() } as Cab));

      const isAllClients = isAdmin || userProfile?.assignedClientIds?.includes('all');
      const allowedClientIds = userProfile?.assignedClientIds || [];

      const accessible = isAllClients
        ? items
        : items.filter(c => allowedClientIds.includes(c.clientId) || allowedClientIds.includes(c.clientName));

      setCabs(accessible);
    });

    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      const items: Driver[] = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() } as Driver));

      const isAllClients = isAdmin || userProfile?.assignedClientIds?.includes('all');
      const allowedClientIds = userProfile?.assignedClientIds || [];

      const accessible = isAllClients
        ? items
        : items.filter(d => allowedClientIds.includes(d.clientId) || allowedClientIds.includes(d.clientName));

      setDrivers(accessible);
      setIsLoading(false);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      const items: Client[] = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() } as Client));
      setClients(items);
    });

    return () => {
      unsubCabs();
      unsubDrivers();
      unsubClients();
    };
  }, [userProfile, isAdmin]);

  // Client filter match logic
  const matchClient = (recordClientName?: string, recordClientId?: string) => {
    if (selectedClient === 'all') return true;
    return (recordClientName || '').toLowerCase() === selectedClient.toLowerCase() ||
           (recordClientId || '').toLowerCase() === selectedClient.toLowerCase();
  };

  // Scoped Cabs & Drivers
  const scopedCabs = cabs.filter(c => matchClient(c.clientName, c.clientId));
  const scopedDrivers = drivers.filter(d => matchClient(d.clientName, d.clientId));

  // Analyze scoped cabs and drivers
  const cabAnalyses: EntityExpiryAnalysis<Cab>[] = scopedCabs
    .map(analyzeCabExpiry)
    .filter(a => a.hasAlert);

  const driverAnalyses: EntityExpiryAnalysis<Driver>[] = scopedDrivers
    .map(analyzeDriverExpiry)
    .filter(a => a.hasAlert);

  // Sort by most urgent (fewest days remaining first, i.e. negative days first)
  cabAnalyses.sort((a, b) => a.minDaysRemaining - b.minDaysRemaining);
  driverAnalyses.sort((a, b) => a.minDaysRemaining - b.minDaysRemaining);

  // Apply filters
  const filteredCabAnalyses = cabAnalyses.filter(a => {
    const reg = (a.entity.registrationNumber || '').toLowerCase();
    const ets = (a.entity.etsVehicleId || '').toLowerCase();
    const matchesSearch = !searchTerm || reg.includes(searchTerm.toLowerCase()) || ets.includes(searchTerm.toLowerCase());
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && a.worstStatus === filterType;
  });

  const filteredDriverAnalyses = driverAnalyses.filter(a => {
    const name = (a.entity.name || '').toLowerCase();
    const license = (a.entity.driverLicenseNumber || '').toLowerCase();
    const matchesSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || license.includes(searchTerm.toLowerCase());
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && a.worstStatus === filterType;
  });

  const totalExpired = cabAnalyses.filter(a => a.worstStatus === 'expired').length + driverAnalyses.filter(a => a.worstStatus === 'expired').length;
  const totalExpiringSoon = cabAnalyses.filter(a => a.worstStatus === 'expiring_soon').length + driverAnalyses.filter(a => a.worstStatus === 'expiring_soon').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-rose-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <span>Document Expiry Alerts Engine</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time automated audit of cab compliance certificates & driver verification documents.
          </p>
        </div>

        {/* Stats Badges & Download Button */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="bg-rose-50 border border-rose-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-rose-700 uppercase font-bold tracking-wider block">Expired Docs</span>
            <span className="text-lg font-black text-rose-800 font-mono">{totalExpired}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-amber-700 uppercase font-bold tracking-wider block">Expiring Soon (≤10d)</span>
            <span className="text-lg font-black text-amber-800 font-mono">{totalExpiringSoon}</span>
          </div>

          <button
            onClick={() => setShowReportModal(true)}
            className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Download Expiry Report</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Search, Category Tab, Expiry Status Filter */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Cab Reg # or Driver Name / License..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:ring-2 focus:ring-rose-500 focus:bg-white outline-none text-slate-800 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          {/* Client Filter Dropdown for Admin, or locked badge for User */}
          {isAdmin ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Building2 className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="text-slate-500 font-medium text-[11px] hidden md:inline">Client:</span>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
              >
                <option value="all">🌐 All Clients ({clients.length})</option>
                {clients.map((c) => (
                  <option key={c.id || c.clientId} value={c.clientId}>
                    🏢 {c.clientName} ({c.clientId})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-900">
              <Building2 className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Client: {userProfile?.clientId || userProfile?.assignedClientIds?.[0] || 'Bound Client'}</span>
            </div>
          )}
          {/* Category Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setCategoryTab('all')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${categoryTab === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              All Alerts ({cabAnalyses.length + driverAnalyses.length})
            </button>
            <button
              onClick={() => setCategoryTab('cabs')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${categoryTab === 'cabs' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Cabs ({cabAnalyses.length})
            </button>
            <button
              onClick={() => setCategoryTab('drivers')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${categoryTab === 'drivers' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Drivers ({driverAnalyses.length})
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${filterType === 'all' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              All Types
            </button>
            <button
              onClick={() => setFilterType('expired')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${filterType === 'expired' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Expired
            </button>
            <button
              onClick={() => setFilterType('expiring_soon')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${filterType === 'expiring_soon' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Expiring Soon
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-rose-600" />
          <span>Running document expiry check across fleet...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* CABS ALERT SECTION */}
          {(categoryTab === 'all' || categoryTab === 'cabs') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-rose-600" />
                  <span>Cab Vehicle Document Alerts ({filteredCabAnalyses.length})</span>
                </h3>
                <span className="text-xs font-mono text-slate-500">Sorted by urgency (fewest days remaining)</span>
              </div>

              {filteredCabAnalyses.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-slate-700">No cab document alerts found!</p>
                  <p>All vehicles have valid insurance, pollution, permit, fitness, tax, and service dates.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCabAnalyses.map(({ entity: cab, worstStatus, alerts }) => (
                    <div
                      key={cab.id}
                      className={`bg-white rounded-2xl border shadow-sm p-5 space-y-3 relative overflow-hidden transition-all ${
                        worstStatus === 'expired' 
                          ? 'border-rose-300 ring-2 ring-rose-500/20' 
                          : 'border-amber-300 ring-2 ring-amber-500/20'
                      }`}
                    >
                      {/* Top Bar with Pulsing Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-mono font-bold text-slate-900 text-base">{cab.registrationNumber || 'N/A'}</h4>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-slate-500">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{cab.etsVehicleId}</span>
                            <span>{cab.vehicleType}</span>
                          </div>
                        </div>

                        {/* Blinking Red Alert Badge */}
                        <div className="flex items-center gap-1.5 bg-rose-600 text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm shrink-0">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                          </span>
                          <span>{worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                        </div>
                      </div>

                      {/* Client & Driver */}
                      <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Client:</span>
                          <span className="font-semibold text-slate-800">{cab.clientName || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Driver:</span>
                          <span className="font-semibold text-slate-800">{cab.driverName || 'Unassigned'}</span>
                        </div>
                      </div>

                      {/* Specific Triggering Document Alerts List */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Triggered Certificate Expiries:
                        </span>
                        <div className="space-y-1.5">
                          {alerts.map((al, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                                al.status === 'expired'
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${al.status === 'expired' ? 'text-rose-600' : 'text-amber-600'}`} />
                                <span className="font-semibold">{al.docName}</span>
                              </div>
                              <div className="text-right font-mono text-[11px] font-bold">
                                <span>{al.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DRIVERS ALERT SECTION */}
          {(categoryTab === 'all' || categoryTab === 'drivers') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-rose-600" />
                  <span>Driver Verification Document Alerts ({filteredDriverAnalyses.length})</span>
                </h3>
                <span className="text-xs font-mono text-slate-500">Sorted by urgency (fewest days remaining)</span>
              </div>

              {filteredDriverAnalyses.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-slate-700">No driver document alerts found!</p>
                  <p>All drivers have valid licenses, badges, BGV, police, medical, training, and eye test verifications.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDriverAnalyses.map(({ entity: driver, worstStatus, alerts }) => (
                    <div
                      key={driver.id}
                      className={`bg-white rounded-2xl border shadow-sm p-5 space-y-3 relative overflow-hidden transition-all ${
                        worstStatus === 'expired' 
                          ? 'border-rose-300 ring-2 ring-rose-500/20' 
                          : 'border-amber-300 ring-2 ring-amber-500/20'
                      }`}
                    >
                      {/* Top Bar with Pulsing Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-slate-900 text-base">{driver.name || 'N/A'}</h4>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-slate-500">
                            <span>DL: <strong className="text-slate-800">{driver.driverLicenseNumber || 'N/A'}</strong></span>
                          </div>
                        </div>

                        {/* Blinking Red Alert Badge */}
                        <div className="flex items-center gap-1.5 bg-rose-600 text-white px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm shrink-0">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                          </span>
                          <span>{worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                        </div>
                      </div>

                      {/* Client & City */}
                      <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Client:</span>
                          <span className="font-semibold text-slate-800">{driver.clientName || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">City:</span>
                          <span className="font-semibold text-slate-800">{driver.city || 'Bangalore'}</span>
                        </div>
                      </div>

                      {/* Specific Triggering Document Alerts List */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Triggered Verification Expiries:
                        </span>
                        <div className="space-y-1.5">
                          {alerts.map((al, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                                al.status === 'expired'
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : 'bg-amber-50 border-amber-200 text-amber-900'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${al.status === 'expired' ? 'text-rose-600' : 'text-amber-600'}`} />
                                <span className="font-semibold">{al.docName}</span>
                              </div>
                              <div className="text-right font-mono text-[11px] font-bold">
                                <span>{al.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Report Download Modal */}
      <ReportDownloadModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        defaultAlertFilter="all_alerts"
        defaultClientFilter={selectedClient}
      />
    </div>
  );
};
