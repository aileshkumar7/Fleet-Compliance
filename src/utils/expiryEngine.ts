/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cab, Driver } from '../types';
import { getCabAssignedDrivers, CabAssignedDriversResult } from './cabDriverUtils';

export interface DocumentAlert {
  docName: string;
  fieldName: string;
  expiryDateStr: string;
  daysRemaining: number;
  status: 'expired' | 'expiring_soon' | 'valid';
  message: string;
}

export interface EntityExpiryAnalysis<T> {
  entity: T;
  hasAlert: boolean;
  worstStatus: 'expired' | 'expiring_soon' | 'valid';
  minDaysRemaining: number;
  alerts: DocumentAlert[];
}

export interface DualDriverExpiryAlert extends DocumentAlert {
  origin: 'cab' | 'primary_driver' | 'secondary_driver';
  driverName?: string;
  driverRole?: 'Driver 1' | 'Driver 2 (Co-Driver)';
}

export interface CabCompleteExpiryAnalysis {
  cab: Cab;
  cabAnalysis: EntityExpiryAnalysis<Cab>;
  isDoubleDriver: boolean;
  assignedDriversInfo: CabAssignedDriversResult;
  primaryDriver?: Driver;
  secondaryDriver?: Driver;
  primaryDriverAnalysis?: EntityExpiryAnalysis<Driver>;
  secondaryDriverAnalysis?: EntityExpiryAnalysis<Driver>;
  hasAlert: boolean;
  worstStatus: 'expired' | 'expiring_soon' | 'valid';
  minDaysRemaining: number;
  allAlerts: DualDriverExpiryAlert[];
}

/**
 * Parses a date string robustly (handles YYYY-MM-DD, DD/MM/YYYY, ISO, etc.) without UTC timezone shifting
 */
export function parseExpiryDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === 'N/A' || trimmed.toLowerCase() === 'null' || trimmed === '-') return null;

  // Match YYYY-MM-DD or YYYY/MM/DD
  const yymmdd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yymmdd) {
    const year = parseInt(yymmdd[1], 10);
    const month = parseInt(yymmdd[2], 10) - 1;
    const day = parseInt(yymmdd[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Match DD-MMM-YYYY or DD-MMM-YY (e.g., 25-Nov-2026 or 25-Nov-26)
  const dMmmY = trimmed.match(/^(\d{1,2})[\s\/\-\.]([a-zA-Z]{3,9})[\s\/\-\.](\d{2,4})$/);
  if (dMmmY) {
    const day = parseInt(dMmmY[1], 10);
    const monthStr = dMmmY[2].substring(0, 3).toLowerCase();
    let year = parseInt(dMmmY[3], 10);
    if (year < 100) year += 2000;
    const monthsMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    if (monthsMap[monthStr] !== undefined) {
      const d = new Date(year, monthsMap[monthStr], day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try standard Date parsing with local midnight normalization
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  return null;
}

/**
 * Calculates days remaining from today at midnight
 */
export function getDaysRemaining(expiryDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Evaluates a single date string against the expiry rules
 */
export function getDocumentStatus(docName: string, dateStr: string | null | undefined): {
  status: 'expired' | 'expiring_soon' | 'valid';
  daysRemaining: number | null;
  message: string;
} {
  const parsedDate = parseExpiryDate(dateStr);
  if (!parsedDate) {
    return {
      status: 'valid',
      daysRemaining: null,
      message: 'No Expiry Recorded'
    };
  }

  const days = getDaysRemaining(parsedDate);
  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      status: 'expired',
      daysRemaining: days,
      message: `Expired (${absDays === 1 ? '1 day ago' : `${absDays} days ago`})`
    };
  } else if (days <= 10) {
    return {
      status: 'expiring_soon',
      daysRemaining: days,
      message: days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`
    };
  } else {
    return {
      status: 'valid',
      daysRemaining: days,
      message: `Valid (${days} days remaining)`
    };
  }
}

export function evaluateDateAlert(docName: string, fieldName: string, dateStr: string | null | undefined): DocumentAlert | null {
  const parsedDate = parseExpiryDate(dateStr);
  if (!parsedDate) return null;

  const days = getDaysRemaining(parsedDate);

  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      docName,
      fieldName,
      expiryDateStr: dateStr || '',
      daysRemaining: days,
      status: 'expired',
      message: `${docName} expired ${absDays === 1 ? '1 day ago' : `${absDays} days ago`}`
    };
  } else if (days <= 10) {
    return {
      docName,
      fieldName,
      expiryDateStr: dateStr || '',
      daysRemaining: days,
      status: 'expiring_soon',
      message: days === 0 ? `${docName} expires today` : `${docName} expires in ${days} ${days === 1 ? 'day' : 'days'}`
    };
  }

  return null; // Valid (> 10 days remaining)
}

/**
 * Evaluates all 5 expiry fields for a Cab (Insurance, PUC, Permit, Road Tax, Fitness)
 */
export function analyzeCabExpiry(cab: Cab): EntityExpiryAnalysis<Cab> {
  const fieldsToCheck: { docName: string; fieldName: keyof Cab }[] = [
    { docName: 'Insurance', fieldName: 'insuranceExpiryDate' },
    { docName: 'Pollution Certificate', fieldName: 'pollutionCertificateExpiryDate' },
    { docName: 'Permit', fieldName: 'permitExpiryDate' },
    { docName: 'Road Tax', fieldName: 'roadTaxExpiryDate' },
    { docName: 'Fitness', fieldName: 'fitnessExpiryDate' },
  ];

  const alerts: DocumentAlert[] = [];
  let minDaysRemaining = Infinity;
  let hasExpired = false;

  for (const item of fieldsToCheck) {
    const val = cab[item.fieldName] as string;
    const alert = evaluateDateAlert(item.docName, item.fieldName as string, val);
    if (alert) {
      alerts.push(alert);
      if (alert.daysRemaining < minDaysRemaining) {
        minDaysRemaining = alert.daysRemaining;
      }
      if (alert.status === 'expired') {
        hasExpired = true;
      }
    }
  }

  const hasAlert = alerts.length > 0;
  const worstStatus = hasExpired ? 'expired' : hasAlert ? 'expiring_soon' : 'valid';

  return {
    entity: cab,
    hasAlert,
    worstStatus,
    minDaysRemaining: minDaysRemaining === Infinity ? 9999 : minDaysRemaining,
    alerts
  };
}

/**
 * Checklist Checkpoint for Drivers:
 * "If Police Verification Date is mentioned and certificate is uploaded,
 * please don't consider the BGV Date and certificate."
 */
export function isBgvExemptedByPoliceVerification(driver: Driver): boolean {
  if (!driver) return false;
  const pvDate = (driver.policeVerificationExpiryDate || '').trim();
  if (!pvDate || pvDate === 'N/A' || pvDate.toLowerCase() === 'null' || pvDate === '-') {
    return false;
  }

  // Police Verification date is mentioned
  const pvStatus = (driver.policeVerificationStatus || '').trim().toLowerCase();
  const hasUploadedCert = Boolean(
    (driver.documentsUploaded && Array.isArray(driver.documentsUploaded) && driver.documentsUploaded.some(d => {
      const lower = String(d).toLowerCase();
      return lower.includes('police') || lower.includes('pvc') || lower.includes('pv') || lower.includes('verification');
    })) ||
    pvStatus === 'verified' ||
    pvStatus === 'approved' ||
    pvStatus === 'uploaded' ||
    pvStatus === 'valid' ||
    pvStatus === 'active' ||
    pvDate.length > 0 // When Police Verification Date is explicitly specified in the records
  );

  return Boolean(pvDate && hasUploadedCert);
}

/**
 * Evaluates expiry fields for a Driver (Driver License, BGV, Police Verification, Medical Verification)
 * Respects Checklist Rule: If Police Verification Date is mentioned and certificate is uploaded,
 * BGV Date and certificate are NOT considered.
 */
export function analyzeDriverExpiry(driver: Driver): EntityExpiryAnalysis<Driver> {
  const bgvExempted = isBgvExemptedByPoliceVerification(driver);

  const fieldsToCheck: { docName: string; fieldName: keyof Driver }[] = [
    { docName: 'Driver License', fieldName: 'driverLicenseExpiryDate' },
    // Only check BGV if Police Verification Date and certificate are NOT present
    ...(bgvExempted ? [] : [{ docName: 'BGV', fieldName: 'bgvExpiryDate' as keyof Driver }]),
    { docName: 'Police Verification', fieldName: 'policeVerificationExpiryDate' },
    { docName: 'Medical Verification', fieldName: 'medicalVerificationExpiryDate' },
  ];

  const alerts: DocumentAlert[] = [];
  let minDaysRemaining = Infinity;
  let hasExpired = false;

  for (const item of fieldsToCheck) {
    const val = driver[item.fieldName] as string;
    const alert = evaluateDateAlert(item.docName, item.fieldName as string, val);
    if (alert) {
      alerts.push(alert);
      if (alert.daysRemaining < minDaysRemaining) {
        minDaysRemaining = alert.daysRemaining;
      }
      if (alert.status === 'expired') {
        hasExpired = true;
      }
    }
  }

  const hasAlert = alerts.length > 0;
  const worstStatus = hasExpired ? 'expired' : hasAlert ? 'expiring_soon' : 'valid';

  return {
    entity: driver,
    hasAlert,
    worstStatus,
    minDaysRemaining: minDaysRemaining === Infinity ? 9999 : minDaysRemaining,
    alerts
  };
}

/**
 * Evaluates the complete compliance and expiry status of a Cab AND its assigned drivers
 * (Primary Driver + Secondary / Co-Driver).
 * Generates document alerts for vehicle documents (Insurance, PUC, Permit, Road Tax, Fitness)
 * as well as Driver 1 & Driver 2 documents (Driver License, Police Verification, Medical).
 */
export function analyzeCabCompleteExpiry(cab: Cab, drivers: Driver[] = []): CabCompleteExpiryAnalysis {
  const cabAnalysis = analyzeCabExpiry(cab);
  const assigned = getCabAssignedDrivers(cab, drivers);

  let primaryDriverAnalysis: EntityExpiryAnalysis<Driver> | undefined;
  let secondaryDriverAnalysis: EntityExpiryAnalysis<Driver> | undefined;

  const allAlerts: DualDriverExpiryAlert[] = [];

  // 1. Vehicle alerts
  cabAnalysis.alerts.forEach(al => {
    allAlerts.push({
      ...al,
      origin: 'cab',
    });
  });

  // 2. Primary driver alerts
  if (assigned.primary) {
    primaryDriverAnalysis = analyzeDriverExpiry(assigned.primary);
    primaryDriverAnalysis.alerts.forEach(al => {
      allAlerts.push({
        ...al,
        origin: 'primary_driver',
        driverName: assigned.primary?.name,
        driverRole: 'Driver 1',
        message: `Driver 1 (${assigned.primary?.name || 'Primary'}): ${al.message}`
      });
    });
  }

  // 3. Secondary / Co-driver alerts
  if (assigned.secondary) {
    secondaryDriverAnalysis = analyzeDriverExpiry(assigned.secondary);
    secondaryDriverAnalysis.alerts.forEach(al => {
      allAlerts.push({
        ...al,
        origin: 'secondary_driver',
        driverName: assigned.secondary?.name,
        driverRole: 'Driver 2 (Co-Driver)',
        message: `Driver 2 (${assigned.secondary?.name || 'Co-Driver'}): ${al.message}`
      });
    });
  }

  let minDays = cabAnalysis.minDaysRemaining;
  if (primaryDriverAnalysis && primaryDriverAnalysis.minDaysRemaining < minDays) {
    minDays = primaryDriverAnalysis.minDaysRemaining;
  }
  if (secondaryDriverAnalysis && secondaryDriverAnalysis.minDaysRemaining < minDays) {
    minDays = secondaryDriverAnalysis.minDaysRemaining;
  }

  const hasExpired = cabAnalysis.worstStatus === 'expired' ||
    primaryDriverAnalysis?.worstStatus === 'expired' ||
    secondaryDriverAnalysis?.worstStatus === 'expired';

  const hasExpiringSoon = cabAnalysis.worstStatus === 'expiring_soon' ||
    primaryDriverAnalysis?.worstStatus === 'expiring_soon' ||
    secondaryDriverAnalysis?.worstStatus === 'expiring_soon';

  const hasAlert = allAlerts.length > 0;
  const worstStatus = hasExpired ? 'expired' : (hasExpiringSoon || hasAlert) ? 'expiring_soon' : 'valid';

  return {
    cab,
    cabAnalysis,
    isDoubleDriver: assigned.isDoubleDriver,
    assignedDriversInfo: assigned,
    primaryDriver: assigned.primary,
    secondaryDriver: assigned.secondary,
    primaryDriverAnalysis,
    secondaryDriverAnalysis,
    hasAlert,
    worstStatus,
    minDaysRemaining: minDays === Infinity ? 9999 : minDays,
    allAlerts,
  };
}
