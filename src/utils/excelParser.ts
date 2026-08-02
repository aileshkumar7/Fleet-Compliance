/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { collection, getDocs, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Driver, Cab, UploadChangeRecord } from '../types';

export interface ParseError {
  sheetName: string;
  rowIndex: number;
  identifier: string;
  reason: string;
}

export interface UploadResult {
  driversAdded: number;
  driversUpdated: number;
  cabsAdded: number;
  cabsUpdated: number;
  failedRows: ParseError[];
  totalRecordsProcessed: number;
}

// Convert DD/MM/YYYY or various date formats into YYYY-MM-DD
export function parseDateValue(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    // Use local Date components to prevent UTC timezone date shifts
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Handle Excel date serial numbers
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim();
  if (!str || str === 'N/A' || str.toLowerCase() === 'null') return '';

  // Match DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Match DD/MM/YY or DD-MM-YY
  const dmyShort = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (dmyShort) {
    const day = dmyShort[1].padStart(2, '0');
    const month = dmyShort[2].padStart(2, '0');
    let year = parseInt(dmyShort[3], 10);
    year = year < 50 ? 2000 + year : 1900 + year;
    return `${year}-${month}-${day}`;
  }

  // Fallback date parsing using local components
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const y = parsedDate.getFullYear();
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

function cleanString(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function cleanNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function cleanArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim());
  const str = String(val).trim();
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function alphaNumKey(str: string): string {
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Maps normalized headers to driver field names
const DRIVER_FIELD_MAP: Record<string, keyof Driver> = {
  name: 'name',
  drivername: 'name',
  fullname: 'name',
  driverfullname: 'name',

  clientname: 'clientName',
  client: 'clientName',
  vendorname: 'clientName',
  accountname: 'clientName',

  overallcompliancestatus: 'overallComplianceStatus',
  compliancestatus: 'overallComplianceStatus',
  overallcompliance: 'overallComplianceStatus',

  city: 'city',
  offices: 'offices',
  office: 'offices',
  location: 'offices',

  driverlicensenumber: 'driverLicenseNumber',
  dlnumber: 'driverLicenseNumber',
  licensenumber: 'driverLicenseNumber',
  driverlicence: 'driverLicenseNumber',
  driverlicense: 'driverLicenseNumber',
  dlno: 'driverLicenseNumber',

  driverlicenseexpirydate: 'driverLicenseExpiryDate',
  driverlicenceexpirydate: 'driverLicenseExpiryDate',
  dlexpiry: 'driverLicenseExpiryDate',
  dlexpirydate: 'driverLicenseExpiryDate',
  licenseexpirydate: 'driverLicenseExpiryDate',
  licenceexpirydate: 'driverLicenseExpiryDate',

  driverid: 'driverId',
  driveridnumber: 'driverId',
  drivercode: 'driverId',
  driverno: 'driverId',
  drivernumber: 'driverId',
  id: 'driverId',
  empid: 'driverId',
  employeeid: 'driverId',

  inductiondate: 'inductionDate',
  dateofinduction: 'inductionDate',

  badgenumber: 'badgeNumber',
  badgeno: 'badgeNumber',
  badge: 'badgeNumber',

  badgeexpirydate: 'badgeExpiryDate',
  badgeexpiry: 'badgeExpiryDate',
  badgeexpirationdate: 'badgeExpiryDate',

  driverage: 'driverAge',
  age: 'driverAge',
  dateofbirth: 'dateOfBirth',
  dob: 'dateOfBirth',

  backgroundcheckstatus: 'backgroundCheckStatus',
  bgvstatus: 'backgroundCheckStatus',
  backgroundcheck: 'backgroundCheckStatus',
  bgv: 'backgroundCheckStatus',

  bgvexpirydate: 'bgvExpiryDate',
  bgvexpiry: 'bgvExpiryDate',
  bgvexpirationdate: 'bgvExpiryDate',
  backgroundcheckexpirydate: 'bgvExpiryDate',

  policeverificationstatus: 'policeVerificationStatus',
  pvstatus: 'policeVerificationStatus',
  policeverification: 'policeVerificationStatus',

  policeverificationexpirydate: 'policeVerificationExpiryDate',
  pvexpirydate: 'policeVerificationExpiryDate',
  pvexpiry: 'policeVerificationExpiryDate',
  policeverificationexpiry: 'policeVerificationExpiryDate',

  overallapprovalstatus: 'overallApprovalStatus',
  approvalstatus: 'overallApprovalStatus',

  phonenumbers: 'phoneNumbers',
  phone: 'phoneNumbers',
  phonenumber: 'phoneNumbers',
  mobilenumber: 'phoneNumbers',
  mobile: 'phoneNumbers',
  contactnumber: 'phoneNumbers',

  address: 'address',
  currentaddress: 'currentAddress',

  govtidtype: 'govtIdType',
  govtidnumber: 'govtIdNumber',
  govtid: 'govtIdNumber',

  medicalverificationstatus: 'medicalVerificationStatus',
  medicalstatus: 'medicalVerificationStatus',

  medicalverificationexpirydate: 'medicalVerificationExpiryDate',
  medicalexpirydate: 'medicalVerificationExpiryDate',
  medicalexpiry: 'medicalVerificationExpiryDate',
  medicalverificationexpiry: 'medicalVerificationExpiryDate',

  trainingverificationstatus: 'trainingVerificationStatus',
  trainingstatus: 'trainingVerificationStatus',

  trainingverificationexpirydate: 'trainingVerificationExpiryDate',
  trainingexpirydate: 'trainingVerificationExpiryDate',
  trainingexpiry: 'trainingVerificationExpiryDate',
  trainingverificationexpiry: 'trainingVerificationExpiryDate',

  eyetestexpirydate: 'eyeTestExpiryDate',
  eyetestexpiry: 'eyeTestExpiryDate',
  eyecheckexpirydate: 'eyeTestExpiryDate',

  status: 'status',
  driverstatus: 'status',

  inactivityreason: 'inactivityReason',
  reasonforinactivity: 'inactivityReason',
  deactivationreason: 'inactivityReason',
  reasonforinactiveness: 'inactivityReason',
  inactivenessreason: 'inactivityReason',
  reason: 'inactivityReason',

  deactivationdate: 'deactivationDate',
  profileimageurl: 'profileImageUrl',
  loudocumenturl: 'louDocumentUrl',
  comments: 'comments',
  approvedby: 'approvedBy',
  approvedtime: 'approvedTime',
  createdby: 'createdBy',
  createdtime: 'createdTime',
  updatedby: 'updatedBy',
  updatedtime: 'updatedTime',
  documentsuploaded: 'documentsUploaded',
  clientid: 'clientId',
};

// Maps normalized headers to cab field names
const CAB_FIELD_MAP: Record<string, keyof Cab> = {
  etsvehicleid: 'etsVehicleId',
  vehicleid: 'etsVehicleId',
  etsid: 'etsVehicleId',
  registrationnumber: 'registrationNumber',
  regnumber: 'registrationNumber',
  regno: 'registrationNumber',
  vehiclenumber: 'registrationNumber',
  clientname: 'clientName',
  vehicletype: 'vehicleType',
  overallcompliancestatus: 'overallComplianceStatus',
  manufacturingdate: 'manufacturingDate',
  mfgdate: 'manufacturingDate',
  registrationdate: 'registrationDate',
  regdate: 'registrationDate',
  ageyears: 'ageYears',
  vehicleage: 'ageYears',
  inductiondate: 'inductionDate',
  durationyears: 'durationYears',
  insuranceexpirydate: 'insuranceExpiryDate',
  insuranceexpiry: 'insuranceExpiryDate',
  pollutioncertificateexpirydate: 'pollutionCertificateExpiryDate',
  pucexpirydate: 'pollutionCertificateExpiryDate',
  pucdate: 'pollutionCertificateExpiryDate',
  permitexpirydate: 'permitExpiryDate',
  roadtaxexpirydate: 'roadTaxExpiryDate',
  fitnessexpirydate: 'fitnessExpiryDate',
  vehicleserviceexpirydate: 'vehicleServiceExpiryDate',
  ehs: 'ehs',
  documentsuploaded: 'documentsUploaded',
  comments: 'comments',
  overallapprovalstatus: 'overallApprovalStatus',
  fueltype: 'fuelType',
  vehicleownership: 'vehicleOwnership',
  permittype: 'permitType',
  deactivationdate: 'deactivationDate',
  otherdocuments: 'otherDocuments',
  approvedby: 'approvedBy',
  approvedtime: 'approvedTime',
  createdby: 'createdBy',
  createdtime: 'createdTime',
  updatedby: 'updatedBy',
  updatedtime: 'updatedTime',
  contractname: 'contractName',
  drivername: 'driverName',
  drivermobilenumber: 'driverMobileNumber',
  drivercompliancestatus: 'driverComplianceStatus',
  status: 'status',
  clientid: 'clientId',
};

const DRIVER_DATE_FIELDS = new Set([
  'driverLicenseExpiryDate',
  'inductionDate',
  'badgeExpiryDate',
  'bgvExpiryDate',
  'policeVerificationExpiryDate',
  'medicalVerificationExpiryDate',
  'trainingVerificationExpiryDate',
  'dateOfBirth',
  'deactivationDate',
  'eyeTestExpiryDate',
  'approvedTime',
  'createdTime',
  'updatedTime'
]);

const CAB_DATE_FIELDS = new Set([
  'manufacturingDate',
  'registrationDate',
  'inductionDate',
  'insuranceExpiryDate',
  'pollutionCertificateExpiryDate',
  'permitExpiryDate',
  'roadTaxExpiryDate',
  'fitnessExpiryDate',
  'vehicleServiceExpiryDate',
  'deactivationDate',
  'approvedTime',
  'createdTime',
  'updatedTime'
]);

export async function processDataSheetUpload(
  file: File, 
  uploadedBy: string,
  overrideClientId?: string,
  overrideClientName?: string
): Promise<UploadResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const result: UploadResult = {
    driversAdded: 0,
    driversUpdated: 0,
    cabsAdded: 0,
    cabsUpdated: 0,
    failedRows: [],
    totalRecordsProcessed: 0,
  };

  const uploadTimestamp = new Date().toISOString();
  const uploadBatchId = 'batch-' + Date.now();
  const uploadChanges: UploadChangeRecord[] = [];

  // Locate the 4 target sheets
  const sheetNames = workbook.SheetNames;
  
  const findSheet = (targetType: 'activeDriver' | 'inactiveDriver' | 'activeCab' | 'inactiveCab') => {
    return sheetNames.find(s => {
      const name = s.trim().toLowerCase();
      if (targetType === 'activeDriver') {
        return name.includes('active') && name.includes('driver') && !name.includes('inactive');
      }
      if (targetType === 'inactiveDriver') {
        return name.includes('inactive') && name.includes('driver');
      }
      if (targetType === 'activeCab') {
        return name.includes('active') && (name.includes('cab') || name.includes('vehicle')) && !name.includes('inactive');
      }
      if (targetType === 'inactiveCab') {
        return name.includes('inactive') && (name.includes('cab') || name.includes('vehicle'));
      }
      return false;
    });
  };

  const activeDriversSheetName = findSheet('activeDriver') || sheetNames.find(s => s.toLowerCase() === 'active drivers');
  const inactiveDriversSheetName = findSheet('inactiveDriver') || sheetNames.find(s => s.toLowerCase() === 'inactive drivers');
  const activeCabsSheetName = findSheet('activeCab') || sheetNames.find(s => s.toLowerCase() === 'active cabs');
  const inactiveCabsSheetName = findSheet('inactiveCab') || sheetNames.find(s => s.toLowerCase() === 'inactive cabs');

  // Fetch existing Firestore records for matching
  const existingDriversSnap = await getDocs(collection(db, 'drivers'));
  const driversMap = new Map<string, { id: string; data: any }>();
  existingDriversSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.driverId) {
      driversMap.set(String(data.driverId).trim().toLowerCase(), { id: docSnap.id, data });
    }
  });

  const existingCabsSnap = await getDocs(collection(db, 'cabs'));
  const cabsMapByEts = new Map<string, { id: string; data: any }>();
  const cabsMapByReg = new Map<string, { id: string; data: any }>();
  existingCabsSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.etsVehicleId) {
      cabsMapByEts.set(String(data.etsVehicleId).trim().toLowerCase(), { id: docSnap.id, data });
    }
    if (data.registrationNumber) {
      cabsMapByReg.set(String(data.registrationNumber).trim().toLowerCase(), { id: docSnap.id, data });
    }
  });

  const clientsToInsert = new Map<string, string>(); // clientId -> clientName

  // Helper to parse driver sheet
  const parseDriverSheet = async (sheetName: string, status: 'active' | 'inactive') => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowIndex = index + 2; // 1-indexed header + row index

      // Construct driver object
      const driverData: Partial<Driver> = {
        status,
        documentsUploaded: [],
      };

      Object.entries(row).forEach(([colHeader, val]) => {
        const key = alphaNumKey(colHeader);
        const mappedField = DRIVER_FIELD_MAP[key];

        if (mappedField) {
          if (DRIVER_DATE_FIELDS.has(mappedField)) {
            (driverData as any)[mappedField] = parseDateValue(val);
          } else if (mappedField === 'driverAge') {
            driverData.driverAge = cleanNumber(val);
          } else if (mappedField === 'documentsUploaded') {
            driverData.documentsUploaded = cleanArray(val);
          } else {
            (driverData as any)[mappedField] = cleanString(val);
          }
        }
      });

      // Validation check
      const driverId = cleanString(driverData.driverId);
      const name = cleanString(driverData.name);

      if (!driverId && !name) {
        // Skip empty or invalid row
        result.failedRows.push({
          sheetName,
          rowIndex,
          identifier: 'Row ' + rowIndex,
          reason: 'Missing Driver ID and Driver Name.',
        });
        continue;
      }

      result.totalRecordsProcessed++;

      // Enforce client ID & name overrides or fallback
      if (overrideClientId) {
        driverData.clientId = overrideClientId;
        if (overrideClientName) driverData.clientName = overrideClientName;
      }
      if (!driverData.clientId) {
        driverData.clientId = 'CL-AIRINDIA';
        if (!driverData.clientName) driverData.clientName = 'Air India T3';
      }

      // Collect client information if present
      if (driverData.clientId && driverData.clientName) {
        clientsToInsert.set(driverData.clientId, driverData.clientName);
      }

      // Check if driver exists by driverId
      const matchedKey = driverId.toLowerCase();
      const existing = matchedKey ? driversMap.get(matchedKey) : null;

      try {
        if (existing) {
          // 1. Archive previous version to sub-collection "driverHistory"
          try {
            await addDoc(collection(db, 'drivers', existing.id, 'driverHistory'), {
              ...existing.data,
              archivedAt: uploadTimestamp,
              archivedBy: uploadedBy,
              archiveReason: 'Pre-upload snapshot prior to excel sync'
            });
          } catch (histErr) {
            console.warn('Failed to archive driver history snapshot:', histErr);
          }

          // 2. Determine changes for audit trail
          const oldStatus = (existing.data.status || 'active').toLowerCase();
          const newStatus = status.toLowerCase();

          const changedKeys: string[] = [];
          Object.keys(driverData).forEach(k => {
            if (k !== 'documentsUploaded' && (driverData as any)[k] !== undefined && (driverData as any)[k] !== (existing.data as any)[k]) {
              changedKeys.push(k);
            }
          });

          if (oldStatus !== newStatus) {
            uploadChanges.push({
              recordId: existing.id,
              identifier: driverData.name || driverData.driverId || 'Driver',
              type: 'driver',
              changeType: 'status_changed',
              oldStatus,
              newStatus,
              details: `Status moved from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}`
            });
          } else if (changedKeys.length > 0) {
            uploadChanges.push({
              recordId: existing.id,
              identifier: driverData.name || driverData.driverId || 'Driver',
              type: 'driver',
              changeType: 'updated',
              details: `Updated attributes: ${changedKeys.slice(0, 4).join(', ')}${changedKeys.length > 4 ? ` (+${changedKeys.length - 4} more)` : ''}`
            });
          }

          // Update existing
          await updateDoc(doc(db, 'drivers', existing.id), {
            ...driverData,
            updatedBy: uploadedBy || 'Admin',
            updatedTime: uploadTimestamp,
            uploadBatchId,
            uploadBatchFileName: file.name,
          });
          result.driversUpdated++;
        } else {
          // Insert new driver
          const newDocRef = await addDoc(collection(db, 'drivers'), {
            name: driverData.name || '',
            clientName: driverData.clientName || '',
            overallComplianceStatus: driverData.overallComplianceStatus || 'Pending',
            city: driverData.city || '',
            offices: driverData.offices || '',
            driverLicenseNumber: driverData.driverLicenseNumber || '',
            driverLicenseExpiryDate: driverData.driverLicenseExpiryDate || '',
            driverId: driverData.driverId || `DR-${Date.now()}`,
            inductionDate: driverData.inductionDate || '',
            badgeNumber: driverData.badgeNumber || '',
            badgeExpiryDate: driverData.badgeExpiryDate || '',
            driverAge: driverData.driverAge || 0,
            backgroundCheckStatus: driverData.backgroundCheckStatus || 'Pending',
            bgvExpiryDate: driverData.bgvExpiryDate || '',
            policeVerificationStatus: driverData.policeVerificationStatus || 'Pending',
            policeVerificationExpiryDate: driverData.policeVerificationExpiryDate || '',
            overallApprovalStatus: driverData.overallApprovalStatus || 'Pending',
            phoneNumbers: driverData.phoneNumbers || '',
            address: driverData.address || '',
            currentAddress: driverData.currentAddress || '',
            govtIdType: driverData.govtIdType || '',
            govtIdNumber: driverData.govtIdNumber || '',
            medicalVerificationStatus: driverData.medicalVerificationStatus || 'Pending',
            medicalVerificationExpiryDate: driverData.medicalVerificationExpiryDate || '',
            trainingVerificationStatus: driverData.trainingVerificationStatus || 'Pending',
            trainingVerificationExpiryDate: driverData.trainingVerificationExpiryDate || '',
            comments: driverData.comments || '',
            dateOfBirth: driverData.dateOfBirth || '',
            deactivationDate: driverData.deactivationDate || '',
            profileImageUrl: driverData.profileImageUrl || '',
            louDocumentUrl: driverData.louDocumentUrl || '',
            eyeTestExpiryDate: driverData.eyeTestExpiryDate || '',
            approvedBy: driverData.approvedBy || '',
            approvedTime: driverData.approvedTime || '',
            createdBy: uploadedBy,
            createdTime: uploadTimestamp,
            updatedBy: uploadedBy,
            updatedTime: uploadTimestamp,
            documentsUploaded: driverData.documentsUploaded || [],
            status,
            clientId: driverData.clientId || '',
            uploadBatchId,
            uploadBatchFileName: file.name,
          });

          if (driverId) {
            driversMap.set(driverId.toLowerCase(), { id: newDocRef.id, data: driverData });
          }

          uploadChanges.push({
            recordId: newDocRef.id,
            identifier: driverData.name || driverData.driverId || 'New Driver',
            type: 'driver',
            changeType: 'added',
            details: `New driver added as ${status.toUpperCase()}`
          });

          result.driversAdded++;
        }
      } catch (err: any) {
        result.failedRows.push({
          sheetName,
          rowIndex,
          identifier: driverId || name || 'Row ' + rowIndex,
          reason: `Firestore error: ${err.message || err}`,
        });
      }
    }
  };

  // Helper to parse cab sheet
  const parseCabSheet = async (sheetName: string, status: 'active' | 'inactive') => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowIndex = index + 2;

      const cabData: Partial<Cab> = {
        status,
        documentsUploaded: [],
      };

      Object.entries(row).forEach(([colHeader, val]) => {
        const key = alphaNumKey(colHeader);
        const mappedField = CAB_FIELD_MAP[key];

        if (mappedField) {
          if (CAB_DATE_FIELDS.has(mappedField)) {
            (cabData as any)[mappedField] = parseDateValue(val);
          } else if (mappedField === 'ageYears' || mappedField === 'durationYears') {
            (cabData as any)[mappedField] = cleanNumber(val);
          } else if (mappedField === 'documentsUploaded') {
            cabData.documentsUploaded = cleanArray(val);
          } else {
            (cabData as any)[mappedField] = cleanString(val);
          }
        }
      });

      const etsVehicleId = cleanString(cabData.etsVehicleId);
      const registrationNumber = cleanString(cabData.registrationNumber);

      if (!etsVehicleId && !registrationNumber) {
        result.failedRows.push({
          sheetName,
          rowIndex,
          identifier: 'Row ' + rowIndex,
          reason: 'Missing both ETS Vehicle ID and Registration Number.',
        });
        continue;
      }

      result.totalRecordsProcessed++;

      // Enforce client ID & name overrides or fallback
      if (overrideClientId) {
        cabData.clientId = overrideClientId;
        if (overrideClientName) cabData.clientName = overrideClientName;
      }
      if (!cabData.clientId) {
        cabData.clientId = 'CL-AIRINDIA';
        if (!cabData.clientName) cabData.clientName = 'Air India T3';
      }

      if (cabData.clientId && cabData.clientName) {
        clientsToInsert.set(cabData.clientId, cabData.clientName);
      }

      const existingByEts = etsVehicleId ? cabsMapByEts.get(etsVehicleId.toLowerCase()) : null;
      const existingByReg = registrationNumber ? cabsMapByReg.get(registrationNumber.toLowerCase()) : null;
      const existing = existingByEts || existingByReg;

      try {
        if (existing) {
          // 1. Archive previous version to sub-collection "cabHistory"
          try {
            await addDoc(collection(db, 'cabs', existing.id, 'cabHistory'), {
              ...existing.data,
              archivedAt: uploadTimestamp,
              archivedBy: uploadedBy,
              archiveReason: 'Pre-upload snapshot prior to excel sync'
            });
          } catch (histErr) {
            console.warn('Failed to archive cab history snapshot:', histErr);
          }

          // 2. Determine changes for audit trail
          const oldStatus = (existing.data.status || 'active').toLowerCase();
          const newStatus = status.toLowerCase();

          const changedKeys: string[] = [];
          Object.keys(cabData).forEach(k => {
            if (k !== 'documentsUploaded' && (cabData as any)[k] !== undefined && (cabData as any)[k] !== (existing.data as any)[k]) {
              changedKeys.push(k);
            }
          });

          if (oldStatus !== newStatus) {
            uploadChanges.push({
              recordId: existing.id,
              identifier: cabData.registrationNumber || cabData.etsVehicleId || 'Cab',
              type: 'cab',
              changeType: 'status_changed',
              oldStatus,
              newStatus,
              details: `Status moved from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}`
            });
          } else if (changedKeys.length > 0) {
            uploadChanges.push({
              recordId: existing.id,
              identifier: cabData.registrationNumber || cabData.etsVehicleId || 'Cab',
              type: 'cab',
              changeType: 'updated',
              details: `Updated attributes: ${changedKeys.slice(0, 4).join(', ')}${changedKeys.length > 4 ? ` (+${changedKeys.length - 4} more)` : ''}`
            });
          }

          await updateDoc(doc(db, 'cabs', existing.id), {
            ...cabData,
            updatedBy: uploadedBy || 'Admin',
            updatedTime: uploadTimestamp,
            uploadBatchId,
            uploadBatchFileName: file.name,
          });
          result.cabsUpdated++;
        } else {
          const newDocRef = await addDoc(collection(db, 'cabs'), {
            etsVehicleId: cabData.etsVehicleId || '',
            registrationNumber: cabData.registrationNumber || '',
            clientName: cabData.clientName || '',
            vehicleType: cabData.vehicleType || '',
            overallComplianceStatus: cabData.overallComplianceStatus || 'Pending',
            manufacturingDate: cabData.manufacturingDate || '',
            registrationDate: cabData.registrationDate || '',
            ageYears: cabData.ageYears || 0,
            inductionDate: cabData.inductionDate || '',
            durationYears: cabData.durationYears || 0,
            insuranceExpiryDate: cabData.insuranceExpiryDate || '',
            pollutionCertificateExpiryDate: cabData.pollutionCertificateExpiryDate || '',
            permitExpiryDate: cabData.permitExpiryDate || '',
            roadTaxExpiryDate: cabData.roadTaxExpiryDate || '',
            fitnessExpiryDate: cabData.fitnessExpiryDate || '',
            vehicleServiceExpiryDate: cabData.vehicleServiceExpiryDate || '',
            ehs: cabData.ehs || '',
            documentsUploaded: cabData.documentsUploaded || [],
            comments: cabData.comments || '',
            overallApprovalStatus: cabData.overallApprovalStatus || 'Pending',
            fuelType: cabData.fuelType || '',
            vehicleOwnership: cabData.vehicleOwnership || '',
            permitType: cabData.permitType || '',
            deactivationDate: cabData.deactivationDate || '',
            otherDocuments: cabData.otherDocuments || '',
            approvedBy: cabData.approvedBy || '',
            approvedTime: cabData.approvedTime || '',
            createdBy: uploadedBy,
            createdTime: uploadTimestamp,
            updatedBy: uploadedBy,
            updatedTime: uploadTimestamp,
            contractName: cabData.contractName || '',
            driverName: cabData.driverName || '',
            driverMobileNumber: cabData.driverMobileNumber || '',
            driverComplianceStatus: cabData.driverComplianceStatus || 'Pending',
            status,
            clientId: cabData.clientId || '',
            uploadBatchId,
            uploadBatchFileName: file.name,
          });

          if (etsVehicleId) cabsMapByEts.set(etsVehicleId.toLowerCase(), { id: newDocRef.id, data: cabData });
          if (registrationNumber) cabsMapByReg.set(registrationNumber.toLowerCase(), { id: newDocRef.id, data: cabData });

          uploadChanges.push({
            recordId: newDocRef.id,
            identifier: cabData.registrationNumber || cabData.etsVehicleId || 'New Cab',
            type: 'cab',
            changeType: 'added',
            details: `New cab added as ${status.toUpperCase()}`
          });

          result.cabsAdded++;
        }
      } catch (err: any) {
        result.failedRows.push({
          sheetName,
          rowIndex,
          identifier: etsVehicleId || registrationNumber || 'Row ' + rowIndex,
          reason: `Firestore error: ${err.message || err}`,
        });
      }
    }
  };

  // Process all 4 sheets if present
  if (activeDriversSheetName) await parseDriverSheet(activeDriversSheetName, 'active');
  if (inactiveDriversSheetName) await parseDriverSheet(inactiveDriversSheetName, 'inactive');
  if (activeCabsSheetName) await parseCabSheet(activeCabsSheetName, 'active');
  if (inactiveCabsSheetName) await parseCabSheet(inactiveCabsSheetName, 'inactive');

  // Insert/Sync Clients collection if any new client IDs were discovered
  if (clientsToInsert.size > 0) {
    try {
      const existingClientsSnap = await getDocs(collection(db, 'clients'));
      const existingClientIds = new Set<string>();
      existingClientsSnap.forEach(docSnap => {
        const c = docSnap.data();
        if (c.clientId) existingClientIds.add(String(c.clientId).trim());
      });

      for (const [clientId, clientName] of clientsToInsert.entries()) {
        if (!existingClientIds.has(clientId)) {
          await addDoc(collection(db, 'clients'), { clientId, clientName });
        }
      }
    } catch (e) {
      console.warn('Error syncing clients collection:', e);
    }
  }

  // Write entry to uploadLogs
  try {
    await addDoc(collection(db, 'uploadLogs'), {
      batchId: uploadBatchId,
      fileName: file.name,
      uploadedBy,
      uploadedAt: uploadTimestamp,
      recordCounts: result.totalRecordsProcessed,
      details: {
        driversAdded: result.driversAdded,
        driversUpdated: result.driversUpdated,
        cabsAdded: result.cabsAdded,
        cabsUpdated: result.cabsUpdated,
        failedRowsCount: result.failedRows.length,
      },
      changes: uploadChanges
    });
  } catch (logErr) {
    console.error('Failed to save upload log:', logErr);
  }

  return result;
}

/**
 * Utility to generate a template Excel spreadsheet with all 4 sheets
 */
export function generateSampleDataSheetTemplate() {
  const wb = XLSX.utils.book_new();

  const driverHeaders = [
    'driverId', 'name', 'clientName', 'clientId', 'overallComplianceStatus', 'city', 'offices',
    'driverLicenseNumber', 'driverLicenseExpiryDate', 'inductionDate', 'badgeNumber', 'badgeExpiryDate',
    'driverAge', 'backgroundCheckStatus', 'bgvExpiryDate', 'policeVerificationStatus',
    'policeVerificationExpiryDate', 'overallApprovalStatus', 'phoneNumbers', 'address', 'currentAddress',
    'govtIdType', 'govtIdNumber', 'medicalVerificationStatus', 'medicalVerificationExpiryDate',
    'trainingVerificationStatus', 'trainingVerificationExpiryDate', 'comments', 'dateOfBirth',
    'deactivationDate', 'profileImageUrl', 'louDocumentUrl', 'eyeTestExpiryDate', 'approvedBy'
  ];

  const cabHeaders = [
    'etsVehicleId', 'registrationNumber', 'clientName', 'clientId', 'vehicleType', 'overallComplianceStatus',
    'manufacturingDate', 'registrationDate', 'ageYears', 'inductionDate', 'durationYears',
    'insuranceExpiryDate', 'pollutionCertificateExpiryDate', 'permitExpiryDate', 'roadTaxExpiryDate',
    'fitnessExpiryDate', 'vehicleServiceExpiryDate', 'ehs', 'comments', 'overallApprovalStatus',
    'fuelType', 'vehicleOwnership', 'permitType', 'contractName', 'driverName', 'driverMobileNumber', 'driverComplianceStatus'
  ];

  const sampleActiveDrivers = [
    {
      driverId: 'DR-101',
      name: 'Rajesh Kumar',
      clientName: 'Air India T3',
      clientId: 'CL-AIRINDIA',
      overallComplianceStatus: 'Compliant',
      city: 'Bangalore',
      offices: 'ECity Phase 1',
      driverLicenseNumber: 'KA-01-2020-0098231',
      driverLicenseExpiryDate: '25/10/2028',
      inductionDate: '15/01/2022',
      badgeNumber: 'BDG-8812',
      badgeExpiryDate: '15/01/2026',
      driverAge: 34,
      backgroundCheckStatus: 'Verified',
      bgvExpiryDate: '10/05/2027',
      policeVerificationStatus: 'Verified',
      policeVerificationExpiryDate: '12/08/2027',
      overallApprovalStatus: 'Approved',
      phoneNumbers: '+91 9876543210',
      address: '12th Main Road, Indiranagar, Bangalore',
      currentAddress: '12th Main Road, Indiranagar, Bangalore',
      govtIdType: 'Aadhaar',
      govtIdNumber: '4589-1234-9901',
      medicalVerificationStatus: 'Passed',
      medicalVerificationExpiryDate: '01/04/2026',
      trainingVerificationStatus: 'Completed',
      trainingVerificationExpiryDate: '15/01/2026',
      comments: 'Regular fleet driver',
      dateOfBirth: '14/06/1990',
      deactivationDate: '',
      profileImageUrl: '',
      louDocumentUrl: '',
      eyeTestExpiryDate: '01/04/2026',
      approvedBy: 'Fleet Admin',
    }
  ];

  const sampleInactiveDrivers = [
    {
      driverId: 'DR-902',
      name: 'Suresh Patil',
      clientName: 'Air India T3',
      clientId: 'CL-AIRINDIA',
      overallComplianceStatus: 'Non-Compliant',
      city: 'Bangalore',
      offices: 'Whitefield',
      driverLicenseNumber: 'KA-02-2018-0012903',
      driverLicenseExpiryDate: '10/02/2024',
      inductionDate: '01/03/2020',
      badgeNumber: 'BDG-4410',
      badgeExpiryDate: '01/03/2024',
      driverAge: 42,
      backgroundCheckStatus: 'Expired',
      bgvExpiryDate: '01/01/2024',
      policeVerificationStatus: 'Pending',
      policeVerificationExpiryDate: '01/01/2024',
      overallApprovalStatus: 'Deactivated',
      phoneNumbers: '+91 9876512345',
      address: '8th Cross, Whitefield, Bangalore',
      currentAddress: '8th Cross, Whitefield, Bangalore',
      govtIdType: 'PAN',
      govtIdNumber: 'ABCDE1234F',
      medicalVerificationStatus: 'Expired',
      medicalVerificationExpiryDate: '01/01/2024',
      trainingVerificationStatus: 'Pending',
      trainingVerificationExpiryDate: '01/01/2024',
      comments: 'License expired, pending renewal',
      dateOfBirth: '20/11/1982',
      deactivationDate: '15/02/2024',
      profileImageUrl: '',
      louDocumentUrl: '',
      eyeTestExpiryDate: '01/01/2024',
      approvedBy: 'Fleet Supervisor',
    }
  ];

  const sampleActiveCabs = [
    {
      etsVehicleId: 'CAB-2001',
      registrationNumber: 'KA-01-MJ-4521',
      clientName: 'Air India T3',
      clientId: 'CL-AIRINDIA',
      vehicleType: 'Sedan (Dzire)',
      overallComplianceStatus: 'Compliant',
      manufacturingDate: '10/05/2021',
      registrationDate: '01/06/2021',
      ageYears: 3,
      inductionDate: '15/06/2021',
      durationYears: 3,
      insuranceExpiryDate: '15/06/2026',
      pollutionCertificateExpiryDate: '20/12/2026',
      permitExpiryDate: '01/06/2026',
      roadTaxExpiryDate: '01/06/2026',
      fitnessExpiryDate: '01/06/2026',
      vehicleServiceExpiryDate: '10/11/2025',
      ehs: 'Compliant',
      comments: 'GPS fitted, speed governor active',
      overallApprovalStatus: 'Approved',
      fuelType: 'CNG / Petrol',
      vehicleOwnership: 'Vendor Owned',
      permitType: 'State Tourist Permit',
      contractName: 'IT Transport Contract',
      driverName: 'Rajesh Kumar',
      driverMobileNumber: '+91 9876543210',
      driverComplianceStatus: 'Compliant',
    }
  ];

  const sampleInactiveCabs = [
    {
      etsVehicleId: 'CAB-9901',
      registrationNumber: 'KA-05-MH-8812',
      clientName: 'Air India T3',
      clientId: 'CL-AIRINDIA',
      vehicleType: 'SUV (Ertiga)',
      overallComplianceStatus: 'Non-Compliant',
      manufacturingDate: '01/01/2016',
      registrationDate: '15/01/2016',
      ageYears: 8,
      inductionDate: '01/02/2016',
      durationYears: 8,
      insuranceExpiryDate: '10/01/2024',
      pollutionCertificateExpiryDate: '05/01/2024',
      permitExpiryDate: '15/01/2024',
      roadTaxExpiryDate: '15/01/2024',
      fitnessExpiryDate: '15/01/2024',
      vehicleServiceExpiryDate: '01/01/2024',
      ehs: 'Non-Compliant',
      comments: 'Age exceeded limit, decommissioned',
      overallApprovalStatus: 'Deactivated',
      fuelType: 'Diesel',
      vehicleOwnership: 'Vendor Owned',
      permitType: 'National Permit',
      contractName: 'Retail Supply Chain',
      driverName: 'Unassigned',
      driverMobileNumber: '',
      driverComplianceStatus: 'N/A',
    }
  ];

  const wsActiveDrivers = XLSX.utils.json_to_sheet(sampleActiveDrivers, { header: driverHeaders });
  const wsInactiveDrivers = XLSX.utils.json_to_sheet(sampleInactiveDrivers, { header: driverHeaders });
  const wsActiveCabs = XLSX.utils.json_to_sheet(sampleActiveCabs, { header: cabHeaders });
  const wsInactiveCabs = XLSX.utils.json_to_sheet(sampleInactiveCabs, { header: cabHeaders });

  XLSX.utils.book_append_sheet(wb, wsActiveDrivers, 'active Drivers');
  XLSX.utils.book_append_sheet(wb, wsInactiveDrivers, 'inactive Drivers');
  XLSX.utils.book_append_sheet(wb, wsActiveCabs, 'active Cabs');
  XLSX.utils.book_append_sheet(wb, wsInactiveCabs, 'inactive cabs');

  XLSX.writeFile(wb, 'Fleet_Compliance_Data_Sheet_Template.xlsx');
}
