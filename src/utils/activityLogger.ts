/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export interface UserActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  clientId: string;
  event: 'login' | 'logout';
  timestamp: string;
  sessionId: string;
}

export async function logUserActivity(
  profile: UserProfile,
  event: 'login' | 'logout',
  sessionId: string
): Promise<void> {
  try {
    const userClientId = profile.role === 'admin' 
      ? 'All Clients (Admin)' 
      : (profile.clientId || profile.assignedClientIds?.[0] || 'Unassigned');

    const entry: UserActivityLog = {
      userId: profile.uid,
      userEmail: profile.email,
      userName: profile.name || profile.email.split('@')[0],
      clientId: userClientId,
      event,
      timestamp: new Date().toISOString(),
      sessionId,
    };

    await addDoc(collection(db, 'userActivityLogs'), entry);
  } catch (err) {
    console.error(`Failed to record ${event} audit log:`, err);
  }
}
