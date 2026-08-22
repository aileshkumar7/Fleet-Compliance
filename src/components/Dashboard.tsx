/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Driver, Cab, Client, UploadLog } from '../types';
import { analyzeCabExpiry, analyzeDriverExpiry } from '../utils/expiryEngine';
import { purgeAllDummyData } from '../utils/seedDriversData';
import { matchesCabSearch, matchesDriverSearch } from '../utils/searchUtils';
import { getDriverCabNumber } from '../utils/cabDriverUtils';
import { resolveUserClientScope, isRecordAccessible } from '../utils/clientUtils';
import { RecordDetailView } from './RecordDetailView';
import { ReportDownloadModal } from './ReportDownloadModal';
import { 
  Truck, 
  Users, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  Building2, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  Calendar, 
  FileText,
  UserCheck,
  UserX,
  Car,
  CheckCircle2,
  XCircle,
  Filter,
  AlertTriangle,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  Download,
  Trash2
} from 'lucide-react';

interface DashboardProps {
  onNavigateToUpload?: () => void;
  onNavigateToAlerts?: () => void;
  selectedClientFilter?: string;
  onSelectClientFilter?: (clientId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  onNavigateToUpload, 
  onNavigateToAlerts,
  selectedClientFilter,
  onSelectClientFilter 
}) => {
  const { userProfile, isAdmin } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [lastUploadLog, setLastUploadLog] = useState<UploadLog | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [localSelectedClient, setLocalSelectedClient] = useState<string>('all');
  const [activeTabSection, setActiveTabSection] = useState<'all' | 'cabs' | 'drivers'>('all');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  // Selected Detail View Record
  const [selectedRecord, setSelectedRecord] = useState<{ record: Cab | Driver; type: 'cab' | 'driver' } | null>(null);

  const selectedClient = selectedClientFilter !== undefined ? selectedClientFilter : localSelectedClient;

  const handleClientChange = (newVal: string) => {
    setLocalSelectedClient(newVal);
    if (onSelectClientFilter) {
      onSelectClientFilter(newVal);
    }
  };

  useEffect(() => {
    setIsLoading(true);

    let rawDrivers: Driver[] = [];
    let rawCabs: Cab[] = [];
    let rawClients: Client[] = [];

    const applyClientScope = () => {
      const scope = resolveUserClientScope(userProfile, rawClients);

      const accessibleDrivers = rawDrivers.filter(d => isRecordAccessible(d, scope));
      const accessibleCabs = rawCabs.filter(c => isRecordAccessible(c, scope));
      const accessibleClients = rawClients.filter(c => isRecordAccessible(c, scope));

      setDrivers(accessibleDrivers);
      setCabs(accessibleCabs);
      setClients(accessibleClients);
    };

    // 1. Subscribe to drivers
    const unsubscribeDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const items: Driver[] = [];
      snapshot.forEach(docSnap => {
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
      applyClientScope();
    }, (err) => console.error('Error listening to drivers:', err));

    // 2. Subscribe to cabs
    const unsubscribeCabs = onSnapshot(collection(db, 'cabs'), (snapshot) => {
      const items: Cab[] = [];
      snapshot.forEach(docSnap => {
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
      applyClientScope();
    }, (err) => console.error('Error listening to cabs:', err));

    // 3. Subscribe to clients
    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const items: Client[] = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Client);
      });
      rawClients = items;
      applyClientScope();
    }, (err) => console.error('Error listening to clients:', err));

    // 4. Subscribe to latest upload log for timestamp
    const qLog = query(collection(db, 'uploadLogs'), orderBy('uploadedAt', 'desc'), limit(1));
    const unsubscribeLogs = onSnapshot(qLog, (snapshot) => {
      if (!snapshot.empty) {
        const firstDoc = snapshot.docs[0];
        setLastUploadLog({ id: firstDoc.id, ...firstDoc.data() } as UploadLog);
      } else {
        setLastUploadLog(null);
      }
      setIsLoading(false);
    }, (err) => {
      console.error('Error listening to uploadLogs:', err);
      setIsLoading(false);
    });

    return () => {
      unsubscribeDrivers();
      unsubscribeCabs();
      unsubscribeClients();
      unsubscribeLogs();
    };
  }, [userProfile, isAdmin]);

  // Filter logic for client scoping
  const matchClient = (recordClientName?: string, recordClientId?: string) => {
    if (selectedClient === 'all') return true;
    return (recordClientName || '').toLowerCase() === selectedClient.toLowerCase() ||
           (recordClientId || '').toLowerCase() === selectedClient.toLowerCase();
  };

  // Records scoped by selected client
  const scopedCabs = cabs.filter(c => matchClient(c.clientName, c.clientId));
  const scopedDrivers = drivers.filter(d => matchClient(d.clientName, d.clientId));

  // Compute live summary counts strictly respecting selected client filter
  const totalCabsCount = scopedCabs.length;
  const activeCabsCount = scopedCabs.filter(c => (c.status || '').toLowerCase() === 'active').length;
  const inactiveCabsCount = scopedCabs.filter(c => (c.status || '').toLowerCase() === 'inactive').length;

  const totalDriversCount = scopedDrivers.length;
  const activeDriversCount = scopedDrivers.filter(d => (d.status || '').toLowerCase() === 'active').length;
  const inactiveDriversCount = scopedDrivers.filter(d => (d.status || '').toLowerCase() === 'inactive').length;

  const totalFleetCount = totalCabsCount + totalDriversCount;

  const filteredCabs = scopedCabs.filter(c => matchesCabSearch(c, searchTerm));

  const filteredDrivers = scopedDrivers.filter(d => matchesDriverSearch(d, searchTerm, scopedCabs));

  const activeCabs = filteredCabs.filter(c => (c.status || '').toLowerCase() === 'active');
  const inactiveCabs = filteredCabs.filter(c => (c.status || '').toLowerCase() === 'inactive');

  const activeDrivers = filteredDrivers.filter(d => (d.status || '').toLowerCase() === 'active');
  const inactiveDrivers = filteredDrivers.filter(d => (d.status || '').toLowerCase() === 'inactive');

  // Compute document expiry alerts across all scoped cabs and drivers (Active & Inactive)
  const activeCabAlertsCount = scopedCabs
    .filter(c => (c.status || '').toLowerCase() === 'active')
    .map(analyzeCabExpiry)
    .filter(a => a.hasAlert).length;

  const inactiveCabAlertsCount = scopedCabs
    .filter(c => (c.status || '').toLowerCase() === 'inactive')
    .map(analyzeCabExpiry)
    .filter(a => a.hasAlert).length;

  const cabAlertsCount = activeCabAlertsCount + inactiveCabAlertsCount;
    
  const activeDriverAlertsCount = scopedDrivers
    .filter(d => (d.status || '').toLowerCase() === 'active')
    .map(analyzeDriverExpiry)
    .filter(a => a.hasAlert).length;

  const inactiveDriverAlertsCount = scopedDrivers
    .filter(d => (d.status || '').toLowerCase() === 'inactive')
    .map(analyzeDriverExpiry)
    .filter(a => a.hasAlert).length;
    
  const driverAlertsCount = activeDriverAlertsCount + inactiveDriverAlertsCount;
  const totalAlertsCount = cabAlertsCount + driverAlertsCount;

  // Calculate days since last Excel upload for weekly reminder
  const lastUploadDate = lastUploadLog?.uploadedAt ? new Date(lastUploadLog.uploadedAt) : null;
  const daysSinceLastUpload = lastUploadDate 
    ? Math.floor((Date.now() - lastUploadDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isDataStale = lastUploadDate === null || (daysSinceLastUpload !== null && daysSinceLastUpload > 7);

  // Active client display helper
  const activeClientDisplayName = useMemo(() => {
    if (isAdmin || userProfile?.assignedClientIds?.includes('all')) {
      return 'All Clients (Global Access)';
    }
    const cid = userProfile?.clientId || userProfile?.assignedClientIds?.[0] || '';
    const matched = clients.find(c => 
      c.clientId.toLowerCase() === cid.toLowerCase() || 
      c.clientName.toLowerCase() === cid.toLowerCase()
    );
    if (matched) return matched.clientName;
    if (cid.toLowerCase().includes('air')) return 'Air India Sats';
    return cid || 'Air India Sats';
  }, [isAdmin, userProfile, clients]);

  if (selectedRecord) {
    return (
      <RecordDetailView 
        record={selectedRecord.record} 
        type={selectedRecord.type} 
        onBack={() => setSelectedRecord(null)} 
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* User Identity & Active Scope Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black border shadow-xs ${
            isAdmin ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-blue-600 text-white border-blue-400'
          }`}>
            {userProfile?.name ? userProfile.name.slice(0, 2).toUpperCase() : 'US'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Logged in as <span className="text-blue-400 font-extrabold">{userProfile?.name || 'User'}</span>
              </h3>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                isAdmin ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-blue-400/20 text-blue-300 border border-blue-400/40'
              }`}>
                {isAdmin ? 'System Administrator' : 'Operations User'}
              </span>
            </div>
            <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Assigned Organization: <strong className="text-white font-bold">{activeClientDisplayName}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            {isAdmin ? 'Global Access Mode' : `Scoped Exclusively to ${activeClientDisplayName}`}
          </span>
        </div>
      </div>
      {/* Stale Data Reminder Banner (> 7 Days or No Upload) */}
      {isDataStale && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-950 text-sm">
                  ⚠️ Fleet Data Sheet Update Required!
                </span>
                <span className="bg-amber-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  {lastUploadDate === null ? 'No Upload Logged' : `${daysSinceLastUpload} Days Old`}
                </span>
              </div>
              <p className="text-xs text-amber-900 mt-0.5">
                {lastUploadDate === null 
                  ? 'No weekly data sheets have been uploaded yet. Upload a sheet to maintain accurate compliance records.'
                  : `Last bulk data upload was on ${lastUploadDate.toLocaleDateString()} (${daysSinceLastUpload} days ago). Weekly uploads keep driver & cab status accurate.`}
              </p>
            </div>
          </div>

          {onNavigateToUpload && (
            <button
              onClick={onNavigateToUpload}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Weekly Excel Sheet</span>
            </button>
          )}
        </div>
      )}

      {/* Expiry Alerts Alert Banner */}
      {totalAlertsCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-600 text-white rounded-xl animate-pulse shadow-xs shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-950 text-sm">
                  {totalAlertsCount} Active Document Expiry Alert{totalAlertsCount > 1 ? 's' : ''} Detected!
                </span>
                <span className="bg-rose-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse">
                  Blinking Alert Active
                </span>
              </div>
              <p className="text-xs text-rose-800 mt-0.5">
                {cabAlertsCount} Cab document{cabAlertsCount !== 1 ? 's' : ''} & {driverAlertsCount} Driver verification{driverAlertsCount !== 1 ? 's' : ''} are expired or expiring within 10 days.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToAlerts}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <span>View Expiry Alerts Tab</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dashboard Top Header & Live Fleet Totals Summary */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <span>Fleet Operations Dashboard</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Real-time compliance tracking for cabs, drivers, and organizational clients.
            </p>
          </div>

          {/* Top Header Actions (Download Report + Last Updated) */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {isAdmin && (
              <button
                onClick={async () => {
                  if (window.confirm("Are you sure you want to clean up legacy system seed data? This will permanently remove any records created by System Seed Engine.")) {
                    const count = await purgeAllDummyData();
                    alert(`Cleaned up ${count} legacy seed records.`);
                  }
                }}
                className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-rose-200 transition-colors cursor-pointer shrink-0"
                title="Manually purge records created by System Seed Engine"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Clean Up Legacy Data</span>
              </button>
            )}

            <button
              onClick={() => setShowReportModal(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download Live Report</span>
            </button>

            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shrink-0">
              <Clock className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="text-xs">
                <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider">
                  Last Updated Log
                </span>
                <span className="font-semibold text-slate-800 font-mono">
                  {lastUploadLog?.uploadedAt 
                    ? new Date(lastUploadLog.uploadedAt).toLocaleString() 
                    : 'No uploads logged yet'}
                </span>
              </div>
              {lastUploadLog?.fileName && (
                <span className="text-[11px] font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 hidden sm:inline">
                  {lastUploadLog.fileName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Highlighted Final Overview Count Pills */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 bg-blue-50/80 border border-blue-200/80 px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-950">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Total Drivers: <strong className="text-blue-700 text-sm font-black font-mono ml-0.5">{totalDriversCount}</strong></span>
            <span className="text-[11px] font-semibold text-blue-800/80 bg-blue-100/70 px-2 py-0.5 rounded-md">
              {activeDriversCount} Active • {inactiveDriversCount} Inactive
            </span>
          </div>

          <div className="inline-flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl text-xs font-bold text-emerald-950">
            <Car className="w-4 h-4 text-emerald-600" />
            <span>Total Cabs: <strong className="text-emerald-700 text-sm font-black font-mono ml-0.5">{totalCabsCount}</strong></span>
            <span className="text-[11px] font-semibold text-emerald-800/80 bg-emerald-100/70 px-2 py-0.5 rounded-md">
              {activeCabsCount} Active • {inactiveCabsCount} Inactive
            </span>
          </div>

          <div className="inline-flex items-center gap-2 bg-slate-100/80 border border-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-900">
            <Truck className="w-4 h-4 text-slate-600" />
            <span>Total Combined Fleet: <strong className="text-slate-800 text-sm font-black font-mono ml-0.5">{totalFleetCount}</strong></span>
          </div>
        </div>
      </div>

      {/* 8 Summary Live Cards Grid: Drivers, Cabs, and Document Expiry Alerts */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Drivers Card */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl border border-blue-700 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">Total Drivers</span>
            <div className="p-1 bg-white/20 rounded-lg text-white">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight font-mono">{totalDriversCount}</div>
            <p className="text-[9px] text-blue-100 font-medium mt-0.5 truncate">
              {activeDriversCount} Act • {inactiveDriversCount} Inact
            </p>
          </div>
          <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden">
            <div className="bg-white h-full rounded-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        {/* Active Drivers */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Drivers</span>
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{activeDriversCount}</div>
            <p className="text-[10px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" />
              <span>On Duty</span>
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalDriversCount ? Math.round((activeDriversCount / totalDriversCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Inactive Drivers */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inactive Drivers</span>
            <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
              <UserX className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{inactiveDriversCount}</div>
            <p className="text-[10px] text-purple-700 font-semibold flex items-center gap-1 mt-0.5">
              <AlertCircle className="w-3 h-3" />
              <span>Deactivated</span>
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-purple-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalDriversCount ? Math.round((inactiveDriversCount / totalDriversCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Drivers with Expiring Documents */}
        <div 
          onClick={onNavigateToAlerts}
          className="bg-rose-50/60 hover:bg-rose-50 rounded-2xl border border-rose-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Expiring Drivers</span>
            <div className="p-1 bg-rose-600 text-white rounded-lg shadow-2xs animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-900 tracking-tight font-mono">{driverAlertsCount}</div>
            <p className="text-[9px] text-rose-700 font-semibold flex items-center gap-1 mt-0.5 truncate">
              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
              <span>{activeDriverAlertsCount} Act • {inactiveDriverAlertsCount} Inact</span>
            </p>
          </div>
          <div className="w-full bg-rose-200/60 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-rose-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalDriversCount ? Math.round((driverAlertsCount / totalDriversCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Total Cabs Card */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl border border-emerald-700 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-wider">Total Cabs</span>
            <div className="p-1 bg-white/20 rounded-lg text-white">
              <Car className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight font-mono">{totalCabsCount}</div>
            <p className="text-[9px] text-emerald-100 font-medium mt-0.5 truncate">
              {activeCabsCount} Act • {inactiveCabsCount} Inact
            </p>
          </div>
          <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden">
            <div className="bg-white h-full rounded-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        {/* Active Cabs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Cabs</span>
            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
              <Car className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{activeCabsCount}</div>
            <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" />
              <span>In-Service</span>
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalCabsCount ? Math.round((activeCabsCount / totalCabsCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Inactive Cabs */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inactive Cabs</span>
            <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">{inactiveCabsCount}</div>
            <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
              <XCircle className="w-3 h-3" />
              <span>Deactivated</span>
            </p>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalCabsCount ? Math.round((inactiveCabsCount / totalCabsCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Cabs with Expiring Documents */}
        <div 
          onClick={onNavigateToAlerts}
          className="bg-rose-50/60 hover:bg-rose-50 rounded-2xl border border-rose-200 shadow-xs p-3.5 flex flex-col justify-between space-y-1.5 relative overflow-hidden cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Expiring Cabs</span>
            <div className="p-1 bg-rose-600 text-white rounded-lg shadow-2xs animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-900 tracking-tight font-mono">{cabAlertsCount}</div>
            <p className="text-[9px] text-rose-700 font-semibold flex items-center gap-1 mt-0.5 truncate">
              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
              <span>{activeCabAlertsCount} Act • {inactiveCabAlertsCount} Inact</span>
            </p>
          </div>
          <div className="w-full bg-rose-200/60 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-rose-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${totalCabsCount ? Math.round((cabAlertsCount / totalCabsCount) * 100) : 0}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Global Filter Bar (Search Cabs & Drivers + Client Dropdown Filter) */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Cab Reg #, Driver Name or DL..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-slate-800 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end flex-wrap">
          {/* Client Filter Dropdown for Admin, locked badge for User */}
          {isAdmin ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-500 font-medium text-[11px] hidden md:inline">Client:</span>
              <select
                value={selectedClient}
                onChange={(e) => handleClientChange(e.target.value)}
                className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
              >
                <option value="all">🌐 All Clients (Combined Data)</option>
                {clients.map((c) => (
                  <option key={c.id || c.clientId} value={c.clientId}>
                    🏢 {c.clientName} ({c.clientId})
                  </option>
                ))}
                {/* Fallback for client names not in collection */}
                {Array.from(new Set([...drivers.map(d => d.clientName), ...cabs.map(c => c.clientName)]))
                  .filter(cName => Boolean(cName) && !clients.some(cl => cl.clientName.toLowerCase() === (cName || '').toLowerCase()))
                  .map((cName, i) => (
                    <option key={`fallback-${i}`} value={cName}>
                      🏢 {cName}
                    </option>
                  ))
                }
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-900">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Bound Organization: {activeClientDisplayName}</span>
            </div>
          )}

          {/* Quick Section View Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setActiveTabSection('all')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${activeTabSection === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
            >
              All Sections
            </button>
            <button
              onClick={() => setActiveTabSection('cabs')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${activeTabSection === 'cabs' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Cabs ({filteredCabs.length})
            </button>
            <button
              onClick={() => setActiveTabSection('drivers')}
              className={`px-3 py-1 rounded-lg cursor-pointer ${activeTabSection === 'drivers' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Drivers ({filteredDrivers.length})
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span>Syncing real-time fleet data from Firestore...</span>
        </div>
      )}

      {/* SECTION 1: CABS SECTION (Split into Active and Inactive lists as Vertical Cards) */}
      {(activeTabSection === 'all' || activeTabSection === 'cabs') && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <Truck className="w-5 h-5 text-emerald-600" />
              <span>Cabs Overview</span>
            </h3>
            <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200">
              {filteredCabs.length} Vehicles Displayed
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Cabs Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200/80 p-3.5 rounded-xl">
                <span className="font-bold text-emerald-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Active Cabs ({activeCabs.length})</span>
                </span>
                <span className="text-[10px] bg-emerald-200/60 text-emerald-900 font-bold px-2 py-0.5 rounded-full">In Service</span>
              </div>

              {activeCabs.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <Truck className="w-6 h-6 text-slate-300 mx-auto" />
                  <p>No active cabs match the current filter.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCabs.map((cab) => {
                    const expiryAudit = analyzeCabExpiry(cab);
                    return (
                      <div
                        key={cab.id}
                        onClick={() => setSelectedRecord({ record: cab, type: 'cab' })}
                        className={`bg-white rounded-2xl border shadow-2xs p-5 hover:shadow-md hover:border-blue-400 transition-all space-y-3 cursor-pointer group ${
                          expiryAudit.hasAlert 
                            ? 'border-rose-300 ring-2 ring-rose-500/20' 
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-base font-mono">{cab.registrationNumber || 'N/A'}</h4>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {cab.etsVehicleId}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">{cab.vehicleType || 'Standard Fleet Vehicle'}</p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{cab.overallComplianceStatus || 'Compliant'}</span>
                            </span>

                            {/* Blinking Red Alert Badge */}
                            {expiryAudit.hasAlert && (
                              <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs animate-pulse">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                </span>
                                <span>{expiryAudit.worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Triggered Expiry Alerts Messages */}
                        {expiryAudit.hasAlert && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                            {expiryAudit.alerts.map((al, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] font-semibold text-rose-900">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>{al.docName}:</span>
                                </span>
                                <span className="font-mono font-bold">{al.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <span className="text-slate-400">Assigned Driver:</span>
                            <span className="font-bold text-slate-800">{cab.driverName || 'Unassigned'}</span>
                          </div>
                          {cab.clientName && (
                            <span className="text-[11px] text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              {cab.clientName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inactive Cabs Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-amber-50/80 border border-amber-200/80 p-3.5 rounded-xl">
                <span className="font-bold text-amber-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-amber-600" />
                  <span>Inactive Cabs ({inactiveCabs.length})</span>
                </span>
                <span className="text-[10px] bg-amber-200/60 text-amber-900 font-bold px-2 py-0.5 rounded-full">Deactivated</span>
              </div>

              {inactiveCabs.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <Truck className="w-6 h-6 text-slate-300 mx-auto" />
                  <p>No inactive cabs found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inactiveCabs.map((cab) => {
                    const expiryAudit = analyzeCabExpiry(cab);
                    return (
                      <div
                        key={cab.id}
                        onClick={() => setSelectedRecord({ record: cab, type: 'cab' })}
                        className={`bg-white rounded-2xl border shadow-2xs p-5 hover:shadow-md transition-all space-y-3 cursor-pointer group ${
                          expiryAudit.hasAlert 
                            ? 'border-rose-300 ring-2 ring-rose-500/20 hover:border-rose-400' 
                            : 'border-amber-200/80 hover:border-amber-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors text-base font-mono">{cab.registrationNumber || 'N/A'}</h4>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                {cab.etsVehicleId}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">{cab.vehicleType || 'Standard Fleet Vehicle'}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                              <span>{cab.overallComplianceStatus || 'Inactive'}</span>
                            </span>

                            {/* Alert Badge if Expiry Exists */}
                            {expiryAudit.hasAlert && (
                              <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs animate-pulse">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                </span>
                                <span>{expiryAudit.worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Triggered Expiry Alerts Messages */}
                        {expiryAudit.hasAlert && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                            {expiryAudit.alerts.map((al, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] font-semibold text-rose-900">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>{al.docName}:</span>
                                </span>
                                <span className="font-mono font-bold">{al.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-slate-700">
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="text-slate-400">Assigned Driver:</span>
                              <span className="font-bold text-slate-800">{cab.driverName || 'Unassigned'}</span>
                            </div>
                            {cab.deactivationDate && (
                              <div className="flex items-center gap-1 text-[11px] text-amber-800 font-mono font-semibold">
                                <Calendar className="w-3 h-3 text-amber-600" />
                                <span>Deactivated: {cab.deactivationDate}</span>
                              </div>
                            )}
                          </div>

                          {/* Inactivity Reason / Comments */}
                          <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                              Inactivity Reason
                            </span>
                            <p className="text-xs text-amber-950 font-medium leading-relaxed">
                              {cab.comments || 'No specific inactivity comment provided.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: DRIVERS SECTION (Split into Active and Inactive lists as Vertical Cards) */}
      {(activeTabSection === 'all' || activeTabSection === 'drivers') && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Drivers Overview</span>
            </h3>
            <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-600 px-3 py-1 rounded-full border border-slate-200">
              {filteredDrivers.length} Drivers Displayed
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Drivers Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200/80 p-3.5 rounded-xl">
                <span className="font-bold text-blue-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>Active Drivers ({activeDrivers.length})</span>
                </span>
                <span className="text-[10px] bg-blue-200/60 text-blue-900 font-bold px-2 py-0.5 rounded-full">On Duty</span>
              </div>

              {activeDrivers.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <Users className="w-6 h-6 text-slate-300 mx-auto" />
                  <p>No active drivers match the current filter.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDrivers.map((driver) => {
                    const expiryAudit = analyzeDriverExpiry(driver);
                    const cabNo = getDriverCabNumber(driver, cabs);
                    return (
                      <div
                        key={driver.id}
                        onClick={() => setSelectedRecord({ record: driver, type: 'driver' })}
                        className={`bg-white rounded-2xl border shadow-2xs p-5 hover:shadow-md hover:border-blue-400 transition-all space-y-3 cursor-pointer group ${
                          expiryAudit.hasAlert 
                            ? 'border-rose-300 ring-2 ring-rose-500/20' 
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-base">{driver.name || 'N/A'}</h4>
                            <p className="text-xs font-mono text-slate-500 mt-0.5">
                              DL: <span className="font-semibold text-slate-800">{driver.driverLicenseNumber || 'N/A'}</span>
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{driver.overallComplianceStatus || 'Compliant'}</span>
                            </span>

                            {/* Blinking Red Alert Badge */}
                            {expiryAudit.hasAlert && (
                              <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs animate-pulse">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                </span>
                                <span>{expiryAudit.worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Triggered Expiry Alerts Messages */}
                        {expiryAudit.hasAlert && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                            {expiryAudit.alerts.map((al, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] font-semibold text-rose-900">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>{al.docName}:</span>
                                </span>
                                <span className="font-mono font-bold">{al.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <span className="text-slate-400">Cab No.:</span>
                            <span className="font-bold text-blue-800 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{cabNo}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <span className="text-slate-400">City:</span>
                            <span className="font-bold text-slate-800">{driver.city || 'Bangalore'}</span>
                          </div>
                          {driver.clientName && (
                            <span className="text-[11px] text-slate-500 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                              {driver.clientName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inactive Drivers Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-rose-50/80 border border-rose-200/80 p-3.5 rounded-xl">
                <span className="font-bold text-rose-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <UserX className="w-4 h-4 text-rose-600" />
                  <span>Inactive Drivers ({inactiveDrivers.length})</span>
                </span>
                <span className="text-[10px] bg-rose-200/60 text-rose-900 font-bold px-2 py-0.5 rounded-full">Deactivated</span>
              </div>

              {inactiveDrivers.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
                  <Users className="w-6 h-6 text-slate-300 mx-auto" />
                  <p>No inactive drivers found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inactiveDrivers.map((driver) => {
                    const cabNo = getDriverCabNumber(driver, cabs);
                    const expiryAudit = analyzeDriverExpiry(driver);
                    return (
                      <div
                        key={driver.id}
                        onClick={() => setSelectedRecord({ record: driver, type: 'driver' })}
                        className={`bg-white rounded-2xl border shadow-2xs p-5 hover:shadow-md transition-all space-y-3 cursor-pointer group ${
                          expiryAudit.hasAlert 
                            ? 'border-rose-300 ring-2 ring-rose-500/20 hover:border-rose-400' 
                            : 'border-rose-200/80 hover:border-rose-400'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="font-bold text-slate-900 group-hover:text-rose-700 transition-colors text-base">{driver.name || 'N/A'}</h4>
                            <p className="text-xs font-mono text-slate-500 mt-0.5">
                              DL: <span className="font-semibold text-slate-800">{driver.driverLicenseNumber || 'N/A'}</span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                              <span>{driver.overallComplianceStatus || 'Inactive'}</span>
                            </span>

                            {/* Alert Badge if Expiry Exists */}
                            {expiryAudit.hasAlert && (
                              <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs animate-pulse">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-200 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                </span>
                                <span>{expiryAudit.worstStatus === 'expired' ? 'EXPIRED DOCS' : 'EXPIRING SOON'}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Triggered Expiry Alerts Messages */}
                        {expiryAudit.hasAlert && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                            {expiryAudit.alerts.map((al, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] font-semibold text-rose-900">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>{al.docName}:</span>
                                </span>
                                <span className="font-mono font-bold">{al.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                          <div className="flex items-center justify-between text-slate-700 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Cab No.:</span>
                              <span className="font-bold text-blue-800 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{cabNo}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">City:</span>
                              <span className="font-bold text-slate-800">{driver.city || 'Bangalore'}</span>
                            </div>
                            {driver.deactivationDate && (
                              <div className="flex items-center gap-1 text-[11px] text-rose-800 font-mono font-semibold">
                                <Calendar className="w-3 h-3 text-rose-600" />
                                <span>Deactivated: {driver.deactivationDate}</span>
                              </div>
                            )}
                          </div>

                          {/* Inactivity Reason / Comments */}
                          <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-xl space-y-1">
                            <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wider block">
                              Inactivity Reason
                            </span>
                            <p className="text-xs text-rose-950 font-medium leading-relaxed">
                              {driver.comments || 'No specific inactivity comment provided.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Report Download Modal */}
      <ReportDownloadModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        defaultClientFilter={selectedClient}
      />
    </div>
  );
};
