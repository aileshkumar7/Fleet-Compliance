/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { UserActivityLog } from '../types';
import { 
  ShieldAlert, 
  Search, 
  Building2, 
  Clock, 
  LogIn, 
  LogOut, 
  UserCheck, 
  Calendar, 
  ArrowUpDown, 
  Filter, 
  Shield, 
  Activity,
  ArrowLeft
} from 'lucide-react';

export const UserActivityLogsView: React.FC = () => {
  const { userProfile, isAdmin } = useAuth();
  const [logs, setLogs] = useState<UserActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filter & Sort state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<'all' | 'login' | 'logout'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const qLogs = query(collection(db, 'userActivityLogs'), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(qLogs, (snapshot) => {
      const items: UserActivityLog[] = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() } as UserActivityLog);
      });
      setLogs(items);
      setIsLoading(false);
    }, (err) => {
      console.error('Error fetching activity logs:', err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Rule 6: Access control guard - Non-admin users see Access Denied
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-3xl border border-rose-200 p-8 text-center space-y-4 shadow-xl">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">Access Denied</h3>
          <p className="text-xs text-slate-500 mt-1">Admin Privilege Required</p>
        </div>
        <p className="text-xs text-slate-600 max-w-md mx-auto bg-rose-50/70 p-3 rounded-xl border border-rose-100 font-medium">
          The User Activity Audit Log is strictly reserved for Fleet Administrators. Standard user accounts cannot inspect system authentication logs.
        </p>
      </div>
    );
  }

  // Unique clients and users for dropdown filters
  const uniqueClients = Array.from(new Set(logs.map(l => l.clientId).filter(Boolean)));
  const uniqueUsers = Array.from(new Set(logs.map(l => l.userEmail).filter(Boolean)));

  // Filter logic
  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchTerm || 
      (log.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.clientId || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesClient = selectedClient === 'all' || 
      (log.clientId || '').toLowerCase() === selectedClient.toLowerCase();

    const matchesEvent = eventFilter === 'all' || log.event === eventFilter;

    return matchesSearch && matchesClient && matchesEvent;
  });

  // Sort logic
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const tA = new Date(a.timestamp).getTime();
    const tB = new Date(b.timestamp).getTime();
    return sortOrder === 'desc' ? tB - tA : tA - tB;
  });

  // Metrics calculation
  const totalLogins = logs.filter(l => l.event === 'login').length;
  const totalLogouts = logs.filter(l => l.event === 'logout').length;
  const activeUserCount = new Set(logs.map(l => l.userEmail)).size;

  const formattedDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '—';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <span>User Authentication & Session Audit Log</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time security audit trail tracking User Login, Logout, Client Bindings, and Session Durations.
          </p>
        </div>

        {/* Stats Badges */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider block">Login Events</span>
            <span className="text-lg font-black text-emerald-800 font-mono">{totalLogins}</span>
          </div>
          <div className="bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider block">Logout Events</span>
            <span className="text-lg font-black text-slate-800 font-mono">{totalLogouts}</span>
          </div>
          <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-center">
            <span className="text-[10px] text-blue-700 uppercase font-bold tracking-wider block">Unique Users</span>
            <span className="text-lg font-black text-blue-800 font-mono">{activeUserCount}</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search User Email, User ID, Client ID..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none text-slate-800 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          {/* Client Filter Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <Building2 className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="text-slate-500 font-medium text-[11px] hidden md:inline">Client:</span>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="bg-transparent border-none outline-none font-bold text-slate-800 text-xs cursor-pointer"
            >
              <option value="all">🌐 All Bound Clients</option>
              {uniqueClients.map((c, i) => (
                <option key={i} value={c}>🏢 {c}</option>
              ))}
            </select>
          </div>

          {/* Event Filter */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
            <button
              onClick={() => setEventFilter('all')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${eventFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}
            >
              All Events
            </button>
            <button
              onClick={() => setEventFilter('login')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${eventFilter === 'login' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Login
            </button>
            <button
              onClick={() => setEventFilter('logout')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer ${eventFilter === 'logout' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500'}`}
            >
              Logout
            </button>
          </div>

          {/* Sort Order Toggle */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-600" />
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <Activity className="w-6 h-6 animate-spin text-slate-600" />
            <span>Loading security audit trail...</span>
          </div>
        ) : sortedLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700">No activity logs recorded yet.</p>
            <p>Authentication events (login, logout, session durations) will appear here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                <tr>
                  <th className="px-5 py-3">Event Type</th>
                  <th className="px-5 py-3">User Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Bound Client ID</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Session Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedLogs.map((log) => {
                  const isLogin = log.event === 'login';
                  const isUserRole = log.role === 'user';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Event Type Badge */}
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isLogin 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {isLogin ? <LogIn className="w-3 h-3 text-emerald-600" /> : <LogOut className="w-3 h-3 text-slate-600" />}
                          <span>{log.event}</span>
                        </span>
                      </td>

                      {/* User Email */}
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {log.userEmail}
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isUserRole ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          {log.role || 'user'}
                        </span>
                      </td>

                      {/* Bound Client ID */}
                      <td className="px-5 py-3.5 font-mono text-slate-700 font-bold">
                        {log.clientId ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                            🏢 {log.clientId}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unbound / Admin</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-slate-600 font-mono text-[11px]">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                      </td>

                      {/* Session Duration */}
                      <td className="px-5 py-3.5 font-mono text-slate-800 font-bold">
                        {!isLogin && log.sessionDurationSeconds ? (
                          <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200">
                            ⏱️ {formattedDuration(log.sessionDurationSeconds)}
                          </span>
                        ) : isLogin ? (
                          <span className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Active Session</span>
                        ) : (
                          <span className="text-slate-400">—</span>
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
    </div>
  );
};
