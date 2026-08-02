import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Client } from '../types';
import { 
  ShieldCheck, 
  User, 
  Building2, 
  Truck, 
  Users as UsersIcon, 
  AlertTriangle, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  X,
  Lock,
  Info
} from 'lucide-react';

interface MyAccessPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyAccessPanel: React.FC<MyAccessPanelProps> = ({ isOpen, onClose }) => {
  const { userProfile, isAdmin } = useAuth();
  const [clientsList, setClientsList] = useState<Client[]>([]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        const items: Client[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() } as Client));
        setClientsList(items);
      } catch (err) {
        console.error('Error fetching clients for My Access panel:', err);
      }
    };
    if (isOpen) {
      fetchClients();
    }
  }, [isOpen]);

  if (!isOpen || !userProfile) return null;

  const isAllClients = userProfile.assignedClientIds?.includes('all');
  const assignedClientNames = isAllClients
    ? ['All Clients (Global Access)']
    : userProfile.assignedClientIds?.map(cid => clientsList.find(c => c.clientId === cid)?.clientName || cid);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 my-8 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className={`p-3 rounded-2xl ${isAdmin ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
            {isAdmin ? <ShieldCheck className="w-6 h-6" /> : <User className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">My Access & Granted Permissions</h3>
            <p className="text-xs text-slate-500">Your profile details and active security entitlements</p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Account Identity</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              isAdmin ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-200'
            }`}>
              {isAdmin ? 'System Administrator' : 'Standard Operations User'}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-900">{userProfile.name}</p>
          <p className="text-xs font-mono text-slate-600">{userProfile.email}</p>
        </div>

        {/* Client Access Scopes */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Assigned Client Organizations</span>
          </h4>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {assignedClientNames && assignedClientNames.length > 0 ? (
              assignedClientNames.map((cName, i) => (
                <span key={i} className="bg-white text-slate-800 border border-slate-200 shadow-2xs px-2.5 py-1 rounded-xl text-xs font-semibold">
                  🏢 {cName}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">No specific client organizations assigned.</span>
            )}
          </div>
        </div>

        {/* Section View Grants */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-600" />
            <span>Section View Entitlements</span>
          </h4>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* View Cabs */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              userProfile.permissions?.viewCabs ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                <span>View Cabs</span>
              </div>
              {userProfile.permissions?.viewCabs ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-300" />}
            </div>

            {/* View Drivers */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              userProfile.permissions?.viewDrivers ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4" />
                <span>View Drivers</span>
              </div>
              {userProfile.permissions?.viewDrivers ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-300" />}
            </div>

            {/* View Expiry Alerts */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              userProfile.permissions?.viewExpiryAlerts ? 'bg-purple-50 border-purple-200 text-purple-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Expiry Alerts</span>
              </div>
              {userProfile.permissions?.viewExpiryAlerts ? <CheckCircle2 className="w-4 h-4 text-purple-600" /> : <XCircle className="w-4 h-4 text-slate-300" />}
            </div>

            {/* Upload Data Sheets */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              userProfile.permissions?.uploadDataSheets ? 'bg-blue-50 border-blue-200 text-blue-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Upload Sheets</span>
              </div>
              {userProfile.permissions?.uploadDataSheets ? <CheckCircle2 className="w-4 h-4 text-blue-600" /> : <XCircle className="w-4 h-4 text-slate-300" />}
            </div>
          </div>
        </div>

        {/* Informational Guidance Note */}
        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {isAdmin 
              ? 'As an Administrator, you have full access to manage fleet data, bulk Excel uploads, and user permission configurations.'
              : 'Your assigned clients filter all driver & cab records shown to you across the dashboard, driver lists, and cab lists. Unpermitted tabs are hidden from navigation.'}
          </p>
        </div>
      </div>
    </div>
  );
};
