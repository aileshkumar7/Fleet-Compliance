/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Cab, Driver } from '../types';
import { getDocumentStatus, isBgvExemptedByPoliceVerification } from '../utils/expiryEngine';
import { exportRecordExcelReport } from '../utils/reportGenerator';
import { getDriverCabNumber, getCabAssignedDriver, getCabAssignedDrivers } from '../utils/cabDriverUtils';
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
  FileSpreadsheet,
  Users
} from 'lucide-react';

interface RecordDetailViewProps {
  record: Cab | Driver;
  type: 'cab' | 'driver';
  onBack: () => void;
  cabs?: Cab[];
  drivers?: Driver[];
}

export const RecordDetailView: React.FC<RecordDetailViewProps> = ({ record, type, onBack, cabs = [], drivers = [] }) => {
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
      await exportRecordExcelReport(record, type, uName, cabs, drivers);
    } catch (err: any) {
      console.error('Failed to export Excel:', err);
      alert('Failed to export Excel: ' + err.message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  if (type === 'cab') {
    const cab = record as Cab;
    const assignedInfo = getCabAssignedDrivers(cab, drivers);
    const primaryDriver = assignedInfo.primary;
    const secondaryDriver = assignedInfo.secondary;
    const resolvedDriverName = assignedInfo.primaryResolvedName;
    const resolvedDriverPhone = assignedInfo.primaryResolvedPhone;
    const resolvedDriverCompliance = (cab.driverComplianceStatus && cab.driverComplianceStatus !== 'NA')
      ? cab.driverComplianceStatus
      : (primaryDriver?.overallComplianceStatus || 'N/A');

    const resolvedSecDriverName = assignedInfo.secondaryResolvedName;
    const resolvedSecDriverPhone = assignedInfo.secondaryResolvedPhone;
    const resolvedSecDriverCompliance = (cab.secondDriverComplianceStatus && cab.secondDriverComplianceStatus !== 'NA')
      ? cab.secondDriverComplianceStatus
      : (secondaryDriver?.overallComplianceStatus || 'N/A');

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

        {/* SECTION 3: DRIVERS ASSIGNED (DUAL DRIVER SUPPORT) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">3. Assigned Drivers & Document Expiries</h3>
            </div>
            {assignedInfo.isDoubleDriver ? (
              <span className="inline-flex items-center gap-1.5 bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>Double Driver Assigned</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium px-3 py-1 rounded-full">
                <span>Single Driver Cab</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Driver 1 (Primary Driver) Card */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    1
                  </span>
                  <span className="font-bold text-slate-900 text-sm">Driver 1 (Primary)</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                  (resolvedDriverCompliance || '').toLowerCase().includes('compliant')
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {resolvedDriverCompliance}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Name</span>
                  <span className="font-bold text-slate-900 text-sm">{resolvedDriverName}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Mobile Number</span>
                  <span className="font-mono font-semibold text-slate-800">{resolvedDriverPhone || 'N/A'}</span>
                </div>

                {primaryDriver && (
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Driving License (DL)</span>
                    <span className="font-mono font-semibold text-slate-800">{primaryDriver.driverLicenseNumber || 'N/A'}</span>
                  </div>
                )}
              </div>

              {/* Driver 1 Document Expiries */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Driver 1 Expiry Checklist
                </span>

                {primaryDriver ? (
                  <div className="space-y-1.5 text-xs">
                    {[
                      { name: 'Driver License', expiry: primaryDriver.driverLicenseExpiryDate },
                      ...(isBgvExemptedByPoliceVerification(primaryDriver) ? [] : [{ name: 'BGV', expiry: primaryDriver.bgvExpiryDate }]),
                      { name: 'Police Verification', expiry: primaryDriver.policeVerificationExpiryDate },
                      { name: 'Medical Verification', expiry: primaryDriver.medicalVerificationExpiryDate },
                      { name: 'Eye Test', expiry: primaryDriver.eyeTestExpiryDate },
                    ].map((d, dIdx) => {
                      const docAudit = getDocumentStatus(d.name, d.expiry);
                      return (
                        <div key={dIdx} className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-slate-800 block">{d.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">Exp: {d.expiry || 'N/A'}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                            docAudit.status === 'expired'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : docAudit.status === 'expiring_soon'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {docAudit.status === 'expired' ? 'Expired' : docAudit.status === 'expiring_soon' ? 'Expiring Soon' : 'Valid'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-100/80 rounded-xl text-slate-500 text-xs italic">
                    Driver document records can be updated via the Drivers sheet upload.
                  </div>
                )}
              </div>
            </div>

            {/* Driver 2 (Co-Driver / Second Driver) Card */}
            <div className={`rounded-2xl p-4 border space-y-4 ${
              assignedInfo.isDoubleDriver ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-50/60 border-slate-200 border-dashed'
            }`}>
              <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                    2
                  </span>
                  <span className="font-bold text-slate-900 text-sm">Driver 2 (Co-Driver)</span>
                </div>
                {assignedInfo.isDoubleDriver && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                    (resolvedSecDriverCompliance || '').toLowerCase().includes('compliant')
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {resolvedSecDriverCompliance || 'Compliant'}
                  </span>
                )}
              </div>

              {assignedInfo.isDoubleDriver ? (
                <>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Name</span>
                      <span className="font-bold text-slate-900 text-sm">{resolvedSecDriverName || 'Co-Driver'}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Mobile Number</span>
                      <span className="font-mono font-semibold text-slate-800">{resolvedSecDriverPhone || 'N/A'}</span>
                    </div>

                    {secondaryDriver && (
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Driving License (DL)</span>
                        <span className="font-mono font-semibold text-slate-800">{secondaryDriver.driverLicenseNumber || 'N/A'}</span>
                      </div>
                    )}
                  </div>

                  {/* Driver 2 Document Expiries */}
                  <div className="pt-2 border-t border-purple-200/60 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Driver 2 Expiry Checklist
                    </span>

                    {secondaryDriver ? (
                      <div className="space-y-1.5 text-xs">
                        {[
                          { name: 'Driver License', expiry: secondaryDriver.driverLicenseExpiryDate },
                          ...(isBgvExemptedByPoliceVerification(secondaryDriver) ? [] : [{ name: 'BGV', expiry: secondaryDriver.bgvExpiryDate }]),
                          { name: 'Police Verification', expiry: secondaryDriver.policeVerificationExpiryDate },
                          { name: 'Medical Verification', expiry: secondaryDriver.medicalVerificationExpiryDate },
                          { name: 'Eye Test', expiry: secondaryDriver.eyeTestExpiryDate },
                        ].map((d, dIdx) => {
                          const docAudit = getDocumentStatus(d.name, d.expiry);
                          return (
                            <div key={dIdx} className="bg-white p-2.5 rounded-xl border border-purple-100 flex items-center justify-between gap-2 shadow-2xs">
                              <div>
                                <span className="font-semibold text-slate-800 block">{d.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">Exp: {d.expiry || 'N/A'}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                                docAudit.status === 'expired'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                  : docAudit.status === 'expiring_soon'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}>
                                {docAudit.status === 'expired' ? 'Expired' : docAudit.status === 'expiring_soon' ? 'Expiring Soon' : 'Valid'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-purple-100/60 rounded-xl text-purple-900 text-xs">
                        Co-Driver linked by mobile / name. Full compliance document history can be populated via Driver sheet sync.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-center space-y-2">
                  <User className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-600 text-xs">No Co-Driver Assigned</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    If this vehicle runs dual shifts, assign a second driver by adding secondary driver details in Excel or assigning this cab registration in the drivers roster.
                  </p>
                </div>
              )}
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

    // Compliance Documents for Driver (4 Verification Checks)
    const driverComplianceDocs = [
      { name: 'Driver License', number: driver.driverLicenseNumber, expiry: driver.driverLicenseExpiryDate },
      { name: 'BGV (Background Check)', number: driver.backgroundCheckStatus, expiry: driver.bgvExpiryDate },
      { name: 'Police Verification', number: driver.policeVerificationStatus, expiry: driver.policeVerificationExpiryDate },
      { name: 'Medical Verification', number: driver.medicalVerificationStatus, expiry: driver.medicalVerificationExpiryDate },
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
                <span className="bg-blue-600/30 text-blue-300 font-mono text-xs px-2.5 py-0.5 rounded-md border border-blue-500/40 font-bold flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-blue-400" />
                  <span>Cab: {getDriverCabNumber(driver, cabs)}</span>
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
                <li>Verify renewed document copy (DL, Police Verification [supersedes BGV when date & certificate are present], Medical, or Eye Test).</li>
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
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">2. Compliance Documents & Verification Checklist</h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              Driver Compliance Checklist
            </span>
          </div>

          {/* Checklist Rule Callout */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-950">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-blue-900">Checklist Rule Applied: </span>
              <span>If Police Verification Date is mentioned and certificate is uploaded, please don't consider the BGV Date and certificate.</span>
            </div>
          </div>

          <div className="space-y-3.5">
            {driverComplianceDocs.map((doc, idx) => {
              const isBgv = doc.name.includes('BGV');
              const bgvExempted = isBgv && isBgvExemptedByPoliceVerification(driver);
              const audit = getDocumentStatus(doc.name, doc.expiry);

              return (
                <div key={idx} className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  bgvExempted 
                    ? 'bg-slate-50/60 border-slate-200/80' 
                    : 'bg-slate-50 border-slate-100'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                        {doc.name}
                      </label>
                      {bgvExempted && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                          Bypassed (PV Active)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mb-0.5">
                      Doc Ref/Status: <span className="font-semibold text-slate-800">{doc.number || 'N/A'}</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-slate-900">
                      Expiry Date: <span className="text-slate-700">{doc.expiry || 'N/A'}</span>
                    </div>
                    {bgvExempted && (
                      <p className="text-[11px] text-blue-700 font-medium mt-1">
                        ✓ Exempted by checklist rule: Police Verification Date and certificate are provided. BGV is not considered.
                      </p>
                    )}
                  </div>

                  {/* Color-coded status badge */}
                  <div className="shrink-0">
                    {bgvExempted ? (
                      <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-blue-600" />
                        <span>Bypassed by Police Verification</span>
                      </span>
                    ) : audit.status === 'expired' ? (
                      <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                        <span>Expired: {audit.message}</span>
                      </span>
                    ) : audit.status === 'expiring_soon' ? (
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>Expiring Soon: {audit.message}</span>
                      </span>
                    ) : (
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
