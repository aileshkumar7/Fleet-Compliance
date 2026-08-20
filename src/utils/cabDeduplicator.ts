/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, doc, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { normalizeRegistration } from './registrationUtils';
import { Cab } from '../types';

export interface CabCleanupReport {
  totalCabsProcessed: number;
  duplicateGroupsFound: number;
  duplicateDocsDeleted: number;
  normalizedFieldUpdatedCount: number;
  mergedGroups: Array<{
    registrationNormalized: string;
    primaryId: string;
    primaryReg: string;
    deletedIds: string[];
    carriedOverFields: string[];
  }>;
}

/**
 * Calculates a completeness score for a cab document.
 * More populated non-empty fields give a higher score.
 */
function getCabCompletenessScore(data: any): number {
  let score = 0;
  const fieldsToCheck = [
    'registrationNumber',
    'etsVehicleId',
    'clientName',
    'vehicleType',
    'insuranceExpiryDate',
    'pollutionCertificateExpiryDate',
    'permitExpiryDate',
    'roadTaxExpiryDate',
    'fitnessExpiryDate',
    'vehicleServiceExpiryDate',
    'driverName',
    'driverMobileNumber',
    'driverComplianceStatus',
    'overallComplianceStatus',
    'fuelType',
    'manufacturingDate',
    'registrationDate',
    'inductionDate',
    'permitType',
    'contractName',
    'clientId',
    'documentsUploaded',
    'comments',
  ];

  for (const field of fieldsToCheck) {
    const val = data[field];
    if (val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val) && val.length > 0) {
        score += 2;
      } else if (typeof val === 'string' && val !== 'N/A' && val !== 'Pending') {
        score += 1;
      } else if (typeof val === 'number' && val > 0) {
        score += 1;
      }
    }
  }

  return score;
}

/**
 * Runs a complete cleanup and deduplication pass across the 'cabs' collection in Firestore.
 * 1. Groups cab documents by normalizeRegistration(registrationNumber || etsVehicleId).
 * 2. Merges duplicate groups into a single most complete / recent record while preserving unique fields.
 * 3. Automatically deletes duplicate records.
 * 4. Ensures registrationNormalized is populated on all cab records.
 */
export async function runCabDeduplicationCleanup(): Promise<CabCleanupReport> {
  const cabsSnap = await getDocs(collection(db, 'cabs'));
  const totalCabsProcessed = cabsSnap.size;

  const groups = new Map<string, Array<{ id: string; data: any }>>();
  const noRegDocs: Array<{ id: string; data: any }> = [];

  cabsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const reg = data.registrationNumber || '';
    const ets = data.etsVehicleId || '';
    const norm = normalizeRegistration(reg) || (ets ? normalizeRegistration(ets) : '');

    if (!norm) {
      noRegDocs.push({ id: docSnap.id, data });
    } else {
      if (!groups.has(norm)) {
        groups.set(norm, []);
      }
      groups.get(norm)!.push({ id: docSnap.id, data });
    }
  });

  let duplicateGroupsFound = 0;
  let duplicateDocsDeleted = 0;
  let normalizedFieldUpdatedCount = 0;
  const mergedGroups: CabCleanupReport['mergedGroups'] = [];

  for (const [norm, docList] of groups.entries()) {
    if (docList.length > 1) {
      duplicateGroupsFound++;

      // Rank documents: Highest completeness score first, then newest updatedTime/createdTime
      docList.sort((a, b) => {
        const scoreA = getCabCompletenessScore(a.data);
        const scoreB = getCabCompletenessScore(b.data);
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        const timeA = new Date(a.data.updatedTime || a.data.createdTime || 0).getTime();
        const timeB = new Date(b.data.updatedTime || b.data.createdTime || 0).getTime();
        return timeB - timeA;
      });

      const primary = docList[0];
      const duplicates = docList.slice(1);
      const mergedData = { ...primary.data, registrationNormalized: norm };
      const carriedOverFields: string[] = [];

      // Carry over any unique/missing fields from duplicates into the primary document
      for (const dup of duplicates) {
        for (const [key, val] of Object.entries(dup.data)) {
          if (key === 'id' || key === 'registrationNormalized') continue;

          const primaryVal = mergedData[key];
          const isPrimaryEmpty =
            primaryVal === undefined ||
            primaryVal === null ||
            primaryVal === '' ||
            primaryVal === 'N/A' ||
            (Array.isArray(primaryVal) && primaryVal.length === 0);

          const isDupValid =
            val !== undefined &&
            val !== null &&
            val !== '' &&
            val !== 'N/A' &&
            (!Array.isArray(val) || val.length > 0);

          if (isPrimaryEmpty && isDupValid) {
            mergedData[key] = val;
            carriedOverFields.push(`${key} (from ${dup.id})`);
          } else if (Array.isArray(primaryVal) && Array.isArray(val) && val.length > 0) {
            // Union arrays if they are documentsUploaded
            const combined = Array.from(new Set([...primaryVal, ...val]));
            if (combined.length > primaryVal.length) {
              mergedData[key] = combined;
              carriedOverFields.push(`${key} union (from ${dup.id})`);
            }
          }
        }
      }

      // Update primary document with merged content
      await updateDoc(doc(db, 'cabs', primary.id), {
        ...mergedData,
        registrationNormalized: norm,
        updatedTime: new Date().toISOString(),
        updatedBy: 'System Auto-Deduplication Engine',
      });

      // Delete all duplicate documents
      for (const dup of duplicates) {
        await deleteDoc(doc(db, 'cabs', dup.id));
        duplicateDocsDeleted++;
      }

      mergedGroups.push({
        registrationNormalized: norm,
        primaryId: primary.id,
        primaryReg: primary.data.registrationNumber || primary.data.etsVehicleId || 'N/A',
        deletedIds: duplicates.map((d) => d.id),
        carriedOverFields,
      });
    } else {
      // Single record: ensure registrationNormalized is stored
      const single = docList[0];
      if (single.data.registrationNormalized !== norm) {
        await updateDoc(doc(db, 'cabs', single.id), {
          registrationNormalized: norm,
        });
        normalizedFieldUpdatedCount++;
      }
    }
  }

  return {
    totalCabsProcessed,
    duplicateGroupsFound,
    duplicateDocsDeleted,
    normalizedFieldUpdatedCount,
    mergedGroups,
  };
}
