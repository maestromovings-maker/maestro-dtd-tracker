// 1. IMPORTS
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth,
         eachDayOfInterval, isSameDay, isWeekend, parseISO,
         isBefore, isAfter, startOfWeek, endOfWeek } from 'date-fns';

// Icons (lucide-react)
import {
  CalendarDays, Trash2, CheckCircle2, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, Download, Upload, Plus, X,
  Truck, Package, RefreshCw, Bell, BarChart2, Moon, Sun
} from 'lucide-react';
// 2. TYPES & INTERFACES
type DTDStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired';
type PickupType = 'standard' | 'bulk' | 'hazmat' | 'recycling';
type ViewMode  = 'dashboard' | 'calendar' | 'submissions' | 'analytics';

interface DTDEntry {
  id:          string;
  date:        string;           // ISO yyyy-MM-dd
  description: string;
  amount:      number;
  status:      DTDStatus;
  notes:       string;
  attachments: string[];
  createdAt:   string;
  updatedAt:   string;
}

interface BulkPickupEvent {
  id:          string;
  date:        string;           // ISO yyyy-MM-dd
  type:        PickupType;
  zone:        string;
  timeWindow:  string;           // e.g. "7:00 AM – 3:00 PM"
  notes:       string;
  reminder:    boolean;
}

interface AppState {
  entries:      DTDEntry[];
  pickupEvents: BulkPickupEvent[];
  darkMode:     boolean;
  activeView:   ViewMode;
  calendarDate: Date;
}
// 3. CONSTANTS
const STATUS_CONFIG: Record<DTDStatus, { label: string; color: string; icon: React.FC }> = {
  pending:   { label: 'Pending',   color: '#f0c060', icon: Clock         },
  submitted: { label: 'Submitted', color: '#82aaff', icon: Upload        },
  approved:  { label: 'Approved',  color: '#c3e88d', icon: CheckCircle2  },
  rejected:  { label: 'Rejected',  color: '#f07178', icon: X             },
  expired:   { label: 'Expired',   color: '#546e7a', icon: AlertTriangle },
};

const PICKUP_CONFIG: Record<PickupType, { label: string; color: string; icon: React.FC }> = {
  standard:  { label: 'Standard',  color: '#7eb8d4', icon: Package  },
  bulk:      { label: 'Bulk',      color: '#c792ea', icon: Truck    },
  hazmat:    { label: 'Hazmat',    color: '#f07178', icon: AlertTriangle },
  recycling: { label: 'Recycling', color: '#c3e88d', icon: RefreshCw },
};

const STORAGE_KEY = 'maestro_dtd_v2';
const DEFAULT_ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'All Zones'];
// 4. SEED DATA (bulk pickup calendar)
const SEED_PICKUPS: BulkPickupEvent[] = [
  {
    id: 'bp-001', date: '2026-04-26', type: 'bulk',
    zone: 'Zone A', timeWindow: '7:00 AM – 3:00 PM',
    notes: 'Furniture, appliances, large items', reminder: true,
  },
  {
    id: 'bp-002', date: '2026-05-03', type: 'bulk',
    zone: 'Zone B', timeWindow: '7:00 AM – 3:00 PM',
    notes: 'No electronics this pickup', reminder: false,
  },
  {
    id: 'bp-003', date: '2026-05-10', type: 'recycling',
    zone: 'All Zones', timeWindow: '6:00 AM – 12:00 PM',
    notes: 'Electronics recycling day', reminder: true,
  },
  {
    id: 'bp-004', date: '2026-05-17', type: 'hazmat',
    zone: 'Zone C', timeWindow: '9:00 AM – 1:00 PM',
    notes: 'Paint, chemicals, batteries', reminder: true,
  },
  {
    id: 'bp-005', date: '2026-05-24', type: 'bulk',
    zone: 'Zone D', timeWindow: '7:00 AM – 3:00 PM',
    notes: 'Holiday weekend – confirm with city', reminder: false,
  },
];
// 5. UTILITY HELPERS
const generateId = () =>
  `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const todayISO = () => format(new Date(), 'yyyy-MM-dd');

const loadState = (): Partial<AppState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveState = (state: Partial<AppState>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota exceeded – fail silently */ }
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(n);
// 6. COMPONENT SHELL & STATE INIT
export default function App() {
  const saved = useMemo(() => loadState(), []);

  // ── Core data ──────────────────────────────────────────────
  const [entries, setEntries] = useState<DTDEntry[]>(
    saved.entries ?? []
  );
  const [pickupEvents, setPickupEvents] = useState<BulkPickupEvent[]>(
    saved.pickupEvents?.length ? saved.pickupEvents : SEED_PICKUPS
  );

  // ── UI state ───────────────────────────────────────────────
  const [activeView,   setActiveView]   = useState<ViewMode>('dashboard');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [darkMode,     setDarkMode]     = useState(true);
  const [selectedDay,  setSelectedDay]  = useState<string | null>(null);

  // ── Modal / form state ─────────────────────────────────────
  const [showEntryForm,  setShowEntryForm]  = useState(false);
  const [showPickupForm, setShowPickupForm] = useState(false);
  const [editingEntry,   setEditingEntry]   = useState<DTDEntry | null>(null);
  const [filterStatus,   setFilterStatus]   = useState<DTDStatus | 'all'>('all');

  // ── Persist on change ──────────────────────────────────────
  useEffect(() => {
    saveState({ entries, pickupEvents, darkMode });
  }, [entries, pickupEvents, darkMode]);
// 7. CALENDAR COMPUTATION (bulk pickup logic)
  // Days visible in the current calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarDate));
    const end   = endOfWeek(endOfMonth(calendarDate));
    return eachDayOfInterval({ start, end });
  }, [calendarDate]);

  // Index pickup events by date string for O(1) lookup
  const pickupByDate = useMemo(() => {
    const map = new Map<string, BulkPickupEvent[]>();
    pickupEvents.forEach(ev => {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    });
    return map;
  }, [pickupEvents]);

  // Index DTD entries by date string
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DTDEntry[]>();
    entries.forEach(e => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [entries]);

  // Upcoming bulk pickups (next 30 days) sorted ascending
  const upcomingPickups = useMemo(() => {
    const today = new Date();
    const cutoff = addMonths(today, 1);
    return pickupEvents
      .filter(ev => {
        const d = parseISO(ev.date);
        return !isBefore(d, today) && !isAfter(d, cutoff);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [pickupEvents]);

  // Analytics totals
  const totals = useMemo(() => ({
    all:       entries.length,
    pending:   entries.filter(e => e.status === 'pending').length,
    approved:  entries.filter(e => e.status === 'approved').length,
    rejected:  entries.filter(e => e.status === 'rejected').length,
    totalAmt:  entries.reduce((s, e) => s + e.amount, 0),
    approvedAmt: entries
      .filter(e => e.status === 'approved')
      .reduce((s, e) => s + e.amount, 0),
  }), [entries]);
// 8. DTD ENTRY CRUD HANDLERS
  const handleSaveEntry = useCallback((
    draft: Omit<DTDEntry, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const now = new Date().toISOString();

    if (editingEntry) {
      // UPDATE existing
      setEntries(prev =>
        prev.map(e =>
          e.id === editingEntry.id
            ? { ...e, ...draft, updatedAt: now }
            : e
        )
      );
    } else {
      // CREATE new
      const newEntry: DTDEntry = {
        ...draft,
        id:        generateId(),
        createdAt: now,
        updatedAt: now,
      };
      setEntries(prev => [newEntry, ...prev]);
    }

    setEditingEntry(null);
    setShowEntryForm(false);
  }, [editingEntry]);

  const handleDeleteEntry = useCallback((id: string) => {
    if (!window.confirm('Delete this DTD entry?')) return;
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleStatusChange = useCallback((
    id: string, status: DTDStatus
  ) => {
    setEntries(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, status, updatedAt: new Date().toISOString() }
          : e
      )
    );
  }, []);

  const handleEditEntry = useCallback((entry: DTDEntry) => {
    setEditingEntry(entry);
    setShowEntryForm(true);
  }, []);
// 9. BULK PICKUP CRUD HANDLERS
  const handleSavePickup = useCallback((
    draft: Omit<BulkPickupEvent, 'id'>
  ) => {
    const newEvent: BulkPickupEvent = {
      ...draft,
      id: generateId(),
    };
    setPickupEvents(prev =>
      [...prev, newEvent].sort((a, b) => a.date.localeCompare(b.date))
    );
    setShowPickupForm(false);
  }, []);

  const handleDeletePickup = useCallback((id: string) => {
    if (!window.confirm('Remove this pickup event?')) return;
    setPickupEvents(prev => prev.filter(ev => ev.id !== id));
  }, []);

  const handleToggleReminder = useCallback((id: string) => {
    setPickupEvents(prev =>
      prev.map(ev =>
        ev.id === id ? { ...ev, reminder: !ev.reminder } : ev
      )
    );
  }, []);
// 10. EXPORT / IMPORT
  const handleExport = useCallback(() => {
    const payload = JSON.stringify({ entries, pickupEvents }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `maestro-dtd-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries, pickupEvents]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.entries)      setEntries(data.entries);
        if (data.pickupEvents) setPickupEvents(data.pickupEvents);
      } catch {
        alert('Invalid import file.');
      }
    };
    reader.readAsText(file);
  }, []);
// 11. DTD ENTRY FORM MODAL
  /** Renders inside a portal-style overlay */
  const EntryFormModal = () => {
    const blank = {
      date:        todayISO(),
      description: '',
      amount:      0,
      status:      'pending' as DTDStatus,
      notes:       '',
      attachments: [] as string[],
    };
    const [form, setForm] = useState(editingEntry ?? blank);

    const set = (k: keyof typeof form, v: unknown) =>
      setForm(prev => ({ ...prev, [k]: v }));

    const submit = () => {
      if (!form.description.trim()) { alert('Description required.'); return; }
      if (form.amount < 0)          { alert('Amount must be ≥ 0.');      return; }
      handleSaveEntry(form);
    };

    return (
      <div className="modal-overlay" onClick={() => setShowEntryForm(false)}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <h3>{editingEntry ? 'Edit Entry' : 'New DTD Entry'}</h3>

          <label>Date</label>
          <input type="date" value={form.date}
            onChange={e => set('date', e.target.value)} />

          <label>Description</label>
          <input type="text" value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="e.g. Overtime claim – Site B" />

          <label>Amount ($)</label>
          <input type="number" min="0" step="0.01" value={form.amount}
            onChange={e => set('amount', parseFloat(e.target.value) || 0)} />

          <label>Status</label>
          <select value={form.status}
            onChange={e => set('status', e.target.value as DTDStatus)}>
            {(Object.keys(STATUS_CONFIG) as DTDStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          <label>Notes</label>
          <textarea rows={3} value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Optional notes..." />

          <div className="modal-actions">
            <button className="btn-secondary"
              onClick={() => { setShowEntryForm(false); setEditingEntry(null); }}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit}>
              {editingEntry ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>
    );
  };
// 12. BULK PICKUP FORM MODAL
  const PickupFormModal = () => {
    const [form, setForm] = useState<Omit<BulkPickupEvent, 'id'>>({
      date:       todayISO(),
      type:       'bulk',
      zone:       'Zone A',
      timeWindow: '7:00 AM – 3:00 PM',
      notes:      '',
      reminder:   true,
    });

    const set = (k: keyof typeof form, v: unknown) =>
      setForm(prev => ({ ...prev, [k]: v }));

    return (
      <div className="modal-overlay" onClick={() => setShowPickupForm(false)}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <h3>Schedule Bulk Pickup</h3>

          <label>Date</label>
          <input type="date" value={form.date}
            onChange={e => set('date', e.target.value)} />

          <label>Pickup Type</label>
          <select value={form.type}
            onChange={e => set('type', e.target.value as PickupType)}>
            {(Object.keys(PICKUP_CONFIG) as PickupType[]).map(t => (
              <option key={t} value={t}>{PICKUP_CONFIG[t].label}</option>
            ))}
          </select>

          <label>Zone</label>
          <select value={form.zone}
            onChange={e => set('zone', e.target.value)}>
            {DEFAULT_ZONES.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <label>Time Window</label>
          <input type="text" value={form.timeWindow}
            onChange={e => set('timeWindow', e.target.value)}
            placeholder="e.g. 7:00 AM – 3:00 PM" />

          <label>Notes</label>
          <textarea rows={2} value={form.notes}
            onChange={e => set('notes', e.target.value)} />

          <label className="checkbox-label">
            <input type="checkbox" checked={form.reminder}
              onChange={e => set('reminder', e.target.checked)} />
            Set reminder
          </label>

          <div className="modal-actions">
            <button className="btn-secondary"
              onClick={() => setShowPickupForm(false)}>Cancel</button>
            <button className="btn-primary"
              onClick={() => handleSavePickup(form)}>Schedule</button>
          </div>
        </div>
      </div>
    );
  };
// 13. DAY DETAIL PANEL (calendar click)
  const DayDetailPanel = ({ dateStr }: { dateStr: string }) => {
    const dayEntries  = entriesByDate.get(dateStr) ?? [];
    const dayPickups  = pickupByDate.get(dateStr)  ?? [];
    const label       = format(parseISO(dateStr), 'EEEE, MMMM d yyyy');

    return (
      <div className="day-panel">
        <div className="day-panel-header">
          <span>{label}</span>
          <button onClick={() => setSelectedDay(null)}><X size={14} /></button>
        </div>

        {dayPickups.length > 0 && (
          <div className="day-section">
            <h4>Pickups</h4>
            {dayPickups.map(ev => {
              const cfg = PICKUP_CONFIG[ev.type];
              return (
                <div key={ev.id} className="pickup-chip"
                  style={{ borderColor: cfg.color }}>
                  <span style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="chip-zone">{ev.zone}</span>
                  <span className="chip-time">{ev.timeWindow}</span>
                  {ev.notes && <span className="chip-notes">{ev.notes}</span>}
                  <button onClick={() => handleToggleReminder(ev.id)}>
                    <Bell size={12}
                      fill={ev.reminder ? cfg.color : 'none'}
                      color={cfg.color} />
                  </button>
                  <button onClick={() => handleDeletePickup(ev.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="day-section">
          <h4>DTD Entries ({dayEntries.length})</h4>
          {dayEntries.length === 0
            ? <p className="empty">No entries this day.</p>
            : dayEntries.map(e => {
                const cfg = STATUS_CONFIG[e.status];
                return (
                  <div key={e.id} className="entry-row">
                    <span className="entry-desc">{e.description}</span>
                    <span style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="entry-amt">{formatCurrency(e.amount)}</span>
                    <button onClick={() => handleEditEntry(e)}>Edit</button>
                    <button onClick={() => handleDeleteEntry(e.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
          }
        </div>

        <div className="day-actions">
          <button className="btn-secondary"
            onClick={() => { setShowPickupForm(true); }}>
            <Truck size={13} /> Add Pickup
          </button>
          <button className="btn-primary"
            onClick={() => setShowEntryForm(true)}>
            <Plus size={13} /> Add Entry
          </button>
        </div>
      </div>
    );
  };
CHUNK 3 / 3FINAL
⬡ MAESTRO DTD TRACKER — app.tsx
// 14. DASHBOARD VIEW
  const DashboardView = () => (
    <div className="view dashboard">

      {/* ── Stat cards ── */}
      <div className="stat-grid">
        {[
          { label: 'Total Entries',    value: totals.all,                         color: '#7eb8d4' },
          { label: 'Pending',           value: totals.pending,                      color: '#f0c060' },
          { label: 'Approved',          value: totals.approved,                     color: '#c3e88d' },
          { label: 'Rejected',          value: totals.rejected,                     color: '#f07178' },
          { label: 'Total Amount',      value: formatCurrency(totals.totalAmt),     color: '#e8e2d4' },
          { label: 'Approved Amount',   value: formatCurrency(totals.approvedAmt),  color: '#c3e88d' },
        ].map(card => (
          <div key={card.label} className="stat-card"
            style={{ borderTopColor: card.color }}>
            <span className="stat-value" style={{ color: card.color }}>
              {card.value}
            </span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>

      {/* ── Upcoming bulk pickups ── */}
      <div className="section-card">
        <div className="section-header">
          <Truck size={15} /> Upcoming Bulk Pickups (next 30 days)
          <button className="btn-ghost"
            onClick={() => setShowPickupForm(true)}>
            <Plus size={13} /> Schedule
          </button>
        </div>
        {upcomingPickups.length === 0
          ? <p className="empty">No upcoming pickups scheduled.</p>
          : upcomingPickups.map(ev => {
              const cfg = PICKUP_CONFIG[ev.type];
              const Icon = cfg.icon;
              return (
                <div key={ev.id} className="pickup-row"
                  style={{ borderLeftColor: cfg.color }}>
                  <Icon size={14} color={cfg.color} />
                  <span className="pickup-date">
                    {format(parseISO(ev.date), 'MMM d')}
                  </span>
                  <span style={{ color: cfg.color }}>{cfg.label}</span>
                  <span className="pickup-zone">{ev.zone}</span>
                  <span className="pickup-time">{ev.timeWindow}</span>
                  {ev.reminder && <Bell size={11} color={cfg.color} fill={cfg.color} />}
                  <button onClick={() => handleDeletePickup(ev.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
        }
      </div>

      {/* ── Recent entries ── */}
      <div className="section-card">
        <div className="section-header">
          <BarChart2 size={15} /> Recent DTD Entries
          <button className="btn-ghost"
            onClick={() => setShowEntryForm(true)}>
            <Plus size={13} /> Add Entry
          </button>
        </div>
        {entries.slice(0, 5).map(e => {
          const cfg = STATUS_CONFIG[e.status];
          const Icon = cfg.icon;
          return (
            <div key={e.id} className="entry-row">
              <Icon size={13} color={cfg.color} />
              <span className="entry-date">{e.date}</span>
              <span className="entry-desc">{e.description}</span>
              <span style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="entry-amt">{formatCurrency(e.amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
// 15. CALENDAR VIEW
  const CalendarView = () => (
    <div className="view calendar-view">
      <div className="cal-nav">
        <button onClick={() => setCalendarDate(d => subMonths(d, 1))}>
          <ChevronLeft size={18} />
        </button>
        <h2 className="cal-month">
          {format(calendarDate, 'MMMM yyyy')}
        </h2>
        <button onClick={() => setCalendarDate(d => addMonths(d, 1))}>
          <ChevronRight size={18} />
        </button>
        <button className="btn-ghost"
          onClick={() => setCalendarDate(new Date())}>Today</button>
        <button className="btn-secondary"
          onClick={() => setShowPickupForm(true)}>
          <Plus size={13} /> Pickup
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="cal-grid">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="cal-dow">{d}</div>
        ))}

        {calendarDays.map(day => {
          const ds       = format(day, 'yyyy-MM-dd');
          const pickups  = pickupByDate.get(ds)  ?? [];
          const dayEnts  = entriesByDate.get(ds) ?? [];
          const isToday  = isSameDay(day, new Date());
          const isCurMon = day.getMonth() === calendarDate.getMonth();
          const isWeeknd = isWeekend(day);
          const isSelected = selectedDay === ds;

          return (
            <div key={ds}
              className={[
                'cal-cell',
                isToday    ? 'today'        : '',
                !isCurMon  ? 'other-month'  : '',
                isWeeknd   ? 'weekend'      : '',
                isSelected ? 'selected'     : '',
              ].join(' ')}
              onClick={() => setSelectedDay(isSelected ? null : ds)}>

              <span className="cal-day-num">{day.getDate()}</span>

              {/* Pickup dots */}
              {pickups.map(ev => (
                <div key={ev.id} className="cal-pickup-dot"
                  style={{ background: PICKUP_CONFIG[ev.type].color }}
                  title={`${PICKUP_CONFIG[ev.type].label} – ${ev.zone}`} />
              ))}

              {/* Entry count badge */}
              {dayEnts.length > 0 && (
                <span className="cal-entry-badge">
                  {dayEnts.length}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Pickup legend */}
      <div className="cal-legend">
        {(Object.entries(PICKUP_CONFIG) as [PickupType, typeof PICKUP_CONFIG[PickupType]][]).map(
          ([type, cfg]) => (
            <span key={type} className="legend-item">
              <span className="legend-dot"
                style={{ background: cfg.color }} />
              {cfg.label}
            </span>
          )
        )}
        <span className="legend-item">
          <span className="legend-dot entry-dot" /> DTD Entries
        </span>
      </div>

      {/* Day detail slide-in */}
      {selectedDay && <DayDetailPanel dateStr={selectedDay} />}
    </div>
  );
// 16. SUBMISSIONS TABLE VIEW
  const SubmissionsView = () => {
    const filtered = filterStatus === 'all'
      ? entries
      : entries.filter(e => e.status === filterStatus);

    return (
      <div className="view">
        <div className="table-toolbar">
          <div className="filter-tabs">
            {(['all', ...Object.keys(STATUS_CONFIG)] as (DTDStatus | 'all')[]).map(s => (
              <button key={s}
                className={filterStatus === s ? 'tab active' : 'tab'}
                style={filterStatus === s && s !== 'all'
                  ? { borderColor: STATUS_CONFIG[s as DTDStatus].color,
                      color:       STATUS_CONFIG[s as DTDStatus].color }
                  : {}}
                onClick={() => setFilterStatus(s)}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s as DTDStatus].label}
              </button>
            ))}
          </div>
          <button className="btn-primary"
            onClick={() => setShowEntryForm(true)}>
            <Plus size={13} /> New Entry
          </button>
        </div>

        <table className="dtd-table">
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th>Amount</th>
              <th>Status</th><th>Notes</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? (
                  <tr><td colSpan={6} className="empty">
                    No entries match this filter.
                  </td></tr>
                )
              : filtered.map(e => {
                  const cfg = STATUS_CONFIG[e.status];
                  return (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>{e.description}</td>
                      <td>{formatCurrency(e.amount)}</td>
                      <td>
                        <select
                          value={e.status}
                          style={{ color: cfg.color, borderColor: cfg.color }}
                          onChange={ev =>
                            handleStatusChange(e.id, ev.target.value as DTDStatus)
                          }>
                          {(Object.keys(STATUS_CONFIG) as DTDStatus[]).map(s => (
                            <option key={s} value={s}>
                              {STATUS_CONFIG[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="notes-cell">{e.notes || '—'}</td>
                      <td className="actions-cell">
                        <button onClick={() => handleEditEntry(e)}>Edit</button>
                        <button className="danger"
                          onClick={() => handleDeleteEntry(e.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    );
  };
// 17. ANALYTICS VIEW
  const AnalyticsView = () => {
    const byStatus = (Object.keys(STATUS_CONFIG) as DTDStatus[]).map(s => ({
      status: s,
      count:  entries.filter(e => e.status === s).length,
      amount: entries.filter(e => e.status === s).reduce((a, e) => a + e.amount, 0),
      cfg:    STATUS_CONFIG[s],
    }));
    const maxCount = Math.max(1, ...byStatus.map(r => r.count));

    const byType = (Object.keys(PICKUP_CONFIG) as PickupType[]).map(t => ({
      type:  t,
      count: pickupEvents.filter(ev => ev.type === t).length,
      cfg:   PICKUP_CONFIG[t],
    }));
    const maxPick = Math.max(1, ...byType.map(r => r.count));

    return (
      <div className="view analytics">
        <div className="analytics-grid">

          <div className="section-card">
            <h3>DTD Entries by Status</h3>
            {byStatus.map(row => (
              <div key={row.status} className="bar-row">
                <span className="bar-label">{row.cfg.label}</span>
                <div className="bar-track">
                  <div className="bar-fill"
                    style={{
                      width:      `${(row.count / maxCount) * 100}%`,
                      background: row.cfg.color,
                    }} />
                </div>
                <span className="bar-count"
                  style={{ color: row.cfg.color }}>{row.count}</span>
                <span className="bar-amt">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>

          <div className="section-card">
            <h3>Pickup Events by Type</h3>
            {byType.map(row => (
              <div key={row.type} className="bar-row">
                <span className="bar-label">{row.cfg.label}</span>
                <div className="bar-track">
                  <div className="bar-fill"
                    style={{
                      width:      `${(row.count / maxPick) * 100}%`,
                      background: row.cfg.color,
                    }} />
                </div>
                <span className="bar-count"
                  style={{ color: row.cfg.color }}>{row.count}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    );
  };
// 18. NAV SHELL + ROOT RENDER
  const NAV_ITEMS: { id: ViewMode; label: string; icon: React.FC }[] = [
    { id: 'dashboard',   label: 'Dashboard',   icon: BarChart2   },
    { id: 'calendar',    label: 'Calendar',    icon: CalendarDays },
    { id: 'submissions', label: 'Submissions', icon: CheckCircle2 },
    { id: 'analytics',   label: 'Analytics',   icon: BarChart2   },
  ];

  return (
    <div className={`app-root ${darkMode ? 'dark' : 'light'}`}>

      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-icon">⬡</span>
          <span className="brand-name">Maestro DTD</span>
        </div>
        <nav className="topbar-nav">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id}
                className={activeView === item.id ? 'nav-btn active' : 'nav-btn'}
                onClick={() => setActiveView(item.id)}>
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="topbar-actions">
          <button className="btn-ghost" onClick={handleExport}>
            <Download size={14} />
          </button>
          <label className="btn-ghost" title="Import JSON">
            <Upload size={14} />
            <input type="file" accept=".json" hidden
              onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <button className="btn-ghost"
            onClick={() => setDarkMode(d => !d)}>
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="main-content">
        {activeView === 'dashboard'   && <DashboardView   />}
        {activeView === 'calendar'    && <CalendarView    />}
        {activeView === 'submissions' && <SubmissionsView />}
        {activeView === 'analytics'   && <AnalyticsView   />}
      </main>

      {/* ── Modals ── */}
      {showEntryForm  && <EntryFormModal  />}
      {showPickupForm && <PickupFormModal />}
    </div>
  );
} // ← end of App()
// 19. CSS (globals — paste into app.css or a <style> tag)
/* ── Tokens ────────────────────────────────────────── */
.dark  { --bg: #0d0f14; --surface: #12151c; --border: #2a2d35;
         --text: #e8e2d4; --muted: #546e7a; --accent: #f0c060; }
.light { --bg: #f5f2ec; --surface: #ffffff; --border: #ddd8cc;
         --text: #1a1c22; --muted: #8a8880; --accent: #c08010; }

/* ── Layout ────────────────────────────────────────── */
.app-root    { min-height: 100vh; background: var(--bg);
               color: var(--text); font-family: 'JetBrains Mono',
               'Courier New', monospace; display: flex; flex-direction: column; }
.topbar      { display: flex; align-items: center; gap: 16px;
               padding: 0 24px; height: 52px;
               background: var(--surface); border-bottom: 1px solid var(--border);
               position: sticky; top: 0; z-index: 100; }
.topbar-brand   { display: flex; align-items: center; gap: 8px; }
.brand-icon     { font-size: 1.3rem; color: var(--accent); }
.brand-name     { font-weight: 700; letter-spacing: .1em;
                  color: var(--accent); white-space: nowrap; }
.topbar-nav     { display: flex; gap: 4px; flex: 1; }
.topbar-actions { display: flex; gap: 6px; }
.main-content   { flex: 1; padding: 24px; max-width: 1200px;
                  margin: 0 auto; width: 100%; }

/* ── Buttons ───────────────────────────────────────── */
button, .btn-ghost, .btn-primary, .btn-secondary {
  cursor: pointer; border: none; border-radius: 4px;
  font-family: inherit; font-size: .78rem; display: inline-flex;
  align-items: center; gap: 5px; transition: opacity .15s; }
button:hover { opacity: .8; }
.btn-primary   { background: var(--accent); color: #0d0f14; padding: 6px 12px; font-weight: 700; }
.btn-secondary { background: transparent; border: 1px solid var(--border);
                 color: var(--text); padding: 5px 10px; }
.btn-ghost     { background: transparent; color: var(--muted); padding: 5px 8px; }
.nav-btn       { background: transparent; color: var(--muted);
                 padding: 6px 10px; border-radius: 4px; }
.nav-btn.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
button.danger  { color: #f07178; }

/* ── Cards / sections ──────────────────────────────── */
.stat-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
               gap: 12px; margin-bottom: 20px; }
.stat-card   { background: var(--surface); border: 1px solid var(--border);
               border-top: 3px solid; border-radius: 6px; padding: 14px 16px;
               display: flex; flex-direction: column; gap: 4px; }
.stat-value  { font-size: 1.4rem; font-weight: 700; }
.stat-label  { font-size: .7rem; color: var(--muted); letter-spacing: .08em; }
.section-card { background: var(--surface); border: 1px solid var(--border);
                border-radius: 6px; padding: 16px; margin-bottom: 16px; }
.section-header { display: flex; align-items: center; gap: 8px;
                  font-size: .8rem; font-weight: 700; letter-spacing: .08em;
                  margin-bottom: 12px; color: var(--muted); }

/* ── Calendar ──────────────────────────────────────── */
.cal-nav   { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.cal-month { font-size: 1rem; font-weight: 700; color: var(--accent);
             letter-spacing: .08em; margin: 0; flex: 1; }
.cal-grid  { display: grid; grid-template-columns: repeat(7, 1fr);
             gap: 2px; margin-bottom: 12px; }
.cal-dow   { text-align: center; font-size: .65rem; color: var(--muted);
             padding: 4px 0; letter-spacing: .06em; }
.cal-cell  { min-height: 72px; background: var(--surface);
             border: 1px solid var(--border); border-radius: 4px;
             padding: 4px 5px; cursor: pointer; position: relative;
             transition: border-color .12s; }
.cal-cell:hover   { border-color: var(--accent); }
.cal-cell.today   { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.cal-cell.selected { border-color: #82aaff; background: color-mix(in srgb, #82aaff 12%, var(--surface)); }
.cal-cell.other-month { opacity: .35; }
.cal-cell.weekend { background: color-mix(in srgb, var(--muted) 6%, var(--surface)); }
.cal-day-num { font-size: .7rem; color: var(--muted); display: block; }
.cal-pickup-dot { width: 8px; height: 8px; border-radius: 50%;
                  display: inline-block; margin: 1px 1px 0 0; }
.cal-entry-badge { position: absolute; bottom: 4px; right: 5px;
                   background: #82aaff; color: #0d0f14; border-radius: 10px;
                   font-size: .6rem; padding: 1px 5px; font-weight: 700; }
.cal-legend  { display: flex; gap: 14px; flex-wrap: wrap;
               font-size: .7rem; color: var(--muted); margin-top: 4px; }
.legend-item { display: flex; align-items: center; gap: 5px; }
.legend-dot  { width: 9px; height: 9px; border-radius: 50%; }
.entry-dot   { background: #82aaff; }

/* ── Pickup rows ───────────────────────────────────── */
.pickup-row { display: flex; align-items: center; gap: 8px;
              border-left: 3px solid; padding: 6px 10px;
              background: var(--bg); border-radius: 0 4px 4px 0;
              margin-bottom: 6px; font-size: .78rem; }
.pickup-zone { color: var(--muted); font-size: .7rem; }
.pickup-time { color: var(--muted); font-size: .7rem; margin-left: auto; }
.pickup-chip { display: flex; align-items: center; gap: 6px;
               border: 1px solid; border-radius: 4px; padding: 5px 8px;
               margin-bottom: 5px; font-size: .75rem; }

/* ── Entry rows / table ────────────────────────────── */
.entry-row  { display: flex; align-items: center; gap: 8px;
              padding: 6px 0; border-bottom: 1px solid var(--border);
              font-size: .78rem; }
.entry-date { color: var(--muted); font-size: .7rem; white-space: nowrap; }
.entry-desc { flex: 1; }
.entry-amt  { font-weight: 700; white-space: nowrap; }
.dtd-table  { width: 100%; border-collapse: collapse; font-size: .78rem; }
.dtd-table th { text-align: left; padding: 8px 10px; color: var(--muted);
                border-bottom: 2px solid var(--border); letter-spacing: .06em; }
.dtd-table td { padding: 7px 10px; border-bottom: 1px solid var(--border); }
.dtd-table tr:hover td { background: var(--surface); }
.notes-cell   { color: var(--muted); max-width: 180px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-cell { display: flex; gap: 6px; align-items: center; }
.table-toolbar { display: flex; align-items: center;
                 justify-content: space-between; margin-bottom: 14px; }
.filter-tabs  { display: flex; gap: 4px; flex-wrap: wrap; }
.tab          { background: transparent; color: var(--muted);
                border: 1px solid var(--border); padding: 4px 10px;
                border-radius: 4px; font-size: .72rem; cursor: pointer; }
.tab.active   { color: var(--accent); border-color: var(--accent); }

/* ── Analytics ─────────────────────────────────────── */
.analytics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.bar-row   { display: flex; align-items: center; gap: 8px;
             margin-bottom: 10px; font-size: .75rem; }
.bar-label { width: 80px; color: var(--muted); }
.bar-track { flex: 1; height: 8px; background: var(--border); border-radius: 4px; }
.bar-fill  { height: 100%; border-radius: 4px; transition: width .4s ease; }
.bar-count { width: 28px; text-align: right; font-weight: 700; }
.bar-amt   { width: 80px; text-align: right; color: var(--muted); }

/* ── Modal ──────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55);
                 display: flex; align-items: center; justify-content: center;
                 z-index: 200; }
.modal-box { background: var(--surface); border: 1px solid var(--border);
             border-radius: 8px; padding: 24px; width: 400px; max-width: 95vw;
             display: flex; flex-direction: column; gap: 10px; }
.modal-box h3    { margin: 0 0 4px; color: var(--accent); font-size: .9rem;
                   letter-spacing: .08em; }
.modal-box label { font-size: .72rem; color: var(--muted); }
.modal-box input, .modal-box select, .modal-box textarea {
  width: 100%; background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 6px 8px; color: var(--text);
  font-family: inherit; font-size: .78rem; box-sizing: border-box; }
.modal-box input:focus, .modal-box select:focus, .modal-box textarea:focus {
  outline: none; border-color: var(--accent); }
.checkbox-label { display: flex; align-items: center; gap: 8px;
                  font-size: .75rem; color: var(--text); cursor: pointer; }
.modal-actions  { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }

/* ── Day panel ──────────────────────────────────────── */
.day-panel        { margin-top: 16px; background: var(--surface);
                    border: 1px solid #82aaff; border-radius: 6px; padding: 16px; }
.day-panel-header { display: flex; justify-content: space-between;
                    align-items: center; margin-bottom: 12px;
                    font-weight: 700; color: #82aaff; font-size: .82rem; }
.day-section      { margin-bottom: 12px; }
.day-section h4   { font-size: .72rem; color: var(--muted); margin: 0 0 6px;
                    letter-spacing: .08em; }
.day-actions      { display: flex; gap: 8px; margin-top: 10px; }
.empty            { color: var(--muted); font-size: .75rem;
                    padding: 8px 0; font-style: italic; }

/* ── Responsive ─────────────────────────────────────── */
@media (max-width: 700px) {
  .analytics-grid { grid-template-columns: 1fr; }
  .topbar-nav .nav-btn span { display: none; }
  .cal-cell { min-height: 48px; }
}
