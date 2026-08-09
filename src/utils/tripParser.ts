/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trip } from '../types';

export interface TripUploadSummary {
  fileName: string;
  totalRowsRead: number;
  totalUniqueTrips: number;
  newlyAddedCount: number;
  updatedCount: number;
  uploadedAt: Date;
}

// Map normalized column headers to standard trip field keys
const TRIP_HEADER_MAP: Record<string, keyof Trip | 'employeeCount'> = {
  // Trip ID
  tripid: 'tripId',
  tripidno: 'tripId',
  tripno: 'tripId',
  tripnumber: 'tripId',
  tripnum: 'tripId',
  bookingid: 'tripId',
  bookingno: 'tripId',
  requestid: 'tripId',
  tripreference: 'tripId',

  // Date
  date: 'date',
  tripdate: 'date',
  bookingdate: 'date',
  shiftdate: 'date',
  startdate: 'date',

  // Registration / Cab No
  registration: 'registration',
  vehicleregistrationnumber: 'registration',
  vehicleregistrationno: 'registration',
  vehicleregistration: 'registration',
  registrationno: 'registration',
  registrationnumber: 'registration',
  regno: 'registration',
  regnumber: 'registration',
  cabno: 'registration',
  cabnumber: 'registration',
  vehicleno: 'registration',
  vehiclenumber: 'registration',

  // Vehicle ID
  vehicleid: 'vehicleId',
  etsvehicleid: 'vehicleId',
  cabid: 'vehicleId',
  vehiclecode: 'vehicleId',

  // Vehicle Type
  vehicletype: 'vehicleType',
  cabtype: 'vehicleType',
  cartype: 'vehicleType',
  model: 'vehicleType',
  vehiclemodel: 'vehicleType',

  // Direction
  direction: 'direction',
  tripdirection: 'direction',
  shiftdirection: 'direction',
  inout: 'direction',
  bound: 'direction',

  // Trip Type
  triptype: 'tripType',
  servicetype: 'tripType',
  bookingtype: 'tripType',
  type: 'tripType',

  // Times
  vehicledeploymenttime: 'deploymentTime',
  deploymenttime: 'deploymentTime',
  shifttime: 'deploymentTime',
  logintime: 'deploymentTime',
  scheduledtime: 'deploymentTime',
  scheduledpickuptime: 'deploymentTime',

  actualpickuptime: 'actualPickupTime',
  pickuptime: 'actualPickupTime',
  boardingtime: 'actualPickupTime',
  actualboardingtime: 'actualPickupTime',

  actualdroptime: 'actualDropTime',
  droptime: 'actualDropTime',
  alightingtime: 'actualDropTime',
  actualalightingtime: 'actualDropTime',
  completiontime: 'actualDropTime',

  // Employee / Passenger Count
  employeecountintrip: 'employeeCount',
  employeecount: 'employeeCount',
  passengercount: 'employeeCount',
  paxcount: 'employeeCount',
  pax: 'employeeCount',
  noofpax: 'employeeCount',
  totalpassengers: 'employeeCount',

  // Driver Details
  drivername: 'driverName',
  driver: 'driverName',
  chauffeurname: 'driverName',

  drivercontactno: 'driverContactNo',
  drivercontact: 'driverContactNo',
  drivermobile: 'driverContactNo',
  driverphone: 'driverContactNo',
  drivercontactnumber: 'driverContactNo',
  driverphonenumber: 'driverContactNo',
  drivermobileno: 'driverContactNo',
  contactno: 'driverContactNo',

  // Facility, Office, Cost Center & Client
  facility: 'facility',
  facilityname: 'facility',
  location: 'facility',
  site: 'facility',
  branch: 'facility',

  office: 'office',
  officelocation: 'office',
  dropoffice: 'office',
  pickupoffice: 'office',

  costcenter: 'costCenter',
  cc: 'costCenter',
  billingcostcenter: 'costCenter',

  clientid: 'clientId',
  client: 'clientId',
  clientname: 'clientId',
};

/**
 * Normalizes header string to lowercase alphanumeric representation
 */
function normalizeHeader(header: string): string {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parses Excel date serials, ISO strings, or standard date formats into a JS Date object
 */
export function parseExcelDate(val: any): Date | null {
  if (!val && val !== 0) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  // Excel serial number (e.g. 45123 or 45123.60416)
  if (typeof val === 'number') {
    if (val <= 0) return null;
    // Excel epoch Dec 30, 1899
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const date = new Date(ms);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // DD/MM/YYYY or DD-MM-YYYY format
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      const hrs = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 0;
      const mins = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
      const secs = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
      const parsed = new Date(year, month, day, hrs, mins, secs);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Combines a base Date with a time value (string, Excel decimal, or Date)
 */
export function combineDateAndTime(baseDate: Date | null, timeVal: any): Date | null {
  if (!timeVal && timeVal !== 0) return baseDate;
  if (timeVal instanceof Date && !isNaN(timeVal.getTime())) return timeVal;

  const resolvedBase = baseDate ? new Date(baseDate.getTime()) : new Date();

  if (typeof timeVal === 'number') {
    if (timeVal > 25569) {
      // Full Excel serial date-time
      return parseExcelDate(timeVal);
    }
    // Time decimal fraction (0 to 1)
    if (timeVal >= 0 && timeVal < 1) {
      const totalSeconds = Math.round(timeVal * 86400);
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      resolvedBase.setHours(hrs, mins, secs, 0);
      return resolvedBase;
    }
  }

  if (typeof timeVal === 'string') {
    const trimmed = timeVal.trim();
    if (!trimmed) return baseDate;

    // Check for HH:MM:SS or HH:MM AM/PM
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
    if (timeMatch) {
      let hrs = parseInt(timeMatch[1], 10);
      const mins = parseInt(timeMatch[2], 10);
      const secs = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

      if (ampm === 'PM' && hrs < 12) hrs += 12;
      if (ampm === 'AM' && hrs === 12) hrs = 0;

      resolvedBase.setHours(hrs, mins, secs, 0);
      return resolvedBase;
    }

    // Attempt direct parse
    const directDate = parseExcelDate(trimmed);
    if (directDate) return directDate;
  }

  return baseDate;
}

/**
 * Parses BA Trip report spreadsheet file buffer and writes unique trip records to Firestore
 */
export async function parseAndUploadTripData(
  fileBuffer: ArrayBuffer,
  fileName: string,
  onProgress?: (processed: number, total: number, message: string) => void
): Promise<TripUploadSummary> {
  // 1. Read workbook
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON objects
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded file is empty or contains no readable trip rows.');
  }

  // Build column mapping from raw row keys
  const firstRawRow = rawRows[0];
  const colKeyToTripKeyMap: Record<string, keyof Trip | 'employeeCount'> = {};

  Object.keys(firstRawRow).forEach((rawCol) => {
    const norm = normalizeHeader(rawCol);
    if (TRIP_HEADER_MAP[norm]) {
      colKeyToTripKeyMap[rawCol] = TRIP_HEADER_MAP[norm];
    }
  });

  // Group raw rows by Trip ID
  const tripGroupsMap = new Map<string, Record<string, any>[]>();
  let totalRawRowsRead = 0;

  for (const row of rawRows) {
    totalRawRowsRead++;

    // Find trip ID in row
    let rawTripId = '';
    for (const [colName, value] of Object.entries(row)) {
      const mappedKey = colKeyToTripKeyMap[colName];
      if (mappedKey === 'tripId' && value !== undefined && value !== null && String(value).trim() !== '') {
        rawTripId = String(value).trim();
        break;
      }
    }

    // Fallback search if header mapping missed Trip ID column name
    if (!rawTripId) {
      for (const [colName, value] of Object.entries(row)) {
        const norm = normalizeHeader(colName);
        if (norm.includes('tripid') || norm.includes('tripno') || norm.includes('bookingid') || norm.includes('tripreference')) {
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            rawTripId = String(value).trim();
            break;
          }
        }
      }
    }

    if (!rawTripId) continue; // Skip rows without Trip ID

    if (!tripGroupsMap.has(rawTripId)) {
      tripGroupsMap.set(rawTripId, []);
    }
    tripGroupsMap.get(rawTripId)!.push(row);
  }

  if (tripGroupsMap.size === 0) {
    throw new Error('Could not identify any valid "Trip ID" column in the uploaded sheet. Please check headers.');
  }

  const uniqueTripIds = Array.from(tripGroupsMap.keys());
  const totalUniqueTrips = uniqueTripIds.length;

  if (onProgress) {
    onProgress(0, totalUniqueTrips, `Identified ${totalUniqueTrips} unique trips from ${totalRawRowsRead} raw passenger rows. Checking existing records...`);
  }

  // 2. Check existing trip records in Firestore to compute newly added vs. updated
  let newlyAddedCount = 0;
  let updatedCount = 0;

  // Process trips and construct payloads
  const processedTripsToSave: { tripId: string; data: Trip }[] = [];

  for (let i = 0; i < uniqueTripIds.length; i++) {
    const tripId = uniqueTripIds[i];
    const rows = tripGroupsMap.get(tripId)!;
    const firstRow = rows[0];

    // Map fields from firstRow
    const mappedValues: Record<string, any> = {};
    Object.entries(firstRow).forEach(([colName, value]) => {
      const mappedKey = colKeyToTripKeyMap[colName];
      if (mappedKey) {
        mappedValues[mappedKey] = value;
      }
    });

    // Determine passenger count
    let passengerCount = rows.length;
    if (passengerCount === 1 && mappedValues.employeeCount) {
      const parsedEmpCount = parseInt(String(mappedValues.employeeCount), 10);
      if (!isNaN(parsedEmpCount) && parsedEmpCount > 1) {
        passengerCount = parsedEmpCount;
      }
    }

    // Parse Dates
    const rawDate = parseExcelDate(mappedValues.date);
    const deploymentTime = combineDateAndTime(rawDate, mappedValues.deploymentTime);
    const actualPickupTime = combineDateAndTime(rawDate, mappedValues.actualPickupTime);
    const actualDropTime = combineDateAndTime(rawDate, mappedValues.actualDropTime);

    const tripData: Trip = {
      tripId,
      date: rawDate || new Date(),
      registration: String(mappedValues.registration || '').trim(),
      vehicleId: String(mappedValues.vehicleId || '').trim(),
      vehicleType: String(mappedValues.vehicleType || '').trim(),
      direction: String(mappedValues.direction || '').trim(),
      tripType: String(mappedValues.tripType || '').trim(),
      deploymentTime: deploymentTime || rawDate || new Date(),
      actualPickupTime: actualPickupTime || rawDate || new Date(),
      actualDropTime: actualDropTime || rawDate || new Date(),
      passengerCount,
      driverName: String(mappedValues.driverName || '').trim(),
      driverContactNo: String(mappedValues.driverContactNo || '').trim(),
      facility: String(mappedValues.facility || '').trim(),
      office: String(mappedValues.office || '').trim(),
      costCenter: String(mappedValues.costCenter || '').trim(),
      clientId: String(mappedValues.clientId || '').trim(),
      uploadedAt: new Date(),
    };

    processedTripsToSave.push({ tripId, data: tripData });
  }

  // 3. Check existing existence and batch write to Firestore
  const BATCH_SIZE = 400; // Safe size below Firestore's 500 limit
  let processedCount = 0;

  for (let i = 0; i < processedTripsToSave.length; i += BATCH_SIZE) {
    const chunk = processedTripsToSave.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    // Check existence for chunk items
    for (const item of chunk) {
      const tripRef = doc(db, 'trips', item.tripId);
      const snap = await getDoc(tripRef);
      if (snap.exists()) {
        updatedCount++;
      } else {
        newlyAddedCount++;
      }

      // Convert JS Date objects for Firestore setDoc
      const payload = {
        ...item.data,
        id: item.tripId,
      };

      batch.set(tripRef, payload, { merge: true });
    }

    await batch.commit();
    processedCount += chunk.length;

    if (onProgress) {
      onProgress(
        processedCount,
        totalUniqueTrips,
        `Saved ${processedCount} of ${totalUniqueTrips} trips to Firestore database...`
      );
    }
  }

  return {
    fileName,
    totalRowsRead: totalRawRowsRead,
    totalUniqueTrips,
    newlyAddedCount,
    updatedCount,
    uploadedAt: new Date(),
  };
}
