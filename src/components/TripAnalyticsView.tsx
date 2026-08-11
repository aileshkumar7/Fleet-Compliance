/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  Clock, 
  Users, 
  Car, 
  Filter, 
  RefreshCw, 
  ArrowUpRight, 
  Building2,
  CheckCircle2,
  Activity,
  Layers,
  Sparkles,
  Search,
  X,
  ChevronRight,
  Phone,
  User,
  ArrowDownRight,
  ExternalLink,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Truck
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend, 
  Cell 
} from 'recharts';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Trip, Cab, Client } from '../types';
import { useAuth } from '../context/AuthContext';
import { exportTripSummaryReport, exportTripDetailedReport } from '../utils/reportGenerator';
import { normalizeRegistration } from '../utils/registrationUtils';

export type PeriodType = '24h' | '7d' | '1m';

/**
 * Safely parses Firestore Timestamp or date string/number into JS Date
 */
function parseTripDate(val: any): Date | null {
  if (!val) return null;
  let d: Date | null = null;
  if (val?.toDate && typeof val.toDate === 'function') {
    d = val.toDate();
  } else if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Match DD-MMM-YYYY, DD MMM YYYY, DD/MMM/YYYY e.g. "09-Aug-2026", "9 Aug 2026"
    const MONTH_MAP: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
    };
    const ddMmmYyyy = trimmed.match(/^(\d{1,2})[\/\-\.\s]+([A-Za-z]{3,9})[\/\-\.\s]+(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddMmmYyyy) {
      const day = parseInt(ddMmmYyyy[1], 10);
      const mStr = ddMmmYyyy[2].toLowerCase();
      const yrRaw = parseInt(ddMmmYyyy[3], 10);
      const year = yrRaw < 100 ? 2000 + yrRaw : yrRaw;
      const month = MONTH_MAP[mStr];
      if (month !== undefined) {
        const hrs = ddMmmYyyy[4] ? parseInt(ddMmmYyyy[4], 10) : 0;
        const mins = ddMmmYyyy[5] ? parseInt(ddMmmYyyy[5], 10) : 0;
        const secs = ddMmmYyyy[6] ? parseInt(ddMmmYyyy[6], 10) : 0;
        return new Date(year, month, day, hrs, mins, secs);
      }
    }
    // Match DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10) - 1;
      const year = parseInt(ddmmyyyy[3], 10);
      const hrs = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 0;
      const mins = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
      const secs = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
      return new Date(year, month, day, hrs, mins, secs);
    }
    // Match YYYY-MM-DD or YYYY/MM/DD
    const yyyymmdd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+|T)?(\d{1,2})?:?(\d{2})?:?(\d{2})?/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = parseInt(yyyymmdd[2], 10) - 1;
      const day = parseInt(yyyymmdd[3], 10);
      const hrs = yyyymmdd[4] ? parseInt(yyyymmdd[4], 10) : 0;
      const mins = yyyymmdd[5] ? parseInt(yyyymmdd[5], 10) : 0;
      const secs = yyyymmdd[6] ? parseInt(yyyymmdd[6], 10) : 0;
      return new Date(year, month, day, hrs, mins, secs);
    }
    d = new Date(trimmed);
  } else if (typeof val === 'number') {
    d = new Date(val);
  }

  if (!d || isNaN(d.getTime())) return null;

  // Handle SheetJS/Excel UTC midnight timestamps (00:00:00.000Z)
  // Convert UTC components to local Date so .getDate() and .toLocaleDateString() match calendar day
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  }

  return d;
}

/**
 * Formats time values (Date, Timestamp, or "HH:MM" string)
 */
function formatTimeString(val: any): string {
  if (!val) return '—';
  if (val?.toDate && typeof val.toDate === 'function') {
    const d = val.toDate();
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '—';
    return val.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof val === 'string') {
    if (!val.trim()) return '—';
    const d = new Date(val);
    if (!isNaN(d.getTime()) && val.includes('T')) {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return val;
  }
  return String(val);
}

export const TripAnalyticsView: React.FC<{ onNavigateToTripUpload?: () => void }> = ({ onNavigateToTripUpload }) => {
  const { userProfile, isAdmin } = useAuth();
  const downloadedBy = userProfile?.name || userProfile?.email || 'Fleet Operations Admin';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [cabs, setCabs] = useState<Cab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('7d');
  const [selectedSpecificDate, setSelectedSpecificDate] = useState<string | null>(null);
  const [showDatePickerPopover, setShowDatePickerPopover] = useState<boolean>(false);
  const [datePickerInputVal, setDatePickerInputVal] = useState<string>('');

  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [notUtilizedSearchQuery, setNotUtilizedSearchQuery] = useState<string>('');

  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Drill-down view state for selected cab
  const [selectedCabReg, setSelectedCabReg] = useState<string | null>(null);
  const [cabSearchQuery, setCabSearchQuery] = useState<string>('');

  // Search by last 4 digits of Registration
  const [digitSearch, setDigitSearch] = useState<string>('');

  // Report export state
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  const handleExportSummary = async (targetCab: string | null = null) => {
    try {
      setIsExporting(true);
      setShowExportMenu(false);
      const result = await exportTripSummaryReport(
        trips,
        selectedPeriod,
        targetCab,
        downloadedBy,
        selectedSpecificDate
      );
      setExportSuccessMsg(`Summary report downloaded: ${result.fileName} (${result.recordCount} cabs)`);
      setTimeout(() => setExportSuccessMsg(null), 6000);
    } catch (err) {
      console.error('Failed to export summary report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDetailed = async (targetCab: string | null = null) => {
    try {
      setIsExporting(true);
      setShowExportMenu(false);
      const result = await exportTripDetailedReport(
        trips,
        selectedPeriod,
        targetCab,
        downloadedBy,
        selectedSpecificDate
      );
      setExportSuccessMsg(`Detailed report downloaded: ${result.fileName} (${result.recordCount} trips)`);
      setTimeout(() => setExportSuccessMsg(null), 6000);
    } catch (err) {
      console.error('Failed to export detailed report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Subscribe to trips, cabs, and clients collections in Firestore
  useEffect(() => {
    const qTrips = query(collection(db, 'trips'));
    const unsubTrips = onSnapshot(
      qTrips,
      (snapshot) => {
        const list: Trip[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Trip);
        });
        setTrips(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching trips for analytics:', err);
        setLoading(false);
      }
    );

    const qCabs = query(collection(db, 'cabs'));
    const unsubCabs = onSnapshot(
      qCabs,
      (snapshot) => {
        const list: Cab[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            ...data,
            registrationNumber: data.registrationNumber || data.regNumber || data.vehicleNumber || 'N/A',
            clientName: data.clientName || data.client || 'N/A',
          } as Cab);
        });
        setCabs(list);
      },
      (err) => console.error('Error fetching cabs for analytics:', err)
    );

    const qClients = query(collection(db, 'clients'));
    const unsubClients = onSnapshot(
      qClients,
      (snapshot) => {
        const list: Client[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Client);
        });
        setClients(list);
      },
      (err) => console.error('Error fetching clients for analytics:', err)
    );

    return () => {
      unsubTrips();
      unsubCabs();
      unsubClients();
    };
  }, []);

  // Compute local calendar day boundaries
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  // Today's YYYY-MM-DD
  const todayKey = useMemo(() => {
    const y = currentYear;
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(currentDate).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [currentYear, currentMonth, currentDate]);

  // Map and List of all available dates with trips in the database
  const availableTripDatesMap = useMemo(() => {
    const map = new Map<string, { dateKey: string; count: number; dateObj: Date }>();
    trips.forEach((t) => {
      const tripId = t.tripId || t.id;
      if (!tripId) return;
      const d = parseTripDate(t.date || t.deploymentTime);
      if (!d) return;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;

      if (!map.has(key)) {
        map.set(key, { dateKey: key, count: 0, dateObj: d });
      }
      map.get(key)!.count += 1;
    });
    return map;
  }, [trips]);

  const availableTripDatesList = useMemo(() => {
    const list = Array.from(availableTripDatesMap.values()) as Array<{
      dateKey: string;
      count: number;
      dateObj: Date;
    }>;
    list.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return list;
  }, [availableTripDatesMap]);

  const availableDateSet = useMemo(() => {
    return new Set(availableTripDatesMap.keys());
  }, [availableTripDatesMap]);

  // Specific Date Window object
  const specificDateWindow = useMemo(() => {
    if (!selectedSpecificDate) return null;
    const parts = selectedSpecificDate.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

    const start = new Date(y, m, d, 0, 0, 0, 0);
    const end = new Date(y, m, d, 23, 59, 59, 999);
    const formattedLabel = start.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return { start, end, dateKey: selectedSpecificDate, dateObj: start, formattedLabel };
  }, [selectedSpecificDate]);

  // 1. Today's full calendar day (00:00:00 to 23:59:59.999)
  const todayStart = new Date(currentYear, currentMonth, currentDate, 0, 0, 0, 0);
  const todayEnd = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999);

  const latestUploadedDateItem = useMemo(() => {
    return availableTripDatesList.length > 0 ? availableTripDatesList[0] : null;
  }, [availableTripDatesList]);

  const hasDataForToday = useMemo(() => {
    return availableDateSet.has(todayKey);
  }, [availableDateSet, todayKey]);

  // Effective 24h start/end: If today has 0 trips in DB, anchor 24h scope to the latest uploaded trip date
  const effective24hStart = useMemo(() => {
    if (hasDataForToday) return todayStart;
    if (latestUploadedDateItem) {
      const d = latestUploadedDateItem.dateObj;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }
    return todayStart;
  }, [hasDataForToday, todayStart, latestUploadedDateItem]);

  const effective24hEnd = useMemo(() => {
    if (hasDataForToday) return todayEnd;
    if (latestUploadedDateItem) {
      const d = latestUploadedDateItem.dateObj;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    }
    return todayEnd;
  }, [hasDataForToday, todayEnd, latestUploadedDateItem]);

  // 2. Last 7 full calendar days (Today + preceding 6 days)
  const last7DaysStart = new Date(currentYear, currentMonth, currentDate - 6, 0, 0, 0, 0);

  // 3. Last 1 Month (30 full calendar days: Today + preceding 29 days)
  const last30DaysStart = new Date(currentYear, currentMonth, currentDate - 29, 0, 0, 0, 0);

  // User accessibility keys
  const userClientKeys = useMemo(() => {
    return Array.from(
      new Set(
        [userProfile?.clientId, ...(userProfile?.assignedClientIds || [])]
          .filter(Boolean)
          .map((s) => String(s).trim().toLowerCase())
      )
    );
  }, [userProfile]);

  const isAllClientsUser = isAdmin || userClientKeys.includes('all');

  const isCabAccessible = (c: Cab) => {
    if (isAllClientsUser) return true;
    if (userClientKeys.length === 0) return true;
    const cId = (c.clientId || '').trim().toLowerCase();
    const cName = (c.clientName || '').trim().toLowerCase();
    return userClientKeys.some((k) => k === cId || k === cName);
  };

  const availableClientOptions = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => {
      const name = c.clientName || c.name || '';
      if (name.trim()) {
        map.set(name.trim().toLowerCase(), name.trim());
      }
    });
    cabs.forEach((c) => {
      const name = c.clientName || '';
      if (name.trim() && name !== 'N/A') {
        if (!map.has(name.trim().toLowerCase())) {
          map.set(name.trim().toLowerCase(), name.trim());
        }
      }
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [clients, cabs]);

  // Shared Registration Normalization Helper
  const normalizeReg = normalizeRegistration;

  // State for cab utilization table filter ('not_utilized' | 'utilized' | 'all')
  const [utilizationTab, setUtilizationTab] = useState<'not_utilized' | 'utilized' | 'all'>('not_utilized');

  // Active Cabs List (status === "active", matching client filter & access)
  const activeCabsList = useMemo(() => {
    return cabs.filter((c) => {
      if (!isCabAccessible(c)) return false;

      const status = (c.status || 'active').trim().toLowerCase();
      if (status !== 'active') return false;

      if (selectedClientFilter !== 'all') {
        const cId = (c.clientId || '').trim().toLowerCase();
        const cName = (c.clientName || '').trim().toLowerCase();
        const sel = selectedClientFilter.trim().toLowerCase();
        if (cId !== sel && cName !== sel) return false;
      }

      return true;
    });
  }, [cabs, isAllClientsUser, userClientKeys, selectedClientFilter]);

  // Map of Normalized Registration -> Stats (tripSet, boardings, latestTripDate) for ACTIVE TIME SCOPE
  const activeScopeCabStatsByNormMap = useMemo(() => {
    const startDateCutoff = specificDateWindow
      ? specificDateWindow.start
      : selectedPeriod === '24h'
      ? effective24hStart
      : selectedPeriod === '7d'
      ? last7DaysStart
      : last30DaysStart;

    const endDateCutoff = specificDateWindow
      ? specificDateWindow.end
      : selectedPeriod === '24h'
      ? effective24hEnd
      : todayEnd;

    const map = new Map<string, { tripSet: Set<string>; boardings: number; latestTripDate: Date | null }>();

    trips.forEach((t) => {
      if (selectedClientFilter !== 'all') {
        const cName = (t.clientName || '').trim().toLowerCase();
        const sel = selectedClientFilter.trim().toLowerCase();
        if (cName && cName !== sel) return;
      }

      const rawReg = t.registration;
      if (!rawReg) return;

      const norm = normalizeReg(rawReg);
      if (!norm) return;

      const tripId = t.tripId || t.id;
      if (!tripId) return;

      const d = parseTripDate(t.date || t.deploymentTime);
      if (!d) return;

      const time = d.getTime();
      if (time >= startDateCutoff.getTime() && time <= endDateCutoff.getTime()) {
        if (!map.has(norm)) {
          map.set(norm, { tripSet: new Set<string>(), boardings: 0, latestTripDate: null });
        }
        const item = map.get(norm)!;
        if (!item.tripSet.has(tripId)) {
          item.tripSet.add(tripId);
          item.boardings += (t.passengerCount || 1);
        }
        if (!item.latestTripDate || time > item.latestTripDate.getTime()) {
          item.latestTripDate = d;
        }
      }
    });

    return map;
  }, [
    trips,
    specificDateWindow,
    selectedPeriod,
    effective24hStart,
    effective24hEnd,
    todayStart,
    todayEnd,
    last7DaysStart,
    last30DaysStart,
    selectedClientFilter,
  ]);

  // Set of normalized Registrations for Trips occurring within the active time scope
  const activeScopeTripNormRegs = useMemo(() => {
    return new Set(activeScopeCabStatsByNormMap.keys());
  }, [activeScopeCabStatsByNormMap]);

  // Map of Normalized Reg -> Most Recent Trip Date & History Stats across ALL trip history
  const allHistoryCabStatsByNormMap = useMemo(() => {
    const map = new Map<string, { tripSet: Set<string>; boardings: number; latestTripDate: Date | null }>();
    trips.forEach((t) => {
      const rawReg = t.registration;
      if (!rawReg) return;

      const norm = normalizeReg(rawReg);
      if (!norm) return;

      const tripId = t.tripId || t.id;
      const d = parseTripDate(t.date || t.deploymentTime);

      if (!map.has(norm)) {
        map.set(norm, { tripSet: new Set<string>(), boardings: 0, latestTripDate: null });
      }

      const item = map.get(norm)!;
      if (tripId && !item.tripSet.has(tripId)) {
        item.tripSet.add(tripId);
        item.boardings += (t.passengerCount || 1);
      }

      if (d) {
        if (!item.latestTripDate || d.getTime() > item.latestTripDate.getTime()) {
          item.latestTripDate = d;
        }
      }
    });
    return map;
  }, [trips]);

  // Map of Normalized Reg -> Most Recent Trip Date across ALL trip history
  const lastTripDateByCabNormMap = useMemo(() => {
    const map = new Map<string, Date>();
    allHistoryCabStatsByNormMap.forEach((val, key) => {
      if (val.latestTripDate) map.set(key, val.latestTripDate);
    });
    return map;
  }, [allHistoryCabStatsByNormMap]);

  // Compute Utilization metrics & partitioned lists
  const cabUtilizationData = useMemo(() => {
    const utilizedCabs: Cab[] = [];
    const notUtilizedCabs: Cab[] = [];

    activeCabsList.forEach((cab) => {
      const norm = normalizeReg(cab.registrationNumber);
      if (norm && activeScopeTripNormRegs.has(norm)) {
        utilizedCabs.push(cab);
      } else {
        notUtilizedCabs.push(cab);
      }
    });

    const activeCount = activeCabsList.length;
    const utilizedCount = utilizedCabs.length;
    const notUtilizedCount = notUtilizedCabs.length;

    const utilizationPct =
      activeCount > 0 ? ((utilizedCount / activeCount) * 100).toFixed(1) : '0.0';

    return {
      activeCount,
      utilizedCount,
      notUtilizedCount,
      utilizationPct,
      utilizedCabs,
      notUtilizedCabs,
    };
  }, [activeCabsList, activeScopeTripNormRegs]);

  // Filtered list of Cabs for the Utilization table (supports tab switching & search)
  const filteredNotUtilizedCabs = useMemo(() => {
    let list: Cab[] = [];
    if (utilizationTab === 'not_utilized') {
      list = cabUtilizationData.notUtilizedCabs;
    } else if (utilizationTab === 'utilized') {
      list = cabUtilizationData.utilizedCabs;
    } else {
      list = activeCabsList;
    }

    if (!notUtilizedSearchQuery.trim()) {
      return list;
    }
    const q = notUtilizedSearchQuery.trim().toLowerCase();
    return list.filter((cab) => {
      const reg = (cab.registrationNumber || '').toLowerCase();
      const vType = (cab.vehicleType || '').toLowerCase();
      const client = (cab.clientName || '').toLowerCase();
      return reg.includes(q) || vType.includes(q) || client.includes(q);
    });
  }, [cabUtilizationData, activeCabsList, utilizationTab, notUtilizedSearchQuery]);

  const formatLastTripLabel = (date: Date | null): string => {
    if (!date || isNaN(date.getTime())) {
      return 'No trips on record';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const formattedDateStr = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    if (diffMs < 0) {
      return `Today (${formattedDateStr})`;
    }

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `Today at ${timeStr}`;
    }
    if (diffDays === 1) {
      return `Yesterday (${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })})`;
    }
    return `Last trip: ${diffDays} days ago (${formattedDateStr})`;
  };

  // Filter trips for summary counts
  const analyticsSummary = useMemo(() => {
    if (specificDateWindow) {
      const tripSet = new Set<string>();
      let totalPassengers = 0;

      trips.forEach((trip) => {
        const tripId = trip.tripId || trip.id;
        if (!tripId) return;

        const d = parseTripDate(trip.date || trip.deploymentTime);
        if (!d) return;

        const t = d.getTime();
        if (t >= specificDateWindow.start.getTime() && t <= specificDateWindow.end.getTime()) {
          if (!tripSet.has(tripId)) {
            tripSet.add(tripId);
            totalPassengers += trip.passengerCount || 1;
          }
        }
      });

      return {
        count24h: tripSet.size,
        count7d: tripSet.size,
        count1m: tripSet.size,
        pax24h: totalPassengers,
        pax7d: totalPassengers,
        pax1m: totalPassengers,
      };
    }

    const trips24hSet = new Set<string>();
    const trips7dSet = new Set<string>();
    const trips1mSet = new Set<string>();

    let totalPassengers24h = 0;
    let totalPassengers7d = 0;
    let totalPassengers1m = 0;

    trips.forEach((trip) => {
      const tripId = trip.tripId || trip.id;
      if (!tripId) return;

      const d = parseTripDate(trip.date || trip.deploymentTime);
      if (!d) return;

      const t = d.getTime();
      const pax = trip.passengerCount || 1;

      // Check 24 Hours (Effective 24h window)
      if (t >= effective24hStart.getTime() && t <= effective24hEnd.getTime()) {
        if (!trips24hSet.has(tripId)) {
          trips24hSet.add(tripId);
          totalPassengers24h += pax;
        }
      }

      // Check Last 7 Days (7 full calendar days)
      if (t >= last7DaysStart.getTime() && t <= todayEnd.getTime()) {
        if (!trips7dSet.has(tripId)) {
          trips7dSet.add(tripId);
          totalPassengers7d += pax;
        }
      }

      // Check Last 1 Month (30 full calendar days)
      if (t >= last30DaysStart.getTime() && t <= todayEnd.getTime()) {
        if (!trips1mSet.has(tripId)) {
          trips1mSet.add(tripId);
          totalPassengers1m += pax;
        }
      }
    });

    return {
      count24h: trips24hSet.size,
      count7d: trips7dSet.size,
      count1m: trips1mSet.size,
      pax24h: totalPassengers24h,
      pax7d: totalPassengers7d,
      pax1m: totalPassengers1m,
    };
  }, [trips, specificDateWindow, todayStart, todayEnd, last7DaysStart, last30DaysStart]);

  // Construct chart data depending on selectedPeriod or specificDateWindow
  const chartData = useMemo(() => {
    if (specificDateWindow || selectedPeriod === '24h') {
      const windowStart = specificDateWindow ? specificDateWindow.start : effective24hStart;
      const windowEnd = specificDateWindow ? specificDateWindow.end : effective24hEnd;

      // Hourly breakdown (00:00 to 23:00)
      const hourBuckets: { [hour: number]: Set<string> } = {};
      const hourPaxMap: { [hour: number]: number } = {};

      for (let h = 0; h < 24; h++) {
        hourBuckets[h] = new Set<string>();
        hourPaxMap[h] = 0;
      }

      trips.forEach((trip) => {
        const tripId = trip.tripId || trip.id;
        if (!tripId) return;

        const d = parseTripDate(trip.deploymentTime || trip.date);
        if (!d) return;

        const t = d.getTime();
        if (t >= windowStart.getTime() && t <= windowEnd.getTime()) {
          const hour = d.getHours();
          if (!hourBuckets[hour].has(tripId)) {
            hourBuckets[hour].add(tripId);
            hourPaxMap[hour] += trip.passengerCount || 1;
          }
        }
      });

      return Array.from({ length: 24 }).map((_, h) => {
        const label = `${h.toString().padStart(2, '0')}:00`;
        return {
          timeLabel: label,
          tripsCount: hourBuckets[h].size,
          passengersCount: hourPaxMap[h],
        };
      });
    }

    const numDays = selectedPeriod === '7d' ? 7 : 30;
    const dayBuckets: { [dayKey: string]: { tripSet: Set<string>; pax: number; dateObj: Date } } = {};

    // Generate buckets for the last N calendar days
    for (let i = numDays - 1; i >= 0; i--) {
      const dayObj = new Date(currentYear, currentMonth, currentDate - i, 0, 0, 0, 0);
      const dayKey = `${dayObj.getFullYear()}-${(dayObj.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${dayObj.getDate().toString().padStart(2, '0')}`;

      dayBuckets[dayKey] = {
        tripSet: new Set<string>(),
        pax: 0,
        dateObj: dayObj,
      };
    }

    const startDateCutoff = selectedPeriod === '7d' ? last7DaysStart : last30DaysStart;

    trips.forEach((trip) => {
      const tripId = trip.tripId || trip.id;
      if (!tripId) return;

      const d = parseTripDate(trip.date || trip.deploymentTime);
      if (!d) return;

      const t = d.getTime();
      if (t >= startDateCutoff.getTime() && t <= todayEnd.getTime()) {
        const dayKey = `${d.getFullYear()}-${(d.getMonth() + 1)
          .toString()
          .padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

        if (dayBuckets[dayKey]) {
          if (!dayBuckets[dayKey].tripSet.has(tripId)) {
            dayBuckets[dayKey].tripSet.add(tripId);
            dayBuckets[dayKey].pax += trip.passengerCount || 1;
          }
        }
      }
    });

    return Object.keys(dayBuckets).map((key) => {
      const item = dayBuckets[key];
      const formattedLabel = item.dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      });
      return {
        timeLabel: formattedLabel,
        rawDateStr: key,
        tripsCount: item.tripSet.size,
        passengersCount: item.pax,
      };
    });
  }, [trips, selectedPeriod, specificDateWindow, todayStart, todayEnd, last7DaysStart, last30DaysStart, currentYear, currentMonth, currentDate]);

  // Cab summary breakdown for the active period or specific date
  const cabBreakdownList = useMemo(() => {
    const startDateCutoff = specificDateWindow
      ? specificDateWindow.start
      : selectedPeriod === '24h'
      ? todayStart
      : selectedPeriod === '7d'
      ? last7DaysStart
      : last30DaysStart;

    const endDateCutoff = specificDateWindow ? specificDateWindow.end : todayEnd;

    const cabMap: {
      [normReg: string]: {
        registration: string;
        tripSet: Set<string>;
        passengers: number;
        drivers: Set<string>;
        latestTripDate: Date | null;
        vehicleType: string;
      };
    } = {};

    trips.forEach((t) => {
      const rawReg = t.registration;
      if (!rawReg) return;

      const norm = normalizeRegistration(rawReg);
      if (!norm) return;

      const tripId = t.tripId || t.id;
      if (!tripId) return;

      const d = parseTripDate(t.date || t.deploymentTime);
      if (!d) return;

      if (d.getTime() >= startDateCutoff.getTime() && d.getTime() <= endDateCutoff.getTime()) {
        if (!cabMap[norm]) {
          cabMap[norm] = {
            registration: rawReg.trim().toUpperCase(),
            tripSet: new Set<string>(),
            passengers: 0,
            drivers: new Set<string>(),
            latestTripDate: null,
            vehicleType: t.vehicleType || 'Cab',
          };
        }

        if (!cabMap[norm].tripSet.has(tripId)) {
          cabMap[norm].tripSet.add(tripId);
          cabMap[norm].passengers += t.passengerCount || 1;
        }

        if (t.driverName && t.driverName.trim()) {
          cabMap[norm].drivers.add(t.driverName.trim());
        }

        if (!cabMap[norm].latestTripDate || d.getTime() > cabMap[norm].latestTripDate!.getTime()) {
          cabMap[norm].latestTripDate = d;
        }
      }
    });

    return Object.values(cabMap).sort((a, b) => b.tripSet.size - a.tripSet.size);
  }, [trips, specificDateWindow, selectedPeriod, todayStart, todayEnd, last7DaysStart, last30DaysStart]);

  // All distinct cab registrations across trips and cabs database
  const allDistinctRegistrations = useMemo(() => {
    const set = new Set<string>();
    trips.forEach((t) => {
      const reg = (t.registration || '').trim().toUpperCase();
      if (reg) set.add(reg);
    });
    cabs.forEach((c) => {
      const reg = (c.registrationNumber || '').trim().toUpperCase();
      if (reg) set.add(reg);
    });
    return Array.from(set).sort();
  }, [trips, cabs]);

  // Compute matching cab registrations ignoring hyphens, spaces, leading zeros, and case
  const digitMatchingCabs = useMemo(() => {
    const rawQ = digitSearch.trim();
    if (!rawQ) return [];

    const normQ = normalizeRegistration(rawQ);

    const matches = allDistinctRegistrations.filter((reg) => {
      const normReg = normalizeRegistration(reg);
      return normReg.includes(normQ);
    });

    return matches;
  }, [allDistinctRegistrations, digitSearch]);

  const handleDigitSearchChange = (val: string) => {
    setDigitSearch(val);
    const rawQ = val.trim();
    if (!rawQ) return;

    const normQ = normalizeRegistration(rawQ);

    const matches = allDistinctRegistrations.filter((reg) => {
      const normReg = normalizeRegistration(reg);
      return normReg.includes(normQ);
    });

    // If search matches EXACTLY ONE CAB and user typed at least 3 chars, directly open drill-down
    if (matches.length === 1 && rawQ.length >= 3) {
      setSelectedCabReg(matches[0]);
      setCabSearchQuery('');
    }
  };

  const handleDigitSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (digitMatchingCabs.length === 1) {
      setSelectedCabReg(digitMatchingCabs[0]);
      setCabSearchQuery('');
    }
  };

  // Filtered trips for the active period or specific date
  const activePeriodTrips = useMemo(() => {
    const startDateCutoff = specificDateWindow
      ? specificDateWindow.start
      : selectedPeriod === '24h'
      ? effective24hStart
      : selectedPeriod === '7d'
      ? last7DaysStart
      : last30DaysStart;

    const endDateCutoff = specificDateWindow
      ? specificDateWindow.end
      : selectedPeriod === '24h'
      ? effective24hEnd
      : todayEnd;

    const matchedSet = new Set<string>();
    const result: Trip[] = [];

    trips.forEach((t) => {
      const tripId = t.tripId || t.id;
      if (!tripId || matchedSet.has(tripId)) return;

      const d = parseTripDate(t.date || t.deploymentTime);
      if (!d) return;

      if (d.getTime() >= startDateCutoff.getTime() && d.getTime() <= endDateCutoff.getTime()) {
        matchedSet.add(tripId);

        // Search query filtering
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matches =
            (t.tripId || '').toLowerCase().includes(q) ||
            (t.registration || '').toLowerCase().includes(q) ||
            (t.driverName || '').toLowerCase().includes(q) ||
            (t.facility || '').toLowerCase().includes(q) ||
            (t.direction || '').toLowerCase().includes(q);

          if (!matches) return;
        }

        result.push(t);
      }
    });

    return result.sort((a, b) => {
      const da = parseTripDate(a.date || a.deploymentTime)?.getTime() || 0;
      const dbDate = parseTripDate(b.date || b.deploymentTime)?.getTime() || 0;
      return dbDate - da;
    });
  }, [trips, specificDateWindow, selectedPeriod, searchQuery, effective24hStart, effective24hEnd, todayStart, todayEnd, last7DaysStart, last30DaysStart]);

  // Trips performed by the selected cab during the selected period or specific date
  const selectedCabTrips = useMemo(() => {
    if (!selectedCabReg) return [];

    const startDateCutoff = specificDateWindow
      ? specificDateWindow.start
      : selectedPeriod === '24h'
      ? effective24hStart
      : selectedPeriod === '7d'
      ? last7DaysStart
      : last30DaysStart;

    const endDateCutoff = specificDateWindow
      ? specificDateWindow.end
      : selectedPeriod === '24h'
      ? effective24hEnd
      : todayEnd;

    const targetNorm = normalizeRegistration(selectedCabReg);
    const matchedSet = new Set<string>();
    const list: Trip[] = [];

    trips.forEach((t) => {
      const norm = normalizeRegistration(t.registration);
      if (norm !== targetNorm) return;

      const tripId = t.tripId || t.id;
      if (!tripId || matchedSet.has(tripId)) return;

      const d = parseTripDate(t.date || t.deploymentTime);
      if (!d) return;

      if (d.getTime() >= startDateCutoff.getTime() && d.getTime() <= endDateCutoff.getTime()) {
        matchedSet.add(tripId);

        if (cabSearchQuery.trim()) {
          const q = cabSearchQuery.toLowerCase().trim();
          const matches =
            (t.tripId || '').toLowerCase().includes(q) ||
            (t.driverName || '').toLowerCase().includes(q) ||
            (t.driverContactNo || '').toLowerCase().includes(q) ||
            (t.direction || '').toLowerCase().includes(q) ||
            (t.facility || '').toLowerCase().includes(q);

          if (!matches) return;
        }

        list.push(t);
      }
    });

    // Sorted by most recent first
    return list.sort((a, b) => {
      const da = parseTripDate(a.date || a.deploymentTime)?.getTime() || 0;
      const dbDate = parseTripDate(b.date || b.deploymentTime)?.getTime() || 0;
      return dbDate - da;
    });
  }, [trips, selectedCabReg, specificDateWindow, selectedPeriod, cabSearchQuery, effective24hStart, effective24hEnd, todayStart, todayEnd, last7DaysStart, last30DaysStart]);

  const selectedCabBoardings = useMemo(() => {
    return selectedCabTrips.reduce((sum, t) => sum + (t.passengerCount || 1), 0);
  }, [selectedCabTrips]);

  const formatDateLabel = (val: any) => {
    if (!val) return 'N/A';
    try {
      const d = val?.toDate ? val.toDate() : new Date(val);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  const activePeriodTitle = specificDateWindow
    ? `Specific Date (${specificDateWindow.formattedLabel})`
    : selectedPeriod === '24h'
    ? (hasDataForToday
        ? 'Today (Last 24 Hours: 00:00–23:59)'
        : `Latest Uploaded Data (${latestUploadedDateItem?.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) || '24 Hours'})`)
    : selectedPeriod === '7d'
    ? 'Last 7 Calendar Days'
    : 'Last 1 Month (30 Calendar Days)';

  const periodHeadlineText = specificDateWindow
    ? `date ${specificDateWindow.formattedLabel}`
    : selectedPeriod === '24h'
    ? '24 hours'
    : selectedPeriod === '7d'
    ? '7 days'
    : '1 month';

  const activeCabReg = useMemo(() => {
    if (selectedCabReg) return selectedCabReg;
    if (digitSearch.trim() && digitMatchingCabs.length === 1) return digitMatchingCabs[0];
    return null;
  }, [selectedCabReg, digitSearch, digitMatchingCabs]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Toast Notification Banner */}
      {exportSuccessMsg && (
        <div className="bg-emerald-950 text-emerald-100 border border-emerald-600/80 px-5 py-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{exportSuccessMsg}</span>
          </div>
          <button
            onClick={() => setExportSuccessMsg(null)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-bold shadow-md">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Trip Analytics & Trends</h2>
              <p className="text-xs text-slate-500">
                Distinct trip volume metrics across calendar days (00:00–23:59) from the Firestore database.
              </p>
            </div>
          </div>
        </div>

        {/* Global Period Selector Controls & Download Report Dropdown */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Period Tabs & Select Date Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                onClick={() => {
                  setSelectedPeriod('24h');
                  setSelectedSpecificDate(null);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !selectedSpecificDate && selectedPeriod === '24h'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {hasDataForToday
                  ? '24 Hours (Today)'
                  : `24 Hours (${latestUploadedDateItem ? latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Today'})`}
              </button>
              <button
                onClick={() => {
                  setSelectedPeriod('7d');
                  setSelectedSpecificDate(null);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !selectedSpecificDate && selectedPeriod === '7d'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => {
                  setSelectedPeriod('1m');
                  setSelectedSpecificDate(null);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !selectedSpecificDate && selectedPeriod === '1m'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Last 1 Month
              </button>
            </div>

            {/* Select Date Calendar Button & Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDatePickerPopover(!showDatePickerPopover)}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                  selectedSpecificDate
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md ring-2 ring-blue-500/30'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
                }`}
              >
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>
                  {selectedSpecificDate && specificDateWindow
                    ? specificDateWindow.formattedLabel
                    : 'Select Date'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${showDatePickerPopover ? 'rotate-180' : ''}`} />
              </button>

              {/* Date Picker Popover */}
              {showDatePickerPopover && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDatePickerPopover(false)}
                  />
                  <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 z-50 w-80 bg-slate-900 text-white border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold text-white">Select Single Date</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDatePickerPopover(false)}
                        className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Notice if Today is missing from uploaded dataset */}
                    {!hasDataForToday && (
                      <div className="bg-slate-800/90 border border-amber-500/40 p-2.5 rounded-xl text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>No trips recorded for Today ({todayKey})</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Latest uploaded date: <strong className="text-amber-300">{latestUploadedDateItem ? latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</strong> ({latestUploadedDateItem?.count || 0} trips).
                        </p>
                      </div>
                    )}

                    {/* Quick Date Input */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-300 block">
                        Choose date with uploaded trips:
                      </label>
                      <input
                        type="date"
                        value={selectedSpecificDate || datePickerInputVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDatePickerInputVal(val);
                          if (val && availableDateSet.has(val)) {
                            setSelectedSpecificDate(val);
                            setShowDatePickerPopover(false);
                          }
                        }}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 font-mono focus:outline-none focus:border-blue-500"
                      />
                      {datePickerInputVal && !availableDateSet.has(datePickerInputVal) && (
                        <p className="text-[11px] text-amber-400 font-medium">
                          No trip data uploaded for {datePickerInputVal}. Select an active date below.
                        </p>
                      )}
                    </div>

                    {/* List of active available dates */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Available Uploaded Dates ({availableTripDatesList.length})
                      </span>
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-800/80 rounded-xl p-1 bg-slate-950/50">
                        {availableTripDatesList.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No uploaded trips found.
                          </div>
                        ) : (
                          availableTripDatesList.map((item) => {
                            const isToday = item.dateKey === todayKey;
                            const isSelected = item.dateKey === selectedSpecificDate;

                            return (
                              <button
                                key={item.dateKey}
                                type="button"
                                onClick={() => {
                                  setSelectedSpecificDate(item.dateKey);
                                  setShowDatePickerPopover(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer flex items-center justify-between ${
                                  isSelected
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span>
                                    {item.dateObj.toLocaleDateString('en-GB', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  {isToday && (
                                    <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.5 rounded font-sans font-bold">
                                      Today
                                    </span>
                                  )}
                                </div>
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${isSelected ? 'bg-blue-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                  {item.count} {item.count === 1 ? 'trip' : 'trips'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    {selectedSpecificDate && (
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Active: {selectedSpecificDate}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSpecificDate(null);
                            setShowDatePickerPopover(false);
                          }}
                          className="text-xs text-amber-400 hover:text-amber-300 font-bold cursor-pointer underline"
                        >
                          Clear Date Filter
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Client Filter Dropdown */}
            {availableClientOptions.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                <Building2 className="w-4 h-4 text-slate-500 ml-1.5 shrink-0" />
                <select
                  value={selectedClientFilter}
                  onChange={(e) => setSelectedClientFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 pr-2 py-1 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Clients ({activeCabsList.length} Active Cabs)</option>
                  {availableClientOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Download Report Button & Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExporting}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-xs flex items-center gap-2 cursor-pointer border border-emerald-500"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Generating...' : 'Download Report'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* EXPORT MENU DROPDOWN */}
            {showExportMenu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-3.5 z-40 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 px-1">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export Reports ({periodHeadlineText})</span>
                    </span>
                    <button
                      onClick={() => setShowExportMenu(false)}
                      className="text-slate-400 hover:text-white p-0.5 rounded-md cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Active Filter Context */}
                  {activeCabReg && (
                    <div className="bg-blue-950/80 border border-blue-800/80 p-2.5 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-blue-300 font-bold">
                        <span>Active Filtered Cab:</span>
                        <span className="font-mono text-white bg-blue-900 px-1.5 py-0.5 rounded">{activeCabReg}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Export specific data for <strong className="text-slate-200">{activeCabReg}</strong> or full fleet.
                      </p>
                    </div>
                  )}

                  {/* Option 1: SUMMARY REPORT */}
                  <div className="bg-slate-800/80 hover:bg-slate-800 p-3 rounded-xl border border-slate-700/80 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0 mt-0.5">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Summary Report (.xlsx)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          One row per cab with total trips, per-day breakdown columns, and grand totals row.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
                      {activeCabReg && (
                        <button
                          type="button"
                          onClick={() => handleExportSummary(activeCabReg)}
                          className="w-full text-left bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <span>Export {activeCabReg} Summary</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExportSummary(null)}
                        className={`w-full text-left font-bold text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                          activeCabReg
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <span>Export Full Fleet Summary ({cabBreakdownList.length} cabs)</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Option 2: DETAILED REPORT */}
                  <div className="bg-slate-800/80 hover:bg-slate-800 p-3 rounded-xl border border-slate-700/80 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg shrink-0 mt-0.5">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Detailed Report (.xlsx)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          One row per individual trip (Trip ID, Driver, Pickup/Drop Times, Pax Count, Direction).
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
                      {activeCabReg && (
                        <button
                          type="button"
                          onClick={() => handleExportDetailed(activeCabReg)}
                          className="w-full text-left bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between"
                        >
                          <span>Export {activeCabReg} Trips</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExportDetailed(null)}
                        className={`w-full text-left font-bold text-xs px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                          activeCabReg
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        <span>Export Full Fleet Detailed ({activePeriodTrips.length} trips)</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* LATEST DATA ALERT BANNER WHEN TODAY HAS 0 UPLOADED TRIPS */}
      {!hasDataForToday && latestUploadedDateItem && (
        <div className="bg-gradient-to-r from-slate-900 via-amber-950/80 to-slate-900 border border-amber-600/70 text-amber-100 rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl shrink-0 mt-0.5 sm:mt-0 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-100 flex items-center gap-2 flex-wrap">
                <span>No trip sheet uploaded for Today ({todayKey}) yet.</span>
                <span className="bg-amber-500/20 text-amber-300 font-mono text-[11px] px-2.5 py-0.5 rounded-md border border-amber-500/30 font-semibold">
                  Showing Latest Data: {latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ({latestUploadedDateItem.count} trips)
                </span>
              </p>
              <p className="text-[11px] text-amber-300/80 mt-1">
                All 24-hour metrics, charts, and vehicle utilization tables are currently anchored to the latest uploaded dataset ({latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}). Upload a trip sheet for 09 Aug / 10 Aug to refresh live metrics.
              </p>
            </div>
          </div>
          {onNavigateToTripUpload && (
            <button
              type="button"
              onClick={onNavigateToTripUpload}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2.5 rounded-2xl transition-all shrink-0 shadow-md flex items-center gap-2 cursor-pointer border border-amber-400/50"
            >
              <Truck className="w-4 h-4" />
              <span>+ Upload 09/10 Aug Data Sheet</span>
            </button>
          )}
        </div>
      )}

      {/* SPECIFIC DATE HEADLINE CARD */}
      {specificDateWindow && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 border border-blue-600/80 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div>
            <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider mb-1">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>Specific Date Analysis Mode</span>
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">
              Trips on {specificDateWindow.formattedLabel}:{' '}
              <span className="font-mono text-blue-300 text-3xl ml-1">{activePeriodTrips.length}</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Showing single-day trip analytics for {specificDateWindow.dateKey} (00:00:00 – 23:59:59 window). All metrics, charts, cab breakdown, and Excel exports below reflect this single date.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedSpecificDate(null)}
            className="bg-slate-800/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-xs px-4 py-2.5 rounded-2xl border border-slate-700 transition-all cursor-pointer flex items-center gap-2 self-start md:self-auto shrink-0 shadow-md"
          >
            <X className="w-4 h-4 text-amber-400" />
            <span>Clear Date Filter (Back to Presets)</span>
          </button>
        </div>
      )}

      {/* QUICK CAB REGISTRATION LOOKUP CARD */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 text-white shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
              <Search className="w-4 h-4" />
              <span>Quick Cab Search</span>
            </div>
            <h3 className="text-lg font-black tracking-tight text-white mt-0.5">
              Registration Search Drill-Down
            </h3>
            <p className="text-xs text-slate-400">
              Instantly view trip history for any vehicle by searching its registration number or trailing digits.
            </p>
          </div>

          {/* Search Box */}
          <form onSubmit={handleDigitSearchSubmit} className="relative w-full md:w-96">
            <div>
              <label htmlFor="cab-digit-search" className="block text-xs font-bold text-slate-300 mb-1.5">
                Search by last 4 digits of Registration
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="cab-digit-search"
                  type="text"
                  placeholder="e.g. 0996..."
                  value={digitSearch}
                  onChange={(e) => handleDigitSearchChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-800/90 border border-slate-700 focus:border-blue-500 rounded-2xl text-sm font-mono text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all shadow-inner"
                />
                {digitSearch && (
                  <button
                    type="button"
                    onClick={() => setDigitSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* SEARCH MATCH RESULTS */}
        {digitSearch.trim().length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 animate-in fade-in duration-200">
            {digitMatchingCabs.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-300 text-xs font-medium bg-amber-950/40 border border-amber-800/50 p-3 rounded-xl">
                <span>No cabs found ending with or matching "{digitSearch}". Try entering different digits or full registration.</span>
              </div>
            ) : digitMatchingCabs.length === 1 ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-900/40 border border-blue-500/40 p-3.5 rounded-2xl text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Matched 1 Cab: <strong className="font-mono text-white text-sm ml-1">{digitMatchingCabs[0]}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCabReg(digitMatchingCabs[0]);
                    setCabSearchQuery('');
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>Open {digitMatchingCabs[0]} Drill-Down</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-2 bg-slate-800/80 border border-slate-700/80 p-3.5 rounded-2xl">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span>Found {digitMatchingCabs.length} matching cab registrations:</span>
                  <span className="text-[11px] text-slate-400">Click a registration to view its trip drill-down</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {digitMatchingCabs.map((reg) => (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => {
                        setSelectedCabReg(reg);
                        setCabSearchQuery('');
                      }}
                      className="bg-slate-700 hover:bg-blue-600 hover:text-white text-blue-200 font-mono font-bold text-xs px-3.5 py-2 rounded-xl border border-slate-600 transition-all cursor-pointer flex items-center gap-2 shadow-xs group"
                    >
                      <Car className="w-3.5 h-3.5 text-blue-400 group-hover:text-white" />
                      <span>{reg}</span>
                      <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOP 3 SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Last 24 Hours */}
        <div
          onClick={() => {
            setSelectedPeriod('24h');
            setSelectedSpecificDate(null);
          }}
          className={`bg-white rounded-3xl p-6 border shadow-sm relative overflow-hidden cursor-pointer transition-all ${
            !selectedSpecificDate && selectedPeriod === '24h'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 scale-[1.01]'
              : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                {hasDataForToday
                  ? 'Trips — Last 24 Hours'
                  : `Trips — Last 24 Hours (${latestUploadedDateItem ? latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Today'})`}
              </span>
              <p className="text-3xl font-black text-slate-900 font-mono mt-1">
                {analyticsSummary.count24h.toLocaleString()}
              </p>
            </div>
            <div className={`p-3 rounded-2xl ${!selectedSpecificDate && selectedPeriod === '24h' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">
              {hasDataForToday
                ? 'Rule: Today 00:00 – 23:59'
                : `Latest Data: ${latestUploadedDateItem ? latestUploadedDateItem.dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`}
            </span>
            <span className="font-bold text-blue-800 font-mono bg-blue-100/80 px-2 py-0.5 rounded-full">
              {analyticsSummary.pax24h} Pax
            </span>
          </div>
        </div>

        {/* Card 2: Last 7 Days */}
        <div
          onClick={() => {
            setSelectedPeriod('7d');
            setSelectedSpecificDate(null);
          }}
          className={`bg-white rounded-3xl p-6 border shadow-sm relative overflow-hidden cursor-pointer transition-all ${
            !selectedSpecificDate && selectedPeriod === '7d'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 scale-[1.01]'
              : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Trips — Last 7 Days
              </span>
              <p className="text-3xl font-black text-slate-900 font-mono mt-1">
                {analyticsSummary.count7d.toLocaleString()}
              </p>
            </div>
            <div className={`p-3 rounded-2xl ${!selectedSpecificDate && selectedPeriod === '7d' ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
              <Calendar className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Rule: 7 full calendar days</span>
            <span className="font-bold text-emerald-800 font-mono bg-emerald-100/80 px-2 py-0.5 rounded-full">
              {analyticsSummary.pax7d} Pax
            </span>
          </div>
        </div>

        {/* Card 3: Last 1 Month */}
        <div
          onClick={() => {
            setSelectedPeriod('1m');
            setSelectedSpecificDate(null);
          }}
          className={`bg-white rounded-3xl p-6 border shadow-sm relative overflow-hidden cursor-pointer transition-all ${
            !selectedSpecificDate && selectedPeriod === '1m'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 scale-[1.01]'
              : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Trips — Last 1 Month
              </span>
              <p className="text-3xl font-black text-slate-900 font-mono mt-1">
                {analyticsSummary.count1m.toLocaleString()}
              </p>
            </div>
            <div className={`p-3 rounded-2xl ${!selectedSpecificDate && selectedPeriod === '1m' ? 'bg-blue-600 text-white' : 'bg-purple-50 text-purple-600'}`}>
              <BarChart3 className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Rule: 30 full calendar days</span>
            <span className="font-bold text-purple-800 font-mono bg-purple-100/80 px-2 py-0.5 rounded-full">
              {analyticsSummary.pax1m} Pax
            </span>
          </div>
        </div>
      </div>

      {/* CAB UTILIZATION SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-xs">
                <Car className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-xl tracking-tight">
                Cab Utilization Overview
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active registered cabs compared against recorded trip activity during{' '}
              <strong className="text-slate-800">{activePeriodTitle}</strong>.
            </p>
          </div>

          {/* Utilization % Metric Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-5 py-3 rounded-2xl shadow-md flex items-center gap-4 self-start md:self-auto border border-slate-800 shrink-0">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-300 block">
                Fleet Utilization Rate
              </span>
              <span className="text-2xl font-black font-mono text-emerald-400">
                {cabUtilizationData.utilizationPct}%
              </span>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-blue-500/30 border-t-emerald-400 flex items-center justify-center text-xs font-bold font-mono bg-slate-800">
              {Math.round(parseFloat(cabUtilizationData.utilizationPct))}%
            </div>
          </div>
        </div>

        {/* 3 Summary Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Active Cabs */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                1. Active Cabs
              </span>
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                <Car className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-black text-slate-900 font-mono">
              {cabUtilizationData.activeCount}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Active status in cabs collection
            </p>
          </div>

          {/* Card 2: Cabs Utilized */}
          <div className="bg-emerald-50/70 rounded-2xl p-5 border border-emerald-200/80 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                2. Cabs Utilized
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-black text-emerald-950 font-mono">
              {cabUtilizationData.utilizedCount}
            </p>
            <p className="text-[11px] text-emerald-700 font-medium">
              Had ≥ 1 trip in {periodHeadlineText}
            </p>
          </div>

          {/* Card 3: Cabs Not Utilized */}
          <div className="bg-amber-50/70 rounded-2xl p-5 border border-amber-200/80 shadow-2xs space-y-2 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                3. Cabs Not Utilized
              </span>
              <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-black text-amber-950 font-mono">
              {cabUtilizationData.notUtilizedCount}
            </p>
            <p className="text-[11px] text-amber-800 font-medium">
              Zero trips in {periodHeadlineText}
            </p>
          </div>
        </div>

        {/* CAB UTILIZATION DETAILS TABLE SECTION */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-400 shrink-0" />
                <h4 className="font-bold text-sm text-white">
                  Fleet Utilization Details ({cabUtilizationData.activeCount} Cabs)
                </h4>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Detailed utilization status and metrics for registered active cabs during {activePeriodTitle}.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Tab Selector */}
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setUtilizationTab('not_utilized')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    utilizationTab === 'not_utilized'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Not Utilized ({cabUtilizationData.notUtilizedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setUtilizationTab('utilized')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    utilizationTab === 'utilized'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Utilized ({cabUtilizationData.utilizedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setUtilizationTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    utilizationTab === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  All Cabs ({cabUtilizationData.activeCount})
                </button>
              </div>

              {/* Table Search Input */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search reg, type, client..."
                  value={notUtilizedSearchQuery}
                  onChange={(e) => setNotUtilizedSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {filteredNotUtilizedCabs.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="font-bold text-slate-800 text-base">
                No cabs found in this category
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {notUtilizedSearchQuery
                  ? `No cabs matching search query "${notUtilizedSearchQuery}".`
                  : `There are currently 0 cabs in the ${utilizationTab.replace('_', ' ')} list.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <th className="p-3 w-12">#</th>
                    <th className="p-3">Registration Number</th>
                    <th className="p-3">Vehicle Type</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Utilization Status</th>
                    <th className="p-3">Period Metrics ({activePeriodTitle})</th>
                    <th className="p-3">Most Recent Trip History</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredNotUtilizedCabs.map((cab, idx) => {
                    const norm = normalizeReg(cab.registrationNumber);
                    const isUtilizedInScope = activeScopeTripNormRegs.has(norm);
                    const scopeStats = activeScopeCabStatsByNormMap.get(norm);
                    const totalTripsInScope = scopeStats?.tripSet.size || 0;
                    const totalBoardingsInScope = scopeStats?.boardings || 0;

                    const lastTripDate = lastTripDateByCabNormMap.get(norm) || null;
                    const lastTripText = formatLastTripLabel(lastTripDate);

                    return (
                      <tr
                        key={cab.id || cab.registrationNumber || idx}
                        className={`transition-colors ${
                          isUtilizedInScope ? 'hover:bg-emerald-50/30' : 'hover:bg-amber-50/40'
                        }`}
                      >
                        <td className="p-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-900 px-2.5 py-1 rounded border border-slate-200">
                            {cab.registrationNumber}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium whitespace-nowrap">
                          {cab.vehicleType || 'Standard'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-slate-800 font-semibold bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {cab.clientName || 'N/A'}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {isUtilizedInScope ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 font-bold text-[11px] px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Utilized
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 font-bold text-[11px] px-2.5 py-1 rounded-full border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Not Utilized
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="bg-blue-50 text-blue-900 font-bold px-2 py-0.5 rounded border border-blue-200">
                              Total Trips: {totalTripsInScope}
                            </span>
                            <span className="bg-emerald-50 text-emerald-900 font-bold px-2 py-0.5 rounded border border-emerald-200">
                              Total Boardings: {totalBoardingsInScope}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-xs whitespace-nowrap">
                          {lastTripDate ? (
                            <span className="text-slate-800 font-medium bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                              {lastTripText}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                              No trips on record
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCabReg(cab.registrationNumber);
                              setCabSearchQuery('');
                            }}
                            className="bg-slate-900 hover:bg-blue-600 text-white font-bold text-[11px] px-3 py-1.5 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          >
                            <span>Full History</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CHART SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-lg">
                Daily Trip Trends ({activePeriodTitle})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedPeriod === '24h'
                ? 'Hourly distribution of trips across today’s 24 hours.'
                : `Distinct daily trip count over the selected ${selectedPeriod === '7d' ? '7' : '30'} calendar days.`}
            </p>
          </div>

          {/* Chart Display Controls */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button
              onClick={() => setChartType('bar')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartType === 'bar' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartType === 'line' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Line Chart
            </button>
          </div>
        </div>

        {/* Recharts Container */}
        <div className="h-80 w-full pt-4">
          {loading ? (
            <div className="h-full flex items-center justify-center space-y-2">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Car className="w-10 h-10" />
              <p className="text-xs">No trip data available for this period.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="timeLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    itemStyle={{ color: '#38bdf8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="tripsCount" name="Distinct Trips" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={selectedPeriod === '1m' ? 14 : 28}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.tripsCount > 0 ? '#2563eb' : '#cbd5e1'} />
                    ))}
                  </Bar>
                  <Bar dataKey="passengersCount" name="Passenger Count" fill="#10b981" radius={[6, 6, 0, 0]} barSize={selectedPeriod === '1m' ? 14 : 28} />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="timeLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                    itemStyle={{ color: '#38bdf8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Line type="monotone" dataKey="tripsCount" name="Distinct Trips" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="passengersCount" name="Passenger Count" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* CAB BREAKDOWN CARDS / CLICKABLE CAB ROWS SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Car className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-lg">
                Cab Performance Breakdown ({activePeriodTitle})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any cab card or row to open its detailed trip drill-down for the selected period.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full self-start sm:self-auto">
            {cabBreakdownList.length} Cabs Active
          </div>
        </div>

        {cabBreakdownList.length === 0 ? (
          <div className="py-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Car className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">No cabs performed trips in this period.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cabBreakdownList.map((cab) => (
              <div
                key={cab.registration}
                onClick={() => {
                  setSelectedCabReg(cab.registration);
                  setCabSearchQuery('');
                }}
                className="group bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-400 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-slate-900 text-base tracking-tight group-hover:text-blue-700 transition-colors">
                      {cab.registration}
                    </span>
                    <span className="bg-blue-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-xl shadow-2xs">
                      {cab.tripSet.size} {cab.tripSet.size === 1 ? 'trip' : 'trips'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Total Passengers:</span>
                      <span className="font-bold font-mono text-slate-800">{cab.passengers} Pax</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Primary Drivers:</span>
                      <span className="font-medium text-slate-800 truncate max-w-[150px] text-right">
                        {Array.from(cab.drivers).slice(0, 2).join(', ') || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-semibold text-blue-600 group-hover:text-blue-700">
                  <span>View All {cab.tripSet.size} Trips</span>
                  <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAILED TRIPS TABLE FOR SELECTED PERIOD */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Filtered Trips List ({activePeriodTrips.length} Trips)
            </h3>
            <p className="text-xs text-slate-500">
              Individual trip documents registered in Firestore during the {activePeriodTitle}. Click a cab registration to filter.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search trip, driver, cab..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {activePeriodTrips.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
            <Car className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No Trips Found For This Period</p>
            <p className="text-xs text-slate-500">
              Try switching the period filter (24 Hours / 7 Days / 1 Month) or upload new BA Trip Excel reports.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Trip ID</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Cab Reg No.</th>
                  <th className="p-3">Driver</th>
                  <th className="p-3 text-center">Pax</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">Facility</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activePeriodTrips.slice(0, 50).map((t) => (
                  <tr key={t.tripId} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-900">
                      {t.tripId}
                    </td>
                    <td className="p-3 font-mono text-slate-700">
                      {formatDateLabel(t.date)}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      <button
                        onClick={() => {
                          if (t.registration) {
                            setSelectedCabReg(t.registration);
                            setCabSearchQuery('');
                          }
                        }}
                        className="bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-800 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1 group/btn"
                        title="Click to view cab trip drill-down"
                      >
                        <span>{t.registration || 'N/A'}</span>
                        <ChevronRight className="w-3 h-3 opacity-60 group-hover/btn:opacity-100" />
                      </button>
                    </td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900">{t.driverName || 'N/A'}</p>
                      {t.driverContactNo && (
                        <p className="text-[11px] font-mono text-slate-500">{t.driverContactNo}</p>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-800 font-mono">
                      {t.passengerCount || 1}
                    </td>
                    <td className="p-3">
                      <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-[11px] font-semibold border border-blue-100">
                        {t.direction || t.tripType || 'Standard'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700">
                      {t.facility || 'N/A'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          if (t.registration) {
                            setSelectedCabReg(t.registration);
                            setCabSearchQuery('');
                          }
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                      >
                        Drill Down
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DRILL-DOWN DETAIL MODAL FOR SELECTED CAB */}
      {selectedCabReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Car className="w-5 h-5 text-blue-400" />
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                    Cab Drill-Down Analysis
                  </span>
                </div>
                {/* HEADLINE REQUIREMENT: "HR-55-BD-0996 — 14 trips in the last 7 days" */}
                <h3 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                  {selectedCabReg} — Total Trips: {selectedCabTrips.length} | Total Boardings: {selectedCabBoardings}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Individual trips recorded during the selected period ({activePeriodTitle}), sorted by most recent first.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleExportSummary(selectedCabReg)}
                  disabled={isExporting}
                  className="bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Export Summary Report for this cab"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Summary .xlsx</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportDetailed(selectedCabReg)}
                  disabled={isExporting}
                  className="bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Export Detailed Trip Report for this cab"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Detailed .xlsx</span>
                </button>
                <button
                  onClick={() => setSelectedCabReg(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2.5 rounded-2xl transition-colors cursor-pointer"
                  title="Close Drill-Down"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Controls & Search */}
            <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="bg-blue-100 text-blue-900 font-mono font-bold text-xs px-3 py-1.5 rounded-xl border border-blue-200">
                  Total Trips: {selectedCabTrips.length}
                </div>
                <div className="bg-emerald-100 text-emerald-900 font-mono font-bold text-xs px-3 py-1.5 rounded-xl border border-emerald-200">
                  Total Boardings: {selectedCabBoardings}
                </div>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter driver, trip ID, direction..."
                  value={cabSearchQuery}
                  onChange={(e) => setCabSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Content / Trips List Table */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {selectedCabTrips.length === 0 ? (
                <div className="py-16 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <Car className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-sm">No Trips Found For This Cab</p>
                  <p className="text-xs text-slate-500">
                    This cab performed 0 trips during the selected period ({activePeriodTitle}).
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-slate-200 font-bold uppercase tracking-wider text-[10px]">
                        <th className="p-3">Trip ID</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Direction</th>
                        <th className="p-3">Actual Pickup Time</th>
                        <th className="p-3">Actual Drop Time</th>
                        <th className="p-3 text-center">Passenger Count</th>
                        <th className="p-3">Driver Name</th>
                        <th className="p-3">Driver Contact No.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {selectedCabTrips.map((trip) => {
                        const isLogin =
                          (trip.direction || '').toLowerCase().includes('login') ||
                          (trip.tripType || '').toLowerCase().includes('login');
                        const isLogout =
                          (trip.direction || '').toLowerCase().includes('logout') ||
                          (trip.tripType || '').toLowerCase().includes('logout');

                        return (
                          <tr key={trip.tripId} className="hover:bg-blue-50/40 transition-colors">
                            {/* 1. Trip ID */}
                            <td className="p-3 font-mono font-bold text-blue-900">
                              {trip.tripId}
                            </td>

                            {/* 2. Date */}
                            <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                              {formatDateLabel(trip.date)}
                            </td>

                            {/* 3. Direction (Login/Logout) */}
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                  isLogin
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : isLogout
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                                }`}
                              >
                                {trip.direction || trip.tripType || 'Standard'}
                              </span>
                            </td>

                            {/* 4. Actual Pickup Time */}
                            <td className="p-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                              {formatTimeString(trip.actualPickupTime || trip.deploymentTime)}
                            </td>

                            {/* 5. Actual Drop Time */}
                            <td className="p-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                              {formatTimeString(trip.actualDropTime)}
                            </td>

                            {/* 6. Passenger Count */}
                            <td className="p-3 text-center font-mono font-bold text-slate-900">
                              <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                                {trip.passengerCount || 1}
                              </span>
                            </td>

                            {/* 7. Driver Name */}
                            <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                              {trip.driverName || 'N/A'}
                            </td>

                            {/* 8. Driver Contact No. */}
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                              {trip.driverContactNo ? (
                                <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  {trip.driverContactNo}
                                </span>
                              ) : (
                                'N/A'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing {selectedCabTrips.length} recorded trip(s) for {selectedCabReg}
              </span>
              <button
                onClick={() => setSelectedCabReg(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

