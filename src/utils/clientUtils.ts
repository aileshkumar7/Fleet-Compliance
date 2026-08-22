/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Client, UserProfile } from '../types';

/**
 * Normalizes a client string (name, ID, or slug) into a comparable key.
 * Removes extra whitespace, hyphens, underscores, and lowercases.
 */
export function normalizeClientKey(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface UserClientScope {
  isAll: boolean;
  allowedKeys: Set<string>;
  boundClientName: string;
  boundClientId: string;
}

/**
 * Resolves all valid client identifiers, names, and normalized keys
 * accessible by a given user profile, given the active clients in the database.
 */
export function resolveUserClientScope(
  userProfile: UserProfile | null,
  clients: Client[] = []
): UserClientScope {
  if (!userProfile) {
    return {
      isAll: false,
      allowedKeys: new Set<string>(),
      boundClientName: 'None',
      boundClientId: '',
    };
  }

  const isAdmin = userProfile.role === 'admin';
  const assigned = userProfile.assignedClientIds || [];
  const directClientId = userProfile.clientId;

  const rawKeys = Array.from(
    new Set([directClientId, ...assigned].filter(Boolean).map(s => String(s).trim()))
  );

  const hasAll = isAdmin || rawKeys.some(k => k.toLowerCase() === 'all');

  if (hasAll) {
    return {
      isAll: true,
      allowedKeys: new Set<string>(['all']),
      boundClientName: 'All Clients (Global Access)',
      boundClientId: 'all',
    };
  }

  const allowedKeys = new Set<string>();
  let resolvedName = '';
  let resolvedId = '';

  rawKeys.forEach(rawKey => {
    const rawLower = rawKey.toLowerCase();
    const rawNorm = normalizeClientKey(rawKey);
    allowedKeys.add(rawLower);
    if (rawNorm) allowedKeys.add(rawNorm);

    // Look for matching client in clients array
    const matched = clients.find(c => {
      const cId = (c.clientId || '').toLowerCase();
      const cName = (c.clientName || '').toLowerCase();
      const cDocId = (c.id || '').toLowerCase();
      const cNormId = normalizeClientKey(c.clientId);
      const cNormName = normalizeClientKey(c.clientName);

      return (
        cId === rawLower ||
        cName === rawLower ||
        cDocId === rawLower ||
        (rawNorm && (cNormId === rawNorm || cNormName === rawNorm))
      );
    });

    if (matched) {
      if (matched.clientId) {
        allowedKeys.add(matched.clientId.toLowerCase());
        allowedKeys.add(normalizeClientKey(matched.clientId));
      }
      if (matched.clientName) {
        allowedKeys.add(matched.clientName.toLowerCase());
        allowedKeys.add(normalizeClientKey(matched.clientName));
      }
      if (matched.id) {
        allowedKeys.add(matched.id.toLowerCase());
      }
      if (!resolvedName) resolvedName = matched.clientName;
      if (!resolvedId) resolvedId = matched.clientId;
    }
  });

  if (!resolvedName && rawKeys.length > 0) {
    resolvedName = rawKeys[0];
  }
  if (!resolvedId && rawKeys.length > 0) {
    resolvedId = rawKeys[0];
  }

  return {
    isAll: false,
    allowedKeys,
    boundClientName: resolvedName || 'Bound Client',
    boundClientId: resolvedId || '',
  };
}

/**
 * Checks whether a given record (cab, driver, trip, client) belongs to the user's accessible client scope.
 */
export function isRecordAccessible(
  record: { clientId?: string; clientName?: string; client?: string; clientOrg?: string; assignedClientId?: string },
  scope: UserClientScope
): boolean {
  if (scope.isAll) return true;
  if (scope.allowedKeys.size === 0) return false;

  const rawValues = [
    record.clientId,
    record.clientName,
    record.client,
    record.clientOrg,
    record.assignedClientId,
  ].filter(Boolean) as string[];

  if (rawValues.length === 0) {
    return false;
  }

  for (const val of rawValues) {
    const valLower = val.trim().toLowerCase();
    const valNorm = normalizeClientKey(val);

    if (scope.allowedKeys.has(valLower) || (valNorm && scope.allowedKeys.has(valNorm))) {
      return true;
    }
  }

  return false;
}
