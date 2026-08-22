/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, orderBy, deleteDoc, doc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UploadLog, UploadChangeRecord } from '../types';
import { 
  History, 
  FileSpreadsheet, 
  RefreshCw, 
  User, 
  Calendar, 
  ArrowLeft, 
  PlusCircle, 
  Edit3, 
  ArrowRightLeft, 
  Search, 
  CheckCircle2, 
  Truck, 
  ChevronRight,
  Filter,
  Trash2,
  AlertTriangle,
  Trash,
  ShieldAlert,
  Car,
  CheckSquare,
  Square,
  MinusSquare,
  X,
  Layers
} from 'lucide-react';

export const UploadLogsList: React.FC = () => {
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<UploadLog | null>(null);

  // Multi-select state (set of log IDs)
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

  // Search & Type Filter for Logs Table
  const [logsSearch, setLogsSearch] = useState<string>('');
  const [logsTypeFilter, setLogsTypeFilter] = useState<'all' | 'vehicles' | 'trips'>('all');

  // Modal States
  const [logsToDelete, setLogsToDelete] = useState<UploadLog[] | null>(null);
  const [showWipeDataModal, setShowWipeDataModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deletionProgress, setDeletionProgress] = useState<string>('');

  // Filters inside detail view
  const [filterType, setFilterType] = useState<'all' | 'added' | 'updated' | 'status_changed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'uploadLogs'), orderBy('uploadedAt', 'desc'));
      const snap = await getDocs(q);
      const items: UploadLog[] = [];
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as UploadLog);
      });
      setLogs(items);
      // Clean up selected IDs that no longer exist
      setSelectedLogIds(prev => {
        const next = new Set<string>();
        const existingIds = new Set(items.map(l => l.id));
        prev.forEach(id => {
          if (existingIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      console.error('Error fetching upload logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const isTrip = log.uploadType === 'trips' || log.details?.tripsAdded !== undefined;
      const matchesType = 
        logsTypeFilter === 'all' ? true :
        logsTypeFilter === 'trips' ? isTrip :
        !isTrip;

      const q = logsSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        log.fileName?.toLowerCase().includes(q) ||
        log.uploadedBy?.toLowerCase().includes(q) ||
        (log.uploadedAt && new Date(log.uploadedAt).toLocaleString().toLowerCase().includes(q));

      return matchesType && matchesSearch;
    });
  }, [logs, logsSearch, logsTypeFilter]);

  // Selection handlers
  const handleToggleSelectOne = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredLogs.map(l => l.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedLogIds.has(id));

    setSelectedLogIds(prev => {
      const next = new Set(prev);
      if (areAllSelected) {
        // Deselect all currently filtered
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        // Select all filtered
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleSelectAllLogs = () => {
    const allIds = logs.map(l => l.id);
    setSelectedLogIds(new Set(allIds));
  };

  const handleClearSelection = () => {
    setSelectedLogIds(new Set());
  };

  // Header checkbox state
  const isAllFilteredSelected = filteredLogs.length > 0 && filteredLogs.every(l => selectedLogIds.has(l.id));
  const isSomeFilteredSelected = filteredLogs.some(l => selectedLogIds.has(l.id)) && !isAllFilteredSelected;

  // Selected Log objects
  const selectedLogsList = useMemo(() => {
    return logs.filter(l => selectedLogIds.has(l.id));
  }, [logs, selectedLogIds]);

  // Trigger modal for selected logs
  const handlePromptDeleteSelected = () => {
    if (selectedLogsList.length === 0) return;
    setLogsToDelete(selectedLogsList);
  };

  // Trigger modal for all logs at once
  const handlePromptDeleteAllLogs = () => {
    if (logs.length === 0) return;
    setLogsToDelete(logs);
  };

  // Trigger modal for a specific log
  const handlePromptDeleteSingleLog = (log: UploadLog, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLogsToDelete([log]);
  };

  // Execute Deletion: Logs Only
  const executeDeleteLogsOnly = async (targetLogs: UploadLog[]) => {
    setIsDeleting(true);
    setDeletionProgress(`Deleting ${targetLogs.length} audit log(s)...`);
    try {
      const targetIds = new Set(targetLogs.map(l => l.id));
      
      // Delete in batches of 400
      for (let i = 0; i < targetLogs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = targetLogs.slice(i, i + 400);
        chunk.forEach(l => {
          batch.delete(doc(db, 'uploadLogs', l.id));
        });
        await batch.commit();
      }

      if (selectedLog && targetIds.has(selectedLog.id)) {
        setSelectedLog(null);
      }

      // Remove from selectedLogIds
      setSelectedLogIds(prev => {
        const next = new Set(prev);
        targetIds.forEach(id => next.delete(id));
        return next;
      });

      setLogsToDelete(null);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to delete logs:', err);
    } finally {
      setIsDeleting(false);
      setDeletionProgress('');
    }
  };

  // Execute Deletion: Logs and Associated Uploaded Data
  const executeDeleteLogsAndData = async (targetLogs: UploadLog[]) => {
    setIsDeleting(true);
    setDeletionProgress(`Finding associated dataset records for ${targetLogs.length} log(s)...`);
    try {
      const targetIds = new Set(targetLogs.map(l => l.id));
      const batchIds = targetLogs.map(l => l.batchId).filter((b): b is string => Boolean(b));

      // Collect all documents to delete
      const docsToDeleteRefs: any[] = [];

      for (let idx = 0; idx < batchIds.length; idx++) {
        const bId = batchIds[idx];
        setDeletionProgress(`Scanning records for batch ${idx + 1} of ${batchIds.length}...`);

        const dQuery = query(collection(db, 'drivers'), where('uploadBatchId', '==', bId));
        const dSnap = await getDocs(dQuery);
        dSnap.forEach(d => docsToDeleteRefs.push(d.ref));

        const cQuery = query(collection(db, 'cabs'), where('uploadBatchId', '==', bId));
        const cSnap = await getDocs(cQuery);
        cSnap.forEach(c => docsToDeleteRefs.push(c.ref));

        const tQuery = query(collection(db, 'trips'), where('uploadBatchId', '==', bId));
        const tSnap = await getDocs(tQuery);
        tSnap.forEach(t => docsToDeleteRefs.push(t.ref));
      }

      // Also add the uploadLogs document refs
      targetLogs.forEach(l => {
        docsToDeleteRefs.push(doc(db, 'uploadLogs', l.id));
      });

      setDeletionProgress(`Deleting ${docsToDeleteRefs.length} records and logs in batches...`);

      for (let i = 0; i < docsToDeleteRefs.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docsToDeleteRefs.slice(i, i + 400);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }

      if (selectedLog && targetIds.has(selectedLog.id)) {
        setSelectedLog(null);
      }

      setSelectedLogIds(prev => {
        const next = new Set(prev);
        targetIds.forEach(id => next.delete(id));
        return next;
      });

      setLogsToDelete(null);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to delete logs and data:', err);
    } finally {
      setIsDeleting(false);
      setDeletionProgress('');
    }
  };

  const handleWipeAllData = async (targetCategory: 'master' | 'trips' | 'all' = 'all') => {
    setIsDeleting(true);
    setDeletionProgress('Wiping active database collections...');
    try {
      const docsToDelete: any[] = [];

      if (targetCategory === 'master' || targetCategory === 'all') {
        const dSnap = await getDocs(collection(db, 'drivers'));
        const cSnap = await getDocs(collection(db, 'cabs'));
        docsToDelete.push(...dSnap.docs, ...cSnap.docs);
      }

      if (targetCategory === 'trips' || targetCategory === 'all') {
        const tSnap = await getDocs(collection(db, 'trips'));
        docsToDelete.push(...tSnap.docs);
      }

      for (let i = 0; i < docsToDelete.length; i += 400) {
        const batch = writeBatch(db);
        const chunk = docsToDelete.slice(i, i + 400);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setShowWipeDataModal(false);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to wipe data:', err);
    } finally {
      setIsDeleting(false);
      setDeletionProgress('');
    }
  };

  // Filtered changes for selected log detail view
  const filteredChanges = selectedLog?.changes?.filter(ch => {
    const matchesFilter = filterType === 'all' || ch.changeType === filterType;
    const matchesSearch = !searchQuery || 
      ch.identifier.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ch.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  }) || [];

  const isTripLog = selectedLog?.uploadType === 'trips' || selectedLog?.details?.tripsAdded !== undefined;

  const addedCount = selectedLog?.changes?.filter(c => c.changeType === 'added').length || 
    (isTripLog ? (selectedLog?.details?.tripsAdded || 0) : ((selectedLog?.details?.driversAdded || 0) + (selectedLog?.details?.cabsAdded || 0)));

  const updatedCount = selectedLog?.changes?.filter(c => c.changeType === 'updated').length || 
    (isTripLog ? (selectedLog?.details?.tripsUpdated || 0) : ((selectedLog?.details?.driversUpdated || 0) + (selectedLog?.details?.cabsUpdated || 0)));

  const statusChangedCount = selectedLog?.changes?.filter(c => c.changeType === 'status_changed').length || 0;

  if (selectedLog) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Detail Header Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
          <div className="space-y-1">
            <button
              onClick={() => setSelectedLog(null)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors mb-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Upload History Logs</span>
            </button>

            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <span>Upload Changes: {selectedLog.fileName}</span>
            </h2>
            <p className="text-xs text-slate-500">
              Uploaded by <span className="font-semibold text-slate-700">{selectedLog.uploadedBy}</span> on{' '}
              <span className="font-mono text-slate-700">{new Date(selectedLog.uploadedAt).toLocaleString()}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
              Total Records Processed: {selectedLog.recordCounts}
            </span>

            <button
              onClick={() => handlePromptDeleteSingleLog(selectedLog)}
              className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs px-3 py-2 rounded-xl border border-red-200 transition-colors cursor-pointer"
              title="Delete this upload audit log"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Delete Log</span>
            </button>
          </div>
        </div>

        {/* Change Counts Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div 
            onClick={() => setFilterType('added')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'added' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200 hover:border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                {isTripLog ? 'New Trips Added' : 'New Records Added'}
              </span>
              <PlusCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-black text-emerald-900 mt-2">{addedCount}</p>
            <p className="text-[11px] text-emerald-700 mt-1">
              {isTripLog ? 'First-time unique trips created' : 'First-time drivers & cabs introduced'}
            </p>
          </div>

          <div 
            onClick={() => setFilterType('updated')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'updated' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-blue-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">
                {isTripLog ? 'Trips Updated' : 'Records Updated'}
              </span>
              <Edit3 className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-black text-blue-900 mt-2">{updatedCount}</p>
            <p className="text-[11px] text-blue-700 mt-1">
              {isTripLog ? 'Existing trips overwritten/merged' : 'Existing records with updated details'}
            </p>
          </div>

          {isTripLog ? (
            <div 
              className="p-5 rounded-2xl border bg-purple-50/50 border-purple-200 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Duplicates Collapsed</span>
                <Car className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-black text-purple-900 mt-2">
                {selectedLog.details?.duplicateRowsCollapsed !== undefined 
                  ? selectedLog.details.duplicateRowsCollapsed 
                  : (selectedLog.details?.totalRowsRead ? Math.max(0, selectedLog.details.totalRowsRead - selectedLog.recordCounts) : 0)}
              </p>
              <p className="text-[11px] text-purple-700 mt-1">
                {selectedLog.details?.totalRowsRead 
                  ? `From ${selectedLog.details.totalRowsRead} raw passenger rows`
                  : 'Passenger rows merged into single trips'}
              </p>
            </div>
          ) : (
            <div 
              onClick={() => setFilterType('status_changed')}
              className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                filterType === 'status_changed' ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20' : 'bg-white border-slate-200 hover:border-purple-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Status Movements</span>
                <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-black text-purple-900 mt-2">{statusChangedCount}</p>
              <p className="text-[11px] text-purple-700 mt-1">Moved between Active ↔ Inactive</p>
            </div>
          )}
        </div>

        {/* Change Logs List Section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          {/* Controls Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 overflow-x-auto">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterType === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Changes ({selectedLog.changes?.length || 0})
              </button>
              <button
                onClick={() => setFilterType('added')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterType === 'added' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Added ({addedCount})
              </button>
              <button
                onClick={() => setFilterType('updated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterType === 'updated' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Updated ({updatedCount})
              </button>
              <button
                onClick={() => setFilterType('status_changed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterType === 'status_changed' ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Status Moved ({statusChangedCount})
              </button>
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search changed records..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Change Items List */}
          {filteredChanges.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-600">No matching changes recorded for this filter.</p>
              <p className="text-slate-400">
                {selectedLog.changes && selectedLog.changes.length > 0 
                  ? 'Try selecting a different filter tab or search query.' 
                  : 'This upload log was created prior to granular change tracking.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredChanges.map((change, idx) => (
                <div key={idx} className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      change.type === 'driver' ? 'bg-blue-100 text-blue-700' : change.type === 'trip' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'
                    }`}>
                      {change.type === 'driver' ? <User className="w-4 h-4" /> : change.type === 'trip' ? <Car className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{change.identifier}</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {change.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 font-medium">{change.details}</p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {change.changeType === 'added' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Added
                      </span>
                    )}
                    {change.changeType === 'updated' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                        Updated
                      </span>
                    )}
                    {change.changeType === 'status_changed' && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-800 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600" />
                        Status Moved ({change.oldStatus?.toUpperCase()} → {change.newStatus?.toUpperCase()})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Modal for logs */}
        {logsToDelete && (
          <DeleteConfirmModal
            logsToDelete={logsToDelete}
            isDeleting={isDeleting}
            deletionProgress={deletionProgress}
            onCancel={() => setLogsToDelete(null)}
            onDeleteLogsOnly={() => executeDeleteLogsOnly(logsToDelete)}
            onDeleteLogsAndData={() => executeDeleteLogsAndData(logsToDelete)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <span>Upload History Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Historical audit trail of uploaded Excel sheets. Select specific logs to delete or delete all logs at once.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {logs.length > 0 && (
            <button
              onClick={handlePromptDeleteAllLogs}
              className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
              title="Delete all upload logs from history"
            >
              <Trash className="w-4 h-4 text-rose-600" />
              <span>Delete All Logs</span>
            </button>
          )}

          <button
            onClick={() => setShowWipeDataModal(true)}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
            title="Clear all active driver & cab records to upload a fresh dataset"
          >
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Clear Active Data</span>
          </button>

          <button
            onClick={fetchLogs}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Selection Control Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2">
          {/* Quick Select Buttons */}
          <button
            onClick={handleSelectAllFiltered}
            disabled={filteredLogs.length === 0}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              isAllFilteredSelected 
                ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-500/20' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {isAllFilteredSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : isSomeFilteredSelected ? (
              <MinusSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-400" />
            )}
            <span>{isAllFilteredSelected ? 'Deselect All' : 'Select All Filtered'}</span>
          </button>

          {logs.length > filteredLogs.length && (
            <button
              onClick={handleSelectAllLogs}
              className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Select All ({logs.length})</span>
            </button>
          )}

          {selectedLogIds.size > 0 && (
            <button
              onClick={handleClearSelection}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Selection</span>
            </button>
          )}

          {/* Type Filter Pills */}
          <div className="h-4 w-px bg-slate-200 hidden sm:block mx-1" />

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setLogsTypeFilter('all')}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                logsTypeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setLogsTypeFilter('vehicles')}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                logsTypeFilter === 'vehicles' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vehicles & Drivers
            </button>
            <button
              onClick={() => setLogsTypeFilter('trips')}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                logsTypeFilter === 'trips' ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BA Trips
            </button>
          </div>
        </div>

        {/* Search Field */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={logsSearch}
            onChange={(e) => setLogsSearch(e.target.value)}
            placeholder="Search logs by file name..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
          />
        </div>
      </div>

      {/* Floating / Sticky Selected Actions Bar */}
      {selectedLogIds.size > 0 && (
        <div className="sticky top-4 z-40 bg-slate-900 text-white p-4 rounded-2xl shadow-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            <div className="text-sm">
              <span className="font-extrabold text-white">{selectedLogIds.size}</span> log{selectedLogIds.size > 1 ? 's' : ''} selected
              <span className="text-slate-400 text-xs ml-2 hidden sm:inline">
                ({selectedLogsList.reduce((acc, l) => acc + (l.recordCounts || 0), 0).toLocaleString()} total records processed)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearSelection}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Deselect All
            </button>

            <button
              onClick={handlePromptDeleteSelected}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-white" />
              <span>Delete Selected ({selectedLogIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Upload Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading upload logs...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No upload logs found.</p>
            <p className="text-slate-400">
              {logs.length > 0 ? 'No logs match your search or filter.' : 'Upload a data sheet to generate your first audit log entry.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  {/* Select Column Header */}
                  <th className="pl-5 pr-2 py-3.5 w-12 text-center">
                    <button
                      onClick={handleSelectAllFiltered}
                      className="p-1 hover:bg-slate-200 rounded-md transition-colors cursor-pointer flex items-center justify-center mx-auto"
                      title={isAllFilteredSelected ? 'Deselect All Filtered' : 'Select All Filtered'}
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : isSomeFilteredSelected ? (
                        <MinusSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5">File Name</th>
                  <th className="px-4 py-3.5">Uploaded By</th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5 text-center">Total Records</th>
                  <th className="px-4 py-3.5">Processing Breakdown</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredLogs.map((log) => {
                  const isSelected = selectedLogIds.has(log.id);
                  return (
                    <tr 
                      key={log.id} 
                      className={`transition-colors group ${
                        isSelected ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Checkbox Cell */}
                      <td className="pl-5 pr-2 py-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => handleToggleSelectOne(log.id, e)}
                          className="p-1 hover:bg-blue-100/50 rounded-md transition-colors cursor-pointer flex items-center justify-center mx-auto"
                          title={isSelected ? 'Deselect log' : 'Select log'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </button>
                      </td>

                      {/* File Name Cell */}
                      <td 
                        onClick={() => setSelectedLog(log)}
                        className="px-4 py-4 cursor-pointer"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className={`w-4 h-4 ${log.uploadType === 'trips' || log.details?.tripsAdded !== undefined ? 'text-purple-600' : 'text-blue-600'} shrink-0 group-hover:scale-110 transition-transform`} />
                            <span className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{log.fileName}</span>
                          </div>
                          <div>
                            {log.uploadType === 'trips' || log.details?.tripsAdded !== undefined ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded border border-purple-200">
                                <Car className="w-3 h-3 text-purple-600" />
                                <span>BA Trip Data</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-200">
                                <Truck className="w-3 h-3 text-blue-600" />
                                <span>Vehicles & Drivers</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Uploaded By */}
                      <td 
                        onClick={() => setSelectedLog(log)}
                        className="px-4 py-4 cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium">{log.uploadedBy || 'Admin'}</span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td 
                        onClick={() => setSelectedLog(log)}
                        className="px-4 py-4 text-slate-500 font-mono text-[11px] cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{log.uploadedAt ? new Date(log.uploadedAt).toLocaleString() : 'N/A'}</span>
                        </div>
                      </td>

                      {/* Total Records */}
                      <td 
                        onClick={() => setSelectedLog(log)}
                        className="px-4 py-4 text-center font-bold text-slate-800 font-mono cursor-pointer"
                      >
                        <span className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                          {log.recordCounts}
                        </span>
                      </td>

                      {/* Processing Breakdown */}
                      <td 
                        onClick={() => setSelectedLog(log)}
                        className="px-4 py-4 cursor-pointer"
                      >
                        {log.uploadType === 'trips' || log.details?.tripsAdded !== undefined ? (
                          <div className="flex items-center gap-2 text-[11px] font-medium flex-wrap">
                            <span className="text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200 font-bold">
                              +{log.details?.tripsAdded || 0} Trips
                            </span>
                            <span className="text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200 font-bold">
                              ↻{log.details?.tripsUpdated || 0} Trips Updated
                            </span>
                          </div>
                        ) : log.details ? (
                          <div className="flex items-center gap-2 text-[11px] font-medium flex-wrap">
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-medium">
                              +{log.details.driversAdded || 0} Drv
                            </span>
                            <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 font-medium">
                              ↻{log.details.driversUpdated || 0} Drv
                            </span>
                            <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100 font-medium">
                              +{log.details.cabsAdded || 0} Cab
                            </span>
                            <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-medium">
                              ↻{log.details.cabsUpdated || 0} Cab
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">Completed</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100/50 transition-colors cursor-pointer"
                            title="Inspect changes"
                          >
                            <span>Inspect</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>

                          <button
                            onClick={(e) => handlePromptDeleteSingleLog(log, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete this log"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Delete Multi/Single Logs Modal */}
      {logsToDelete && (
        <DeleteConfirmModal
          logsToDelete={logsToDelete}
          isDeleting={isDeleting}
          deletionProgress={deletionProgress}
          onCancel={() => setLogsToDelete(null)}
          onDeleteLogsOnly={() => executeDeleteLogsOnly(logsToDelete)}
          onDeleteLogsAndData={() => executeDeleteLogsAndData(logsToDelete)}
        />
      )}

      {/* Wipe All Active Data Confirmation Modal */}
      {showWipeDataModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Clear Active Database Records</h3>
                <p className="text-xs text-slate-500">Choose data category to wipe</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select which dataset you wish to wipe from the database to upload fresh sheets:
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleWipeAllData('master')}
                disabled={isDeleting}
                className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs py-3 px-4 rounded-xl border border-amber-200 transition-colors cursor-pointer flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-bold">Wipe Vehicles & Drivers Data</p>
                  <p className="text-[10px] font-normal text-amber-800/80">Clears `drivers` and `cabs` collections</p>
                </div>
                <Truck className="w-4 h-4 text-amber-700 shrink-0" />
              </button>

              <button
                onClick={() => handleWipeAllData('trips')}
                disabled={isDeleting}
                className="w-full bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs py-3 px-4 rounded-xl border border-purple-200 transition-colors cursor-pointer flex items-center justify-between text-left"
              >
                <div>
                  <p className="font-bold">Wipe BA Trip Data</p>
                  <p className="text-[10px] font-normal text-purple-800/80">Clears `trips` collection</p>
                </div>
                <Car className="w-4 h-4 text-purple-700 shrink-0" />
              </button>

              <button
                onClick={() => handleWipeAllData('all')}
                disabled={isDeleting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-between text-left shadow-2xs"
              >
                <div>
                  <p className="font-bold">Wipe ALL Database Records</p>
                  <p className="text-[10px] font-normal text-red-100">Clears drivers, cabs, and trips completely</p>
                </div>
                <Trash2 className="w-4 h-4 text-white shrink-0" />
              </button>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                onClick={() => setShowWipeDataModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sub-component for clean Delete Confirmation Modal supporting both single and multi-delete
interface DeleteConfirmModalProps {
  logsToDelete: UploadLog[];
  isDeleting: boolean;
  deletionProgress: string;
  onCancel: () => void;
  onDeleteLogsOnly: () => void;
  onDeleteLogsAndData: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  logsToDelete,
  isDeleting,
  deletionProgress,
  onCancel,
  onDeleteLogsOnly,
  onDeleteLogsAndData,
}) => {
  const isSingle = logsToDelete.length === 1;
  const singleLog = isSingle ? logsToDelete[0] : null;
  const totalRecords = logsToDelete.reduce((acc, l) => acc + (l.recordCounts || 0), 0);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 text-rose-600">
          <div className="p-3 bg-rose-100 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              {isSingle ? 'Delete Upload Audit Log' : `Delete ${logsToDelete.length} Upload Audit Logs`}
            </h3>
            <p className="text-xs text-slate-500">
              {isSingle ? 'Choose how you want to delete this upload history log.' : 'Choose deletion method for all selected logs.'}
            </p>
          </div>
        </div>

        {/* Summary Info Box */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1.5 max-h-48 overflow-y-auto">
          {isSingle && singleLog ? (
            <>
              <p><span className="font-semibold text-slate-900">File:</span> {singleLog.fileName}</p>
              <p><span className="font-semibold text-slate-900">Uploaded:</span> {new Date(singleLog.uploadedAt).toLocaleString()}</p>
              <p><span className="font-semibold text-slate-900">Processed Records:</span> {singleLog.recordCounts}</p>
            </>
          ) : (
            <>
              <div className="flex justify-between font-semibold text-slate-900 border-b border-slate-200 pb-1">
                <span>Selected Files ({logsToDelete.length})</span>
                <span>{totalRecords.toLocaleString()} Total Records</span>
              </div>
              <ul className="space-y-1 divide-y divide-slate-100/80 pt-1">
                {logsToDelete.map(l => (
                  <li key={l.id} className="flex justify-between pt-1">
                    <span className="truncate max-w-[260px] text-slate-800 font-medium">{l.fileName}</span>
                    <span className="font-mono text-[11px] text-slate-500">{l.recordCounts} rows</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {deletionProgress && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
            <span className="font-medium">{deletionProgress}</span>
          </div>
        )}

        <div className="space-y-2.5">
          <button
            onClick={onDeleteLogsOnly}
            disabled={isDeleting}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-3 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center justify-between text-left"
          >
            <div>
              <p className="font-bold">1. Delete Audit Log{isSingle ? '' : 's'} Only</p>
              <p className="text-[11px] font-normal text-slate-500">Removes history log{isSingle ? '' : 's'}; preserves active cabs/drivers/trips data</p>
            </div>
            <Trash className="w-4 h-4 text-slate-600 shrink-0" />
          </button>

          <button
            onClick={onDeleteLogsAndData}
            disabled={isDeleting}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-between text-left shadow-2xs"
          >
            <div>
              <p className="font-bold">2. Delete Log{isSingle ? '' : 's'} & Uploaded Batch Records</p>
              <p className="text-[11px] font-normal text-rose-100">Removes audit log{isSingle ? '' : 's'} AND wipes records uploaded in {isSingle ? 'this batch' : 'these batches'}</p>
            </div>
            <Trash2 className="w-4 h-4 text-white shrink-0" />
          </button>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

