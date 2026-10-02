/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, getDocs, doc, writeBatch, addDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

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
 * Robustly deletes previous Driver or Cab records from Firestore in batches of 400.
 * Logs the deletion to uploadLogs for full audit compliance.
 */
export async function deletePreviousFleetData(options: DeleteOptions): Promise<DeleteResult> {
  const { target, scope, clientId, clientName, deletedBy, onProgress } = options;
  const collectionName = target === 'drivers' ? 'drivers' : 'cabs';

  // 1. Fetch all documents in the target collection
  const snap = await getDocs(collection(db, collectionName));
  const docsToDelete: { id: string }[] = [];

  snap.forEach(d => {
    const data = d.data();
    if (scope === 'all') {
      docsToDelete.push({ id: d.id });
    } else if (scope === 'client' && clientId) {
      const docCId = (data.clientId || '').trim().toLowerCase();
      const docCName = (data.clientName || '').trim().toLowerCase();
      const targetCId = clientId.trim().toLowerCase();
      const targetCName = (clientName || '').trim().toLowerCase();

      if (
        (docCId && docCId === targetCId) ||
        (docCName && targetCName && docCName === targetCName) ||
        (targetCId.includes('air') && (docCId.includes('air') || docCName.includes('air')))
      ) {
        docsToDelete.push({ id: d.id });
      }
    }
  });

  const total = docsToDelete.length;
  let deletedCount = 0;

  // 2. Commit batch deletions in chunks of 400 (well within Firestore's 500 operation limit)
  const CHUNK_SIZE = 400;
  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.delete(doc(db, collectionName, item.id));
    }
    await batch.commit();
    deletedCount += chunk.length;
    if (onProgress) {
      onProgress(deletedCount, total);
    }
  }

  // 3. Record audit log entry in uploadLogs
  try {
    const targetLabel = target === 'drivers' ? 'Drivers' : 'Cabs';
    const scopeLabel = scope === 'all' 
      ? 'All Clients' 
      : `${clientName || clientId} (${clientId})`;

    await addDoc(collection(db, 'uploadLogs'), {
      fileName: `Purge / Delete Previous ${targetLabel} Data`,
      uploadType: target,
      uploadedBy: deletedBy || 'Operations User',
      uploadedAt: new Date().toISOString(),
      recordCounts: deletedCount,
      batchId: `delete_${target}_${Date.now()}`,
      details: {
        action: 'delete_previous_data',
        targetCollection: collectionName,
        scope: scope,
        scopeLabel: scopeLabel,
        deletedRecordsCount: deletedCount,
        note: `User initiated deletion of previous ${targetLabel.toLowerCase()} records before fresh upload.`
      }
    });
  } catch (logErr) {
    console.warn('Failed to record deletion in uploadLogs:', logErr);
  }

  return {
    target,
    deletedCount,
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
  const collectionName = target === 'drivers' ? 'drivers' : 'cabs';
  const snap = await getDocs(collection(db, collectionName));
  let total = 0;
  let clientMatch = 0;

  snap.forEach(d => {
    total++;
    if (clientId && clientId !== 'auto') {
      const data = d.data();
      const docCId = (data.clientId || '').trim().toLowerCase();
      const docCName = (data.clientName || '').trim().toLowerCase();
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
