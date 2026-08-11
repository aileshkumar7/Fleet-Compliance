/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
  Car
} from 'lucide-react';

export const UploadLogsList: React.FC = () => {
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<UploadLog | null>(null);

  // Modal States
  const [logToDelete, setLogToDelete] = useState<UploadLog | null>(null);
  const [showWipeDataModal, setShowWipeDataModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

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
    } catch (err) {
      console.error('Error fetching upload logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleDeleteLogOnly = async (log: UploadLog) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'uploadLogs', log.id));
      if (selectedLog?.id === log.id) {
        setSelectedLog(null);
      }
      setLogToDelete(null);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to delete log:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteLogAndData = async (log: UploadLog) => {
    setIsDeleting(true);
    try {
      if (log.batchId) {
        const batch = writeBatch(db);

        const dQuery = query(collection(db, 'drivers'), where('uploadBatchId', '==', log.batchId));
        const dSnap = await getDocs(dQuery);
        dSnap.forEach(d => batch.delete(d.ref));

        const cQuery = query(collection(db, 'cabs'), where('uploadBatchId', '==', log.batchId));
        const cSnap = await getDocs(cQuery);
        cSnap.forEach(c => batch.delete(c.ref));

        const tQuery = query(collection(db, 'trips'), where('uploadBatchId', '==', log.batchId));
        const tSnap = await getDocs(tQuery);
        tSnap.forEach(t => batch.delete(t.ref));

        await batch.commit();
      }

      await deleteDoc(doc(db, 'uploadLogs', log.id));

      if (selectedLog?.id === log.id) {
        setSelectedLog(null);
      }
      setLogToDelete(null);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to delete log and data:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleWipeAllData = async (targetCategory: 'master' | 'trips' | 'all' = 'all') => {
    setIsDeleting(true);
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
    }
  };

  // Filtered changes for selected log
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
              onClick={() => setLogToDelete(selectedLog)}
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
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">New Records Added</span>
              <PlusCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-black text-emerald-900 mt-2">{addedCount}</p>
            <p className="text-[11px] text-emerald-700 mt-1">First-time drivers & cabs introduced</p>
          </div>

          <div 
            onClick={() => setFilterType('updated')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer ${
              filterType === 'updated' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-blue-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Records Updated</span>
              <Edit3 className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-3xl font-black text-blue-900 mt-2">{updatedCount}</p>
            <p className="text-[11px] text-blue-700 mt-1">Existing records with updated details</p>
          </div>

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
                      change.type === 'driver' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'
                    }`}>
                      {change.type === 'driver' ? <User className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
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

        {/* Delete Modal for selected log */}
        {logToDelete && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-red-600">
                <div className="p-3 bg-red-100 rounded-xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Delete Upload Audit Log</h3>
                  <p className="text-xs text-slate-500">Choose how you want to delete this upload history log.</p>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                <p><span className="font-semibold text-slate-900">File:</span> {logToDelete.fileName}</p>
                <p><span className="font-semibold text-slate-900">Uploaded:</span> {new Date(logToDelete.uploadedAt).toLocaleString()}</p>
                <p><span className="font-semibold text-slate-900">Records:</span> {logToDelete.recordCounts}</p>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleDeleteLogOnly(logToDelete)}
                  disabled={isDeleting}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-3 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center justify-between"
                >
                  <span>1. Delete Audit Log Only</span>
                  <span className="text-[11px] font-normal text-slate-500">(Keeps driver/cab data)</span>
                </button>

                <button
                  onClick={() => handleDeleteLogAndData(logToDelete)}
                  disabled={isDeleting}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-between shadow-2xs"
                >
                  <span>2. Delete Log & All Records in Batch</span>
                  <span className="text-[11px] font-normal text-red-100">(Deletes batch drivers/cabs)</span>
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setLogToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <span>Upload History Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Historical audit trail of uploaded Excel sheets. You can delete old logs or clear uploaded data manually before uploading a fresh dataset.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowWipeDataModal(true)}
            className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
            title="Clear all active driver & cab records to upload a fresh dataset"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading upload logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">No upload logs found yet.</p>
            <p>Upload a data sheet to generate your first audit log entry.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">File Name</th>
                  <th className="px-6 py-3.5">Uploaded By</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5 text-center">Total Records</th>
                  <th className="px-6 py-3.5">Processing Breakdown</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log) => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-blue-50/50 transition-colors group"
                  >
                    <td 
                      onClick={() => setSelectedLog(log)}
                      className="px-6 py-4 cursor-pointer"
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
                    <td 
                      onClick={() => setSelectedLog(log)}
                      className="px-6 py-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{log.uploadedBy || 'Admin'}</span>
                      </div>
                    </td>
                    <td 
                      onClick={() => setSelectedLog(log)}
                      className="px-6 py-4 text-slate-500 font-mono text-[11px] cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.uploadedAt ? new Date(log.uploadedAt).toLocaleString() : 'N/A'}</span>
                      </div>
                    </td>
                    <td 
                      onClick={() => setSelectedLog(log)}
                      className="px-6 py-4 text-center font-bold text-slate-800 font-mono cursor-pointer"
                    >
                      <span className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                        {log.recordCounts}
                      </span>
                    </td>
                    <td 
                      onClick={() => setSelectedLog(log)}
                      className="px-6 py-4 cursor-pointer"
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
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            +{log.details.driversAdded || 0} Drv
                          </span>
                          <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            ↻{log.details.driversUpdated || 0} Drv
                          </span>
                          <span className="text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                            +{log.details.cabsAdded || 0} Cab
                          </span>
                          <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            ↻{log.details.cabsUpdated || 0} Cab
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">Completed</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-100/50 transition-colors cursor-pointer"
                          title="Inspect changes"
                        >
                          <span>Inspect</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogToDelete(log);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete log"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Log Options Modal */}
      {logToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Delete Upload Audit Log</h3>
                <p className="text-xs text-slate-500">Choose how you want to delete this upload audit record.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <p><span className="font-semibold text-slate-900">File:</span> {logToDelete.fileName}</p>
              <p><span className="font-semibold text-slate-900">Uploaded:</span> {new Date(logToDelete.uploadedAt).toLocaleString()}</p>
              <p><span className="font-semibold text-slate-900">Records:</span> {logToDelete.recordCounts}</p>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => handleDeleteLogOnly(logToDelete)}
                disabled={isDeleting}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-3 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center justify-between"
              >
                <span>1. Delete Audit Log Only</span>
                <span className="text-[11px] font-normal text-slate-500">(Keeps driver/cab data)</span>
              </button>

              <button
                onClick={() => handleDeleteLogAndData(logToDelete)}
                disabled={isDeleting}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 px-4 rounded-xl transition-colors cursor-pointer flex items-center justify-between shadow-2xs"
              >
                <span>2. Delete Log & All Records in Batch</span>
                <span className="text-[11px] font-normal text-red-100">(Deletes batch drivers, cabs, or trips)</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setLogToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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

