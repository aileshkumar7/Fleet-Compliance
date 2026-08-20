/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Car, 
  Layers, 
  Calendar, 
  Clock, 
  Users, 
  Check, 
  ArrowRight,
  Database,
  FileCheck,
  Building2,
  ListFilter,
  Trash2,
  AlertTriangle,
  ShieldCheck,
  CopyCheck,
  Info,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import { parseAndUploadTripData, TripUploadSummary } from '../utils/tripParser';
import { runCabDeduplicationCleanup } from '../utils/cabDeduplicator';
import { collection, onSnapshot, query, orderBy, limit, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trip } from '../types';
import { useAuth } from '../context/AuthContext';

interface TripDataUploaderProps {
  onNavigateToTripAnalytics?: () => void;
}

export const TripDataUploader: React.FC<TripDataUploaderProps> = ({ onNavigateToTripAnalytics }) => {
  const { userProfile } = useAuth();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<TripUploadSummary | null>(null);
  const [dedupeNotice, setDedupeNotice] = useState<string | null>(null);
  
  // Options
  const [clearExistingFirst, setClearExistingFirst] = useState<boolean>(false);
  const [showWipeTripsModal, setShowWipeTripsModal] = useState<boolean>(false);
  const [isWiping, setIsWiping] = useState<boolean>(false);

  // Recent Trips Preview
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState<boolean>(true);

  // Realtime subscription to recent trips
  useEffect(() => {
    const tripsRef = collection(db, 'trips');
    const q = query(tripsRef, orderBy('uploadedAt', 'desc'), limit(25));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsList: Trip[] = [];
      snapshot.forEach((doc) => {
        tripsList.push({ id: doc.id, ...doc.data() } as Trip);
      });
      setRecentTrips(tripsList);
      setLoadingTrips(false);
    }, (err) => {
      console.error('Error fetching recent trips:', err);
      setLoadingTrips(false);
    });

    return () => unsubscribe();
  }, []);

  const handleWipeAllTrips = async () => {
    setIsWiping(true);
    try {
      const snap = await getDocs(collection(db, 'trips'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      setShowWipeTripsModal(false);
    } catch (err: any) {
      console.error('Failed to wipe trip data:', err);
      setUploadError(`Failed to clear trip data: ${err.message || err}`);
    } finally {
      setIsWiping(false);
    }
  };

  const handleFileProcess = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setUploadError('Please select a valid Excel spreadsheet file (.xlsx or .xls).');
      return;
    }

    setUploadError(null);
    setUploadSummary(null);
    setIsUploading(true);
    setProgressStatus('Reading Excel file content...');
    setProgressPercent(10);

    try {
      const buffer = await file.arrayBuffer();
      const uploaderName = userProfile?.name || userProfile?.email || 'Fleet Admin';

      const summary = await parseAndUploadTripData(
        buffer,
        file.name,
        (processed, total, msg) => {
          setProgressStatus(msg);
          if (total > 0) {
            const pct = Math.min(95, Math.round((processed / total) * 85) + 10);
            setProgressPercent(pct);
          }
        },
        uploaderName,
        clearExistingFirst
      );

      setProgressPercent(100);
      setProgressStatus('Trip upload completed successfully!');
      setUploadSummary(summary);

      // Run automatic cab de-duplication after trip upload
      try {
        const dedupeRes = await runCabDeduplicationCleanup();
        if (dedupeRes.duplicateDocsDeleted > 0) {
          setDedupeNotice(`${dedupeRes.duplicateDocsDeleted} duplicate cab record${dedupeRes.duplicateDocsDeleted > 1 ? 's' : ''} merged automatically`);
        }
      } catch (dErr) {
        console.warn('Auto cab deduplication on trip upload:', dErr);
      }
    } catch (err: any) {
      console.error('Trip upload failed:', err);
      setUploadError(err.message || 'An unexpected error occurred while processing the trip Excel file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const formatDateValue = (val: any): string => {
    if (!val) return 'N/A';
    try {
      let d = val?.toDate ? val.toDate() : new Date(val);
      if (isNaN(d.getTime())) return 'N/A';
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        d = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
      }
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  const formatTimeValue = (val: any): string => {
    if (!val) return 'N/A';
    try {
      const d = val?.toDate ? val.toDate() : new Date(val);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Screen Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold shadow-md">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Upload BA Trip Data</h2>
              <p className="text-xs text-slate-500">
                Upload raw BA Trip reports (.xlsx) with passenger rows. Automatic grouping by Trip ID & duplicate deduplication.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowWipeTripsModal(true)}
            className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs px-3.5 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs"
            title="Delete all trip data records from database"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
            <span>Wipe Existing Trip Data</span>
          </button>

          <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-full text-xs font-bold font-mono">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            <span>Target: `trips` collection</span>
          </span>
        </div>
      </div>

      {/* Upload Settings / Pre-Clear Toggle */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-2.5 font-bold text-amber-950 cursor-pointer">
          <input
            type="checkbox"
            checked={clearExistingFirst}
            onChange={(e) => setClearExistingFirst(e.target.checked)}
            className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
          />
          <span>Automatically delete previous Trip Data records when uploading this new sheet</span>
        </label>
        <span className="text-[11px] text-amber-800/80">
          {clearExistingFirst ? '⚠️ Existing trips will be cleared before parsing' : 'Default: Overwrites/merges by Trip ID'}
        </span>
      </div>

      {/* Upload Dropzone Container */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/60 scale-[0.99]'
              : isUploading
              ? 'border-slate-300 bg-slate-50 opacity-75 pointer-events-none'
              : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20'
          }`}
        >
          <input
            type="file"
            id="tripFileInput"
            accept=".xlsx, .xls"
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="space-y-4 max-w-md mx-auto py-4">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 text-base">Processing BA Trip Report</h3>
                <p className="text-xs font-mono text-slate-600">{progressStatus}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <label htmlFor="tripFileInput" className="cursor-pointer space-y-4 block">
              <div className="w-16 h-16 bg-blue-100/80 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-900 text-base">
                  Click to select or drag & drop your BA Trip Report Excel file (.xlsx)
                </p>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Processes rows grouped by <span className="font-semibold text-slate-800">Trip ID</span>. Multiple passenger rows per trip are automatically aggregated, setting passenger counts and updating Firestore without creating duplicates.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors">
                <Upload className="w-4 h-4" />
                <span>Browse Excel File</span>
              </div>
            </label>
          )}
        </div>

        {/* Error Alert */}
        {uploadError && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-rose-800 text-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-slate-900">Upload Error</p>
              <p>{uploadError}</p>
            </div>
          </div>
        )}

        {/* Upload Summary Card */}
        {uploadSummary && (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-3xl p-6 sm:p-7 space-y-6 animate-fadeIn shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-bold shadow-xs">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-emerald-950 text-base sm:text-lg">Trip ID De-duplication & Upload Summary</h3>
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-300">
                      <ShieldCheck className="w-3 h-3 text-emerald-700" />
                      Airtight Deduplication
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 font-mono mt-0.5">Source File: {uploadSummary.fileName}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-emerald-800 bg-emerald-100/90 px-3 py-1 rounded-full border border-emerald-300 self-start sm:self-auto">
                Completed at {uploadSummary.uploadedAt.toLocaleTimeString()}
              </span>
            </div>

            {/* Stat Cards Grid - 5 Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* Total Raw Rows */}
              <div className="bg-white p-4 rounded-2xl border border-emerald-100/80 shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">1. Raw Rows Read</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono block">{uploadSummary.totalRowsRead}</span>
                <span className="text-[10px] text-slate-400 block font-medium">Passenger rows in sheet</span>
              </div>

              {/* Duplicate Rows Collapsed */}
              <div className="bg-white p-4 rounded-2xl border border-purple-200/80 shadow-2xs space-y-1 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-purple-50 rounded-bl-full pointer-events-none -mr-2 -mt-2" />
                <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">2. Duplicates Collapsed</span>
                <span className="text-2xl sm:text-3xl font-black text-purple-900 font-mono block">
                  {uploadSummary.duplicateRowsCollapsed}
                </span>
                <span className="text-[10px] text-purple-600 block font-medium">
                  {uploadSummary.duplicateRowsCollapsed > 0 ? 'Passenger rows merged' : 'Zero duplicates in sheet'}
                </span>
              </div>

              {/* Unique Trips Written */}
              <div className="bg-white p-4 rounded-2xl border border-blue-200/80 shadow-2xs space-y-1 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-12 h-12 bg-blue-50 rounded-bl-full pointer-events-none -mr-2 -mt-2" />
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">3. Unique Trips Written</span>
                <span className="text-2xl sm:text-3xl font-black text-blue-900 font-mono block">{uploadSummary.totalUniqueTrips}</span>
                <span className="text-[10px] text-blue-600 block font-medium">Distinct Firestore docs</span>
              </div>

              {/* Newly Added */}
              <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">4. Newly Added</span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono block">+{uploadSummary.newlyAddedCount}</span>
                <span className="text-[10px] text-emerald-600 block font-medium">New trip documents</span>
              </div>

              {/* Updated / Overwritten */}
              <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-2xs space-y-1">
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">5. Merged / Updated</span>
                <span className="text-2xl sm:text-3xl font-black text-amber-700 font-mono block">{uploadSummary.updatedCount}</span>
                <span className="text-[10px] text-amber-600 block font-medium">Existing trips refreshed</span>
              </div>
            </div>

            {/* Deduplication Confirmation & Math Box */}
            <div className="bg-white rounded-2xl border border-emerald-200/90 p-4 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <CopyCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Deduplication Equation Breakdown:</span>
                </div>
                <div className="font-mono text-xs text-slate-700 font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
                  <span className="text-slate-900">{uploadSummary.totalRowsRead} raw rows</span>
                  <span className="text-slate-400 mx-1.5">−</span>
                  <span className="text-purple-700">{uploadSummary.duplicateRowsCollapsed} collapsed</span>
                  <span className="text-slate-400 mx-1.5">=</span>
                  <span className="text-blue-700">{uploadSummary.totalUniqueTrips} unique trips</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900 mb-0.5">Airtight Document Key Guarantee</p>
                  <p className="text-[11px] text-slate-600">
                    Every Trip ID was stringified, trimmed, and normalized before database persistence (safeguarding against mixed number vs. text cell formats in Excel). Each trip document is stored with its unique Trip ID as the primary Firestore document key (<code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800 font-mono font-bold">trips/[tripId]</code>). Multiple passenger rows and re-uploads are automatically consolidated without duplicate trip counts.
                  </p>
                </div>
              </div>

              {/* Auto Deduplication Notification Banner */}
              {dedupeNotice && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{dedupeNotice}</span>
                </div>
              )}
            </div>

            {/* Post-Upload CTA: View & Download Utilization Reports */}
            {onNavigateToTripAnalytics && (
              <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg border border-blue-800/80 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-500/20 text-blue-300 rounded-xl shrink-0">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm sm:text-base">
                      Trip Analytics & Utilization Reports Ready
                    </h4>
                    <p className="text-xs text-blue-200 mt-0.5">
                      View real-time fleet utilization analytics and export Summary, Date-Wise, or Not Utilized Excel (.xlsx) reports.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onNavigateToTripAnalytics}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer shrink-0 self-stretch sm:self-center"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>View & Download Utilization Reports</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trips Collection Preview Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-lg">Firestore Trips Database Registry</h3>
            <span className="bg-slate-100 text-slate-700 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
              {recentTrips.length} recent
            </span>
          </div>
        </div>

        {loadingTrips ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading trip records from Firestore...</p>
          </div>
        ) : recentTrips.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <Car className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No Trip Records Found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Upload a BA Trip Report Excel file above to populate the `trips` database collection.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Trip ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Cab Reg No.</th>
                  <th className="p-3">Driver Name & Contact</th>
                  <th className="p-3 text-center">Pax Count</th>
                  <th className="p-3">Times (Deploy / Pick / Drop)</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">Facility / Office</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentTrips.map((t) => (
                  <tr key={t.tripId} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-900">
                      {t.tripId}
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatDateValue(t.date)}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        {t.registration || 'N/A'}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900">{t.driverName || 'N/A'}</p>
                      {t.driverContactNo && (
                        <p className="text-[11px] font-mono text-slate-500">{t.driverContactNo}</p>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-100 text-blue-900 font-mono font-black rounded-full text-xs border border-blue-200">
                        {t.passengerCount || 1}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-600 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Deploy: <strong className="text-slate-800">{formatTimeValue(t.deploymentTime)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Pick: <strong className="text-emerald-700">{formatTimeValue(t.actualPickupTime)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Drop: <strong className="text-rose-700">{formatTimeValue(t.actualDropTime)}</strong></span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium capitalize">
                        {t.direction || t.tripType || 'Standard'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 space-y-0.5">
                      <p className="font-medium text-slate-800">{t.facility || 'N/A'}</p>
                      {t.office && <p className="text-[10px] text-slate-400">{t.office}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wipe All Trip Data Confirmation Modal */}
      {showWipeTripsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Clear All BA Trip Data</h3>
                <p className="text-xs text-slate-500">Delete all records in `trips` collection</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900">ALL trip records</span> from the database? This action is permanent and cannot be undone. Trip Analytics will show zero trips until you upload a new Trip Data Excel sheet.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowWipeTripsModal(false)}
                disabled={isWiping}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeAllTrips}
                disabled={isWiping}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                {isWiping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete All Trip Records</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
