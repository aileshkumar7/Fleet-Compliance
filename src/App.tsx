import { useState, useEffect, useMemo } from 'react';
import { 
  Database, 
  ShieldCheck, 
  FileSpreadsheet, 
  Users, 
  Truck, 
  Building2, 
  History, 
  LayoutDashboard, 
  AlertTriangle,
  UserCog,
  LogOut,
  Shield,
  KeyRound,
  Info,
  Activity
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { ManageUsers } from './components/ManageUsers';
import { MyAccessPanel } from './components/MyAccessPanel';
import { DataUploader } from './components/DataUploader';
import { TripDataUploader } from './components/TripDataUploader';
import { TripAnalyticsView } from './components/TripAnalyticsView';
import { UploadLogsList } from './components/UploadLogsList';
import { ReportLogsView } from './components/ReportLogsView';
import { UserActivityLogsView } from './components/UserActivityLogsView';
import { DriversList } from './components/DriversList';
import { CabsList } from './components/CabsList';
import { ClientsList } from './components/ClientsList';
import { Dashboard } from './components/Dashboard';
import { ExpiringAlertsView } from './components/ExpiringAlertsView';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Cab, Driver, Client } from './types';
import { analyzeCabExpiry, analyzeDriverExpiry } from './utils/expiryEngine';
import { resolveUserClientScope, isRecordAccessible } from './utils/clientUtils';

export default function App() {
  const { user, userProfile, isAdmin, logout, canAccess, isLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'alerts' | 'uploader' | 'tripUploader' | 'tripAnalytics' | 'drivers' | 'cabs' | 'clients' | 'logs' | 'reportLogs' | 'users' | 'userLogs'>('dashboard');
  const [alertCount, setAlertCount] = useState<number>(0);
  const [isMyAccessOpen, setIsMyAccessOpen] = useState<boolean>(false);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);

  // Expiry alerts real-time counter
  useEffect(() => {
    if (!user) return;

    let cabsList: Cab[] = [];
    let driversList: Driver[] = [];
    let clientsList: Client[] = [];

    const updateCounts = () => {
      const scope = resolveUserClientScope(userProfile, clientsList);

      const filteredCabs = cabsList.filter(c => isRecordAccessible(c, scope));
      const filteredDrivers = driversList.filter(d => isRecordAccessible(d, scope));

      const cAlerts = filteredCabs.map(analyzeCabExpiry).filter(a => a.hasAlert).length;
      const dAlerts = filteredDrivers.map(analyzeDriverExpiry).filter(a => a.hasAlert).length;
      setAlertCount(cAlerts + dAlerts);
    };

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      clientsList = [];
      snap.forEach(doc => clientsList.push({ id: doc.id, ...doc.data() } as Client));
      setAvailableClients(clientsList);
      updateCounts();
    });

    const unsubCabs = onSnapshot(collection(db, 'cabs'), (snap) => {
      cabsList = [];
      snap.forEach(doc => {
        const data = doc.data();
        cabsList.push({ 
          id: doc.id, 
          ...data,
          registrationNumber: data.registrationNumber || data.regNumber || data.vehicleNumber || 'N/A',
          clientName: data.clientName || data.client || 'N/A',
        } as Cab);
      });
      updateCounts();
    });

    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      driversList = [];
      snap.forEach(doc => {
        const data = doc.data();
        driversList.push({ 
          id: doc.id, 
          ...data,
          name: data.name || data.driverName || 'N/A',
          clientName: data.clientName || data.client || 'N/A',
        } as Driver);
      });
      updateCounts();
    });

    return () => {
      unsubClients();
      unsubCabs();
      unsubDrivers();
    };
  }, [user, userProfile, isAdmin]);

  const activeClientDisplay = useMemo(() => {
    if (isAdmin || userProfile?.assignedClientIds?.includes('all')) {
      return 'All Clients (Global Access)';
    }
    const cid = userProfile?.clientId || userProfile?.assignedClientIds?.[0] || '';
    const matched = availableClients.find(c => 
      c.clientId.toLowerCase() === cid.toLowerCase() || 
      c.clientName.toLowerCase() === cid.toLowerCase()
    );
    if (matched) return matched.clientName;
    if (cid.toLowerCase().includes('air')) return 'Air India Sats';
    return cid || 'Air India Sats';
  }, [isAdmin, userProfile, availableClients]);

  // Loading state guard
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-300 text-sm font-medium">Authenticating & loading fleet profile...</p>
        </div>
      </div>
    );
  }

  // Auth Guard: Show login if unauthenticated
  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex">
      {/* Sidebar navigation */}
      <aside className="hidden lg:flex w-64 bg-[#1e293b] text-white flex-col justify-between shrink-0 border-r border-slate-800">
        <div>
          {/* Header Brand */}
          <div className="p-6 border-b border-slate-700/60 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg shadow-md text-white">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-slate-100 block">Fleet Compliance</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {isAdmin ? 'ADMIN CONSOLE' : 'OPERATIONS PORTAL'}
                </span>
              </div>
            </div>

            {/* Sidebar Active User Chip */}
            <div className="bg-slate-800/90 rounded-xl p-3 border border-slate-700/80 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current User</span>
                <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full ${
                  isAdmin ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                }`}>
                  {isAdmin ? 'Admin' : 'Operations'}
                </span>
              </div>
              <p className="text-sm font-bold text-white truncate">{userProfile?.name || 'User'}</p>
              <div className="flex items-center gap-1 text-[11px] text-slate-300 truncate">
                <Building2 className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="truncate">{activeClientDisplay}</span>
              </div>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1.5 text-sm font-medium">
            {/* Dashboard Overview */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard Overview</span>
            </button>

            {/* Expiry Alerts */}
            {canAccess('viewExpiryAlerts') && (
              <button
                onClick={() => setActiveTab('alerts')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
                  activeTab === 'alerts' ? 'bg-rose-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`w-4 h-4 ${alertCount > 0 ? 'text-rose-400 animate-pulse' : ''}`} />
                  <span>Expiry Alerts</span>
                </div>
                {alertCount > 0 && (
                  <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse shadow-2xs">
                    {alertCount}
                  </span>
                )}
              </button>
            )}

            {/* Drivers List */}
            {canAccess('viewDrivers') && (
              <button
                onClick={() => setActiveTab('drivers')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'drivers' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Drivers</span>
              </button>
            )}

            {/* Cabs List */}
            {canAccess('viewCabs') && (
              <button
                onClick={() => setActiveTab('cabs')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'cabs' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Cabs</span>
              </button>
            )}

            {/* Clients Directory */}
            <button
              onClick={() => setActiveTab('clients')}
              className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'clients' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Clients</span>
            </button>

            {/* Data Sheet Uploader */}
            {canAccess('uploadDataSheets') && (
              <button
                onClick={() => setActiveTab('uploader')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'uploader' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Upload Data Sheet</span>
              </button>
            )}

            {/* Trip Data Uploader */}
            {canAccess('uploadDataSheets') && (
              <button
                onClick={() => setActiveTab('tripUploader')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'tripUploader' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Truck className="w-4 h-4 text-blue-400" />
                <span>Upload Trip Data</span>
              </button>
            )}

            {/* Trip Analytics */}
            <button
              onClick={() => setActiveTab('tripAnalytics')}
              className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'tripAnalytics' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Trip Analytics</span>
            </button>

            {/* Upload Logs */}
            {canAccess('uploadDataSheets') && (
              <button
                onClick={() => setActiveTab('logs')}
                className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                  activeTab === 'logs' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <History className="w-4 h-4" />
                <span>Upload Logs</span>
              </button>
            )}

            {/* Report Export Logs */}
            <button
              onClick={() => setActiveTab('reportLogs')}
              className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'reportLogs' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Report Export Logs</span>
            </button>

            {/* Admin User Management */}
            {isAdmin && (
              <div className="pt-3 border-t border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-4 block mb-1.5">
                  Administration
                </span>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                    activeTab === 'users' ? 'bg-amber-600 text-white shadow-xs font-semibold' : 'text-amber-400 hover:bg-amber-950/40 hover:text-amber-300'
                  }`}
                >
                  <UserCog className="w-4 h-4" />
                  <span>Manage Users</span>
                </button>
                <button
                  onClick={() => setActiveTab('userLogs')}
                  className={`w-full text-left rounded-xl px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                    activeTab === 'userLogs' ? 'bg-amber-600 text-white shadow-xs font-semibold' : 'text-amber-400 hover:bg-amber-950/40 hover:text-amber-300'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>User Login Audit Logs</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Sidebar Footer with My Access & Logout */}
        <div className="p-4 border-t border-slate-700/60 space-y-2">
          {/* My Access Panel Trigger */}
          <button
            onClick={() => setIsMyAccessOpen(true)}
            className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-400" />
              <span className="font-semibold">My Access & Permissions</span>
            </div>
            <Info className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* User Badge */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                isAdmin ? 'bg-amber-500/20 border border-amber-400/30 text-amber-300' : 'bg-blue-500/20 border border-blue-400/30 text-blue-300'
              }`}>
                {userProfile?.name ? userProfile.name.slice(0, 2).toUpperCase() : 'US'}
              </div>
              <div className="text-xs max-w-[110px] truncate">
                <p className="font-semibold text-slate-200 truncate">{userProfile?.name || 'User'}</p>
                <p className="text-slate-400 text-[10px] capitalize">{userProfile?.role || 'User'}</p>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="lg:hidden p-2 bg-blue-600 text-white rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg lg:text-xl font-bold text-slate-800 tracking-tight">Fleet Compliance Manager</h1>
              <p className="text-xs text-slate-500">
                {activeTab === 'uploader' && 'Upload Data Sheet & Snapshot Archive'}
                {activeTab === 'tripUploader' && 'Upload BA Trip Reports & Deduplicated Trips Sync'}
                {activeTab === 'tripAnalytics' && 'Daily Trip Volume Analytics & Trends'}
                {activeTab === 'dashboard' && 'Fleet Overview & Live Document Audit'}
                {activeTab === 'alerts' && 'Document Expiry Alerts & Audit Control'}
                {activeTab === 'drivers' && 'Driver Verification & Compliance Registry'}
                {activeTab === 'cabs' && 'Cab Verification & Vehicle Compliance Registry'}
                {activeTab === 'clients' && 'Client Organization Accounts'}
                {activeTab === 'logs' && 'Bulk Sheet Upload Audit Trail'}
                {activeTab === 'users' && 'User Access & Permission Management'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* User Profile Identity Capsule */}
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-full shadow-2xs">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-xs ${
                isAdmin ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
              }`}>
                {userProfile?.name ? userProfile.name.slice(0, 2).toUpperCase() : 'US'}
              </div>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 leading-none">
                    {userProfile?.name || 'User'}
                  </span>
                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full ${
                    isAdmin ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {isAdmin ? 'Global Admin' : 'Operations'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium leading-tight flex items-center gap-1 mt-0.5">
                  <Building2 className="w-2.5 h-2.5 text-blue-600" />
                  <span className="truncate max-w-[130px]">{activeClientDisplay}</span>
                </span>
              </div>
            </div>

            {/* My Access Button */}
            <button
              onClick={() => setIsMyAccessOpen(true)}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>My Access</span>
            </button>

            {/* Alert Shortcut */}
            {canAccess('viewExpiryAlerts') && activeTab !== 'alerts' && alertCount > 0 && (
              <button
                onClick={() => setActiveTab('alerts')}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs px-3 py-1.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>{alertCount} Alerts</span>
              </button>
            )}

            {/* Upload Shortcut */}
            {canAccess('uploadDataSheets') && activeTab !== 'uploader' && (
              <button
                onClick={() => setActiveTab('uploader')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-full font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-xs"
              >
                + New Sheet Upload
              </button>
            )}

            {/* Sign Out Shortcut */}
            <button
              onClick={logout}
              className="bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-xs px-3 py-1.5 rounded-full font-bold transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Dynamic View Container */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <Dashboard 
              onNavigateToUpload={() => setActiveTab('uploader')} 
              onNavigateToAlerts={() => setActiveTab('alerts')}
            />
          )}

          {activeTab === 'alerts' && canAccess('viewExpiryAlerts') && (
            <ExpiringAlertsView />
          )}

          {activeTab === 'drivers' && canAccess('viewDrivers') && (
            <DriversList />
          )}

          {activeTab === 'cabs' && canAccess('viewCabs') && (
            <CabsList />
          )}

          {activeTab === 'clients' && (
            <ClientsList />
          )}

          {activeTab === 'uploader' && canAccess('uploadDataSheets') && (
            <DataUploader
              onNavigateToLogs={() => setActiveTab('logs')}
              onUploadSuccess={() => setActiveTab('dashboard')}
            />
          )}

          {activeTab === 'tripUploader' && canAccess('uploadDataSheets') && (
            <TripDataUploader onNavigateToTripAnalytics={() => setActiveTab('tripAnalytics')} />
          )}

          {activeTab === 'tripAnalytics' && (
            <TripAnalyticsView onNavigateToTripUpload={() => setActiveTab('tripUploader')} />
          )}

          {activeTab === 'logs' && canAccess('uploadDataSheets') && (
            <UploadLogsList />
          )}

          {activeTab === 'reportLogs' && (
            <ReportLogsView />
          )}

          {activeTab === 'users' && isAdmin && (
            <ManageUsers />
          )}

          {activeTab === 'userLogs' && (
            <UserActivityLogsView />
          )}

          {/* Access Blocked Fallback for restricted direct views */}
          {((activeTab === 'alerts' && !canAccess('viewExpiryAlerts')) ||
            (activeTab === 'drivers' && !canAccess('viewDrivers')) ||
            (activeTab === 'cabs' && !canAccess('viewCabs')) ||
            (activeTab === 'uploader' && !canAccess('uploadDataSheets')) ||
            (activeTab === 'tripUploader' && !canAccess('uploadDataSheets')) ||
            (activeTab === 'logs' && !canAccess('uploadDataSheets')) ||
            (activeTab === 'users' && !isAdmin) ||
            (activeTab === 'userLogs' && !isAdmin)) && (
            <div className="max-w-lg mx-auto bg-white p-8 rounded-3xl border border-rose-200 shadow-md text-center my-12 space-y-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Access Restricted</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your account does not have permission to view this section. Contact your administrator if you require additional entitlements.
              </p>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </div>
      </main>

      {/* My Access Modal */}
      <MyAccessPanel
        isOpen={isMyAccessOpen}
        onClose={() => setIsMyAccessOpen(false)}
      />
    </div>
  );
}
