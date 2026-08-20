/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileSpreadsheet, FileText, Clock, User, Shield, RefreshCw, Filter } from 'lucide-react';

export interface ReportLogEntry {
  id?: string;
  downloadedBy: string;
  reportType: 'excel_full' | 'pdf_single';
  fileName: string;
  filtersUsed: any;
  recordCount: number;
  timestamp: string;
}

export const ReportLogsView: React.FC = () => {
  const [logs, setLogs] = useState<ReportLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'reportLogs'), orderBy('timestamp', 'desc'), limit(50));

    const unsub = onSnapshot(q, (snap) => {
      const items: ReportLogEntry[] = [];
      snap.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ReportLogEntry);
      });
      setLogs(items);
      setIsLoading(false);
    }, (err) => {
      console.error('Error fetching report logs:', err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-2xl">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Report Export Audit Trail</h2>
            <p className="text-xs text-slate-400 mt-1">
              Immutable security audit log tracking who downloaded reports, applied filters, and generated single-record PDFs.
            </p>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-center shrink-0">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Logged Downloads</span>
          <span className="text-lg font-black font-mono text-blue-400">{logs.length}</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-semibold">Loading audit logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <Clock className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">No report download logs recorded yet.</p>
            <p className="text-[11px] text-slate-400">
              When users download Excel or PDF reports, audit logs will be automatically displayed here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Exported File Name</th>
                  <th className="py-3.5 px-4">Downloaded By</th>
                  <th className="py-3.5 px-4">Records</th>
                  <th className="py-3.5 px-4">Filters Applied</th>
                  <th className="py-3.5 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      {log.reportType?.startsWith('excel') || log.reportType?.startsWith('trip') || log.reportType?.startsWith('utilization') || log.reportType === 'not_utilized_cabs' ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            {log.reportType === 'trip_summary'
                              ? 'Trip Summary'
                              : log.reportType === 'trip_detailed'
                              ? 'Trip Detailed'
                              : log.reportType === 'utilization_summary'
                              ? 'Util. Summary'
                              : log.reportType === 'utilization_date_wise'
                              ? 'Util. Date-Wise'
                              : log.reportType === 'not_utilized_cabs'
                              ? 'Not Utilized'
                              : 'Excel'}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>PDF</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {log.fileName}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{log.downloadedBy || 'Admin'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {log.recordCount ?? 1}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 text-[11px]">
                      {typeof log.filtersUsed === 'object' ? (
                        <span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {JSON.stringify(log.filtersUsed)}
                        </span>
                      ) : (
                        log.filtersUsed || 'Default'
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                      {new Date(log.timestamp).toLocaleString()}
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
