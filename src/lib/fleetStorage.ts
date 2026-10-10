/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { collection, onSnapshot, getDocs, doc, writeBatch, deleteDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { Trip, Cab, Driver, Client, UploadLog } from '../types';

type CollectionName = 'trips' | 'cabs' | 'drivers' | 'clients' | 'uploadLogs';

type Listener<T> = (data: T[]) => void;

class FleetStorageService {
  private trips: Trip[] = [];
  private cabs: Cab[] = [];
  private drivers: Driver[] = [];
  private clients: Client[] = [];
  private uploadLogs: UploadLog[] = [];

  private listeners: Map<CollectionName, Set<Listener<any>>> = new Map([
    ['trips', new Set()],
    ['cabs', new Set()],
    ['drivers', new Set()],
    ['clients', new Set()],
    ['uploadLogs', new Set()],
  ]);

  private initialized = false;
  private isQuotaExhausted = false;

  constructor() {
    this.loadFromLocalStorage();
    this.initFirestoreSync();
  }

  private loadFromLocalStorage() {
    if (typeof window === 'undefined') return;
    try {
      const storedTrips = localStorage.getItem('fleet_trips');
      if (storedTrips) {
        this.trips = JSON.parse(storedTrips);
      }
      const storedCabs = localStorage.getItem('fleet_cabs');
      if (storedCabs) {
        this.cabs = JSON.parse(storedCabs);
      }
      const storedDrivers = localStorage.getItem('fleet_drivers');
      if (storedDrivers) {
        this.drivers = JSON.parse(storedDrivers);
      }
      const storedClients = localStorage.getItem('fleet_clients');
      if (storedClients) {
        this.clients = JSON.parse(storedClients);
      }
      const storedLogs = localStorage.getItem('fleet_upload_logs');
      if (storedLogs) {
        this.uploadLogs = JSON.parse(storedLogs);
      }
    } catch (e) {
      console.warn('Could not read fleet cache from localStorage:', e);
    }
  }

  private saveToLocalStorage(name: CollectionName) {
    if (typeof window === 'undefined') return;
    try {
      if (name === 'trips') {
        localStorage.setItem('fleet_trips', JSON.stringify(this.trips));
      } else if (name === 'cabs') {
        localStorage.setItem('fleet_cabs', JSON.stringify(this.cabs));
      } else if (name === 'drivers') {
        localStorage.setItem('fleet_drivers', JSON.stringify(this.drivers));
      } else if (name === 'clients') {
        localStorage.setItem('fleet_clients', JSON.stringify(this.clients));
      } else if (name === 'uploadLogs') {
        localStorage.setItem('fleet_upload_logs', JSON.stringify(this.uploadLogs));
      }
    } catch (e) {
      console.warn(`Could not save ${name} to localStorage (quota may be full):`, e);
    }
  }

  private notify(name: CollectionName) {
    const list = this.getCollectionData(name);
    const set = this.listeners.get(name);
    if (set) {
      set.forEach(cb => {
        try {
          cb(list);
        } catch (err) {
          console.error(`Error in fleetStorage listener for ${name}:`, err);
        }
      });
    }
  }

  private getCollectionData(name: CollectionName): any[] {
    switch (name) {
      case 'trips': return [...this.trips];
      case 'cabs': return [...this.cabs];
      case 'drivers': return [...this.drivers];
      case 'clients': return [...this.clients];
      case 'uploadLogs': return [...this.uploadLogs];
    }
  }

  public subscribe<T = any>(name: CollectionName, callback: Listener<T>): () => void {
    const set = this.listeners.get(name);
    if (set) {
      set.add(callback);
      // Immediately push current state
      callback(this.getCollectionData(name));
    }
    return () => {
      set?.delete(callback);
    };
  }

  private initFirestoreSync() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen to trips
    try {
      onSnapshot(collection(db, 'trips'), (snap) => {
        const items: Trip[] = [];
        snap.forEach(d => {
          items.push({ id: d.id, ...d.data() } as Trip);
        });
        // If Firestore returned records, merge/replace local cache
        if (items.length > 0) {
          this.trips = items;
          this.saveToLocalStorage('trips');
          this.notify('trips');
        } else if (this.trips.length > 0) {
          // If Firestore is empty but we have local trips, keep local trips
          this.notify('trips');
        }
      }, (err) => {
        console.warn('Firestore trips sync note:', err.message);
        if (err.message?.includes('resource-exhausted') || err.message?.includes('Quota')) {
          this.isQuotaExhausted = true;
        }
      });
    } catch (e) {
      console.warn('Trips onSnapshot error:', e);
    }

    // Listen to cabs
    try {
      onSnapshot(collection(db, 'cabs'), (snap) => {
        const items: Cab[] = [];
        snap.forEach(d => {
          const data = d.data();
          items.push({
            id: d.id,
            ...data,
            registrationNumber: data.registrationNumber || data.regNumber || data.vehicleNumber || 'N/A',
            etsVehicleId: data.etsVehicleId || data.vehicleId || d.id || 'N/A',
            clientName: data.clientName || data.client || 'N/A',
          } as Cab);
        });
        this.cabs = items;
        this.saveToLocalStorage('cabs');
        this.notify('cabs');
      }, (err) => {
        console.warn('Firestore cabs sync note:', err.message);
      });
    } catch (e) {
      console.warn('Cabs onSnapshot error:', e);
    }

    // Listen to drivers
    try {
      onSnapshot(collection(db, 'drivers'), (snap) => {
        const items: Driver[] = [];
        snap.forEach(d => {
          const data = d.data();
          items.push({
            id: d.id,
            ...data,
            name: data.name || data.driverName || 'N/A',
            driverId: data.driverId || d.id || 'N/A',
            phoneNumbers: data.phoneNumbers || data.phone || data.mobile || data.driverMobileNumber || '',
            clientName: data.clientName || data.client || 'N/A',
          } as Driver);
        });
        this.drivers = items;
        this.saveToLocalStorage('drivers');
        this.notify('drivers');
      }, (err) => {
        console.warn('Firestore drivers sync note:', err.message);
      });
    } catch (e) {
      console.warn('Drivers onSnapshot error:', e);
    }

    // Listen to clients
    try {
      onSnapshot(collection(db, 'clients'), (snap) => {
        const items: Client[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() } as Client));
        if (items.length > 0) {
          this.clients = items;
          this.saveToLocalStorage('clients');
          this.notify('clients');
        }
      }, (err) => {
        console.warn('Firestore clients sync note:', err.message);
      });
    } catch (e) {
      console.warn('Clients onSnapshot error:', e);
    }

    // Listen to uploadLogs
    try {
      const qLog = query(collection(db, 'uploadLogs'), orderBy('uploadedAt', 'desc'), limit(50));
      onSnapshot(qLog, (snap) => {
        const items: UploadLog[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() } as UploadLog));
        if (items.length > 0) {
          this.uploadLogs = items;
          this.saveToLocalStorage('uploadLogs');
          this.notify('uploadLogs');
        }
      }, (err) => {
        console.warn('Firestore uploadLogs sync note:', err.message);
      });
    } catch (e) {
      console.warn('UploadLogs onSnapshot error:', e);
    }
  }

  // ==========================================
  // RESILIENT WRITE & DELETE OPERATIONS
  // ==========================================

  public async saveTrips(newTrips: Trip[], clearExisting = false): Promise<void> {
    if (clearExisting) {
      this.trips = [...newTrips];
    } else {
      const map = new Map<string, Trip>();
      this.trips.forEach(t => map.set(t.tripId, t));
      newTrips.forEach(t => map.set(t.tripId, t));
      this.trips = Array.from(map.values());
    }
    this.saveToLocalStorage('trips');
    this.notify('trips');

    // Attempt sync to Firestore in chunks (safe if quota exceeded)
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < newTrips.length; i += CHUNK_SIZE) {
        const chunk = newTrips.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const tripRef = doc(db, 'trips', item.tripId);
          batch.set(tripRef, item, { merge: true });
        }
        await batch.commit();
      }
    } catch (err: any) {
      console.warn('Firestore trips batch write skipped/failed (persisted locally):', err?.message);
    }
  }

  public async saveFleetTrips(newTrips: Trip[], clearExisting = false): Promise<void> {
    return this.saveTrips(newTrips, clearExisting);
  }

  public async deleteFleetRecords(
    target: 'drivers' | 'cabs',
    scope: 'all' | 'client',
    clientId?: string,
    clientName?: string,
    deletedBy?: string
  ): Promise<{ deletedCount: number }> {
    const isTargetDrivers = target === 'drivers';
    const currentList = isTargetDrivers ? this.drivers : this.cabs;
    let itemsToKeep: any[] = [];
    let deletedCount = 0;

    const tCId = (clientId || '').trim().toLowerCase();
    const tCName = (clientName || '').trim().toLowerCase();

    if (scope === 'all') {
      deletedCount = currentList.length;
      itemsToKeep = [];
    } else {
      currentList.forEach(item => {
        const docCId = (item.clientId || '').trim().toLowerCase();
        const docCName = (item.clientName || '').trim().toLowerCase();
        const match = (
          (docCId && docCId === tCId) ||
          (docCName && tCName && docCName === tCName) ||
          (tCId.includes('air') && (docCId.includes('air') || docCName.includes('air')))
        );
        if (match) {
          deletedCount++;
        } else {
          itemsToKeep.push(item);
        }
      });
    }

    // Immediately update local store and notify all components
    if (isTargetDrivers) {
      this.drivers = itemsToKeep;
      this.saveToLocalStorage('drivers');
      this.notify('drivers');
    } else {
      this.cabs = itemsToKeep;
      this.saveToLocalStorage('cabs');
      this.notify('cabs');
    }

    // Attempt deletion in Firestore (gracefully handling quota limits)
    try {
      const collectionName = isTargetDrivers ? 'drivers' : 'cabs';
      const snap = await getDocs(collection(db, collectionName));
      const docsToDelete: { id: string }[] = [];

      snap.forEach(d => {
        const data = d.data();
        if (scope === 'all') {
          docsToDelete.push({ id: d.id });
        } else if (scope === 'client' && clientId) {
          const docCId = (data.clientId || '').trim().toLowerCase();
          const docCName = (data.clientName || '').trim().toLowerCase();
          if (
            (docCId && docCId === tCId) ||
            (docCName && tCName && docCName === tCName) ||
            (tCId.includes('air') && (docCId.includes('air') || docCName.includes('air')))
          ) {
            docsToDelete.push({ id: d.id });
          }
        }
      });

      const CHUNK_SIZE = 400;
      for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
        const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          batch.delete(doc(db, collectionName, item.id));
        });
        await batch.commit();
      }
    } catch (err: any) {
      console.warn(`Firestore ${target} deletion skipped/failed (persisted locally):`, err?.message);
    }

    // Record audit log
    const logItem: UploadLog = {
      id: `delete_${target}_${Date.now()}`,
      fileName: `Purge / Delete Previous ${target === 'drivers' ? 'Drivers' : 'Cabs'} Data`,
      uploadType: target,
      uploadedBy: deletedBy || 'Operations User',
      uploadedAt: new Date().toISOString(),
      recordCounts: deletedCount,
      details: {
        totalRowsRead: deletedCount,
      }
    };
    this.uploadLogs = [logItem, ...this.uploadLogs];
    this.saveToLocalStorage('uploadLogs');
    this.notify('uploadLogs');

    try {
      await addDoc(collection(db, 'uploadLogs'), logItem);
    } catch (e) {
      // safe catch
    }

    return { deletedCount };
  }

  public async deleteSingleRecord(target: 'drivers' | 'cabs', id: string): Promise<void> {
    if (target === 'drivers') {
      this.drivers = this.drivers.filter(d => d.id !== id && d.driverId !== id);
      this.saveToLocalStorage('drivers');
      this.notify('drivers');
    } else {
      this.cabs = this.cabs.filter(c => c.id !== id && c.etsVehicleId !== id && c.registrationNumber !== id);
      this.saveToLocalStorage('cabs');
      this.notify('cabs');
    }

    try {
      await deleteDoc(doc(db, target, id));
    } catch (err: any) {
      console.warn(`Firestore single delete doc ${id} skipped/failed (persisted locally):`, err?.message);
    }
  }

  public async wipeAllTrips(): Promise<number> {
    const count = this.trips.length;
    this.trips = [];
    this.saveToLocalStorage('trips');
    this.notify('trips');

    try {
      const snap = await getDocs(collection(db, 'trips'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e: any) {
      console.warn('Firestore wipe trips skipped/failed (cleared locally):', e?.message);
    }
    return count;
  }

  public getSnapshot<T = any>(name: CollectionName): T[] {
    return this.getCollectionData(name);
  }
}

export const fleetStorage = new FleetStorageService();
