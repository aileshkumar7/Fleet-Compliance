/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Driver, Cab } from '../types';

/**
 * Extracts and returns the standardized last 10 digits of a phone number,
 * or empty string if insufficient digits.
 */
export function cleanPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * Resolves and returns the Cab Registration Number or Vehicle ID associated with a Driver.
 * Prioritizes matching active cabs with the driver's mobile number, eliminating false matches
 * caused by multiple drivers sharing the same name.
 */
export function getDriverCabNumber(driver: Driver, cabs: Cab[] = []): string {
  if (!driver) return 'Unassigned';

  // 1. Check direct properties on Driver object (explicit assignment)
  const direct = (driver as any).assignedCab ||
                 (driver as any).vehicleNumber ||
                 (driver as any).registrationNumber ||
                 (driver as any).cabNumber ||
                 (driver as any).cabNo ||
                 (driver as any).vehicleNo || '';
  if (direct && String(direct).trim() && !['N/A', 'UNASSIGNED', 'NONE', 'NULL'].includes(String(direct).trim().toUpperCase())) {
    return String(direct).trim();
  }

  if (!cabs || cabs.length === 0) return 'Unassigned';

  const driverPhone10 = cleanPhoneNumber(driver.phoneNumbers);
  const driverNameNorm = (driver.name || '').trim().toLowerCase();
  const driverClientId = (driver.clientId || '').trim().toLowerCase();
  const driverClientName = (driver.clientName || '').trim().toLowerCase();

  // 2. PRIMARY MATCH: Match by Driver Mobile Number on ACTIVE Cabs
  if (driverPhone10) {
    const activeCabs = cabs.filter(c => (c.status || '').toLowerCase() === 'active');
    
    // First try active cabs with matching phone and matching client
    const activeSameClient = activeCabs.find(c => {
      const cabPhone10 = cleanPhoneNumber(c.driverMobileNumber);
      if (cabPhone10 !== driverPhone10) return false;
      const cabCId = (c.clientId || '').trim().toLowerCase();
      const cabCName = (c.clientName || '').trim().toLowerCase();
      return (driverClientId && cabCId === driverClientId) || (driverClientName && cabCName === driverClientName);
    });
    if (activeSameClient && (activeSameClient.registrationNumber || activeSameClient.etsVehicleId)) {
      return activeSameClient.registrationNumber || activeSameClient.etsVehicleId;
    }

    // Next try any active cab with matching phone
    const activeMatchedCab = activeCabs.find(c => cleanPhoneNumber(c.driverMobileNumber) === driverPhone10);
    if (activeMatchedCab && (activeMatchedCab.registrationNumber || activeMatchedCab.etsVehicleId)) {
      return activeMatchedCab.registrationNumber || activeMatchedCab.etsVehicleId;
    }

    // 3. SECONDARY MATCH: Match by Driver Mobile Number on any cab (including inactive)
    const anyMatchedCabByPhone = cabs.find(c => cleanPhoneNumber(c.driverMobileNumber) === driverPhone10);
    if (anyMatchedCabByPhone && (anyMatchedCabByPhone.registrationNumber || anyMatchedCabByPhone.etsVehicleId)) {
      return anyMatchedCabByPhone.registrationNumber || anyMatchedCabByPhone.etsVehicleId;
    }
  }

  // 4. Driver ID vs Cab ETS Vehicle ID match
  if (driver.driverId) {
    const dId = driver.driverId.trim().toLowerCase();
    const activeCabById = cabs.find(c => 
      (c.status || '').toLowerCase() === 'active' && 
      ((c.etsVehicleId || '').trim().toLowerCase() === dId || (c.registrationNumber || '').trim().toLowerCase() === dId)
    );
    if (activeCabById && (activeCabById.registrationNumber || activeCabById.etsVehicleId)) {
      return activeCabById.registrationNumber || activeCabById.etsVehicleId;
    }

    const anyCabById = cabs.find(c => 
      (c.etsVehicleId || '').trim().toLowerCase() === dId || (c.registrationNumber || '').trim().toLowerCase() === dId
    );
    if (anyCabById && (anyCabById.registrationNumber || anyCabById.etsVehicleId)) {
      return anyCabById.registrationNumber || anyCabById.etsVehicleId;
    }
  }

  // 5. FALLBACK ONLY: Strict Exact Full-Name Match (ONLY if no conflicting phone numbers)
  // NEVER use loose substring / includes() matching, which causes "Abhishek" to match "Abhishek Chauhan"
  if (driverNameNorm && driverNameNorm.length >= 3) {
    const matchingCabsByName = cabs.filter(c => {
      const cabDriverName = (c.driverName || '').trim().toLowerCase();
      if (!cabDriverName || cabDriverName !== driverNameNorm) {
        return false; // Strict equality only!
      }

      // Check phone conflict: If both have valid 10-digit phone numbers and they differ,
      // this is a different driver with the same name. DO NOT MATCH!
      const cabPhone10 = cleanPhoneNumber(c.driverMobileNumber);
      if (driverPhone10 && cabPhone10 && driverPhone10 !== cabPhone10) {
        return false;
      }

      return true;
    });

    if (matchingCabsByName.length > 0) {
      // Prioritize active cab
      const activeCab = matchingCabsByName.find(c => (c.status || '').toLowerCase() === 'active');
      if (activeCab && (activeCab.registrationNumber || activeCab.etsVehicleId)) {
        return activeCab.registrationNumber || activeCab.etsVehicleId;
      }
      const firstCab = matchingCabsByName[0];
      if (firstCab && (firstCab.registrationNumber || firstCab.etsVehicleId)) {
        return firstCab.registrationNumber || firstCab.etsVehicleId;
      }
    }
  }

  return 'Unassigned';
}

/**
 * Resolves the matching Driver object for a Cab.
 * Matches active drivers by mobile number first, ensuring accurate document and compliance status.
 */
export function getCabAssignedDriver(cab: Cab, drivers: Driver[] = []): Driver | undefined {
  if (!cab || !drivers || drivers.length === 0) return undefined;

  const cabPhone10 = cleanPhoneNumber(cab.driverMobileNumber);
  const cabDriverNameNorm = (cab.driverName || '').trim().toLowerCase();
  const cabRegNorm = (cab.registrationNumber || '').trim().toLowerCase();
  const cabEtsNorm = (cab.etsVehicleId || '').trim().toLowerCase();
  const cabClientId = (cab.clientId || '').trim().toLowerCase();
  const cabClientName = (cab.clientName || '').trim().toLowerCase();

  // 1. PRIMARY MATCH: Match by Driver Mobile Number on ACTIVE Drivers
  if (cabPhone10) {
    const activeDrivers = drivers.filter(d => (d.status || '').toLowerCase() === 'active');

    // First try active drivers with matching phone and matching client
    const activeSameClient = activeDrivers.find(d => {
      const dPhone10 = cleanPhoneNumber(d.phoneNumbers);
      if (dPhone10 !== cabPhone10) return false;
      const dCId = (d.clientId || '').trim().toLowerCase();
      const dCName = (d.clientName || '').trim().toLowerCase();
      return (cabClientId && dCId === cabClientId) || (cabClientName && dCName === cabClientName);
    });
    if (activeSameClient) return activeSameClient;

    // Next try any active driver with matching phone
    const activeMatchedDriver = activeDrivers.find(d => cleanPhoneNumber(d.phoneNumbers) === cabPhone10);
    if (activeMatchedDriver) return activeMatchedDriver;

    // 2. SECONDARY MATCH: Match by Driver Mobile Number on any driver (including inactive)
    const anyMatchedDriver = drivers.find(d => cleanPhoneNumber(d.phoneNumbers) === cabPhone10);
    if (anyMatchedDriver) return anyMatchedDriver;
  }

  // 3. Driver explicit assignedCab match
  if (cabRegNorm || cabEtsNorm) {
    const assignedDriver = drivers.find(d => {
      const assigned = ((d as any).assignedCab || (d as any).vehicleNumber || '').trim().toLowerCase();
      if (!assigned) return false;
      return (cabRegNorm && assigned === cabRegNorm) || (cabEtsNorm && assigned === cabEtsNorm);
    });
    if (assignedDriver) return assignedDriver;
  }

  // 4. Driver ID vs Cab ETS Vehicle ID match
  if (cabEtsNorm) {
    const driverById = drivers.find(d => (d.driverId || '').trim().toLowerCase() === cabEtsNorm);
    if (driverById) return driverById;
  }

  // 5. FALLBACK ONLY: Strict Exact Full-Name Match (ONLY if no conflicting phone numbers)
  if (cabDriverNameNorm && cabDriverNameNorm.length >= 3) {
    const matchingDriversByName = drivers.filter(d => {
      const dName = (d.name || '').trim().toLowerCase();
      if (!dName || dName !== cabDriverNameNorm) return false;

      // Phone conflict check
      const dPhone10 = cleanPhoneNumber(d.phoneNumbers);
      if (cabPhone10 && dPhone10 && cabPhone10 !== dPhone10) {
        return false;
      }

      return true;
    });

    if (matchingDriversByName.length > 0) {
      const activeDriver = matchingDriversByName.find(d => (d.status || '').toLowerCase() === 'active');
      if (activeDriver) return activeDriver;
      return matchingDriversByName[0];
    }
  }

  return undefined;
}
