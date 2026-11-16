/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cab, Driver } from '../types';
import { normalizeRegistration } from './registrationUtils';

/**
 * Robustly matches vehicle registration numbers, with dedicated support for last 4 digits
 * (e.g. searching "1234" or "0259" matches "DL 01 AB 1234", "DL-01-ZE-0259", "DL-1-ZE-0259", etc.)
 */
export function matchVehicleRegistration(registrationNumber: string | undefined | null, query: string): boolean {
  if (!registrationNumber || !query) return false;
  const rawQuery = query.trim().toLowerCase();
  const rawReg = registrationNumber.trim().toLowerCase();

  if (!rawQuery) return false;

  // 1. Direct raw substring match
  if (rawReg.includes(rawQuery)) return true;

  // 2. Standardized normalization match (removes leading zeros, hyphens, spaces)
  const normReg = normalizeRegistration(registrationNumber);
  const normQuery = normalizeRegistration(query);

  if (normQuery && normReg.includes(normQuery)) return true;

  // 3. Clean alphanumeric match
  const cleanReg = rawReg.replace(/[^a-z0-9]/g, '');
  const cleanQuery = rawQuery.replace(/[^a-z0-9]/g, '');

  if (!cleanQuery) return false;

  if (cleanReg.includes(cleanQuery)) return true;

  // 4. Last 4 digits specific match
  if (/^\d{3,4}$/.test(cleanQuery)) {
    return cleanReg.endsWith(cleanQuery) || cleanReg.includes(cleanQuery) || normReg.endsWith(cleanQuery);
  }

  return false;
}

/**
 * Evaluates whether a Cab matches search input (including last 4 digits of vehicle number)
 */
export function matchesCabSearch(cab: Cab, query: string): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();

  // 1. Vehicle Registration Number (last 4 digits & full string)
  if (matchVehicleRegistration(cab.registrationNumber, q)) return true;

  // 2. ETS Vehicle ID / Cab ID
  if ((cab.etsVehicleId || '').toLowerCase().includes(q)) return true;

  // 3. Driver 1 and Driver 2 (Co-Driver) Name / Phone assigned to cab
  if ((cab.driverName || '').toLowerCase().includes(q)) return true;
  if ((cab.driverMobileNumber || '').toLowerCase().includes(q)) return true;
  if ((cab.secondDriverName || '').toLowerCase().includes(q)) return true;
  if ((cab.secondDriverMobileNumber || '').toLowerCase().includes(q)) return true;
  if ((cab.coDriverName || '').toLowerCase().includes(q)) return true;
  if ((cab.coDriverMobileNumber || '').toLowerCase().includes(q)) return true;

  // 4. Client Name / Vehicle Type / Fuel Type / Ownership / Owner (Comments) / Contract
  if ((cab.clientName || '').toLowerCase().includes(q)) return true;
  if ((cab.vehicleType || '').toLowerCase().includes(q)) return true;
  if ((cab.vehicleOwnership || '').toLowerCase().includes(q)) return true;
  if ((cab.comments || '').toLowerCase().includes(q)) return true;
  if ((cab.contractName || '').toLowerCase().includes(q)) return true;

  return false;
}

/**
 * Evaluates whether a Driver matches search input (including searching by last 4 digits of vehicle number)
 */
export function matchesDriverSearch(driver: Driver, query: string, allCabs: Cab[] = []): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();

  // 1. Standard Driver Fields
  if ((driver.name || '').toLowerCase().includes(q)) return true;
  if ((driver.driverLicenseNumber || '').toLowerCase().includes(q)) return true;
  if ((driver.driverId || '').toLowerCase().includes(q)) return true;
  if ((driver.phoneNumbers || '').toLowerCase().includes(q)) return true;
  if ((driver.clientName || '').toLowerCase().includes(q)) return true;
  if ((driver.city || '').toLowerCase().includes(q)) return true;
  if ((driver.badgeNumber || '').toLowerCase().includes(q)) return true;
  if ((driver.comments || '').toLowerCase().includes(q)) return true;

  // 2. Direct vehicle fields on Driver object
  const driverReg = (driver as any).assignedCab || (driver as any).vehicleNumber || (driver as any).registrationNumber || '';
  if (matchVehicleRegistration(driverReg, q)) return true;

  // 3. Cross-reference with Cab Fleet Roster
  if (allCabs.length > 0) {
    const matchingCabs = allCabs.filter(c => matchVehicleRegistration(c.registrationNumber, q) || (c.etsVehicleId || '').toLowerCase().includes(q));

    for (const cab of matchingCabs) {
      const driverPhoneClean = (driver.phoneNumbers || '').replace(/[^0-9]/g, '');
      const dPhone10 = driverPhoneClean.length >= 10 ? driverPhoneClean.slice(-10) : '';

      // Collect all phones from cab (primary + secondary)
      const cabPhones = [
        cab.driverMobileNumber,
        cab.secondDriverMobileNumber,
        cab.coDriverMobileNumber,
        cab.driver2MobileNumber,
      ].filter(Boolean).map(p => (String(p).replace(/[^0-9]/g, ''))).map(p => p.length >= 10 ? p.slice(-10) : '').filter(Boolean);

      // 1. Phone number last 10 digits match (Highest automated confidence)
      if (dPhone10 && cabPhones.length > 0) {
        if (cabPhones.includes(dPhone10)) {
          return true;
        }
        // If driver has a phone and cab has phones and none match, do not match by loose name
        continue;
      }

      // 2. Driver ID / ETS Vehicle ID match
      if (driver.driverId && cab.etsVehicleId && driver.driverId.trim().toLowerCase() === cab.etsVehicleId.trim().toLowerCase()) {
        return true;
      }

      // 3. Fallback: Strict Exact full-name match against primary or secondary driver name
      const driverNameNorm = (driver.name || '').trim().toLowerCase();
      const cabNames = [
        cab.driverName,
        cab.secondDriverName,
        cab.coDriverName,
        cab.driver2Name,
      ].filter(Boolean).map(n => String(n).trim().toLowerCase());

      if (driverNameNorm && cabNames.includes(driverNameNorm)) {
        return true;
      }
    }
  }

  return false;
}
