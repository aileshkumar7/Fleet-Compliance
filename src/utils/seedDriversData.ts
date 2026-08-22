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
    let hasAirIndiaSats = false;
    let hasAirportT3 = false;

    clientsSnap.forEach(dDoc => {
      const cData = dDoc.data();
      const cName = (cData.clientName || cData.name || '').trim().toLowerCase();
      const cId = (cData.clientId || '').trim().toLowerCase();
      if (unwantedNames.some(u => cName.includes(u) || cId.includes(u))) {
        batch.delete(dDoc.ref);
        hasEdits = true;
      }
      if (cName.includes('air india') || cId.includes('airindia') || cName.includes('sats')) {
        hasAirIndiaSats = true;
      }
      if (cName.includes('airport t3') || cId === 'cl-01' || cName.includes('terminal 3')) {
        hasAirportT3 = true;
      }
    });

    if (!hasAirIndiaSats) {
      const newRef = doc(collection(db, 'clients'));
      batch.set(newRef, {
        clientName: 'Air India Sats',
        clientId: 'CL-AIRINDIA',
        createdAt: new Date().toISOString()
      });
      hasEdits = true;
    }

    if (!hasAirportT3) {
      const t3Ref = doc(collection(db, 'clients'));
      batch.set(t3Ref, {
        clientName: 'Airport T3',
        clientId: 'CL-01',
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

export async function ensureDefaultUserAccounts(): Promise<void> {
  try {
    const batch = writeBatch(db);
    let hasEdits = false;

    // 1. Ensure Ranjit profile bound to Air India Sats
    const ranjitDocRef = doc(db, 'users', 'local_user_ranjit');
    const ranjitEmailRef = doc(db, 'users', 'local_user_ranjit_fleet_local');
    const ranjitProfile = {
      uid: 'local_user_ranjit',
      name: 'Ranjit',
      email: 'ranjit@fleet.local',
      role: 'user',
      clientId: 'CL-AIRINDIA',
      assignedClientIds: ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'],
      permissions: {
        viewCabs: true,
        viewDrivers: true,
        viewExpiryAlerts: true,
        uploadDataSheets: true,
      },
      updatedAt: new Date().toISOString(),
      createdBy: 'system',
    };

    batch.set(ranjitDocRef, ranjitProfile, { merge: true });
    batch.set(ranjitEmailRef, ranjitProfile, { merge: true });
    hasEdits = true;

    // 2. Also check if any existing user doc has name "Ranjit" and update client if it was CL-01
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.forEach(uDoc => {
      const uData = uDoc.data();
      const uName = (uData.name || '').trim().toLowerCase();
      const uEmail = (uData.email || '').trim().toLowerCase();
      if ((uName === 'ranjit' || uEmail.includes('ranjit')) && uData.clientId === 'CL-01') {
        batch.set(uDoc.ref, {
          clientId: 'CL-AIRINDIA',
          assignedClientIds: ['CL-AIRINDIA', 'Air India Sats', 'air_india_sats', 'Air India SATS', 'CL-02'],
        }, { merge: true });
        hasEdits = true;
      }
    });

    if (hasEdits) {
      await batch.commit();
    }
  } catch (err) {
    console.error('Error ensuring default user accounts:', err);
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
    await ensureDefaultUserAccounts();
    await purgeAllDummyData();
  } catch (err) {
    console.error('Data check failed:', err);
  }
}
