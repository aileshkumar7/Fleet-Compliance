/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
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
  Filter
} from 'lucide-react';

export const UploadLogsList: React.FC = () => {
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<UploadLog | null>(null);

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

  // Filtered changes for selected log
  const filteredChanges = selectedLog?.changes?.filter(ch => {
    const matchesFilter = filterType === 'all' || ch.changeType === filterType;
    const matchesSearch = !searchQuery || 
      ch.identifier.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ch.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  }) || [];

  const addedCount = selectedLog?.changes?.filter(c => c.changeType === 'added').length || selectedLog?.details?.driversAdded! + selectedLog?.details?.cabsAdded! || 0;
  const updatedCount = selectedLog?.changes?.filter(c => c.changeType === 'updated').length || selectedLog?.details?.driversUpdated! + selectedLog?.details?.cabsUpdated! || 0;
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

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
              Total Records Processed: {selectedLog.recordCounts}
            </span>
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
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <span>Upload History Audit Logs</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Historical audit trail of weekly Excel uploads. Click any log to inspect granular record changes.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          title="Refresh Logs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
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
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {logs.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{log.fileName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{log.uploadedBy || 'Admin'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{log.uploadedAt ? new Date(log.uploadedAt).toLocaleString() : 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-800 font-mono">
                      <span className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
                        {log.recordCounts}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {log.details ? (
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
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                        <span>Inspect Changes</span>
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

