/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Cab, Driver, Client } from '../types';
import { useAuth } from '../context/AuthContext';
import { exportFleetExcelReport, ReportFilterOptions } from '../utils/reportGenerator';
import { analyzeCabExpiry, analyzeDriverExpiry } from '../utils/expiryEngine';
import { 
  FileSpreadsheet, 
  Download, 
  X, 
  Filter, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Truck, 
  Users,
  Sparkles
} from 'lucide-react';

interface ReportDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAlertFilter?: 'all' | 'expiring_soon' | 'expired' | 'all_alerts';
  defaultClientFilter?: string;
}

export const ReportDownloadModal: React.FC<ReportDownloadModalProps> = ({
  isOpen,
  onClose,
  defaultAlertFilter = 'all',
  defaultClientFilter = 'all'
}) => {
  const { userProfile, isAdmin } = useAuth();

  const [cabs, setCabs] = useState<Cab[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  // Filters
  const [clientFilter, setClientFilter] = useState<string>(defaultClientFilter);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [alertStatusFilter, setAlertStatusFilter] = useState<'all' | 'expiring_soon' | 'expired' | 'all_alerts'>(defaultAlertFilter);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  useEffect(() => {
    setAlertStatusFilter(defaultAlertFilter);
    setClientFilter(defaultClientFilter);
  }, [defaultAlertFilter, defaultClientFilter]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const cabSnap = await getDocs(collection(db, 'cabs'));
        const cabList: Cab[] = [];
        cabSnap.forEach(d => cabList.push({ id: d.id, ...d.data() } as Cab));

        const driverSnap = await getDocs(collection(db, 'drivers'));
        const driverList: Driver[] = [];
        driverSnap.forEach(d => driverList.push({ id: d.id, ...d.data() } as Driver));

        const clientSnap = await getDocs(collection(db, 'clients'));
        const clientList: Client[] = [];
        clientSnap.forEach(d => clientList.push({ id: d.id, ...d.data() } as Client));

        setCabs(cabList);
        setDrivers(driverList);
        setClients(clientList);
      } catch (err) {
        console.error('Error loading report modal data:', err);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, [isOpen]);

  if (!isOpen) return null;

  // Compute live pre-filter counts
  const matchingCabs = cabs.filter(c => {
    if (clientFilter !== 'all') {
      const match = (c.clientId || '').toLowerCase() === clientFilter.toLowerCase() ||
                    (c.clientName || '').toLowerCase() === clientFilter.toLowerCase();
      if (!match) return false;
    }
    if (statusFilter !== 'all') {
      if ((c.status || '').toLowerCase() !== statusFilter) return false;
    }
    const analysis = analyzeCabExpiry(c);
    if (alertStatusFilter === 'expired') return analysis.worstStatus === 'expired';
    if (alertStatusFilter === 'expiring_soon') return analysis.worstStatus === 'expiring_soon';
    if (alertStatusFilter === 'all_alerts') return analysis.hasAlert;
    return true;
  });

  const matchingDrivers = drivers.filter(d => {
    if (clientFilter !== 'all') {
      const match = (d.clientId || '').toLowerCase() === clientFilter.toLowerCase() ||
                    (d.clientName || '').toLowerCase() === clientFilter.toLowerCase();
      if (!match) return false;
    }
    if (statusFilter !== 'all') {
      if ((d.status || '').toLowerCase() !== statusFilter) return false;
    }
    const analysis = analyzeDriverExpiry(d);
    if (alertStatusFilter === 'expired') return analysis.worstStatus === 'expired';
    if (alertStatusFilter === 'expiring_soon') return analysis.worstStatus === 'expiring_soon';
    if (alertStatusFilter === 'all_alerts') return analysis.hasAlert;
    return true;
  });

  const handleDownload = async () => {
    setIsExporting(true);
    setExportSuccess(null);

    const filterOptions: ReportFilterOptions = {
      clientFilter,
      statusFilter,
      alertStatusFilter,
    };

    try {
      const res = await exportFleetExcelReport(
        cabs,
        drivers,
        filterOptions,
        userProfile?.email || userProfile?.name || 'Admin User',
        clients
      );

      setExportSuccess(`Report "${res.fileName}" successfully generated! (${res.cabCount} cabs, ${res.driverCount} drivers exported)`);
      setTimeout(() => {
        onClose();
        setExportSuccess(null);
      }, 2500);
    } catch (err: any) {
      console.error('Failed to generate excel report:', err);
      alert('Failed to generate Excel report: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden space-y-0">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-2xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Export Fleet Compliance Report</h3>
              <p className="text-xs text-slate-400">Export structured Excel (.xlsx) data with multi-sheet audit logs</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {exportSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-2xl flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>Configure Export Filters</span>
            </div>

            {/* 1. Client Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Filter by Client Organization</span>
              </label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">🌐 All Clients ({clients.length} Organizations)</option>
                {clients.map(c => (
                  <option key={c.id || c.clientId} value={c.clientId}>
                    🏢 {c.clientName} ({c.clientId})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Active Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Filter by Operating Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All Statuses
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Active Only
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('inactive')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === 'inactive'
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Inactive Only
                </button>
              </div>
            </div>

            {/* 3. Alert Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Filter by Expiry Alert Status
              </label>
              <select
                value={alertStatusFilter}
                onChange={(e) => setAlertStatusFilter(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">📊 All Records (Valid + Expiring + Expired)</option>
                <option value="all_alerts">⚠️ All Document Alerts (Expiring Soon OR Expired)</option>
                <option value="expiring_soon">⏳ Expiring Soon Only (Expires within 10 Days)</option>
                <option value="expired">🚨 Expired Documents Only</option>
              </select>
            </div>
          </div>

          {/* Record Live Preview Badge */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
            <div className="text-xs text-slate-600">
              <span className="font-bold text-slate-800">Selected Export Scope:</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Includes two sheets ("Cabs" & "Drivers") with complete attributes + alert columns.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800">
                <Truck className="w-3.5 h-3.5 text-blue-600" />
                <span>{matchingCabs.length} Cabs</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                <span>{matchingDrivers.length} Drivers</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-4 py-2 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isExporting || isLoadingData || (matchingCabs.length === 0 && matchingDrivers.length === 0)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Generating Excel...' : 'Download Excel Report (.xlsx)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
