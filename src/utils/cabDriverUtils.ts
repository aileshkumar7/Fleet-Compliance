/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Driver, Cab } from '../types';

/**
 * Resolves and returns the Cab Registration Number or Vehicle ID associated with a Driver.
 * Checks direct properties on the Driver object first, then matches against the cabs fleet roster.
 */
export function getDriverCabNumber(driver: Driver, cabs: Cab[] = []): string {
  if (!driver) return 'Unassigned';

  // 1. Check direct properties on Driver object
  const direct = (driver as any).assignedCab ||
                 (driver as any).vehicleNumber ||
                 (driver as any).registrationNumber ||
                 (driver as any).cabNumber ||
                 (driver as any).cabNo ||
                 (driver as any).vehicleNo || '';
  if (direct && String(direct).trim() && String(direct).trim().toUpperCase() !== 'N/A') {
    return String(direct).trim();
  }

  if (!cabs || cabs.length === 0) return 'Unassigned';

  const driverNameNorm = (driver.name || '').trim().toLowerCase();
  const driverPhoneClean = (driver.phoneNumbers || '').replace(/[^0-9]/g, '');

  // 2. Exact or fuzzy match in cabs list where cab.driverName matches driver.name
  if (driverNameNorm) {
    const matchedCabByName = cabs.find(c => {
      const cabDriverName = (c.driverName || '').trim().toLowerCase();
      if (!cabDriverName) return false;
      if (cabDriverName === driverNameNorm) return true;
      if (driverNameNorm.length >= 3 && cabDriverName.includes(driverNameNorm)) return true;
      if (cabDriverName.length >= 3 && driverNameNorm.includes(cabDriverName)) return true;
      return false;
    });
    if (matchedCabByName && matchedCabByName.registrationNumber) {
      return matchedCabByName.registrationNumber;
    }
  }

  // 3. Match by phone number if available
  if (driverPhoneClean.length >= 10) {
    const matchedCabByPhone = cabs.find(c => {
      const cabPhoneClean = (c.driverMobileNumber || '').replace(/[^0-9]/g, '');
      return cabPhoneClean.length >= 10 && cabPhoneClean.slice(-10) === driverPhoneClean.slice(-10);
    });
    if (matchedCabByPhone && matchedCabByPhone.registrationNumber) {
      return matchedCabByPhone.registrationNumber;
    }
  }

  // 4. Driver ID vs ETS Vehicle ID match
  if (driver.driverId) {
    const matchedCabById = cabs.find(c => (c.etsVehicleId || '').toLowerCase() === driver.driverId.toLowerCase());
    if (matchedCabById && matchedCabById.registrationNumber) {
      return matchedCabById.registrationNumber;
    }
  }

  return 'Unassigned';
}
