/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cab, Driver } from '../types';

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
