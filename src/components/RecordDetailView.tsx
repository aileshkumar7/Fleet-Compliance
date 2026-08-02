/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Cab, Driver } from '../types';
import { getDocumentStatus } from '../utils/expiryEngine';
import { exportRecordExcelReport } from '../utils/reportGenerator';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, 
  Truck, 
  User, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  Building2, 
  CheckCircle2, 
  FileText, 
  Calendar,
  Phone,
  MapPin,
  Fuel,
  Info,
  Download,
  FileSpreadsheet
} from 'lucide-react';

interface RecordDetailViewProps {
  record: Cab | Driver;
  type: 'cab' | 'driver';
  onBack: () => void;
}

export const RecordDetailView: React.FC<RecordDetailViewProps> = ({ record, type, onBack }) => {
  const { userProfile, isAdmin } = useAuth();
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Rule 2: RESTRICTED DATA VIEW - Access Denied check for direct navigation
  const userClientKeys = Array.from(new Set([
    userProfile?.clientId,
    ...(userProfile?.assignedClientIds || [])
  ].filter(Boolean).map(s => String(s).trim().toLowerCase())));

  const isAllClients = isAdmin || userClientKeys.includes('all');

  const recCId = (record.clientId || '').trim().toLowerCase();
  const recCName = (record.clientName || '').trim().toLowerCase();

  const isUnauthorized = !isAdmin && !isAllClients && userClientKeys.length > 0 && recCId && (
    !userClientKeys.some(k => k === recCId || k === recCName)
  );

  const userClientIdDisplay = userClientKeys.join(', ') || 'Bound Client';

  if (isUnauthorized) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 p-8 text-center space-y-4 shadow-xl">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">Access Denied</h3>
          <p className="text-xs text-slate-500 mt-1">Direct access blocked by Client Organization Data Isolation policy.</p>
        </div>
        <p className="text-xs text-slate-600 max-w-md mx-auto bg-rose-50/70 p-3 rounded-xl border border-rose-100 font-medium">
          Your account is bound exclusively to client organization <span className="font-bold text-blue-700 font-mono">{userClientIdDisplay}</span>. You cannot view compliance profiles belonging to other clients.
        </p>
        <div className="pt-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Allowed Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  const handleDownloadExcel = async () => {
    setIsExportingExcel(true);
    try {
      const uName = userProfile?.email || userProfile?.name || 'Admin User';
      await exportRecordExcelReport(record, type, uName);
    } catch (err: any) {
      console.error('Failed to export Excel:', err);
      alert('Failed to export Excel: ' + err.message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  if (type === 'cab') {
    const cab = record as Cab;

    // Compliance Documents for Cab
    const cabComplianceDocs = [
      { name: 'Insurance', expiry: cab.insuranceExpiryDate },
      { name: 'PUC / Pollution Certificate', expiry: cab.pollutionCertificateExpiryDate },
      { name: 'Permit', expiry: cab.permitExpiryDate },
      { name: 'Road Tax', expiry: cab.roadTaxExpiryDate },
      { name: 'Fitness Certificate', expiry: cab.fitnessExpiryDate },
    ];

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button & Top Action */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isExportingExcel ? 'animate-bounce' : ''}`} />
              <span>{isExportingExcel ? 'Exporting Excel...' : 'Download Record as Excel'}</span>
            </button>

            <span className="text-xs font-mono font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 hidden sm:inline-block">
              Cab Record Detail View
            </span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-2xl">
              <Truck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black font-mono tracking-tight">{cab.registrationNumber || 'N/A'}</h2>
                <span className="bg-slate-800 text-slate-300 font-mono text-xs px-2.5 py-0.5 rounded-md border border-slate-700">
                  ETS ID: {cab.etsVehicleId || 'N/A'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {cab.vehicleType || 'Standard Fleet Vehicle'} • {cab.clientName || 'General Fleet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
              (cab.status || '').toLowerCase() === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              <ShieldCheck className="w-4 h-4" />
              <span>Status: {cab.status || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* SECTION 1: VEHICLE INFO */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Truck className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">1. Vehicle Info</h3>
          </div>

          <div className="space-y-3.5">
            {/* ETS Vehicle ID */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                ETS Vehicle ID
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">{cab.etsVehicleId || 'N/A'}</div>
            </div>

            {/* Registration Number */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Registration Number
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">{cab.registrationNumber || 'N/A'}</div>
            </div>

            {/* Vehicle Type */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Vehicle Type
              </label>
              <div className="text-sm font-semibold text-slate-900">{cab.vehicleType || 'N/A'}</div>
            </div>

            {/* Fuel Type */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Fuel Type
              </label>
              <div className="text-sm font-semibold text-slate-900">{cab.fuelType || 'N/A'}</div>
            </div>

            {/* Vehicle Ownership */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Vehicle Ownership
              </label>
              <div className="text-sm font-semibold text-slate-900">{cab.vehicleOwnership || 'N/A'}</div>
            </div>

            {/* Manufacturing / Registration Date */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Manufacturing & Registration Date
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">
                Mfg: {cab.manufacturingDate || 'N/A'} | Reg: {cab.registrationDate || 'N/A'}
              </div>
            </div>

            {/* Age */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Vehicle Age
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {cab.ageYears !== undefined && cab.ageYears !== null ? `${cab.ageYears} Years` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: COMPLIANCE DOCUMENTS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">2. Compliance Documents</h3>
          </div>

          <div className="space-y-3.5">
            {cabComplianceDocs.map((doc, idx) => {
              const audit = getDocumentStatus(doc.name, doc.expiry);
              return (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      {doc.name}
                    </label>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      Expiry Date: <span className="text-slate-700">{doc.expiry || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Color-coded status badge */}
                  <div className="shrink-0">
                    {audit.status === 'expired' && (
                      <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                        <span>Expired: {audit.message}</span>
                      </span>
                    )}

                    {audit.status === 'expiring_soon' && (
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Expiring Soon: {audit.message}</span>
                      </span>
                    )}

                    {audit.status === 'valid' && (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Valid ({audit.message})</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: DRIVER ASSIGNED */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">3. Driver Assigned</h3>
          </div>

          <div className="space-y-3.5">
            {/* Driver Name */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Driver Name
              </label>
              <div className="text-sm font-semibold text-slate-900">{cab.driverName || 'Unassigned'}</div>
            </div>

            {/* Driver Mobile Number */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Driver Mobile Number
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">{cab.driverMobileNumber || 'N/A'}</div>
            </div>

            {/* Driver Compliance Status */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Driver Compliance Status
              </label>
              <div className="text-sm font-semibold text-slate-900">{cab.driverComplianceStatus || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* SECTION 4: ADMIN INFO */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">4. Admin Info</h3>
          </div>

          <div className="space-y-3.5">
            {/* Approved By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Approved By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {cab.approvedBy || 'System Admin'} {cab.approvedTime ? `(${cab.approvedTime})` : ''}
              </div>
            </div>

            {/* Created By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Created By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {cab.createdBy || 'Excel Data Sync'} {cab.createdTime ? `(${cab.createdTime})` : ''}
              </div>
            </div>

            {/* Updated By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Updated By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {cab.updatedBy || 'N/A'} {cab.updatedTime ? `(${cab.updatedTime})` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    const driver = record as Driver;

    // Compliance Documents for Driver
    const driverComplianceDocs = [
      { name: 'Driver License', number: driver.driverLicenseNumber, expiry: driver.driverLicenseExpiryDate },
      { name: 'Badge', number: driver.badgeNumber, expiry: driver.badgeExpiryDate },
      { name: 'BGV (Background Check)', number: driver.backgroundCheckStatus, expiry: driver.bgvExpiryDate },
      { name: 'Police Verification', number: driver.policeVerificationStatus, expiry: driver.policeVerificationExpiryDate },
      { name: 'Medical Verification', number: driver.medicalVerificationStatus, expiry: driver.medicalVerificationExpiryDate },
      { name: 'Training Verification', number: driver.trainingVerificationStatus, expiry: driver.trainingVerificationExpiryDate },
      { name: 'Eye Test', number: 'Eye Check Record', expiry: driver.eyeTestExpiryDate },
    ];

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button & Top Action */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadExcel}
              disabled={isExportingExcel}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isExportingExcel ? 'animate-bounce' : ''}`} />
              <span>{isExportingExcel ? 'Exporting Excel...' : 'Download Record as Excel'}</span>
            </button>

            <span className="text-xs font-mono font-semibold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200 hidden sm:inline-block">
              Driver Record Detail View
            </span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-2xl">
              <User className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight">{driver.name || 'N/A'}</h2>
                <span className="bg-slate-800 text-slate-300 font-mono text-xs px-2.5 py-0.5 rounded-md border border-slate-700">
                  ID: {driver.driverId || 'N/A'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Client: {driver.clientName || 'General Fleet'} • City: {driver.city || 'Bangalore'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
              (driver.status || '').toLowerCase() === 'active'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}>
              <ShieldCheck className="w-4 h-4" />
              <span>Status: {driver.status || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Inactiveness Reason & Action to Rectify Callout */}
        {(driver.status || '').toLowerCase() === 'inactive' && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 space-y-3 shadow-md">
            <div className="flex items-center gap-2.5 text-amber-900 font-extrabold text-base">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
              <span>Inactive Driver Status & Rectification Action Required</span>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-amber-200 space-y-2 text-xs">
              <div>
                <span className="font-bold text-amber-900 uppercase tracking-wider text-[11px] block">Reason for Inactiveness:</span>
                <p className="text-slate-800 font-semibold mt-0.5 text-sm">
                  {driver.inactivityReason || driver.comments || 'Deactivated due to non-compliant verification status or document expiry.'}
                </p>
              </div>

              {driver.deactivationDate && (
                <div>
                  <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px]">Deactivation Date:</span>
                  <span className="font-mono text-slate-700 ml-2 font-bold">{driver.deactivationDate}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-100/70 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium space-y-1">
              <p className="font-bold text-amber-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-amber-700" />
                <span>Recommended Rectification Steps to Re-activate:</span>
              </p>
              <ul className="list-disc list-inside pl-1 space-y-1 text-slate-800">
                <li>Verify renewed document copy (DL, BGV, Police Verification, Medical, or Eye Test).</li>
                <li>Upload fresh compliance certificate via the Excel Upload or Document Portal.</li>
                <li>Submit record to Fleet Operations Admin to switch status back to <span className="font-bold text-emerald-700 font-mono">ACTIVE</span>.</li>
              </ul>
            </div>
          </div>
        )}

        {/* SECTION 1: PERSONAL INFO */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">1. Personal Info</h3>
          </div>

          <div className="space-y-3.5">
            {/* Name */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Full Name
              </label>
              <div className="text-sm font-semibold text-slate-900">{driver.name || 'N/A'}</div>
            </div>

            {/* Date of Birth */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Date of Birth (DOB)
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">{driver.dateOfBirth || 'N/A'}</div>
            </div>

            {/* Driver Age */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Age
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {driver.driverAge ? `${driver.driverAge} Years` : 'N/A'}
              </div>
            </div>

            {/* Phone */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Phone Number
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">{driver.phoneNumbers || 'N/A'}</div>
            </div>

            {/* Permanent Address */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Permanent Address
              </label>
              <div className="text-sm font-medium text-slate-900">{driver.address || 'N/A'}</div>
            </div>

            {/* Current Address */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Current Address
              </label>
              <div className="text-sm font-medium text-slate-900">{driver.currentAddress || 'N/A'}</div>
            </div>

            {/* Govt ID */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Govt ID (Type & Number)
              </label>
              <div className="text-sm font-semibold font-mono text-slate-900">
                {driver.govtIdType || 'Aadhaar / ID'}: {driver.govtIdNumber || 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: COMPLIANCE DOCUMENTS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">2. Compliance Documents</h3>
          </div>

          <div className="space-y-3.5">
            {driverComplianceDocs.map((doc, idx) => {
              const audit = getDocumentStatus(doc.name, doc.expiry);
              return (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      {doc.name}
                    </label>
                    <div className="text-xs text-slate-600 mb-0.5">
                      Doc Ref/Status: <span className="font-semibold text-slate-800">{doc.number || 'N/A'}</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      Expiry Date: <span className="text-slate-700">{doc.expiry || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Color-coded status badge */}
                  <div className="shrink-0">
                    {audit.status === 'expired' && (
                      <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                        <span>Expired: {audit.message}</span>
                      </span>
                    )}

                    {audit.status === 'expiring_soon' && (
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Expiring Soon: {audit.message}</span>
                      </span>
                    )}

                    {audit.status === 'valid' && (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Valid ({audit.message})</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 3: ADMIN INFO */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Info className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">3. Admin Info</h3>
          </div>

          <div className="space-y-3.5">
            {/* Approved By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Approved By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {driver.approvedBy || 'System Admin'} {driver.approvedTime ? `(${driver.approvedTime})` : ''}
              </div>
            </div>

            {/* Created By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Created By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {driver.createdBy || 'Excel Data Sync'} {driver.createdTime ? `(${driver.createdTime})` : ''}
              </div>
            </div>

            {/* Updated By & Time */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Updated By & Timestamp
              </label>
              <div className="text-sm font-semibold text-slate-900">
                {driver.updatedBy || 'N/A'} {driver.updatedTime ? `(${driver.updatedTime})` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
};
