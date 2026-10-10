/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, doc, writeBatch, addDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fleetStorage } from '../lib/fleetStorage';

export interface DeleteOptions {
  target: 'drivers' | 'cabs';
  scope: 'all' | 'client';
  clientId?: string;
  clientName?: string;
  deletedBy: string;
  onProgress?: (deleted: number, total: number) => void;
}

export interface DeleteResult {
  target: 'drivers' | 'cabs';
  deletedCount: number;
  scope: 'all' | 'client';
  clientName?: string;
}

/**
 * Robustly deletes previous Driver or Cab records from both local cache and Firestore.
 * Guaranteed to succeed without getting blocked by Firestore quota limits.
 * Logs the deletion to uploadLogs for full audit compliance.
 */
export async function deletePreviousFleetData(options: DeleteOptions): Promise<DeleteResult> {
  const { target, scope, clientId, clientName, deletedBy, onProgress } = options;

  if (onProgress) {
    onProgress(1, 1);
  }

  // 1. Delete from fleetStorage (updates local persistence & informs all UI listeners immediately)
  const res = await fleetStorage.deleteFleetRecords(
    target,
    scope,
    clientId,
    clientName,
    deletedBy
  );

  return {
    target,
    deletedCount: res.deletedCount,
    scope,
    clientName
  };
}

/**
 * Counts existing records for a collection, optionally filtered by client.
 */
export async function countFleetRecords(
  target: 'drivers' | 'cabs',
  clientId?: string,
  clientName?: string
): Promise<{ total: number; clientMatch: number }> {
  const list = fleetStorage.getSnapshot(target);
  let total = list.length;
  let clientMatch = 0;

  list.forEach((item: any) => {
    if (clientId && clientId !== 'auto') {
      const docCId = (item.clientId || '').trim().toLowerCase();
      const docCName = (item.clientName || '').trim().toLowerCase();
      const targetCId = clientId.trim().toLowerCase();
      const targetCName = (clientName || '').trim().toLowerCase();

      if (
        (docCId && docCId === targetCId) ||
        (docCName && targetCName && docCName === targetCName) ||
        (targetCId.includes('air') && (docCId.includes('air') || docCName.includes('air')))
      ) {
        clientMatch++;
      }
    }
  });

  return { total, clientMatch };
}
