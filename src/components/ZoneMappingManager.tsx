import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ZoneMappingRule } from '../types';
import { 
  MapPin, 
  Plus, 
  Upload, 
  Download, 
  Search, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Filter, 
  Layers, 
  Compass, 
  FileSpreadsheet, 
  Hash, 
  Type,
  AlertTriangle,
  ArrowUpDown,
  Sparkles
} from 'lucide-react';

const DEFAULT_ZONE_RULES: Omit<ZoneMappingRule, 'id'>[] = [
  { type: 'pincode', pattern: '110037', zoneName: 'South West', description: 'Mahipalpur / Airport / Aerocity' },
  { type: 'pincode', pattern: '110038', zoneName: 'South West', description: 'Rajokri / Kapashera' },
  { type: 'pincode', pattern: '110061', zoneName: 'South West', description: 'Dwarka Sector 8' },
  { type: 'pincode', pattern: '110075', zoneName: 'South West', description: 'Dwarka Sector 6, 10, 11' },
  { type: 'pincode', pattern: '110077', zoneName: 'South West', description: 'Dwarka Sector 12-19' },
  { type: 'pincode', pattern: '110078', zoneName: 'South West', description: 'Dwarka Sector 20-23' },
  { type: 'pincode', pattern: '110041', zoneName: 'West', description: 'Nangloi' },
  { type: 'pincode', pattern: '110063', zoneName: 'West', description: 'Paschim Vihar' },
  { type: 'pincode', pattern: '110058', zoneName: 'West', description: 'Janakpuri' },
  { type: 'pincode', pattern: '110018', zoneName: 'West', description: 'Tilak Nagar / Vikaspuri' },
  { type: 'pincode', pattern: '110085', zoneName: 'North West', description: 'Rohini Sector 3, 7, 8' },
  { type: 'pincode', pattern: '110086', zoneName: 'North West', description: 'Rohini Sector 9-16' },
  { type: 'pincode', pattern: '110034', zoneName: 'North West', description: 'Pitampura / Rani Bagh' },
  { type: 'pincode', pattern: '110001', zoneName: 'Central', description: 'Connaught Place' },
  { type: 'pincode', pattern: '110019', zoneName: 'South', description: 'Kalkaji / Nehru Place' },
  { type: 'pincode', pattern: '110024', zoneName: 'South', description: 'Lajpat Nagar' },
  { type: 'pincode', pattern: '110091', zoneName: 'East', description: 'Mayur Vihar Phase 1' },
  { type: 'pincode', pattern: '110092', zoneName: 'East', description: 'Laxmi Nagar / Anand Vihar' },
  { type: 'pincode', pattern: '122001', zoneName: 'Gurugram', description: 'Old Gurgaon' },
  { type: 'pincode', pattern: '122002', zoneName: 'Gurugram', description: 'DLF Phase 1 / Phase 2' },
  { type: 'pincode', pattern: '122003', zoneName: 'Gurugram', description: 'Sector 48 / Sohna Road' },
  { type: 'pincode', pattern: '122018', zoneName: 'Gurugram', description: 'Cyber City / Udyog Vihar' },
  { type: 'pincode', pattern: '201301', zoneName: 'Noida', description: 'Noida Sector 1-20' },
  { type: 'locality', pattern: 'NANGLOI', zoneName: 'North West', description: 'Nangloi Locality keyword' },
  { type: 'locality', pattern: 'DWARKA', zoneName: 'South West', description: 'Dwarka sub-city' },
  { type: 'locality', pattern: 'PASCHIM VIHAR', zoneName: 'West', description: 'Paschim Vihar Locality' },
  { type: 'locality', pattern: 'ROHINI', zoneName: 'North West', description: 'Rohini Sub-city' },
  { type: 'locality', pattern: 'AEROCITY', zoneName: 'South West', description: 'Aerocity Hospitality District' },
  { type: 'locality', pattern: 'MAHIPALPUR', zoneName: 'South West', description: 'Mahipalpur Village & Extn' },
  { type: 'locality', pattern: 'KAPASHERA', zoneName: 'South West', description: 'Kapashera Border' },
  { type: 'locality', pattern: 'GURGAON', zoneName: 'Gurugram', description: 'Gurgaon district' },
  { type: 'locality', pattern: 'GURUGRAM', zoneName: 'Gurugram', description: 'Gurugram district' },
  { type: 'locality', pattern: 'NOIDA', zoneName: 'Noida', description: 'Noida City' },
  { type: 'locality', pattern: 'FARIDABAD', zoneName: 'Faridabad', description: 'Faridabad City' },
  { type: 'locality', pattern: 'GHAZIABAD', zoneName: 'Ghaziabad', description: 'Ghaziabad City' },
  { type: 'locality', pattern: 'JANAKPURI', zoneName: 'West', description: 'Janakpuri Blocks' },
  { type: 'locality', pattern: 'VIKASPURI', zoneName: 'West', description: 'Vikaspuri Blocks' },
  { type: 'locality', pattern: 'UTTAM NAGAR', zoneName: 'West', description: 'Uttam Nagar' },
  { type: 'locality', pattern: 'PALAM', zoneName: 'South West', description: 'Palam Colony / Village' },
  { type: 'locality', pattern: 'VASANT KUNJ', zoneName: 'South', description: 'Vasant Kunj Sectors' },
  { type: 'locality', pattern: 'SAKET', zoneName: 'South', description: 'Saket / Press Enclave' }
];

export const ZoneMappingManager: React.FC<{ initialSearch?: string }> = ({ initialSearch = '' }) => {
  const { userProfile, isAdmin } = useAuth();

  const [rules, setRules] = useState<ZoneMappingRule[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [typeFilter, setTypeFilter] = useState<'all' | 'pincode' | 'locality'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  
  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<ZoneMappingRule | null>(null);
  const [formData, setFormData] = useState<{
    type: 'pincode' | 'locality';
    pattern: string;
    zoneName: string;
    description: string;
  }>({
    type: 'pincode',
    pattern: '',
    zoneName: '',
    description: '',
  });

  // Delete Confirm Modal State
  const [deletingRule, setDeletingRule] = useState<ZoneMappingRule | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Bulk Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Fetch rules from Firestore
  const fetchRules = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'zoneMappingRules'), orderBy('pattern', 'asc'));
      const snap = await getDocs(q);
      const items: ZoneMappingRule[] = [];
      snap.forEach(d => {
        items.push({ id: d.id, ...d.data() } as ZoneMappingRule);
      });
      setRules(items);
    } catch (err: any) {
      console.error('Error fetching zone mapping rules:', err);
      setFeedback({ type: 'error', message: `Failed to load rules: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  // Seed default rules if database is empty
  const handleSeedDefaults = async () => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const creator = userProfile?.email || 'Admin';

      for (const item of DEFAULT_ZONE_RULES) {
        const docId = `${item.type}_${item.pattern.toUpperCase().replace(/\s+/g, '_')}`;
        const docRef = doc(db, 'zoneMappingRules', docId);
        batch.set(docRef, {
          ...item,
          pattern: item.pattern.trim().toUpperCase(),
          createdBy: creator,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
      }

      await batch.commit();
      setFeedback({ type: 'success', message: `Successfully seeded ${DEFAULT_ZONE_RULES.length} standard Delhi-NCR & Airport zone rules!` });
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to seed rules:', err);
      setFeedback({ type: 'error', message: `Seeding failed: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Open Create Modal
  const handleOpenCreate = (prefill?: Partial<ZoneMappingRule>) => {
    setEditingRule(null);
    setFormData({
      type: prefill?.type || 'pincode',
      pattern: prefill?.pattern || '',
      zoneName: prefill?.zoneName || '',
      description: prefill?.description || '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (rule: ZoneMappingRule) => {
    setEditingRule(rule);
    setFormData({
      type: rule.type,
      pattern: rule.pattern,
      zoneName: rule.zoneName,
      description: rule.description || '',
    });
    setIsModalOpen(true);
  };

  // Save / Update Rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPattern = formData.pattern.trim().toUpperCase();
    const cleanZone = formData.zoneName.trim();

    if (!cleanPattern || !cleanZone) {
      setFeedback({ type: 'error', message: 'Pattern and Zone Name are required.' });
      return;
    }

    if (formData.type === 'pincode' && !/^\d{6}$/.test(cleanPattern)) {
      setFeedback({ type: 'error', message: 'Pincode must be exactly a 6-digit number (e.g. 110037).' });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const now = new Date().toISOString();
      const docId = editingRule?.id || `${formData.type}_${cleanPattern.replace(/\s+/g, '_')}`;
      const docRef = doc(db, 'zoneMappingRules', docId);

      await setDoc(docRef, {
        type: formData.type,
        pattern: cleanPattern,
        zoneName: cleanZone,
        description: formData.description.trim(),
        createdBy: editingRule?.createdBy || userProfile?.email || 'Admin',
        createdAt: editingRule?.createdAt || now,
        updatedAt: now,
      }, { merge: true });

      setFeedback({
        type: 'success',
        message: editingRule 
          ? `Updated rule for "${cleanPattern}" → ${cleanZone}` 
          : `Created new zone rule for "${cleanPattern}" → ${cleanZone}`,
      });

      setIsModalOpen(false);
      setEditingRule(null);
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to save zone rule:', err);
      setFeedback({ type: 'error', message: `Save error: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Rule
  const handleDeleteRule = async () => {
    if (!deletingRule || !deletingRule.id) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'zoneMappingRules', deletingRule.id));
      setFeedback({
        type: 'success',
        message: `Deleted rule "${deletingRule.pattern}" → ${deletingRule.zoneName}`,
      });
      setDeletingRule(null);
      await fetchRules();
    } catch (err: any) {
      console.error('Failed to delete rule:', err);
      setFeedback({ type: 'error', message: `Delete failed: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk Import from Excel
  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        if (!sheet) throw new Error('No readable sheet found in file.');

        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length === 0) throw new Error('Excel sheet contains no data rows.');

        const batch = writeBatch(db);
        let importedCount = 0;
        const now = new Date().toISOString();
        const creator = userProfile?.email || 'Admin';

        for (const r of rows) {
          // Normalize column names flexibly (Pincode / Keyword / Pattern / Zone / Zone Name)
          const rawType = String(r['Type'] || r['type'] || '').trim().toLowerCase();
          const rawPattern = String(
            r['Pincode'] || r['pincode'] || 
            r['Keyword'] || r['keyword'] || 
            r['Pattern'] || r['pattern'] || 
            r['Locality'] || r['locality'] || ''
          ).trim().toUpperCase();

          const rawZone = String(
            r['Zone'] || r['zone'] || 
            r['Zone Name'] || r['zoneName'] || 
            r['ZoneName'] || ''
          ).trim();

          const rawDesc = String(r['Description'] || r['description'] || '').trim();

          if (!rawPattern || !rawZone) continue;

          let determinedType: 'pincode' | 'locality' = 'locality';
          if (rawType === 'pincode' || /^\d{6}$/.test(rawPattern)) {
            determinedType = 'pincode';
          }

          const docId = `${determinedType}_${rawPattern.replace(/\s+/g, '_')}`;
          const docRef = doc(db, 'zoneMappingRules', docId);

          batch.set(docRef, {
            type: determinedType,
            pattern: rawPattern,
            zoneName: rawZone,
            description: rawDesc,
            createdBy: creator,
            createdAt: now,
            updatedAt: now,
          }, { merge: true });

          importedCount++;
        }

        await batch.commit();
        setFeedback({
          type: 'success',
          message: `Successfully imported and merged ${importedCount} zone mapping rules!`,
        });

        await fetchRules();
      } catch (err: any) {
        console.error('Bulk import error:', err);
        setFeedback({ type: 'error', message: `Import failed: ${err.message}` });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setIsImporting(false);
      setFeedback({ type: 'error', message: 'Failed to read Excel file.' });
    };

    reader.readAsArrayBuffer(file);
  };

  // Export current rules to Excel
  const handleExportRules = () => {
    if (rules.length === 0) return;
    const exportData = rules.map(r => ({
      'Type': r.type,
      'Pattern (Pincode / Keyword)': r.pattern,
      'Zone Name': r.zoneName,
      'Description': r.description || '',
      'Created By': r.createdBy || '',
      'Updated At': r.updatedAt || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zone Mapping Rules');
    XLSX.writeFile(wb, `Zone_Mapping_Rules_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Distinct Zones list for filtering
  const distinctZones = useMemo(() => {
    const set = new Set<string>();
    rules.forEach(r => {
      if (r.zoneName) set.add(r.zoneName);
    });
    return Array.from(set).sort();
  }, [rules]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (zoneFilter !== 'all' && r.zoneName !== zoneFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPattern = r.pattern.toLowerCase().includes(q);
        const matchesZone = r.zoneName.toLowerCase().includes(q);
        const matchesDesc = (r.description || '').toLowerCase().includes(q);
        return matchesPattern || matchesZone || matchesDesc;
      }
      return true;
    });
  }, [rules, typeFilter, zoneFilter, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
            <Compass className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Zone Mapping Rules</h2>
              <span className="text-[10px] font-black uppercase bg-blue-600 text-white px-2.5 py-0.5 rounded-full">
                Admin Master
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Lookup dictionary used during Trip Roster processing. Matches 6-digit Pincodes first, then Locality Keywords.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {rules.length === 0 && !isLoading && (
            <button
              onClick={handleSeedDefaults}
              disabled={isSaving}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Seed Standard NCR Rules</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleBulkImport}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Import Excel file with columns: Pincode/Keyword, Zone, Description"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isImporting ? 'Importing...' : 'Import Excel'}</span>
          </button>

          <button
            onClick={handleExportRules}
            disabled={rules.length === 0}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={() => handleOpenCreate()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Zone Rule</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
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

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Rules</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{rules.length}</p>
          <p className="text-[11px] text-slate-400">Pincode + Locality lookups</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">6-Digit Pincodes</span>
            <Hash className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600">
            {rules.filter(r => r.type === 'pincode').length}
          </p>
          <p className="text-[11px] text-slate-400">Priority Tier 1 match</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Locality Keywords</span>
            <Type className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-indigo-600">
            {rules.filter(r => r.type === 'locality').length}
          </p>
          <p className="text-[11px] text-slate-400">Fallback Tier 2 match</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Rule Type Filter */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                typeFilter === 'all' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Types ({rules.length})
            </button>
            <button
              onClick={() => setTypeFilter('pincode')}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                typeFilter === 'pincode' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pincodes ({rules.filter(r => r.type === 'pincode').length})
            </button>
            <button
              onClick={() => setTypeFilter('locality')}
              className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                typeFilter === 'locality' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Keywords ({rules.filter(r => r.type === 'locality').length})
            </button>
          </div>

          {/* Zone Selector Filter */}
          {distinctZones.length > 0 && (
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            >
              <option value="all">All Zones ({distinctZones.length})</option>
              {distinctZones.map(z => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-80">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search pincode, keyword, zone, locality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={fetchRules}
            className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-700 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span>Loading zone rules from Firestore...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Compass className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700 text-sm">No zone mapping rules found</p>
            <p className="text-slate-400 max-w-sm mx-auto">
              Add individual rules or click "Seed Standard NCR Rules" to populate standard airport & Delhi-NCR mappings.
            </p>
            <button
              onClick={() => handleOpenCreate()}
              className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Rule</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Rule Type</th>
                  <th className="px-4 py-3.5">Pattern / Pincode / Keyword</th>
                  <th className="px-4 py-3.5">Assigned Zone</th>
                  <th className="px-4 py-3.5">Description / Locality Note</th>
                  <th className="px-4 py-3.5">Last Updated</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      {rule.type === 'pincode' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                          <Hash className="w-3 h-3 text-emerald-600" />
                          <span>Pincode</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                          <Type className="w-3 h-3 text-indigo-600" />
                          <span>Keyword</span>
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {rule.pattern}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                        {rule.zoneName}
                      </span>
                    </td>

                    <td className="px-4 py-3 max-w-sm">
                      <p className="truncate text-slate-600">{rule.description || '—'}</p>
                    </td>

                    <td className="px-4 py-3 text-[11px] text-slate-400">
                      {rule.updatedAt ? rule.updatedAt.split('T')[0] : '—'}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(rule)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Rule"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingRule(rule)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Compass className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingRule ? 'Edit Zone Rule' : 'Create New Zone Rule'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="p-5 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Rule Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'pincode' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      formData.type === 'pincode'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>6-Digit Pincode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'locality' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      formData.type === 'locality'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    <span>Locality Keyword</span>
                  </button>
                </div>
              </div>

              {/* Pattern Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {formData.type === 'pincode' ? '6-Digit Pincode Pattern' : 'Locality Keyword Pattern'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={formData.type === 'pincode' ? 'e.g. 110037' : 'e.g. NANGLOI, DWARKA'}
                  value={formData.pattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, pattern: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 uppercase font-mono font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {formData.type === 'pincode' 
                    ? 'Matches the last 6-digit number extracted from the address.' 
                    : 'Case-insensitive substring match inside the address string.'}
                </p>
              </div>

              {/* Target Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Zone Name</label>
                <input
                  type="text"
                  required
                  list="zone-suggestions"
                  placeholder="e.g. South West, North West, West, Noida, Gurugram"
                  value={formData.zoneName}
                  onChange={(e) => setFormData(prev => ({ ...prev, zoneName: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
                <datalist id="zone-suggestions">
                  <option value="South West" />
                  <option value="North West" />
                  <option value="West" />
                  <option value="South" />
                  <option value="Central" />
                  <option value="East" />
                  <option value="North" />
                  <option value="Gurugram" />
                  <option value="Noida" />
                  <option value="Faridabad" />
                  <option value="Ghaziabad" />
                </datalist>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Sub-Localities (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mahipalpur, Aerocity, Dwarka Sector 10"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editingRule ? 'Save Changes' : 'Create Rule'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">Delete Zone Mapping Rule</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to remove rule <strong className="text-slate-800">{deletingRule.pattern}</strong> → <strong className="text-slate-800">{deletingRule.zoneName}</strong>?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRule(null)}
                className="py-2 px-3 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteRule}
                disabled={isSaving}
                className="py-2 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
