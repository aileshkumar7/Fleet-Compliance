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
    // SheetJS cellDates creates UTC Date objects. Use UTC getters to preserve exact calendar date
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
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
  if (!str) return '';
  const lowerStr = str.toLowerCase();
  if (['n/a', 'na', 'null', 'none', 'nil', '-', 'pending', 'expired'].includes(lowerStr)) {
    return '';
  }

  // Match DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD, YYYY/MM/DD, or YYYY.MM.DD
  const ymd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2].padStart(2, '0');
    const day = ymd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Match DD-MMM-YYYY or DD MMM YYYY (e.g., 25-Oct-2028 or 25 Oct 2028)
  const dMmmY = str.match(/^(\d{1,2})[\s\/\-\.]([a-zA-Z]{3,9})[\s\/\-\.](\d{4})$/);
  if (dMmmY) {
    const day = dMmmY[1].padStart(2, '0');
    const monthStr = dMmmY[2].substring(0, 3).toLowerCase();
    const year = dMmmY[3];
    const monthsMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    if (monthsMap[monthStr]) {
      return `${year}-${monthsMap[monthStr]}-${day}`;
    }
  }

  // Fallback date parsing with local date normalization
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
  nameofdriver: 'name',
  fullname: 'name',
  driverfullname: 'name',
  driver: 'name',
  driversname: 'name',
  drivernameinbank: 'name',
  drivernameasondl: 'name',

  driverid: 'driverId',
  id: 'driverId',
  empid: 'driverId',
  employeeid: 'driverId',
  empcode: 'driverId',
  employeecode: 'driverId',
  drivercode: 'driverId',
  code: 'driverId',
  vendordriverid: 'driverId',
  driveruniqueid: 'driverId',
  uniqueid: 'driverId',
  drid: 'driverId',
  slno: 'driverId',
  sno: 'driverId',
  srno: 'driverId',
  serialno: 'driverId',
  sn: 'driverId',

  clientname: 'clientName',
  client: 'clientName',
  clientid: 'clientId',
  vendorname: 'clientName',
  vendor: 'clientName',
  organization: 'clientName',
  company: 'clientName',
  unit: 'clientName',

  overallcompliancestatus: 'overallComplianceStatus',
  compliancestatus: 'overallComplianceStatus',
  compliance: 'overallComplianceStatus',
  overallstatus: 'overallComplianceStatus',

  city: 'city',
  offices: 'offices',
  office: 'offices',
  hub: 'offices',
  location: 'offices',

  driverlicensenumber: 'driverLicenseNumber',
  dlnumber: 'driverLicenseNumber',
  licensenumber: 'driverLicenseNumber',
  dlno: 'driverLicenseNumber',
  license: 'driverLicenseNumber',
  dlnum: 'driverLicenseNumber',
  driverdl: 'driverLicenseNumber',
  driverdlno: 'driverLicenseNumber',
  drivinglicensenumber: 'driverLicenseNumber',
  drivinglicenseno: 'driverLicenseNumber',
  drivinglicense: 'driverLicenseNumber',

  driverlicenseexpirydate: 'driverLicenseExpiryDate',
  dlexpiry: 'driverLicenseExpiryDate',
  dlexpirydate: 'driverLicenseExpiryDate',
  licenserenewaldate: 'driverLicenseExpiryDate',
  dlexpiration: 'driverLicenseExpiryDate',
  dlexpirationdate: 'driverLicenseExpiryDate',

  inductiondate: 'inductionDate',
  badgenumber: 'badgeNumber',
  badgeno: 'badgeNumber',
  badge: 'badgeNumber',
  badgeid: 'badgeNumber',

  badgeexpirydate: 'badgeExpiryDate',
  badgeexpiry: 'badgeExpiryDate',
  badgeexpiration: 'badgeExpiryDate',

  driverage: 'driverAge',
  age: 'driverAge',
  dateofbirth: 'dateOfBirth',
  dob: 'dateOfBirth',

  backgroundcheckstatus: 'backgroundCheckStatus',
  bgvstatus: 'backgroundCheckStatus',
  bgv: 'backgroundCheckStatus',
  bgvexpirydate: 'bgvExpiryDate',
  bgvexpiry: 'bgvExpiryDate',

  policeverificationstatus: 'policeVerificationStatus',
  pvstatus: 'policeVerificationStatus',
  pv: 'policeVerificationStatus',
  policeverificationexpirydate: 'policeVerificationExpiryDate',
  pvexpirydate: 'policeVerificationExpiryDate',
  pvexpiry: 'policeVerificationExpiryDate',
  pvcdate: 'policeVerificationExpiryDate',

  overallapprovalstatus: 'overallApprovalStatus',
  approvalstatus: 'overallApprovalStatus',
  approval: 'overallApprovalStatus',

  phonenumbers: 'phoneNumbers',
  phone: 'phoneNumbers',
  phonenumber: 'phoneNumbers',
  mobilenumber: 'phoneNumbers',
  mobile: 'phoneNumbers',
  contact: 'phoneNumbers',
  contactnumber: 'phoneNumbers',
  drivermobile: 'phoneNumbers',
  driverphone: 'phoneNumbers',
  mob: 'phoneNumbers',

  address: 'address',
  currentaddress: 'currentAddress',
  permanentaddress: 'address',

  govtidtype: 'govtIdType',
  govtidnumber: 'govtIdNumber',
  idtype: 'govtIdType',
  idnumber: 'govtIdNumber',
  aadhaar: 'govtIdNumber',
  pan: 'govtIdNumber',

  medicalverificationstatus: 'medicalVerificationStatus',
  medicalstatus: 'medicalVerificationStatus',
  medical: 'medicalVerificationStatus',
  medicalverificationexpirydate: 'medicalVerificationExpiryDate',
  medicalexpirydate: 'medicalVerificationExpiryDate',
  medicalexpiry: 'medicalVerificationExpiryDate',

  trainingverificationstatus: 'trainingVerificationStatus',
  trainingstatus: 'trainingVerificationStatus',
  training: 'trainingVerificationStatus',
  trainingverificationexpirydate: 'trainingVerificationExpiryDate',
  trainingexpirydate: 'trainingVerificationExpiryDate',
  trainingexpiry: 'trainingVerificationExpiryDate',

  eyetestexpirydate: 'eyeTestExpiryDate',
  eyetestexpiry: 'eyeTestExpiryDate',
  eyetest: 'eyeTestExpiryDate',
  eyetestdate: 'eyeTestExpiryDate',

  status: 'status',
  driverstatus: 'status',
  activestatus: 'status',

  inactivityreason: 'inactivityReason',
  reasonforinactivity: 'inactivityReason',
  deactivationreason: 'inactivityReason',
  reasonforinactiveness: 'inactivityReason',
  inactivenessreason: 'inactivityReason',
  reason: 'inactivityReason',
  remarks: 'inactivityReason',
  remark: 'inactivityReason',
  comments: 'comments',

  cabno: 'assignedCab',
  cabnumber: 'assignedCab',
  cabsno: 'assignedCab',
  cab: 'assignedCab',
  assignedcab: 'assignedCab',
  assignedvehicle: 'assignedCab',
  vehicleno: 'assignedCab',
  vehiclenumber: 'assignedCab',
  vehicleregistrationnumber: 'assignedCab',
  regno: 'assignedCab',
  registrationno: 'assignedCab',
  registrationnumber: 'assignedCab',
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

function getSheetJsonWithHeaderDetection(sheet: XLSX.WorkSheet): { rawRows: any[]; sheetNameLog: string } {
  const defaultRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (defaultRows.length === 0) return { rawRows: [], sheetNameLog: '0 rows' };

  const firstRowKeys = Object.keys(defaultRows[0]).map(alphaNumKey);
  const knownDriverOrCabKeys = new Set([
    'driverid', 'drivername', 'name', 'driverlicensenumber', 'licensenumber', 'badgenumber',
    'bgvstatus', 'policeverificationstatus', 'phonenumbers', 'phone', 'city', 'status',
    'etsvehicleid', 'registrationnumber', 'vehicletype', 'insuranceexpirydate'
  ]);

  const matchCount = firstRowKeys.filter(k => knownDriverOrCabKeys.has(k)).length;
  if (matchCount >= 2) {
    return { rawRows: defaultRows, sheetNameLog: `${defaultRows.length} rows` };
  }

  // Inspect matrix rows to find header row if top rows are title banners
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  let bestHeaderRowIndex = -1;
  let maxScore = 0;

  for (let r = 0; r < Math.min(10, matrix.length); r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    let score = 0;
    row.forEach(cell => {
      const key = alphaNumKey(String(cell));
      if (knownDriverOrCabKeys.has(key) || key.includes('driver') || key.includes('license') || key.includes('vehicle') || key.includes('reg') || key.includes('expiry')) {
        score++;
      }
    });
    if (score > maxScore) {
      maxScore = score;
      bestHeaderRowIndex = r;
    }
  }

  if (bestHeaderRowIndex >= 0 && maxScore >= 2) {
    const rows: any[] = [];
    const headerRow = matrix[bestHeaderRowIndex].map(c => String(c).trim());
    for (let r = bestHeaderRowIndex + 1; r < matrix.length; r++) {
      const rowData = matrix[r];
      if (!rowData || rowData.every((val: any) => !val)) continue;
      const rowObj: Record<string, any> = {};
      headerRow.forEach((colName, cIdx) => {
        if (colName) {
          rowObj[colName] = rowData[cIdx] !== undefined ? rowData[cIdx] : '';
        }
      });
      rows.push(rowObj);
    }
    return { rawRows: rows, sheetNameLog: `${rows.length} rows (detected header at row ${bestHeaderRowIndex + 1})` };
  }

  return { rawRows: defaultRows, sheetNameLog: `${defaultRows.length} rows` };
}

export async function processDataSheetUpload(
  file: File, 
  uploadedBy: string,
  uploadType: 'cabs' | 'drivers' | 'all' = 'all',
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

  // Locate target sheets
  const sheetNames = workbook.SheetNames;
  console.info(`[Excel Parser] Reading uploaded file "${file.name}" (Target uploadType: ${uploadType}). Available tabs:`, sheetNames);
  
  let activeDriversSheetName: string | undefined;
  let inactiveDriversSheetName: string | undefined;
  let activeCabsSheetName: string | undefined;
  let inactiveCabsSheetName: string | undefined;

  if (uploadType === 'drivers') {
    activeDriversSheetName = sheetNames.find(s => {
      const name = s.trim().toLowerCase();
      return name.includes('active') && !name.includes('inactive') && !name.includes('deactive');
    });
    inactiveDriversSheetName = sheetNames.find(s => {
      const name = s.trim().toLowerCase();
      return name.includes('inactive') || name.includes('deactive') || name.includes('resigned');
    });
  } else if (uploadType === 'cabs') {
    activeCabsSheetName = sheetNames.find(s => {
      const name = s.trim().toLowerCase();
      return name.includes('active') && !name.includes('inactive') && !name.includes('deactive');
    });
    inactiveCabsSheetName = sheetNames.find(s => {
      const name = s.trim().toLowerCase();
      return name.includes('inactive') || name.includes('deactive') || name.includes('resigned');
    });
  } else {
    const findSheet = (targetType: 'activeDriver' | 'inactiveDriver' | 'activeCab' | 'inactiveCab') => {
      return sheetNames.find(s => {
        const name = s.trim().toLowerCase();
        if (targetType === 'activeDriver') {
          return name.includes('active') && name.includes('driver') && !name.includes('inactive') && !name.includes('deactive');
        }
        if (targetType === 'inactiveDriver') {
          return (name.includes('inactive') || name.includes('deactive') || name.includes('resigned')) && name.includes('driver');
        }
        if (targetType === 'activeCab') {
          return name.includes('active') && (name.includes('cab') || name.includes('vehicle')) && !name.includes('inactive') && !name.includes('deactive');
        }
        if (targetType === 'inactiveCab') {
          return (name.includes('inactive') || name.includes('deactive') || name.includes('resigned')) && (name.includes('cab') || name.includes('vehicle'));
        }
        return false;
      });
    };

    activeDriversSheetName = findSheet('activeDriver') || sheetNames.find(s => s.toLowerCase().includes('active') && !s.toLowerCase().includes('cab') && !s.toLowerCase().includes('inactive'));
    inactiveDriversSheetName = findSheet('inactiveDriver') || sheetNames.find(s => (s.toLowerCase().includes('inactive') || s.toLowerCase().includes('deactive') || s.toLowerCase().includes('resigned')) && !s.toLowerCase().includes('cab'));
    activeCabsSheetName = findSheet('activeCab') || sheetNames.find(s => s.toLowerCase().includes('active') && (s.toLowerCase().includes('cab') || s.toLowerCase().includes('vehicle')) && !s.toLowerCase().includes('inactive'));
    inactiveCabsSheetName = findSheet('inactiveCab') || sheetNames.find(s => (s.toLowerCase().includes('inactive') || s.toLowerCase().includes('deactive')) && (s.toLowerCase().includes('cab') || s.toLowerCase().includes('vehicle')));
  }

  // Fetch existing Firestore records for matching (ONLY for the relevant entity type)
  const driversMapByDL = new Map<string, { id: string; data: any }>();
  const driversMapByNameAndPhone = new Map<string, { id: string; data: any }>();

  if (uploadType === 'drivers' || uploadType === 'all') {
    const existingDriversSnap = await getDocs(collection(db, 'drivers'));
    existingDriversSnap.forEach(docSnap => {
      const data = docSnap.data();
      const dlVal = cleanString(data.driverLicenseNumber).toLowerCase();
      const nameVal = cleanString(data.name).toLowerCase();
      const phoneVal = cleanString(data.phoneNumbers).toLowerCase();

      if (dlVal) {
        driversMapByDL.set(dlVal, { id: docSnap.id, data });
      }
      if (nameVal && phoneVal) {
        driversMapByNameAndPhone.set(`${nameVal}|${phoneVal}`, { id: docSnap.id, data });
      }
    });
  }

  const cabsMapByEts = new Map<string, { id: string; data: any }>();
  const cabsMapByReg = new Map<string, { id: string; data: any }>();

  if (uploadType === 'cabs' || uploadType === 'all') {
    const existingCabsSnap = await getDocs(collection(db, 'cabs'));
    existingCabsSnap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.etsVehicleId) {
        cabsMapByEts.set(String(data.etsVehicleId).trim().toLowerCase(), { id: docSnap.id, data });
      }
      if (data.registrationNumber) {
        cabsMapByReg.set(String(data.registrationNumber).trim().toLowerCase(), { id: docSnap.id, data });
      }
    });
  }

  const clientsToInsert = new Map<string, string>(); // clientId -> clientName

  // Helper to parse driver sheet
  const parseDriverSheet = async (sheetName: string, status: 'active' | 'inactive') => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const { rawRows, sheetNameLog } = getSheetJsonWithHeaderDetection(sheet);
    console.info(`[Excel Parser - Drivers] Parsing tab "${sheetName}". Raw rows found: ${rawRows.length} (${sheetNameLog}). Default status: ${status}.`);

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rowIndex = index + 2;

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

      // Override or confirm status (strictly lowercased 'active' or 'inactive')
      if (driverData.status && typeof driverData.status === 'string') {
        const rowStatus = driverData.status.toLowerCase();
        if (rowStatus.includes('inactive') || rowStatus.includes('deactive') || rowStatus.includes('resigned') || rowStatus.includes('terminated') || rowStatus.includes('suspended')) {
          driverData.status = 'inactive';
        } else if (rowStatus.includes('active')) {
          driverData.status = 'active';
        } else {
          driverData.status = status;
        }
      } else {
        driverData.status = status;
      }

      // Validation check & fallback ID generation
      let driverId = cleanString(driverData.driverId);
      let name = cleanString(driverData.name);
      let dl = cleanString(driverData.driverLicenseNumber);

      if (!driverId && (name || driverData.phoneNumbers || dl)) {
        const seedPart = (name || driverData.phoneNumbers || dl || `ROW-${rowIndex}`)
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .slice(0, 10);
        driverId = `AUTO-DRV-${seedPart}-${rowIndex}-${Date.now()}`;
        driverData.driverId = driverId;
      }

      if (!driverId && !name) {
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

      if (driverData.clientId && driverData.clientName) {
        clientsToInsert.set(driverData.clientId, driverData.clientName);
      }

      // Match existing driver strictly:
      // 1) Match by Driver License Number if present
      // 2) If License Number is blank, fallback to Name + Phone Number together
      const dlKey = dl.toLowerCase();
      const nameKey = name.toLowerCase();
      const phoneKey = cleanString(driverData.phoneNumbers).toLowerCase();

      let existing: { id: string; data: any } | null = null;

      if (dlKey) {
        existing = driversMapByDL.get(dlKey) || null;
      } else if (nameKey && phoneKey) {
        existing = driversMapByNameAndPhone.get(`${nameKey}|${phoneKey}`) || null;
      }

      const finalStatus: 'active' | 'inactive' = driverData.status as 'active' | 'inactive';

      try {
        if (existing) {
          // 1. Archive previous version
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

          // 2. Audit trail
          const oldStatus = (existing.data.status || 'active').toLowerCase();
          const newStatus = finalStatus;

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
            status: finalStatus,
            updatedBy: uploadedBy || 'Admin',
            updatedTime: uploadTimestamp,
            uploadBatchId,
            uploadBatchFileName: file.name,
          });
          result.driversUpdated++;

          const updatedDriverData = { id: existing.id, data: { ...existing.data, ...driverData, status: finalStatus } };
          if (dlKey) driversMapByDL.set(dlKey, updatedDriverData);
          if (nameKey && phoneKey) driversMapByNameAndPhone.set(`${nameKey}|${phoneKey}`, updatedDriverData);
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
            status: finalStatus,
            clientId: driverData.clientId || '',
            uploadBatchId,
            uploadBatchFileName: file.name,
          });

          const createdDriverData = { id: newDocRef.id, data: { ...driverData, status: finalStatus } };
          if (dlKey) driversMapByDL.set(dlKey, createdDriverData);
          if (nameKey && phoneKey) driversMapByNameAndPhone.set(`${nameKey}|${phoneKey}`, createdDriverData);

          uploadChanges.push({
            recordId: newDocRef.id,
            identifier: driverData.name || driverData.driverId || 'New Driver',
            type: 'driver',
            changeType: 'added',
            details: `New driver added as ${finalStatus.toUpperCase()}`
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

    const { rawRows, sheetNameLog } = getSheetJsonWithHeaderDetection(sheet);
    console.info(`[Excel Parser - Cabs] Parsing tab "${sheetName}". Raw rows found: ${rawRows.length} (${sheetNameLog}). Default status: ${status}.`);

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

  // Process sheets based on uploadType
  if (uploadType === 'drivers') {
    if (activeDriversSheetName) await parseDriverSheet(activeDriversSheetName, 'active');
    if (inactiveDriversSheetName) await parseDriverSheet(inactiveDriversSheetName, 'inactive');

    // Fallback: If no drivers were parsed yet, check other tabs in this driver file
    if (result.driversAdded + result.driversUpdated === 0) {
      for (const sheetName of sheetNames) {
        if (sheetName === activeDriversSheetName || sheetName === inactiveDriversSheetName) continue;
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rawRows.length === 0) continue;
        const lowerName = sheetName.toLowerCase();
        const defaultStatus = (lowerName.includes('inactive') || lowerName.includes('deactive') || lowerName.includes('resigned')) ? 'inactive' : 'active';
        await parseDriverSheet(sheetName, defaultStatus);
      }
    }
  } else if (uploadType === 'cabs') {
    if (activeCabsSheetName) await parseCabSheet(activeCabsSheetName, 'active');
    if (inactiveCabsSheetName) await parseCabSheet(inactiveCabsSheetName, 'inactive');

    // Fallback: If no cabs were parsed yet, check other tabs in this cab file
    if (result.cabsAdded + result.cabsUpdated === 0) {
      for (const sheetName of sheetNames) {
        if (sheetName === activeCabsSheetName || sheetName === inactiveCabsSheetName) continue;
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rawRows.length === 0) continue;
        const lowerName = sheetName.toLowerCase();
        const defaultStatus = (lowerName.includes('inactive') || lowerName.includes('deactive') || lowerName.includes('resigned')) ? 'inactive' : 'active';
        await parseCabSheet(sheetName, defaultStatus);
      }
    }
  } else {
    // Process all 4 sheets if present (legacy / 'all')
    if (activeDriversSheetName) await parseDriverSheet(activeDriversSheetName, 'active');
    if (inactiveDriversSheetName) await parseDriverSheet(inactiveDriversSheetName, 'inactive');
    if (activeCabsSheetName) await parseCabSheet(activeCabsSheetName, 'active');
    if (inactiveCabsSheetName) await parseCabSheet(inactiveCabsSheetName, 'inactive');
  }

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
      uploadType,
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
 * Utility to generate a Cabs template Excel spreadsheet (2 tabs: active Cabs, inactive cabs)
 */
export function generateSampleCabsSheetTemplate() {
  const wb = XLSX.utils.book_new();

  const cabHeaders = [
    'etsVehicleId', 'registrationNumber', 'clientName', 'clientId', 'vehicleType', 'overallComplianceStatus',
    'manufacturingDate', 'registrationDate', 'ageYears', 'inductionDate', 'durationYears',
    'insuranceExpiryDate', 'pollutionCertificateExpiryDate', 'permitExpiryDate', 'roadTaxExpiryDate',
    'fitnessExpiryDate', 'vehicleServiceExpiryDate', 'ehs', 'comments', 'overallApprovalStatus',
    'fuelType', 'vehicleOwnership', 'permitType', 'contractName', 'driverName', 'driverMobileNumber', 'driverComplianceStatus'
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

  const wsActiveCabs = XLSX.utils.json_to_sheet(sampleActiveCabs, { header: cabHeaders });
  const wsInactiveCabs = XLSX.utils.json_to_sheet(sampleInactiveCabs, { header: cabHeaders });

  XLSX.utils.book_append_sheet(wb, wsActiveCabs, 'active Cabs');
  XLSX.utils.book_append_sheet(wb, wsInactiveCabs, 'inactive cabs');

  XLSX.writeFile(wb, 'Cabs_Data_Sheet_Template.xlsx');
}

/**
 * Utility to generate a Drivers template Excel spreadsheet (2 tabs: active Drivers, inactive Drivers)
 */
export function generateSampleDriversSheetTemplate() {
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

  const wsActiveDrivers = XLSX.utils.json_to_sheet(sampleActiveDrivers, { header: driverHeaders });
  const wsInactiveDrivers = XLSX.utils.json_to_sheet(sampleInactiveDrivers, { header: driverHeaders });

  XLSX.utils.book_append_sheet(wb, wsActiveDrivers, 'active Drivers');
  XLSX.utils.book_append_sheet(wb, wsInactiveDrivers, 'inactive Drivers');

  XLSX.writeFile(wb, 'Drivers_Data_Sheet_Template.xlsx');
}
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
