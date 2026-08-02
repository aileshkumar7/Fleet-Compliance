/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, FileCheck, Info, Building2, Plus, LayoutDashboard } from 'lucide-react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Client } from '../types';
import { processDataSheetUpload, generateSampleDataSheetTemplate, UploadResult } from '../utils/excelParser';

interface DataUploaderProps {
  onUploadSuccess?: () => void;
  onNavigateToLogs?: () => void;
}

export const DataUploader: React.FC<DataUploaderProps> = ({ onUploadSuccess, onNavigateToLogs }) => {
  const { userProfile, isAdmin } = useAuth();
  const userBoundClientId = userProfile?.clientId || userProfile?.assignedClientIds?.[0] || '';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploaderName, setUploaderName] = useState<string>(userProfile?.name || userProfile?.email || 'Fleet Operations User');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Client Selection State for Step 2 Upload Assignment
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(isAdmin ? 'auto' : (userBoundClientId || 'auto'));
  const [showNewClientInput, setShowNewClientInput] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientId, setNewClientId] = useState<string>('');

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
        } else if (items.length > 0 && selectedClientId === 'auto') {
          setSelectedClientId(items[0].clientId);
        }
      } catch (e) {
        console.error('Error fetching clients for uploader:', e);
      }
    };
    fetchClients();
  }, [isAdmin, userBoundClientId]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setErrorMsg('Please select a valid Excel (.xlsx or .xls) file.');
        setSelectedFile(null);
        return;
      }
      setErrorMsg(null);
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setErrorMsg('Please select a valid Excel (.xlsx or .xls) file.');
        setSelectedFile(null);
        return;
      }
      setErrorMsg(null);
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleProcessUpload = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select an Excel file to upload.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    let overrideClientId: string | undefined = undefined;
    let overrideClientName: string | undefined = undefined;

    if (selectedClientId !== 'auto') {
      overrideClientId = selectedClientId;
      const matchedClient = clients.find(c => c.clientId === selectedClientId);
      overrideClientName = matchedClient?.clientName || selectedClientId;
    }

    try {
      const res = await processDataSheetUpload(
        selectedFile, 
        uploaderName.trim() || 'Admin User',
        overrideClientId,
        overrideClientName
      );
      setUploadResult(res);
      if (onUploadSuccess) onUploadSuccess();
    } catch (err: any) {
      console.error('Upload processing error:', err);
      setErrorMsg(err.message || 'Failed to parse and upload data sheet. Please check the file structure.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setErrorMsg(null);
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
            <span>Upload Fleet Data Sheet</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Import bulk records into Firestore for drivers, cabs, and client compliance tracking.
          </p>
        </div>

        <button
          onClick={generateSampleDataSheetTemplate}
          className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-200/80 transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 text-blue-600" />
          <span>Download Excel Template</span>
        </button>
      </div>

      {/* Main Upload Card or Post-Upload Summary */}
      {!uploadResult ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Instructions Box */}
          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Required Excel File Structure</span>
            </div>
            <p className="text-blue-800 leading-relaxed">
              Your workbook should contain 4 sheets: <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">active Drivers</code>, <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">inactive Drivers</code>, <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">active Cabs</code>, and <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">inactive cabs</code>.
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-800 pl-1">
              <li>Drivers match existing Firestore records by <strong>Driver ID</strong>.</li>
              <li>Cabs match existing records by <strong>ETS Vehicle ID</strong> or <strong>Registration Number</strong>.</li>
              <li>Expiry dates in <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">DD/MM/YYYY</code> format will automatically be converted to date strings.</li>
            </ul>
          </div>

          {/* Client Assignment Selection (Step 2 Upload Scope) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Target Client Organization</span>
                </span>
                <span className="text-[10px] text-blue-600 font-semibold uppercase">
                  {isAdmin ? '(Step 2 Upload Scope)' : '(Bound Client Scope)'}
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
                  <span>🏢 {userBoundClientId || 'Bound Client'}</span>
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
                  placeholder="Client Organization Name (e.g. Apex Tech Solutions)"
                  className="bg-white border border-violet-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-500"
                />
                <input
                  type="text"
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
                  placeholder="Client ID (e.g. client-apex)"
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

          {/* Dropzone File Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
              isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : selectedFile ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              id="sheet-upload-input"
              className="hidden"
            />

            <label htmlFor="sheet-upload-input" className="cursor-pointer space-y-3 block">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                {selectedFile ? <FileCheck className="w-7 h-7 text-emerald-600" /> : <Upload className="w-7 h-7 text-blue-600" />}
              </div>

              {selectedFile ? (
                <div>
                  <p className="text-sm font-bold text-emerald-900">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to parse</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to select or drag & drop Excel (.xlsx) file
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Supports active and inactive Drivers & Cabs sheets</p>
                </div>
              )}
            </label>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-xs text-red-800 font-medium">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleProcessUpload}
              disabled={!selectedFile || isProcessing}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md ${
                !selectedFile || isProcessing
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Parsing & Updating Firestore...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Process & Upload Data Sheet</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Post-Upload Summary Screen */
        <div className="space-y-6">
          {/* Prominent Stat Cards Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">Upload Processing Completed</h3>
                  <p className="text-xs text-slate-500">
                    File <span className="font-semibold text-slate-700">{selectedFile?.name}</span> • Processed by {uploaderName}
                  </p>
                </div>
              </div>

              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
                Total Records: {uploadResult.totalRecordsProcessed}
              </span>
            </div>

            {/* Structured Breakdown Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

            {/* Formatted Text Sentence Summary as specified in prompt */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 leading-relaxed text-center">
              <span className="font-bold text-slate-900">Summary: </span>
              {uploadResult.driversAdded} drivers added, {uploadResult.driversUpdated} drivers updated, {uploadResult.cabsAdded} cabs added, {uploadResult.cabsUpdated} cabs updated.
            </div>
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
              <span>Upload Another Data Sheet</span>
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
    </div>
  );
};
