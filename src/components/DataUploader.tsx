/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  FileCheck, 
  Info, 
  Building2, 
  Plus, 
  LayoutDashboard,
  Truck,
  Users,
  Trash2,
  AlertCircle,
  X,
  ShieldAlert
} from 'lucide-react';
import { collection, getDocs, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Client } from '../types';
import { 
  processDataSheetUpload, 
  generateSampleCabsSheetTemplate, 
  generateSampleDriversSheetTemplate,
  UploadResult 
} from '../utils/excelParser';
import { runCabDeduplicationCleanup } from '../utils/cabDeduplicator';
import { deletePreviousFleetData, DeleteResult } from '../utils/fleetDeletionUtils';

interface DataUploaderProps {
  onUploadSuccess?: () => void;
  onNavigateToLogs?: () => void;
}

export const DataUploader: React.FC<DataUploaderProps> = ({ onUploadSuccess, onNavigateToLogs }) => {
  const { userProfile, isAdmin } = useAuth();
  const userBoundClientId = userProfile?.clientId || userProfile?.assignedClientIds?.[0] || '';

  const [activeUploadMode, setActiveUploadMode] = useState<'drivers' | 'cabs'>('drivers');
  
  // Independent File States
  const [driversFile, setDriversFile] = useState<File | null>(null);
  const [cabsFile, setCabsFile] = useState<File | null>(null);

  const [uploaderName, setUploaderName] = useState<string>(userProfile?.name || userProfile?.email || 'Fleet Operations User');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [isDraggingDrivers, setIsDraggingDrivers] = useState<boolean>(false);
  const [isDraggingCabs, setIsDraggingCabs] = useState<boolean>(false);

  // Client Selection State
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(isAdmin ? 'auto' : (userBoundClientId || 'auto'));
  const [showNewClientInput, setShowNewClientInput] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientId, setNewClientId] = useState<string>('');

  // Live Database Records Count
  const [driversDataState, setDriversDataState] = useState<{ id: string; clientId?: string; clientName?: string }[]>([]);
  const [cabsDataState, setCabsDataState] = useState<{ id: string; clientId?: string; clientName?: string }[]>([]);

  // Direct Deletion Modal States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<'drivers' | 'cabs'>('drivers');
  const [deleteScope, setDeleteScope] = useState<'all' | 'client'>('all');
  const [isDeletingData, setIsDeletingData] = useState<boolean>(false);
  const [deleteProgressMessage, setDeleteProgressMessage] = useState<string>('');
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  // Clean Replace Mode on Upload States
  const [replaceDriversBeforeUpload, setReplaceDriversBeforeUpload] = useState<boolean>(false);
  const [replaceCabsBeforeUpload, setReplaceCabsBeforeUpload] = useState<boolean>(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState<boolean>(false);
  const [pendingUploadTarget, setPendingUploadTarget] = useState<'drivers' | 'cabs' | null>(null);

  useEffect(() => {
    if (userProfile) {
      setUploaderName(userProfile.name || userProfile.email);
    }
  }, [userProfile]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        const items: Client[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() } as Client));
        setClients(items);
        if (!isAdmin && userBoundClientId) {
          setSelectedClientId(userBoundClientId);
        }
      } catch (e) {
        console.error('Error fetching clients for uploader:', e);
      }
    };
    fetchClients();
  }, [isAdmin, userBoundClientId]);

  // Real-time listener for current database count of Drivers and Cabs
  useEffect(() => {
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      const list: { id: string; clientId?: string; clientName?: string }[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({ id: d.id, clientId: data.clientId, clientName: data.clientName });
      });
      setDriversDataState(list);
    }, (err) => console.error('Error listening to drivers count:', err));

    const unsubCabs = onSnapshot(collection(db, 'cabs'), (snap) => {
      const list: { id: string; clientId?: string; clientName?: string }[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({ id: d.id, clientId: data.clientId, clientName: data.clientName });
      });
      setCabsDataState(list);
    }, (err) => console.error('Error listening to cabs count:', err));

    return () => {
      unsubDrivers();
      unsubCabs();
    };
  }, []);

  // Compute matching counts for the currently selected client
  const matchedClient = clients.find(c => c.clientId?.toLowerCase() === selectedClientId?.toLowerCase());
  const selectedClientName = matchedClient?.clientName || selectedClientId;

  const countForTarget = (target: 'drivers' | 'cabs', scope: 'all' | 'client') => {
    const list = target === 'drivers' ? driversDataState : cabsDataState;
    if (scope === 'all' || selectedClientId === 'auto') {
      return list.length;
    }
    const tId = selectedClientId.trim().toLowerCase();
    const tName = (selectedClientName || '').trim().toLowerCase();
    return list.filter(item => {
      const cId = (item.clientId || '').trim().toLowerCase();
      const cName = (item.clientName || '').trim().toLowerCase();
      return (
        (cId && cId === tId) ||
        (cName && tName && cName === tName) ||
        (tId.includes('air') && (cId.includes('air') || cName.includes('air')))
      );
    }).length;
  };

  const currentDriversTotal = driversDataState.length;
  const currentDriversClientMatch = countForTarget('drivers', 'client');
  const currentCabsTotal = cabsDataState.length;
  const currentCabsClientMatch = countForTarget('cabs', 'client');

  const handleCreateInlineClient = async () => {
    if (!newClientName.trim() || !newClientId.trim()) {
      setErrorMsg('Client Name and Client ID are required.');
      return;
    }
    const sanitizedId = newClientId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const clientObj = { clientName: newClientName.trim(), clientId: sanitizedId };

    try {
      const docRef = await addDoc(collection(db, 'clients'), clientObj);
      const newClientItem: Client = { id: docRef.id, ...clientObj };
      setClients(prev => [...prev, newClientItem]);
      setSelectedClientId(sanitizedId);
      setShowNewClientInput(false);
      setNewClientName('');
      setNewClientId('');
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg('Failed to create client: ' + e.message);
    }
  };

  const validateAndSetFile = (file: File, mode: 'drivers' | 'cabs') => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMsg('Please select a valid Excel (.xlsx or .xls) file.');
      return;
    }
    setErrorMsg(null);
    setUploadResult(null);
    if (mode === 'drivers') {
      setDriversFile(file);
    } else {
      setCabsFile(file);
    }
  };

  // Open Direct Deletion Modal
  const handleOpenDeleteModal = (target: 'drivers' | 'cabs') => {
    setErrorMsg(null);
    setActionSuccessNotice(null);
    setDeleteTarget(target);

    // If client is selected and has matching records, default scope to client, otherwise all
    const clientMatches = countForTarget(target, 'client');
    if (selectedClientId !== 'auto' && clientMatches > 0) {
      setDeleteScope('client');
    } else {
      setDeleteScope('all');
    }
    setIsDeleteModalOpen(true);
  };

  // Execute Direct Batch Deletion
  const handleConfirmExecuteDelete = async () => {
    setIsDeletingData(true);
    setDeleteProgressMessage(`Preparing to delete previous ${deleteTarget}...`);

    try {
      const result: DeleteResult = await deletePreviousFleetData({
        target: deleteTarget,
        scope: deleteScope,
        clientId: selectedClientId !== 'auto' ? selectedClientId : undefined,
        clientName: selectedClientId !== 'auto' ? selectedClientName : undefined,
        deletedBy: uploaderName.trim() || 'Admin User',
        onProgress: (deleted, total) => {
          setDeleteProgressMessage(`Deleting previous ${deleteTarget}: ${deleted} / ${total} records removed...`);
        }
      });

      setIsDeleteModalOpen(false);
      const scopeDesc = deleteScope === 'all' 
        ? 'all organizations' 
        : (selectedClientName || selectedClientId);

      setActionSuccessNotice(
        `✓ Successfully deleted ${result.deletedCount} previous ${deleteTarget} record${result.deletedCount === 1 ? '' : 's'} (${scopeDesc}) from Firestore. The database is clean and ready for your new upload!`
      );
    } catch (err: any) {
      console.error(`Error deleting previous ${deleteTarget}:`, err);
      setErrorMsg(`Failed to delete previous ${deleteTarget}: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDeletingData(false);
      setDeleteProgressMessage('');
    }
  };

  // Check upload click: prompt if Replace Mode is enabled, else process directly
  const handleInitiateUpload = (mode: 'drivers' | 'cabs') => {
    const isReplace = mode === 'drivers' ? replaceDriversBeforeUpload : replaceCabsBeforeUpload;
    const targetFile = mode === 'drivers' ? driversFile : cabsFile;

    if (!targetFile) {
      setErrorMsg(`Please select an Excel file to upload for ${mode}.`);
      return;
    }

    if (isReplace) {
      const countToDelete = countForTarget(mode, selectedClientId !== 'auto' ? 'client' : 'all');
      if (countToDelete > 0) {
        setPendingUploadTarget(mode);
        setIsReplaceConfirmOpen(true);
        return;
      }
    }

    // Normal upload without prior deletion (or if collection is already empty)
    handleProcessUpload(mode, 0);
  };

  // Execute Replace Upload (Purge previous data, then upload sheet)
  const handleConfirmReplaceUpload = async () => {
    if (!pendingUploadTarget) return;
    const mode = pendingUploadTarget;
    setIsReplaceConfirmOpen(false);

    setIsProcessing(true);
    setErrorMsg(null);
    setActionSuccessNotice(null);

    let deletedCount = 0;
    try {
      const scope = selectedClientId !== 'auto' ? 'client' : 'all';
      const delRes = await deletePreviousFleetData({
        target: mode,
        scope: scope,
        clientId: selectedClientId !== 'auto' ? selectedClientId : undefined,
        clientName: selectedClientId !== 'auto' ? selectedClientName : undefined,
        deletedBy: uploaderName.trim() || 'Admin User'
      });
      deletedCount = delRes.deletedCount;
    } catch (dErr: any) {
      console.error(`Failed to delete previous data during replace upload:`, dErr);
      setErrorMsg(`Could not delete previous ${mode} data: ${dErr.message}. Upload cancelled.`);
      setIsProcessing(false);
      return;
    }

    // Now process the new file
    await handleProcessUpload(mode, deletedCount);
  };

  const handleProcessUpload = async (mode: 'drivers' | 'cabs', previousDeletedCount: number = 0) => {
    const targetFile = mode === 'drivers' ? driversFile : cabsFile;
    if (!targetFile) {
      setErrorMsg(`Please select an Excel file to upload for ${mode}.`);
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    let overrideClientId: string | undefined = undefined;
    let overrideClientName: string | undefined = undefined;

    if (selectedClientId !== 'auto') {
      overrideClientId = selectedClientId;
      const matched = clients.find(c => c.clientId === selectedClientId);
      overrideClientName = matched?.clientName || selectedClientId;
    }

    try {
      const res = await processDataSheetUpload(
        targetFile, 
        uploaderName.trim() || 'Admin User',
        mode,
        overrideClientId,
        overrideClientName
      );

      // Attach deleted count to result
      res.previousRecordsDeleted = previousDeletedCount;
      setUploadResult(res);

      if (mode === 'cabs') {
        try {
          const dedupeRes = await runCabDeduplicationCleanup();
          if (dedupeRes.duplicateDocsDeleted > 0) {
            setDedupeNotice(`${dedupeRes.duplicateDocsDeleted} duplicate cab record${dedupeRes.duplicateDocsDeleted > 1 ? 's' : ''} merged automatically`);
          }
        } catch (dErr) {
          console.warn('Auto cab deduplication notice:', dErr);
        }
      }

      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      console.error(`${mode} upload processing error:`, err);
      setErrorMsg(err.message || `Failed to parse and upload ${mode} sheet. Please check the file structure.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetUpload = () => {
    setDriversFile(null);
    setCabsFile(null);
    setUploadResult(null);
    setErrorMsg(null);
    setActionSuccessNotice(null);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <span>Upload Fleet Data Sheets</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload Drivers Sheet and Cabs Sheet independently. Easily delete previous data to start fresh anytime.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateSampleDriversSheetTemplate}
            className="inline-flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-2 rounded-xl border border-blue-200 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Download Drivers Template</span>
          </button>
          <button
            onClick={generateSampleCabsSheetTemplate}
            className="inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download Cabs Template</span>
          </button>
        </div>
      </div>

      {/* Action Success Notification Banner */}
      {actionSuccessNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs text-emerald-950 font-bold shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccessNotice}</span>
          </div>
          <button
            onClick={() => setActionSuccessNotice(null)}
            className="p-1 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Mode Selector Tabs */}
      {!uploadResult && (
        <div className="flex bg-slate-200/80 p-1 rounded-2xl border border-slate-300 gap-1">
          <button
            onClick={() => { setActiveUploadMode('drivers'); setErrorMsg(null); }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeUploadMode === 'drivers'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>Upload Drivers Sheet</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-mono px-2 py-0.5 rounded-full font-bold">
              {currentDriversTotal} in DB
            </span>
            {driversFile && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
          </button>

          <button
            onClick={() => { setActiveUploadMode('cabs'); setErrorMsg(null); }}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeUploadMode === 'cabs'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>Upload Cabs Sheet</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded-full font-bold">
              {currentCabsTotal} in DB
            </span>
            {cabsFile && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
          </button>
        </div>
      )}

      {/* Main Upload Form or Summary */}
      {!uploadResult ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Settings Section: Client Organization & Uploader Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Target Client Organization</span>
                </span>
                <span className="text-[10px] text-blue-600 font-semibold uppercase">
                  {isAdmin ? '(Upload Scope Filter)' : '(Bound Client Scope)'}
                </span>
              </label>
              {isAdmin ? (
                <select
                  value={selectedClientId}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') {
                      setShowNewClientInput(true);
                    } else {
                      setSelectedClientId(e.target.value);
                      setShowNewClientInput(false);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-slate-800 font-medium cursor-pointer"
                >
                  <option value="auto">⚡ Auto-detect Client ID from Sheet Columns</option>
                  {clients.map((c) => (
                    <option key={c.id || c.clientId} value={c.clientId}>
                      🏢 {c.clientName} ({c.clientId})
                    </option>
                  ))}
                  <option value="ADD_NEW">+ Add New Client Organization...</option>
                </select>
              ) : (
                <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-900 font-bold flex items-center justify-between">
                  <span>🏢 {clients.find(c => c.clientId?.toLowerCase() === userBoundClientId?.toLowerCase() || c.clientName?.toLowerCase() === userBoundClientId?.toLowerCase())?.clientName || userBoundClientId || 'Bound Client'}</span>
                  <span className="text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-mono font-bold">Auto-Tagged Scope</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Uploaded By (User Name / Email)
              </label>
              <input
                type="text"
                value={uploaderName}
                onChange={(e) => setUploaderName(e.target.value)}
                placeholder="e.g. user@fleetcompany.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none text-slate-800 font-medium"
              />
            </div>
          </div>

          {/* Inline New Client Creator */}
          {showNewClientInput && (
            <div className="p-4 bg-violet-50/80 border border-violet-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-violet-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-violet-600" />
                  <span>Create & Select New Client Organization</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewClientInput(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Client Organization Name (e.g. Air India T3)"
                  className="bg-white border border-violet-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  type="text"
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  placeholder="Client ID (e.g. CL-AIRINDIA)"
                  className="bg-white border border-violet-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-500 font-mono"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateInlineClient}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer"
                >
                  Save & Assign Selected Client
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE MODE PANEL: DRIVERS SHEET UPLOAD */}
          {activeUploadMode === 'drivers' && (
            <div className="space-y-6">
              {/* Database Status & Direct Delete Previous Data Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Current Drivers Database:</span>
                      <span className="text-xs font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {currentDriversTotal} {currentDriversTotal === 1 ? 'Driver' : 'Drivers'} Total
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedClientId !== 'auto' 
                        ? `Contains ${currentDriversClientMatch} drivers matching ${selectedClientName} (${selectedClientId})`
                        : 'Active across all client organizations'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenDeleteModal('drivers')}
                  disabled={currentDriversTotal === 0}
                  className={`inline-flex items-center justify-center gap-2 text-xs font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
                    currentDriversTotal === 0
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200 hover:border-rose-300 shadow-2xs'
                  }`}
                  title="Wipe previous driver records to prepare for a fresh upload"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Previous Drivers Data</span>
                </button>
              </div>

              {/* Requirement Note */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-blue-900">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Drivers Sheet Requirements</span>
                </div>
                <p className="text-blue-800 leading-relaxed">
                  Upload an Excel file containing <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono font-bold">active Drivers</code> and/or <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono font-bold">inactive Drivers</code> tabs.
                </p>
                <p className="text-blue-800 text-[11px]">
                  <strong>Strict Collection Isolation:</strong> This upload will ONLY touch the <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">drivers</code> collection — it will never write to or modify vehicle/cab records.
                </p>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingDrivers(true); }}
                onDragLeave={() => setIsDraggingDrivers(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingDrivers(false);
                  if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0], 'drivers');
                }}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all cursor-pointer ${
                  isDraggingDrivers ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : driversFile ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0], 'drivers')}
                  id="drivers-sheet-input"
                  className="hidden"
                />

                <label htmlFor="drivers-sheet-input" className="cursor-pointer space-y-3 block">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-2xs">
                    {driversFile ? <FileCheck className="w-7 h-7 text-emerald-600" /> : <Users className="w-7 h-7 text-blue-600" />}
                  </div>

                  {driversFile ? (
                    <div>
                      <p className="text-sm font-bold text-emerald-900">{driversFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{(driversFile.size / 1024).toFixed(1)} KB • Ready for Drivers Sheet import</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Click to select or drag & drop Drivers Excel (.xlsx) file
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Requires 'active Drivers' and 'inactive Drivers' tabs</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Clean Replace Mode Checkbox */}
              <div className={`p-4 rounded-xl border transition-all ${
                replaceDriversBeforeUpload 
                  ? 'bg-amber-50/80 border-amber-300 shadow-2xs' 
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceDriversBeforeUpload}
                    onChange={(e) => setReplaceDriversBeforeUpload(e.target.checked)}
                    className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Delete previous drivers data before uploading (Replace Mode)</span>
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Automatically purges existing driver records before importing this spreadsheet so only new data remains in Firestore.
                    </p>
                    {replaceDriversBeforeUpload && (
                      <p className="text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-1 rounded-lg border border-amber-200 mt-1.5 inline-block">
                        ⚠️ Will delete {selectedClientId !== 'auto' ? `${currentDriversClientMatch} matching` : `${currentDriversTotal} total`} previous driver records before uploading.
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={generateSampleDriversSheetTemplate}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Drivers Template (.xlsx)</span>
                </button>

                <button
                  onClick={() => handleInitiateUpload('drivers')}
                  disabled={!driversFile || isProcessing}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md ${
                    !driversFile || isProcessing
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : replaceDriversBeforeUpload
                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer hover:shadow-lg'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing Drivers Sheet...</span>
                    </>
                  ) : replaceDriversBeforeUpload ? (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Replace & Upload Drivers Sheet</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload Drivers Sheet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ACTIVE MODE PANEL: CABS SHEET UPLOAD */}
          {activeUploadMode === 'cabs' && (
            <div className="space-y-6">
              {/* Database Status & Direct Delete Previous Data Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">Current Cabs Database:</span>
                      <span className="text-xs font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {currentCabsTotal} {currentCabsTotal === 1 ? 'Cab' : 'Cabs'} Total
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {selectedClientId !== 'auto' 
                        ? `Contains ${currentCabsClientMatch} cabs matching ${selectedClientName} (${selectedClientId})`
                        : 'Active across all client organizations'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenDeleteModal('cabs')}
                  disabled={currentCabsTotal === 0}
                  className={`inline-flex items-center justify-center gap-2 text-xs font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
                    currentCabsTotal === 0
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border-rose-200 hover:border-rose-300 shadow-2xs'
                  }`}
                  title="Wipe previous cab records to prepare for a fresh upload"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Previous Cabs Data</span>
                </button>
              </div>

              {/* Requirement Note */}
              <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-4 text-xs text-emerald-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Cabs Sheet Requirements</span>
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  Upload an Excel file containing <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 font-mono font-bold">active Cabs</code> and/or <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 font-mono font-bold">inactive cabs</code> tabs.
                </p>
                <p className="text-emerald-800 text-[11px]">
                  <strong>Strict Collection Isolation:</strong> This upload will ONLY touch the <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">cabs</code> collection — it will never write to or modify driver records.
                </p>
              </div>

              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingCabs(true); }}
                onDragLeave={() => setIsDraggingCabs(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingCabs(false);
                  if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0], 'cabs');
                }}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all cursor-pointer ${
                  isDraggingCabs ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]' : cabsFile ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0], 'cabs')}
                  id="cabs-sheet-input"
                  className="hidden"
                />

                <label htmlFor="cabs-sheet-input" className="cursor-pointer space-y-3 block">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                    {cabsFile ? <FileCheck className="w-7 h-7 text-emerald-600" /> : <Truck className="w-7 h-7 text-emerald-600" />}
                  </div>

                  {cabsFile ? (
                    <div>
                      <p className="text-sm font-bold text-emerald-900">{cabsFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{(cabsFile.size / 1024).toFixed(1)} KB • Ready for Cabs Sheet import</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Click to select or drag & drop Cabs Excel (.xlsx) file
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Requires 'active Cabs' and 'inactive cabs' tabs</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Clean Replace Mode Checkbox */}
              <div className={`p-4 rounded-xl border transition-all ${
                replaceCabsBeforeUpload 
                  ? 'bg-amber-50/80 border-amber-300 shadow-2xs' 
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceCabsBeforeUpload}
                    onChange={(e) => setReplaceCabsBeforeUpload(e.target.checked)}
                    className="mt-1 h-4 w-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Delete previous cabs data before uploading (Replace Mode)</span>
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Automatically purges existing cab records before importing this spreadsheet so only new data remains in Firestore.
                    </p>
                    {replaceCabsBeforeUpload && (
                      <p className="text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-1 rounded-lg border border-amber-200 mt-1.5 inline-block">
                        ⚠️ Will delete {selectedClientId !== 'auto' ? `${currentCabsClientMatch} matching` : `${currentCabsTotal} total`} previous cab records before uploading.
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={generateSampleCabsSheetTemplate}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Cabs Template (.xlsx)</span>
                </button>

                <button
                  onClick={() => handleInitiateUpload('cabs')}
                  disabled={!cabsFile || isProcessing}
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md ${
                    !cabsFile || isProcessing
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : replaceCabsBeforeUpload
                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer hover:shadow-lg'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow-lg'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Processing Cabs Sheet...</span>
                    </>
                  ) : replaceCabsBeforeUpload ? (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Replace & Upload Cabs Sheet</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload Cabs Sheet</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-800 font-medium">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      ) : (
        /* Post-Upload Summary Screen */
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {activeUploadMode === 'drivers' ? 'Drivers Sheet Upload Completed' : 'Cabs Sheet Upload Completed'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    File <span className="font-semibold text-slate-700">{(activeUploadMode === 'drivers' ? driversFile : cabsFile)?.name}</span> • Processed by {uploaderName}
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                Total Records Read: {uploadResult.totalRecordsProcessed}
              </span>
            </div>

            {/* Replace Mode Purge Notice */}
            {uploadResult.previousRecordsDeleted !== undefined && uploadResult.previousRecordsDeleted > 0 && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 font-semibold flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Clean Replace Applied:</strong> Deleted {uploadResult.previousRecordsDeleted} previous {activeUploadMode} records from Firestore before importing this new sheet.
                </span>
              </div>
            )}

            {/* Structured Breakdown Summary */}
            <div className={`grid gap-4 ${uploadResult.previousRecordsDeleted ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
              {uploadResult.previousRecordsDeleted !== undefined && uploadResult.previousRecordsDeleted > 0 && (
                <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl text-center space-y-1">
                  <p className="text-2xl font-black text-rose-800">{uploadResult.previousRecordsDeleted}</p>
                  <p className="text-xs font-semibold text-rose-900 uppercase tracking-wider">Deleted Previous</p>
                </div>
              )}

              <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-emerald-800">{uploadResult.driversAdded}</p>
                <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">Drivers Added</p>
              </div>

              <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-blue-800">{uploadResult.driversUpdated}</p>
                <p className="text-xs font-semibold text-blue-900 uppercase tracking-wider">Drivers Updated</p>
              </div>

              <div className="p-4 bg-teal-50/70 border border-teal-100 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-teal-800">{uploadResult.cabsAdded}</p>
                <p className="text-xs font-semibold text-teal-900 uppercase tracking-wider">Cabs Added</p>
              </div>

              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-center space-y-1">
                <p className="text-2xl font-black text-indigo-800">{uploadResult.cabsUpdated}</p>
                <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">Cabs Updated</p>
              </div>
            </div>

            {/* Formatted Text Sentence Summary */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 leading-relaxed text-center">
              <span className="font-bold text-slate-900">Summary: </span>
              {uploadResult.driversAdded + uploadResult.driversUpdated > 0 ? (
                <span>Read {uploadResult.totalRecordsProcessed} driver rows ({uploadResult.driversAdded} added, {uploadResult.driversUpdated} updated) into the drivers collection.</span>
              ) : (
                <span>Read {uploadResult.totalRecordsProcessed} cab rows ({uploadResult.cabsAdded} added, {uploadResult.cabsUpdated} updated) into the cabs collection.</span>
              )}
            </div>

            {/* Auto Deduplication Notification Banner */}
            {dedupeNotice && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{dedupeNotice}</span>
              </div>
            )}
          </div>

          {/* Failed Rows / Parse Warning Panel */}
          {uploadResult.failedRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-2xs p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Flagged Rows / Parsing Warnings ({uploadResult.failedRows.length})</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Sheet Name</th>
                      <th className="px-4 py-2.5">Row #</th>
                      <th className="px-4 py-2.5">Identifier</th>
                      <th className="px-4 py-2.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {uploadResult.failedRows.map((fail, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/30">
                        <td className="px-4 py-2.5 font-mono text-slate-800 font-medium">{fail.sheetName}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">{fail.rowIndex}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{fail.identifier}</td>
                        <td className="px-4 py-2.5 text-amber-800 font-medium">{fail.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Navigation Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              onClick={resetUpload}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-5 py-2.5 rounded-xl border border-slate-200 transition-colors cursor-pointer w-full sm:w-auto justify-center"
            >
              <RefreshCw className="w-4 h-4 text-slate-600" />
              <span>Upload Another Sheet</span>
            </button>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
              {onUploadSuccess && (
                <button
                  onClick={onUploadSuccess}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors shadow-xs cursor-pointer w-full sm:w-auto justify-center"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Go to Client Dashboard</span>
                </button>
              )}

              {onNavigateToLogs && (
                <button
                  onClick={onNavigateToLogs}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors shadow-xs cursor-pointer w-full sm:w-auto justify-center"
                >
                  <span>View Upload Audit Logs</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: DIRECT DELETE PREVIOUS DATA CONFIRMATION MODAL    */}
      {/* ========================================================= */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    Delete Previous {deleteTarget === 'drivers' ? 'Drivers' : 'Cabs'} Data
                  </h3>
                  <p className="text-xs text-slate-500">
                    Clean out outdated records to prepare for a fresh spreadsheet upload
                  </p>
                </div>
              </div>

              {!isDeletingData && (
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Warning Box */}
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Permanent Deletion Warning</p>
                <p className="text-rose-800 mt-0.5">
                  This action cannot be undone. All selected records will be permanently removed from Firestore. The deletion event will be recorded in the audit trail.
                </p>
              </div>
            </div>

            {/* Scope Selection */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                Select Records to Delete:
              </span>

              <div className="space-y-2">
                {/* Option 1: All records */}
                <label className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  deleteScope === 'all' 
                    ? 'border-rose-400 bg-rose-50/50 text-rose-950 font-bold' 
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/60'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="deleteScopeRadio"
                      value="all"
                      checked={deleteScope === 'all'}
                      onChange={() => setDeleteScope('all')}
                      disabled={isDeletingData}
                      className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="text-xs">Delete ALL {deleteTarget} in database (Global purge)</span>
                  </div>
                  <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800 shadow-2xs">
                    {countForTarget(deleteTarget, 'all')} records
                  </span>
                </label>

                {/* Option 2: Client-specific records (if a client is selected) */}
                {selectedClientId !== 'auto' && (
                  <label className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                    deleteScope === 'client' 
                      ? 'border-rose-400 bg-rose-50/50 text-rose-950 font-bold' 
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/60'
                  }`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="deleteScopeRadio"
                        value="client"
                        checked={deleteScope === 'client'}
                        onChange={() => setDeleteScope('client')}
                        disabled={isDeletingData}
                        className="h-4 w-4 text-rose-600 border-slate-300 focus:ring-rose-500 cursor-pointer"
                      />
                      <span className="text-xs">
                        Delete only for {selectedClientName} ({selectedClientId})
                      </span>
                    </div>
                    <span className="text-xs font-mono font-black bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-800 shadow-2xs">
                      {countForTarget(deleteTarget, 'client')} records
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Progress Display */}
            {isDeletingData && (
              <div className="space-y-2 p-3.5 bg-slate-100 rounded-xl border border-slate-200 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-800">
                  <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                  <span>{deleteProgressMessage || 'Purging records in batches...'}</span>
                </div>
              </div>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeletingData}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmExecuteDelete}
                disabled={isDeletingData || countForTarget(deleteTarget, deleteScope) === 0}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer ${
                  isDeletingData || countForTarget(deleteTarget, deleteScope) === 0
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-rose-600 hover:bg-rose-700 hover:shadow-lg'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {isDeletingData 
                    ? 'Deleting Records...' 
                    : `Yes, Delete ${countForTarget(deleteTarget, deleteScope)} ${deleteTarget === 'drivers' ? 'Drivers' : 'Cabs'}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: REPLACE MODE ON UPLOAD CONFIRMATION MODAL         */}
      {/* ========================================================= */}
      {isReplaceConfirmOpen && pendingUploadTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    Confirm Replace & Upload
                  </h3>
                  <p className="text-xs text-slate-500">
                    Replace Mode is enabled for {pendingUploadTarget === 'drivers' ? 'Drivers Sheet' : 'Cabs Sheet'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsReplaceConfirmOpen(false)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs text-amber-950 leading-relaxed">
              <p className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>The following actions will be performed in order:</span>
              </p>
              <ol className="list-decimal list-inside space-y-1 text-amber-900 pl-1 font-medium">
                <li>
                  Permanently delete <strong>{countForTarget(pendingUploadTarget, selectedClientId !== 'auto' ? 'client' : 'all')} previous {pendingUploadTarget}</strong> from Firestore
                  {selectedClientId !== 'auto' ? ` (for ${selectedClientName})` : ' (all organizations)'}.
                </li>
                <li>
                  Parse and insert all fresh records from file <strong className="font-mono">{(pendingUploadTarget === 'drivers' ? driversFile : cabsFile)?.name}</strong>.
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReplaceConfirmOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReplaceUpload}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-md cursor-pointer hover:shadow-lg"
              >
                <Trash2 className="w-4 h-4" />
                <span>Proceed with Clean Replace & Upload</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
