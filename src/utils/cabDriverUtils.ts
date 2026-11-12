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
 * Extracts all unique 10-digit phone numbers from a string
 * (e.g., "9812345678 / 9876543210" or "9812345678, 9876543210")
 */
export function extractAllPhoneNumbers(str?: string | null): string[] {
  if (!str) return [];
  const parts = String(str).split(/[\/\\,;&|]|\band\b|\s{2,}/i);
  const phones: string[] = [];
  for (const part of parts) {
    const cleaned = cleanPhoneNumber(part);
    if (cleaned && !phones.includes(cleaned)) {
      phones.push(cleaned);
    }
  }
  // Also regex match any 10-digit sequence if parts split missed it
  if (phones.length === 0) {
    const matches = String(str).match(/[6-9]\d{9}/g);
    if (matches) {
      matches.forEach(m => {
        if (!phones.includes(m)) phones.push(m);
      });
    }
  }
  return phones;
}

/**
 * Extracts multiple driver names from a string separated by slash, ampersand, comma, or "and"
 */
export function extractAllNames(str?: string | null): string[] {
  if (!str) return [];
  const parts = String(str)
    .split(/[\/\\,;&|]|\band\b/i)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !['n/a', 'na', 'none', 'null', 'unassigned'].includes(s.toLowerCase()));
  return parts;
}

export interface CabAssignedDriversResult {
  primary?: Driver;
  secondary?: Driver;
  all: Driver[];
  isDoubleDriver: boolean;
  primaryResolvedName: string;
  primaryResolvedPhone: string;
  secondaryResolvedName: string;
  secondaryResolvedPhone: string;
}

/**
 * Resolves both Primary Driver (Driver 1) and Secondary Driver (Driver 2 / Co-Driver) for a Cab.
 * Supports explicit secondary driver fields, comma/slash separated numbers, and multiple drivers
 * sharing the same assigned cab registration number in the drivers roster.
 */
export function getCabAssignedDrivers(cab: Cab, drivers: Driver[] = []): CabAssignedDriversResult {
  if (!cab) {
    return {
      all: [],
      isDoubleDriver: false,
      primaryResolvedName: 'Unassigned',
      primaryResolvedPhone: '',
      secondaryResolvedName: '',
      secondaryResolvedPhone: '',
    };
  }

  // 1. Extract phone candidates
  const mainPhones = extractAllPhoneNumbers(cab.driverMobileNumber);
  const secPhones = extractAllPhoneNumbers(
    cab.secondDriverMobileNumber || cab.coDriverMobileNumber || cab.driver2MobileNumber
  );

  const primaryPhone10 = mainPhones[0] || cleanPhoneNumber(cab.driverMobileNumber);
  const secondaryPhone10 = secPhones[0] || (mainPhones.length > 1 ? mainPhones[1] : '');

  // 2. Extract name candidates
  const mainNames = extractAllNames(cab.driverName);
  const secNames = extractAllNames(
    cab.secondDriverName || cab.coDriverName || cab.driver2Name
  );

  const primaryNameRaw = mainNames[0] || (cab.driverName || '').trim();
  const secondaryNameRaw = secNames[0] || (mainNames.length > 1 ? mainNames[1] : '');

  const cabRegNorm = (cab.registrationNumber || '').trim().toLowerCase();
  const cabEtsNorm = (cab.etsVehicleId || '').trim().toLowerCase();
  const cabClientId = (cab.clientId || '').trim().toLowerCase();
  const cabClientName = (cab.clientName || '').trim().toLowerCase();

  // Helper to match a driver by phone
  const findDriverByPhone = (phone10: string, excludeIds: string[] = []): Driver | undefined => {
    if (!phone10 || !drivers.length) return undefined;
    const active = drivers.filter(d => (d.status || '').toLowerCase() === 'active' && !excludeIds.includes(d.id || ''));
    
    // Active same client
    const activeSameClient = active.find(d => {
      const dPhone10 = cleanPhoneNumber(d.phoneNumbers);
      if (dPhone10 !== phone10) return false;
      const dCId = (d.clientId || '').trim().toLowerCase();
      const dCName = (d.clientName || '').trim().toLowerCase();
      return (cabClientId && dCId === cabClientId) || (cabClientName && dCName === cabClientName);
    });
    if (activeSameClient) return activeSameClient;

    // Any active
    const activeMatch = active.find(d => cleanPhoneNumber(d.phoneNumbers) === phone10);
    if (activeMatch) return activeMatch;

    // Any (including inactive)
    return drivers.find(d => !excludeIds.includes(d.id || '') && cleanPhoneNumber(d.phoneNumbers) === phone10);
  };

  // Helper to match a driver by strict name
  const findDriverByName = (name: string, phone10: string, excludeIds: string[] = []): Driver | undefined => {
    const norm = (name || '').trim().toLowerCase();
    if (!norm || norm.length < 3 || !drivers.length) return undefined;

    const matched = drivers.filter(d => {
      if (excludeIds.includes(d.id || '')) return false;
      const dName = (d.name || '').trim().toLowerCase();
      if (!dName || dName !== norm) return false;
      const dPhone10 = cleanPhoneNumber(d.phoneNumbers);
      if (phone10 && dPhone10 && phone10 !== dPhone10) return false;
      return true;
    });

    if (matched.length > 0) {
      return matched.find(d => (d.status || '').toLowerCase() === 'active') || matched[0];
    }
    return undefined;
  };

  // Find Driver 1 (Primary)
  let primaryDriver: Driver | undefined = findDriverByPhone(primaryPhone10);

  // If not matched by phone, check assignedCab match where name matches primaryNameRaw
  if (!primaryDriver && (cabRegNorm || cabEtsNorm)) {
    primaryDriver = drivers.find(d => {
      const assigned = ((d as any).assignedCab || (d as any).vehicleNumber || '').trim().toLowerCase();
      if (!assigned) return false;
      const matchesCab = (cabRegNorm && assigned === cabRegNorm) || (cabEtsNorm && assigned === cabEtsNorm);
      if (!matchesCab) return false;
      if (primaryNameRaw && (d.name || '').trim().toLowerCase() === primaryNameRaw.toLowerCase()) return true;
      return false;
    });
  }

  // Fallback to name match for primary
  if (!primaryDriver && primaryNameRaw) {
    primaryDriver = findDriverByName(primaryNameRaw, primaryPhone10);
  }

  // If still not matched, check any driver assigned to this cab
  if (!primaryDriver && (cabRegNorm || cabEtsNorm)) {
    primaryDriver = drivers.find(d => {
      const assigned = ((d as any).assignedCab || (d as any).vehicleNumber || '').trim().toLowerCase();
      return (cabRegNorm && assigned === cabRegNorm) || (cabEtsNorm && assigned === cabEtsNorm);
    });
  }

  const primaryId = primaryDriver?.id || '';
  const excludeList = primaryId ? [primaryId] : [];

  // Find Driver 2 (Secondary / Co-Driver)
  let secondaryDriver: Driver | undefined = secondaryPhone10 ? findDriverByPhone(secondaryPhone10, excludeList) : undefined;

  // If not found by phone, try finding any OTHER driver in roster whose assignedCab matches this cab
  if (!secondaryDriver && (cabRegNorm || cabEtsNorm)) {
    secondaryDriver = drivers.find(d => {
      if (excludeList.includes(d.id || '')) return false;
      const assigned = ((d as any).assignedCab || (d as any).vehicleNumber || '').trim().toLowerCase();
      return (cabRegNorm && assigned === cabRegNorm) || (cabEtsNorm && assigned === cabEtsNorm);
    });
  }

  // If still not found, try matching by secondary name
  if (!secondaryDriver && secondaryNameRaw) {
    secondaryDriver = findDriverByName(secondaryNameRaw, secondaryPhone10, excludeList);
  }

  const allDrivers: Driver[] = [];
  if (primaryDriver) allDrivers.push(primaryDriver);
  if (secondaryDriver && secondaryDriver.id !== primaryDriver?.id) allDrivers.push(secondaryDriver);

  // Check if any additional drivers in roster are also assigned to this cab
  if (cabRegNorm || cabEtsNorm) {
    const existingIds = allDrivers.map(d => d.id).filter(Boolean);
    const extraDrivers = drivers.filter(d => {
      if (existingIds.includes(d.id)) return false;
      const assigned = ((d as any).assignedCab || (d as any).vehicleNumber || '').trim().toLowerCase();
      return (cabRegNorm && assigned === cabRegNorm) || (cabEtsNorm && assigned === cabEtsNorm);
    });
    extraDrivers.forEach(d => allDrivers.push(d));
    if (!secondaryDriver && extraDrivers.length > 0) {
      secondaryDriver = extraDrivers[0];
    }
  }

  const primaryResolvedName = primaryDriver?.name || primaryNameRaw || cab.driverName || 'Unassigned';
  const primaryResolvedPhone = primaryDriver?.phoneNumbers || primaryPhone10 || cab.driverMobileNumber || '';

  const secondaryResolvedName = secondaryDriver?.name || secondaryNameRaw ||
    cab.secondDriverName || cab.coDriverName || cab.driver2Name || '';
  const secondaryResolvedPhone = secondaryDriver?.phoneNumbers || secondaryPhone10 ||
    cab.secondDriverMobileNumber || cab.coDriverMobileNumber || cab.driver2MobileNumber || '';

  const isDoubleDriver = Boolean(
    secondaryDriver ||
    (secondaryResolvedName && secondaryResolvedName.toLowerCase() !== 'unassigned' && secondaryResolvedName !== primaryResolvedName) ||
    (secondaryResolvedPhone && secondaryResolvedPhone !== primaryResolvedPhone) ||
    allDrivers.length >= 2
  );

  return {
    primary: primaryDriver,
    secondary: secondaryDriver,
    all: allDrivers,
    isDoubleDriver,
    primaryResolvedName,
    primaryResolvedPhone,
    secondaryResolvedName,
    secondaryResolvedPhone,
  };
}

/**
 * Resolves the primary Driver object for a Cab (backward-compatible convenience wrapper).
 */
export function getCabAssignedDriver(cab: Cab, drivers: Driver[] = []): Driver | undefined {
  const result = getCabAssignedDrivers(cab, drivers);
  return result.primary || result.all[0];
}

/**
 * Resolves and returns the Cab Registration Number or Vehicle ID associated with a Driver.
 * Prioritizes matching active cabs with the driver's mobile number, eliminating false matches
 * caused by multiple drivers sharing the same name. Supports dual drivers on the same cab.
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

  // Helper: check if a cab matches this driver's phone (in primary or secondary phone)
  const cabMatchesDriverPhone = (c: Cab, p10: string): boolean => {
    if (!p10) return false;
    const cabPhones = [
      ...extractAllPhoneNumbers(c.driverMobileNumber),
      ...extractAllPhoneNumbers(c.secondDriverMobileNumber || c.coDriverMobileNumber || c.driver2MobileNumber),
    ];
    return cabPhones.includes(p10);
  };

  // 2. PRIMARY MATCH: Match by Driver Mobile Number on ACTIVE Cabs (Primary or Double Driver)
  if (driverPhone10) {
    const activeCabs = cabs.filter(c => (c.status || '').toLowerCase() === 'active');

    // First try active cabs with matching phone and matching client
    const activeSameClient = activeCabs.find(c => {
      if (!cabMatchesDriverPhone(c, driverPhone10)) return false;
      const cabCId = (c.clientId || '').trim().toLowerCase();
      const cabCName = (c.clientName || '').trim().toLowerCase();
      return (driverClientId && cabCId === driverClientId) || (driverClientName && cabCName === driverClientName);
    });
    if (activeSameClient && (activeSameClient.registrationNumber || activeSameClient.etsVehicleId)) {
      return activeSameClient.registrationNumber || activeSameClient.etsVehicleId;
    }

    // Next try any active cab with matching phone
    const activeMatchedCab = activeCabs.find(c => cabMatchesDriverPhone(c, driverPhone10));
    if (activeMatchedCab && (activeMatchedCab.registrationNumber || activeMatchedCab.etsVehicleId)) {
      return activeMatchedCab.registrationNumber || activeMatchedCab.etsVehicleId;
    }

    // 3. SECONDARY MATCH: Match by Driver Mobile Number on any cab (including inactive)
    const anyMatchedCabByPhone = cabs.find(c => cabMatchesDriverPhone(c, driverPhone10));
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

  // 5. FALLBACK ONLY: Strict Exact Full-Name Match (Primary or Secondary driver name)
  if (driverNameNorm && driverNameNorm.length >= 3) {
    const matchingCabsByName = cabs.filter(c => {
      const names = [
        ...extractAllNames(c.driverName),
        ...extractAllNames(c.secondDriverName || c.coDriverName || c.driver2Name),
      ].map(s => s.toLowerCase());

      if (!names.includes(driverNameNorm)) {
        return false;
      }

      // Check phone conflict: If cab has a phone and driver has a phone and none match
      const cabPhones = [
        ...extractAllPhoneNumbers(c.driverMobileNumber),
        ...extractAllPhoneNumbers(c.secondDriverMobileNumber || c.coDriverMobileNumber || c.driver2MobileNumber),
      ];
      if (driverPhone10 && cabPhones.length > 0 && !cabPhones.includes(driverPhone10)) {
        return false;
      }

      return true;
    });

    if (matchingCabsByName.length > 0) {
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
