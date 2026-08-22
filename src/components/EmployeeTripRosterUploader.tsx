import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { TripRosterEntry, TripBlockSummary, ZoneMappingRule } from '../types';
import { exportTripRosterExcelReport } from '../utils/reportGenerator';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  X, 
  Search, 
  Download, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Building2, 
  Truck, 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Compass, 
  ArrowRight,
  ExternalLink,
  Filter,
  FileCheck,
  Hash,
  Type
} from 'lucide-react';

interface ParseResult {
  fileName: string;
  totalTrips: number;
  totalPassengers: number;
  matchedTripsCount: number;
  mismatchedTripsCount: number;
  autoZonedCount: number;
  unmappedCount: number;
  tripBlocks: TripBlockSummary[];
  flatEntries: TripRosterEntry[];
  unmappedRecords: {
    tripId: string;
    loginId: string;
    name: string;
    address: string;
    extractedPincode?: string;
  }[];
}

interface Props {
  onNavigateToZoneMapping?: (prefillSearch?: string) => void;
}

export const EmployeeTripRosterUploader: React.FC<Props> = ({ onNavigateToZoneMapping }) => {
  const { userProfile, isAdmin } = useAuth();

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isExportingReport, setIsExportingReport] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Active parse result
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'mismatched' | 'flat' | 'unmapped'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedTrips, setExpandedTrips] = useState<Record<string, boolean>>({});

  // History state
  const [historyEntries, setHistoryEntries] = useState<TripRosterEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');

  // Zone rules cache
  const [zoneRules, setZoneRules] = useState<ZoneMappingRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch zone mapping lookup rules from Firestore
  const loadZoneRules = async () => {
    setIsLoadingRules(true);
    try {
      const q = query(collection(db, 'zoneMappingRules'));
      const snap = await getDocs(q);
      const list: ZoneMappingRule[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as ZoneMappingRule);
      });
      setZoneRules(list);
    } catch (err) {
      console.error('Error fetching zone rules:', err);
    } finally {
      setIsLoadingRules(false);
    }
  };

  useEffect(() => {
    loadZoneRules();
  }, []);

  // Helper: Extract last standalone 6-digit Indian Pincode from Address string
  const extractPincodeFromAddress = (address: string): string | null => {
    if (!address) return null;
    // Regex for 6-digit number bounded by non-digits or start/end
    const matches = address.match(/(?<!\d)\d{6}(?!\d)/g);
    if (!matches || matches.length === 0) return null;
    // The prompt specifies: "the last standalone 6-digit number in the address string"
    return matches[matches.length - 1];
  };

  // Helper: Resolve Zone according to hierarchy:
  // 1. Pincode Match
  // 2. Locality Keyword Substring Match (case-insensitive) in Address
  // 3. Fallback: "Unmapped — Needs Review"
  const resolveZoneForAddress = (
    address: string, 
    rules: ZoneMappingRule[]
  ): { zone: string; matchMethod: 'pincode' | 'locality' | 'unmapped'; matchedPattern?: string; pincode?: string } => {
    const cleanAddr = (address || '').trim();
    const extractedPin = extractPincodeFromAddress(cleanAddr);

    // 1. Check 6-digit Pincode rules first
    if (extractedPin) {
      const pinRule = rules.find(
        r => r.type === 'pincode' && r.pattern.trim() === extractedPin
      );
      if (pinRule && pinRule.zoneName) {
        return {
          zone: pinRule.zoneName.trim(),
          matchMethod: 'pincode',
          matchedPattern: pinRule.pattern,
          pincode: extractedPin,
        };
      }
    }

    // 2. Check Locality Keyword rules inside Address (case-insensitive substring)
    const upperAddr = cleanAddr.toUpperCase();
    if (upperAddr) {
      // Sort keyword rules by pattern length descending so longer/more specific phrases match first
      const keywordRules = rules
        .filter(r => r.type === 'locality' && r.pattern && r.pattern.trim())
        .sort((a, b) => b.pattern.length - a.pattern.length);

      for (const rule of keywordRules) {
        const patternUpper = rule.pattern.trim().toUpperCase();
        if (patternUpper && upperAddr.includes(patternUpper)) {
          return {
            zone: rule.zoneName.trim(),
            matchMethod: 'locality',
            matchedPattern: rule.pattern,
            pincode: extractedPin || undefined,
          };
        }
      }
    }

    // 3. Fallback: "Unmapped — Needs Review"
    return {
      zone: 'Unmapped — Needs Review',
      matchMethod: 'unmapped',
      pincode: extractedPin || undefined,
    };
  };

  // Helper to extract clean date string from diverse Excel cell formats
  const extractServiceDate = (val: any): string => {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number') {
      if (val > 20000 && val < 70000) {
        const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(jsDate.getTime())) {
          return jsDate.toISOString().split('T')[0];
        }
      }
      return String(val);
    }
    const str = String(val).trim();
    if (str.includes('T')) {
      return str.split('T')[0];
    }
    if (str.includes(' ')) {
      return str.split(' ')[0];
    }
    return str;
  };

  // Helper to format/clean cell string values
  const cleanStr = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  // Parsing Algorithm for Headerless Raw File starting at Row 1
  const parseRawRosterWorkbook = (workbook: XLSX.WorkBook, fileName: string, currentRules: ZoneMappingRule[]): ParseResult => {
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error('The uploaded Excel file does not contain any readable sheets.');
    }

    // 0-indexed raw rows without assuming header names
    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { 
      header: 1, 
      raw: false, 
      defval: '' 
    });

    if (!rawRows || rawRows.length === 0) {
      throw new Error('The uploaded spreadsheet contains no data rows.');
    }

    const batchId = `roster_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadTimestamp = new Date().toISOString();
    const clientId = 'CL-AIRINDIA';
    const clientName = 'Air India Sats';
    const uploadedBy = userProfile?.email || userProfile?.name || 'Ranjit';

    const tripBlocks: TripBlockSummary[] = [];
    const flatEntries: TripRosterEntry[] = [];
    const unmappedRecords: ParseResult['unmappedRecords'] = [];

    let autoZonedCount = 0;
    let unmappedCount = 0;

    let currentTripHeader: {
      tripId: string;
      cabNumber: string;
      loginTimeText: string;
      serviceDate: string;
      vendorName: string;
      passengerCountExpected: number;
      headerRowIndex: number;
    } | null = null;

    let currentPassengers: {
      sNo: string;
      loginId: string;
      name: string;
      gender: string;
      address: string;
      office: string;
      rawLocationText: string;
      contact: string;
      extractedPincode?: string;
      zone: string;
      zoneMatchMethod?: 'pincode' | 'locality' | 'unmapped';
      matchedRulePattern?: string;
    }[] = [];

    // Finalize current trip block helper
    const finalizeCurrentTrip = () => {
      if (!currentTripHeader) return;
      const actualCount = currentPassengers.length;
      const isMatched = actualCount === currentTripHeader.passengerCountExpected;

      tripBlocks.push({
        tripId: currentTripHeader.tripId,
        cabNumber: currentTripHeader.cabNumber,
        loginTimeText: currentTripHeader.loginTimeText,
        serviceDate: currentTripHeader.serviceDate,
        vendorName: currentTripHeader.vendorName,
        passengerCountExpected: currentTripHeader.passengerCountExpected,
        passengerCountActual: actualCount,
        isCountMatched: isMatched,
        headerRowIndex: currentTripHeader.headerRowIndex,
        passengers: [...currentPassengers],
      });

      // Build flat entries for this block
      for (const p of currentPassengers) {
        flatEntries.push({
          tripId: currentTripHeader.tripId,
          cabNumber: currentTripHeader.cabNumber,
          loginTimeText: currentTripHeader.loginTimeText,
          serviceDate: currentTripHeader.serviceDate,
          vendorName: currentTripHeader.vendorName,
          sNo: p.sNo,
          loginId: p.loginId,
          name: p.name,
          gender: p.gender,
          address: p.address,
          office: p.office,
          rawLocationText: p.rawLocationText,
          contact: p.contact,
          extractedPincode: p.extractedPincode,
          zone: p.zone,
          zoneMatchMethod: p.zoneMatchMethod,
          matchedRulePattern: p.matchedRulePattern,
          clientId,
          clientName,
          uploadedBy,
          uploadedAt: uploadTimestamp,
          uploadBatchId: batchId,
          uploadFileName: fileName,
        });
      }

      currentTripHeader = null;
      currentPassengers = [];
    };

    // Iterate all rows top to bottom
    for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
      const row = rawRows[rIdx] || [];
      if (!Array.isArray(row)) continue;

      // Extract raw column cells:
      // Col A (0): Timestamp / S.No
      // Col C (2): Login Time / Login ID
      // Col D (3): Cab Number / Employee Name
      // Col E (4): Gender
      // Col F (5): Address
      // Col G (6): Office
      // Col H (7): Vendor Name / Raw Location Text (goes to rawLocationText, NOT Zone)
      // Col I (8): Contact
      // Col J (9): Expected Passenger Count (in header row)
      // Col K (10): Trip ID (in header row)
      const colA = cleanStr(row[0]);
      const colC = cleanStr(row[2]);
      const colD = cleanStr(row[3]);
      const colE = cleanStr(row[4]);
      const colF = cleanStr(row[5]);
      const colG = cleanStr(row[6]);
      const colH = cleanStr(row[7]);
      const colI = cleanStr(row[8]);
      const colJ = cleanStr(row[9]);
      const colK = cleanStr(row[10]);

      const isCompletelyEmpty = row.every(cell => cleanStr(cell) === '');
      if (isCompletelyEmpty) continue;

      // Check for Trip Header row: Column K (Trip ID) non-empty and Column J is positive small integer
      const parsedColJ = parseInt(colJ, 10);
      const isColJInteger = !isNaN(parsedColJ) && parsedColJ > 0 && parsedColJ <= 100;
      const isTripHeader = colK !== '' && isColJInteger;

      if (isTripHeader) {
        if (currentTripHeader) {
          finalizeCurrentTrip();
        }

        currentTripHeader = {
          tripId: colK,
          cabNumber: colD,
          loginTimeText: colC,
          serviceDate: extractServiceDate(row[0]),
          vendorName: colH,
          passengerCountExpected: parsedColJ,
          headerRowIndex: rIdx + 1,
        };
        currentPassengers = [];
        continue;
      }

      // Check for Passenger row: Col K & Col J are blank under an active trip header
      if (currentTripHeader && colK === '' && colJ === '') {
        const hasPassengerInfo = colA !== '' || colC !== '' || colD !== '' || colF !== '';
        if (hasPassengerInfo) {
          // Address zone resolution using ZoneMapping table
          const zoneRes = resolveZoneForAddress(colF, currentRules);
          
          if (zoneRes.matchMethod === 'unmapped') {
            unmappedCount++;
            unmappedRecords.push({
              tripId: currentTripHeader.tripId,
              loginId: colC,
              name: colD,
              address: colF,
              extractedPincode: zoneRes.pincode,
            });
          } else {
            autoZonedCount++;
          }

          currentPassengers.push({
            sNo: colA,
            loginId: colC,
            name: colD,
            gender: colE,
            address: colF,
            office: colG,
            rawLocationText: colH, // Note: raw Col H is saved as location text, never used as Zone
            contact: colI,
            extractedPincode: zoneRes.pincode,
            zone: zoneRes.zone,
            zoneMatchMethod: zoneRes.matchMethod,
            matchedRulePattern: zoneRes.matchedPattern,
          });

          if (currentPassengers.length >= currentTripHeader.passengerCountExpected) {
            finalizeCurrentTrip();
          }
        }
      }
    }

    // Finalize any trailing trip at EOF
    if (currentTripHeader) {
      finalizeCurrentTrip();
    }

    const matchedCount = tripBlocks.filter(t => t.isCountMatched).length;
    const mismatchedCount = tripBlocks.filter(t => !t.isCountMatched).length;

    return {
      fileName,
      totalTrips: tripBlocks.length,
      totalPassengers: flatEntries.length,
      matchedTripsCount: matchedCount,
      mismatchedTripsCount: mismatchedCount,
      autoZonedCount,
      unmappedCount,
      tripBlocks,
      flatEntries,
      unmappedRecords,
    };
  };

  // Handle file ingestion
  const processSelectedFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);
    setFeedback(null);

    // Ensure latest rules are loaded
    let activeRules = zoneRules;
    if (activeRules.length === 0) {
      try {
        const q = query(collection(db, 'zoneMappingRules'));
        const snap = await getDocs(q);
        const list: ZoneMappingRule[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as ZoneMappingRule));
        activeRules = list;
        setZoneRules(list);
      } catch (e) {
        console.error('Error fetching zone rules before parse:', e);
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: true,
          cellNF: false,
          cellText: false 
        });

        const result = parseRawRosterWorkbook(workbook, file.name, activeRules);
        setParseResult(result);

        // Pre-expand trips with count discrepancies or unmapped passengers
        const initialExpanded: Record<string, boolean> = {};
        result.tripBlocks.forEach((tb) => {
          const hasUnmapped = tb.passengers.some(p => p.zoneMatchMethod === 'unmapped');
          if (!tb.isCountMatched || hasUnmapped) {
            initialExpanded[tb.tripId] = true;
          }
        });
        setExpandedTrips(initialExpanded);

        if (result.totalTrips === 0) {
          setFeedback({
            type: 'warning',
            message: 'No trip blocks detected. Ensure Column K contains Trip IDs and Column J contains expected passenger counts.',
          });
        } else if (result.unmappedCount > 0 || result.mismatchedTripsCount > 0) {
          setFeedback({
            type: 'warning',
            message: `Parsed ${result.totalTrips} trips (${result.totalPassengers} passengers). ${result.autoZonedCount} auto-zoned, ${result.unmappedCount} unmapped (Needs Review).`,
          });
        } else {
          setFeedback({
            type: 'success',
            message: `Successfully parsed and 100% auto-zoned all ${result.totalPassengers} passengers across ${result.totalTrips} trips!`,
          });
        }
      } catch (err: any) {
        console.error('Failed to parse employee trip roster:', err);
        setFeedback({
          type: 'error',
          message: `Parsing failed: ${err.message || 'Malformed spreadsheet structure.'}`,
        });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setFeedback({ type: 'error', message: 'Failed to read file from disk.' });
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const toggleTripExpand = (tripId: string) => {
    setExpandedTrips(prev => ({
      ...prev,
      [tripId]: !prev[tripId],
    }));
  };

  const expandAll = (expand: boolean) => {
    if (!parseResult) return;
    const nextState: Record<string, boolean> = {};
    parseResult.tripBlocks.forEach(t => {
      nextState[t.tripId] = expand;
    });
    setExpandedTrips(nextState);
  };

  // Commit Parsed Records to Firestore Collection "tripRosterEntries"
  const handleCommitToFirestore = async () => {
    if (!parseResult || parseResult.flatEntries.length === 0) return;

    setIsSaving(true);
    setFeedback(null);

    try {
      const records = parseResult.flatEntries;
      const batchSize = 350;
      const totalBatches = Math.ceil(records.length / batchSize);

      for (let b = 0; b < totalBatches; b++) {
        const batch = writeBatch(db);
        const chunk = records.slice(b * batchSize, (b + 1) * batchSize);

        for (const entry of chunk) {
          const docRef = doc(collection(db, 'tripRosterEntries'));
          batch.set(docRef, {
            ...entry,
            id: docRef.id,
          });
        }

        await batch.commit();
      }

      setFeedback({
        type: 'success',
        message: `Successfully saved ${records.length} passenger entries (${parseResult.autoZonedCount} zoned, ${parseResult.unmappedCount} unmapped) across ${parseResult.totalTrips} trips to Firestore.`,
      });

      fetchHistory();
    } catch (err: any) {
      console.error('Failed to commit roster entries to Firestore:', err);
      setFeedback({
        type: 'error',
        message: `Database save failed: ${err.message || 'Firestore connection error.'}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch past roster records
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'tripRosterEntries'),
        orderBy('uploadedAt', 'desc'),
        limit(500)
      );
      const snap = await getDocs(q);
      const items: TripRosterEntry[] = [];
      snap.forEach(d => {
        items.push({ id: d.id, ...d.data() } as TripRosterEntry);
      });
      setHistoryEntries(items);
    } catch (err) {
      console.error('Error fetching roster history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Export Trip Roster Report with exactly 13 columns in exact order
  const handleDownloadRosterReport = async (source: 'current' | 'history' | 'auto' = 'auto') => {
    setIsExportingReport(true);
    setFeedback(null);
    try {
      let entriesToExport: TripRosterEntry[] = [];

      if (source === 'current') {
        if (parseResult && parseResult.flatEntries.length > 0) {
          entriesToExport = parseResult.flatEntries;
        } else {
          setFeedback({
            type: 'warning',
            message: 'No active parsed sheet data. Please upload a file first or switch to database history.',
          });
          return;
        }
      } else if (source === 'history') {
        if (filteredHistory.length > 0) {
          entriesToExport = filteredHistory;
        } else if (historyEntries.length > 0) {
          entriesToExport = historyEntries;
        } else {
          // Fetch from Firestore
          const q = query(
            collection(db, 'tripRosterEntries'),
            orderBy('uploadedAt', 'desc'),
            limit(1000)
          );
          const snap = await getDocs(q);
          const fetched: TripRosterEntry[] = [];
          snap.forEach(d => {
            fetched.push({ id: d.id, ...d.data() } as TripRosterEntry);
          });
          entriesToExport = fetched;
        }
      } else {
        // 'auto' mode: prioritize current parseResult, then history, then Firestore fetch
        if (parseResult && parseResult.flatEntries.length > 0) {
          entriesToExport = parseResult.flatEntries;
        } else if (historyEntries.length > 0) {
          entriesToExport = historyEntries;
        } else {
          const q = query(
            collection(db, 'tripRosterEntries'),
            orderBy('uploadedAt', 'desc'),
            limit(1000)
          );
          const snap = await getDocs(q);
          const fetched: TripRosterEntry[] = [];
          snap.forEach(d => {
            fetched.push({ id: d.id, ...d.data() } as TripRosterEntry);
          });
          entriesToExport = fetched;
        }
      }

      // Scope to Air India Sats client when user is client-bound per existing access rules
      if (!isAdmin && userProfile?.role === 'user' && userProfile.clientId) {
        entriesToExport = entriesToExport.filter(e => 
          e.clientId === userProfile.clientId || 
          e.clientName?.toLowerCase().includes('air india') || 
          userProfile.assignedClientIds?.includes(e.clientId)
        );
      }

      if (entriesToExport.length === 0) {
        setFeedback({
          type: 'warning',
          message: 'No trip roster records found to generate report. Please upload a roster spreadsheet first.',
        });
        return;
      }

      const userName = userProfile?.email || userProfile?.name || 'Ranjit';
      const result = await exportTripRosterExcelReport(entriesToExport, userName);

      setFeedback({
        type: 'success',
        message: `Successfully generated and downloaded Trip Roster Report (${result.fileName}) with ${result.recordCount} passenger rows across 13 columns. Action logged to audit trail.`,
      });
    } catch (err: any) {
      console.error('Failed to export trip roster report:', err);
      setFeedback({
        type: 'error',
        message: `Report export failed: ${err.message || 'Unknown error occurred.'}`,
      });
    } finally {
      setIsExportingReport(false);
    }
  };

  // Export current parsed records to Excel (Legacy or Quick raw export)
  const exportToExcel = () => {
    handleDownloadRosterReport('current');
  };

  // Filtered trips for UI rendering
  const filteredTripBlocks = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.tripBlocks.filter(tb => {
      if (activeFilter === 'matched' && !tb.isCountMatched) return false;
      if (activeFilter === 'mismatched' && tb.isCountMatched) return false;
      if (activeFilter === 'unmapped' && !tb.passengers.some(p => p.zoneMatchMethod === 'unmapped')) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTrip = 
          tb.tripId.toLowerCase().includes(q) ||
          tb.cabNumber.toLowerCase().includes(q) ||
          tb.vendorName.toLowerCase().includes(q) ||
          tb.serviceDate.toLowerCase().includes(q) ||
          tb.loginTimeText.toLowerCase().includes(q);

        const matchesPassenger = tb.passengers.some(p => 
          p.name.toLowerCase().includes(q) ||
          p.loginId.toLowerCase().includes(q) ||
          p.contact.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.zone.toLowerCase().includes(q)
        );

        return matchesTrip || matchesPassenger;
      }

      return true;
    });
  }, [parseResult, activeFilter, searchQuery]);

  // Filtered flat entries
  const filteredFlatEntries = useMemo(() => {
    if (!parseResult) return [];
    let list = parseResult.flatEntries;
    if (activeFilter === 'unmapped') {
      list = list.filter(e => e.zoneMatchMethod === 'unmapped');
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(e => 
      e.tripId.toLowerCase().includes(q) ||
      e.cabNumber.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.loginId.toLowerCase().includes(q) ||
      e.address.toLowerCase().includes(q) ||
      e.zone.toLowerCase().includes(q) ||
      e.contact.toLowerCase().includes(q)
    );
  }, [parseResult, activeFilter, searchQuery]);

  // Filtered history entries
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyEntries;
    const q = historySearch.toLowerCase();
    return historyEntries.filter(h => 
      h.tripId?.toLowerCase().includes(q) ||
      h.cabNumber?.toLowerCase().includes(q) ||
      h.name?.toLowerCase().includes(q) ||
      h.loginId?.toLowerCase().includes(q) ||
      h.zone?.toLowerCase().includes(q) ||
      h.serviceDate?.toLowerCase().includes(q)
    );
  }, [historyEntries, historySearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-2xl">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Upload Employee Trip Roster</span>
                <span className="text-[10px] font-black uppercase bg-blue-600 text-white px-2.5 py-0.5 rounded-full">
                  Air India Sats
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Headerless raw parser (Row 1 start) with automated Zone resolution (Pincode & Locality Keyword lookup).
              </p>
            </div>
          </div>
        </div>

        {/* View switcher & Zone mapping link & Download Report */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadRosterReport('auto')}
            disabled={isExportingReport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Download Trip Roster Report with 13 Columns: DATE, S.NO, TIME, NEW ID, NAME, GENDER, ADDRESS, LOCATION, OFFICE, CONTACT, CAB NO, TRIP ID, ZONE"
          >
            {isExportingReport ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Download Trip Roster Report</span>
          </button>

          {onNavigateToZoneMapping && (
            <button
              onClick={() => onNavigateToZoneMapping()}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Compass className="w-4 h-4 text-blue-600" />
              <span>Zone Rules ({zoneRules.length})</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'upload' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sheet Parser & Uploader
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'history' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Roster Database ({historyEntries.length > 0 ? historyEntries.length : 'Records'})
            </button>
          </div>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-2xs ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' :
          feedback.type === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-900' :
          'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {feedback.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}
            {feedback.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'upload' ? (
        <div className="space-y-6">
          {/* Upload Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`bg-white rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
              isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.005]' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
            } shadow-2xs`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleFileInput}
              className="hidden"
            />

            <div className="max-w-md mx-auto space-y-3">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs border border-blue-100">
                {isProcessing ? (
                  <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
                ) : (
                  <Upload className="w-7 h-7" />
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {isProcessing ? 'Processing Raw Trip Roster & Auto-Zoning...' : 'Choose or Drag & Drop Raw Roster Sheet (.xls / .xlsx)'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Extracts 6-digit Pincodes & Locality Keywords to auto-map Zones. Flags unmapped addresses for admin rule additions.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 px-3.5 py-1.5 rounded-xl text-xs font-semibold">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Client Organization Target: <strong>Air India Sats</strong></span>
              </div>
            </div>
          </div>

          {/* Results Summary Dashboard */}
          {parseResult && (
            <div className="space-y-6">
              {/* Stat Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Trip Blocks</span>
                    <Truck className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-2xl font-black text-slate-900">{parseResult.totalTrips}</p>
                  <p className="text-[11px] text-slate-400">Header rows parsed in Col K</p>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-bold uppercase tracking-wider">Total Passengers</span>
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                  <p className="text-2xl font-black text-indigo-600">{parseResult.totalPassengers}</p>
                  <p className="text-[11px] text-slate-400">Roster output records</p>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="text-xs font-bold uppercase tracking-wider">Auto-Zoned</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-black text-emerald-600">{parseResult.autoZonedCount}</p>
                  <p className="text-[11px] text-emerald-700">Pincode or Keyword matched</p>
                </div>

                <div className={`p-4.5 rounded-2xl border shadow-2xs space-y-1 ${
                  parseResult.unmappedCount > 0 ? 'bg-amber-50/80 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-600'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">Unmapped Zones</span>
                    <MapPin className={`w-4 h-4 ${parseResult.unmappedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
                  </div>
                  <p className={`text-2xl font-black ${parseResult.unmappedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {parseResult.unmappedCount}
                  </p>
                  <p className="text-[11px] opacity-80">Needs Review / Rule addition</p>
                </div>

                <div className={`p-4.5 rounded-2xl border shadow-2xs space-y-1 ${
                  parseResult.mismatchedTripsCount > 0 ? 'bg-rose-50/80 border-rose-300 text-rose-900' : 'bg-white border-slate-200 text-slate-600'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">Count Discrepancies</span>
                    <AlertTriangle className={`w-4 h-4 ${parseResult.mismatchedTripsCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                  </div>
                  <p className={`text-2xl font-black ${parseResult.mismatchedTripsCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {parseResult.mismatchedTripsCount}
                  </p>
                  <p className="text-[11px] opacity-80">Trips with count mismatches</p>
                </div>
              </div>

              {/* Unmapped Warning & Direct Action Box */}
              {parseResult.unmappedCount > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-3xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 text-amber-700 rounded-xl mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">
                        {parseResult.unmappedCount} Passenger(s) set to "Unmapped — Needs Review"
                      </h4>
                      <p className="text-xs text-amber-800/90 mt-0.5">
                        These addresses had no matching 6-digit Pincode or Locality Keyword in the Zone Mapping table. You can review them in the "Unmapped List" or add new mapping rules directly.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setActiveFilter('unmapped')}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-2xs"
                    >
                      View Unmapped Records ({parseResult.unmappedCount})
                    </button>
                    {onNavigateToZoneMapping && (
                      <button
                        onClick={() => onNavigateToZoneMapping()}
                        className="bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-900 font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Compass className="w-3.5 h-3.5 text-blue-600" />
                        <span>Add Mapping Rules</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {/* Filter Pills */}
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Trips ({parseResult.totalTrips})
                  </button>

                  <button
                    onClick={() => setActiveFilter('matched')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeFilter === 'matched' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    ✓ Count Matched ({parseResult.matchedTripsCount})
                  </button>

                  {parseResult.unmappedCount > 0 && (
                    <button
                      onClick={() => setActiveFilter('unmapped')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeFilter === 'unmapped' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      ⚠️ Unmapped Zones ({parseResult.unmappedCount})
                    </button>
                  )}

                  {parseResult.mismatchedTripsCount > 0 && (
                    <button
                      onClick={() => setActiveFilter('mismatched')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        activeFilter === 'mismatched' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      ⚠️ Discrepancies ({parseResult.mismatchedTripsCount})
                    </button>
                  )}

                  <button
                    onClick={() => setActiveFilter('flat')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      activeFilter === 'flat' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Flat Table ({parseResult.totalPassengers})
                  </button>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  <div className="relative flex-1 md:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search Trip, Cab, Name, Zone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={() => handleDownloadRosterReport('current')}
                    disabled={isExportingReport}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    title="Download 13-Column Trip Roster Excel Report (DATE, S.NO, TIME, NEW ID, NAME, GENDER, ADDRESS, LOCATION, OFFICE, CONTACT, CAB NO, TRIP ID, ZONE)"
                  >
                    {isExportingReport ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download Trip Roster Report</span>
                  </button>

                  <button
                    onClick={handleCommitToFirestore}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving to Database...</span>
                      </>
                    ) : (
                      <>
                        <FileCheck className="w-4 h-4" />
                        <span>Save to Firestore ({parseResult.totalPassengers})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Grouped Trip Cards vs Flat Table */}
              {activeFilter === 'flat' || activeFilter === 'unmapped' ? (
                /* Flat Passenger Table with Zone Badges */
                <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3">Trip ID</th>
                          <th className="px-4 py-3">Cab Number</th>
                          <th className="px-4 py-3">Date & Login</th>
                          <th className="px-4 py-3">Passenger</th>
                          <th className="px-4 py-3">Assigned Zone</th>
                          <th className="px-4 py-3">Full Address</th>
                          <th className="px-4 py-3">Raw Location (Col H)</th>
                          <th className="px-4 py-3">Contact</th>
                          {onNavigateToZoneMapping && <th className="px-4 py-3 text-right">Rule Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredFlatEntries.map((row, idx) => (
                          <tr key={idx} className={`hover:bg-slate-50 ${row.zoneMatchMethod === 'unmapped' ? 'bg-amber-50/30' : ''}`}>
                            <td className="px-4 py-3 font-mono font-bold text-blue-600">{row.tripId}</td>
                            <td className="px-4 py-3 font-bold text-slate-900">{row.cabNumber}</td>
                            <td className="px-4 py-3">
                              <div className="text-[11px]">
                                <span className="font-semibold text-slate-800">{row.serviceDate}</span>
                                <span className="text-slate-400 block">{row.loginTimeText}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <span className="font-bold text-slate-900 block">{row.name}</span>
                                <span className="text-[10px] font-mono text-slate-500">ID: {row.loginId}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {row.zoneMatchMethod === 'unmapped' ? (
                                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-black">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Unmapped — Needs Review</span>
                                </span>
                              ) : (
                                <div>
                                  <span className="font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md inline-block">
                                    {row.zone}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">
                                    {row.zoneMatchMethod === 'pincode' ? `via Pin: ${row.extractedPincode}` : `via Keyword: ${row.matchedRulePattern}`}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-xs">
                              <p className="text-slate-800 line-clamp-2">{row.address}</p>
                              {row.extractedPincode && (
                                <span className="text-[10px] font-mono text-blue-600 font-semibold">
                                  Pin: {row.extractedPincode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 max-w-xs text-slate-500">
                              <span className="truncate block font-mono text-[11px]">{row.rawLocationText || '—'}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600">{row.contact}</td>
                            {onNavigateToZoneMapping && (
                              <td className="px-4 py-3 text-right">
                                {row.zoneMatchMethod === 'unmapped' && (
                                  <button
                                    onClick={() => onNavigateToZoneMapping(row.extractedPincode || '')}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                    title="Add zone rule for this address"
                                  >
                                    <span>Add Rule</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Grouped Trip Cards */
                <div className="space-y-4">
                  {filteredTripBlocks.map((trip) => {
                    const isExpanded = expandedTrips[trip.tripId];
                    const tripHasUnmapped = trip.passengers.some(p => p.zoneMatchMethod === 'unmapped');

                    return (
                      <div
                        key={trip.tripId}
                        className={`bg-white rounded-2xl border transition-all ${
                          !trip.isCountMatched 
                            ? 'border-rose-300 shadow-rose-50/50' 
                            : tripHasUnmapped
                            ? 'border-amber-300 shadow-amber-50/50'
                            : 'border-slate-200'
                        } shadow-2xs overflow-hidden`}
                      >
                        {/* Header Bar */}
                        <div
                          onClick={() => toggleTripExpand(trip.tripId)}
                          className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl font-mono text-xs font-bold ${
                              !trip.isCountMatched ? 'bg-rose-100 text-rose-800' :
                              tripHasUnmapped ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'
                            }`}>
                              <Truck className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black text-slate-900 font-mono">
                                  Trip ID: {trip.tripId}
                                </h4>
                                <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                                  Cab: {trip.cabNumber}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  {trip.serviceDate || 'Date N/A'}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {trip.loginTimeText || 'Login N/A'}
                                </span>
                                {trip.vendorName && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-600 font-medium">Vendor: {trip.vendorName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-between md:justify-end">
                            {/* Validation Badges */}
                            {tripHasUnmapped && (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-bold">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Contains Unmapped Zone</span>
                              </span>
                            )}

                            {trip.isCountMatched ? (
                              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Matched: {trip.passengerCountActual}/{trip.passengerCountExpected} Pax</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-800 border border-rose-300 px-3 py-1 rounded-full text-xs font-black animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                <span>Discrepancy: Expected {trip.passengerCountExpected}, Found {trip.passengerCountActual} Pax</span>
                              </span>
                            )}

                            <button className="text-slate-400 hover:text-slate-600 p-1">
                              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Passenger List */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                              <table className="w-full text-left text-xs text-slate-600">
                                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-[11px] text-slate-500 uppercase">
                                  <tr>
                                    <th className="px-3.5 py-2.5">S.No</th>
                                    <th className="px-3.5 py-2.5">Login ID</th>
                                    <th className="px-3.5 py-2.5">Passenger Name</th>
                                    <th className="px-3.5 py-2.5">Zone (Mapped)</th>
                                    <th className="px-3.5 py-2.5">Address</th>
                                    <th className="px-3.5 py-2.5">Location (Col H)</th>
                                    <th className="px-3.5 py-2.5">Contact</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {trip.passengers.length === 0 ? (
                                    <tr>
                                      <td colSpan={7} className="p-4 text-center text-slate-400 text-xs italic">
                                        No passenger rows detected under this trip header.
                                      </td>
                                    </tr>
                                  ) : (
                                    trip.passengers.map((p, pIdx) => (
                                      <tr key={pIdx} className={`hover:bg-slate-50/80 ${p.zoneMatchMethod === 'unmapped' ? 'bg-amber-50/40' : ''}`}>
                                        <td className="px-3.5 py-2 font-mono text-slate-500">{p.sNo || pIdx + 1}</td>
                                        <td className="px-3.5 py-2 font-mono font-bold text-slate-700">{p.loginId}</td>
                                        <td className="px-3.5 py-2 font-bold text-slate-900">{p.name}</td>
                                        <td className="px-3.5 py-2">
                                          {p.zoneMatchMethod === 'unmapped' ? (
                                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-black">
                                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                              <span>Unmapped — Needs Review</span>
                                            </span>
                                          ) : (
                                            <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                                              {p.zone}
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3.5 py-2 max-w-xs truncate text-slate-700">{p.address}</td>
                                        <td className="px-3.5 py-2 max-w-xs truncate text-slate-500 font-mono text-[11px]">{p.rawLocationText || '—'}</td>
                                        <td className="px-3.5 py-2 font-mono">{p.contact}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* History & Database Browser View */
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search database by Trip ID, Cab, Name, Zone..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadRosterReport('history')}
                disabled={isExportingReport || filteredHistory.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                title="Download Filtered Trip Roster Records with 13 Columns"
              >
                {isExportingReport ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>Download Trip Roster Report ({filteredHistory.length})</span>
              </button>

              <button
                onClick={fetchHistory}
                className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 cursor-pointer"
                title="Refresh Records"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            {isLoadingHistory ? (
              <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Loading saved trip roster records from Firestore...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600">No trip roster entries found.</p>
                <p className="text-slate-400">Upload a spreadsheet via the "Sheet Parser & Uploader" tab above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[650px]">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3.5">Trip ID</th>
                      <th className="px-4 py-3.5">Cab Number</th>
                      <th className="px-4 py-3.5">Service Date & Time</th>
                      <th className="px-4 py-3.5">Passenger Name</th>
                      <th className="px-4 py-3.5">Zone (Mapped)</th>
                      <th className="px-4 py-3.5">Address</th>
                      <th className="px-4 py-3.5">Location (Col H)</th>
                      <th className="px-4 py-3.5">Contact</th>
                      <th className="px-4 py-3.5">Uploaded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredHistory.map((item) => (
                      <tr key={item.id || item.tripId + item.loginId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-blue-600">{item.tripId}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.cabNumber}</td>
                        <td className="px-4 py-3">
                          <div className="text-[11px]">
                            <span className="font-semibold text-slate-800">{item.serviceDate}</span>
                            <span className="text-slate-400 block">{item.loginTimeText}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900">{item.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                            item.zone === 'Unmapped — Needs Review' 
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {item.zone || 'Unmapped — Needs Review'}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-700">{item.address}</td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-500 font-mono text-[11px]">{item.rawLocationText || '—'}</td>
                        <td className="px-4 py-3 font-mono">{item.contact}</td>
                        <td className="px-4 py-3 text-[11px] text-slate-400">{item.uploadedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
