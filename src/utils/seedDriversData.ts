/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Purge any legacy dummy dataset if present
 */
export async function purgeAllDummyData(): Promise<number> {
  try {
    const driversSnap = await getDocs(collection(db, 'drivers'));
    const cabsSnap = await getDocs(collection(db, 'cabs'));
    const batch = writeBatch(db);
    let count = 0;

    driversSnap.forEach(dDoc => {
      const d = dDoc.data();
      const isDummy = d.createdBy === 'System Seed Engine';

      if (isDummy) {
        batch.delete(dDoc.ref);
        count++;
      }
    });

    cabsSnap.forEach(cDoc => {
      const c = cDoc.data();
      const isDummy = c.createdBy === 'System Seed Engine';

      if (isDummy) {
        batch.delete(cDoc.ref);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`[Purge] Successfully removed ${count} dummy/seeded records.`);
    }
    return count;
  } catch (err) {
    console.error('Error purging dummy data:', err);
    return 0;
  }
}

export async function cleanUnwantedClients(): Promise<void> {
  try {
    const clientsSnap = await getDocs(collection(db, 'clients'));
    const unwantedNames = ['tech corp', 'techcorp', 'techcorp inc', 'global logistics', 'alpha retail', 'apex tech', 'apex tech solutions', 'client-apex', 'dummy'];
    const batch = writeBatch(db);
    let hasEdits = false;
    let hasAirIndia = false;

    clientsSnap.forEach(dDoc => {
      const cData = dDoc.data();
      const cName = (cData.clientName || cData.name || '').trim().toLowerCase();
      const cId = (cData.clientId || '').trim().toLowerCase();
      if (unwantedNames.some(u => cName.includes(u) || cId.includes(u))) {
        batch.delete(dDoc.ref);
        hasEdits = true;
      }
      if (cName.includes('air india')) {
        hasAirIndia = true;
      }
    });

    if (!hasAirIndia) {
      const newRef = doc(collection(db, 'clients'));
      batch.set(newRef, {
        clientName: 'Air India T3',
        clientId: 'CL-AIRINDIA',
        createdAt: new Date().toISOString()
      });
      hasEdits = true;
    }

    if (hasEdits) {
      await batch.commit();
    }
  } catch (err) {
    console.error('Error cleaning unwanted clients:', err);
  }
}

export async function seedCompleteDriversDataset(): Promise<{ activeCount: number; inactiveCount: number }> {
  // NO-OP: Seeding synthetic/dummy drivers disabled as per user instruction.
  // Purge any legacy dummy records instead.
  await purgeAllDummyData();
  return { activeCount: 0, inactiveCount: 0 };
}

export async function ensureCompleteDriversDataset(): Promise<void> {
  try {
    await cleanUnwantedClients();
    await purgeAllDummyData();
  } catch (err) {
    console.error('Data check failed:', err);
  }
}
