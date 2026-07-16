'use client';

import React, { useReducer, useEffect, useState, useRef } from 'react';
import {
  ConciergeBell, Sparkles, Wrench, LayoutDashboard, Bell, Pause, Play,
  Star, X, Plus, Droplets, Wind, Tv, Coffee, Clock, Car, Check,
  ArrowRight, AlertTriangle, Waves, LogOut,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type RoomStatus = 'occupied' | 'checkout_due' | 'vacant_dirty' | 'cleaning' | 'vacant_clean' | 'out_of_order';
type Dept = 'housekeeping' | 'maintenance' | 'frontdesk';
type Priority = 'low' | 'med' | 'high';
type TicketStatus = 'new' | 'in_progress' | 'done';
type RequestType = 'towels' | 'clean' | 'ac' | 'plumb' | 'tv' | 'food' | 'late' | 'taxi';
type Role = 'frontdesk' | 'housekeeping' | 'maintenance' | 'manager';

interface Room {
  id: string; floor: number; status: RoomStatus;
  vip: boolean; guest?: string; nights?: number;
}

interface Ticket {
  id: string; room: string; request_type: RequestType;
  title: string; dept: Dept; priority: Priority;
  status: TicketStatus; createdBy: string; createdAt: number; log: string[];
}

interface ActivityEntry {
  id: string; dept: Dept; message: string; timestamp: number; isNew?: boolean;
}

interface AppState {
  rooms: Room[];
  tickets: Ticket[];
  activity: ActivityEntry[];
  unread: Record<Dept, number>;
  flash: Record<string, number>;
  toast: { message: string; id: string } | null;
  ticketCounter: number;
  activityCounter: number;
  ambientCount: number;
  paused: boolean;
  activeRole: Role;
  selectedRoom: string | null;
  showNotifications: boolean;
  showLogRequest: boolean;
  logRequestRoom: string;
}

type Action =
  | { type: 'CREATE_TICKET'; payload: { room: string; request_type: RequestType; createdBy: string; isAmbient?: boolean } }
  | { type: 'ADVANCE_TICKET'; payload: { ticketId: string } }
  | { type: 'CLEAN_ROOM'; payload: { roomId: string } }
  | { type: 'CHECKOUT'; payload: { roomId: string } }
  | { type: 'SET_ROLE'; payload: Role }
  | { type: 'SET_ROOM'; payload: string | null }
  | { type: 'TOGGLE_NOTIFICATIONS' }
  | { type: 'TOGGLE_LOG_REQUEST'; payload?: string }
  | { type: 'DISMISS_TOAST' }
  | { type: 'TOGGLE_PAUSED' }
  | { type: 'CLEAR_NEW_ACTIVITY' };

// ─── Constants ───────────────────────────────────────────────────────────────

interface WorkflowItem { title: string; dept: Dept; priority: Priority; }

const WORKFLOW: Record<RequestType, WorkflowItem> = {
  towels: { title: 'Extra towels / amenities', dept: 'housekeeping', priority: 'low' },
  clean:  { title: 'Room cleaning',            dept: 'housekeeping', priority: 'med' },
  ac:     { title: 'AC / heating issue',        dept: 'maintenance',  priority: 'high' },
  plumb:  { title: 'Plumbing / leak',           dept: 'maintenance',  priority: 'high' },
  tv:     { title: 'TV / electronics',           dept: 'maintenance',  priority: 'med' },
  food:   { title: 'Room service (F&B)',         dept: 'frontdesk',    priority: 'med' },
  late:   { title: 'Late checkout',             dept: 'frontdesk',    priority: 'low' },
  taxi:   { title: 'Taxi / concierge',          dept: 'frontdesk',    priority: 'low' },
};

const STATUS_CONFIG: Record<RoomStatus, { label: string; color: string; bg: string }> = {
  occupied:     { label: 'Occupied',    color: '#3F73B5', bg: 'rgba(63,115,181,0.1)' },
  checkout_due: { label: 'Checkout',   color: '#8069C6', bg: 'rgba(128,105,198,0.1)' },
  vacant_dirty: { label: 'Dirty',      color: '#D99B3B', bg: 'rgba(217,155,59,0.12)' },
  cleaning:     { label: 'Cleaning',   color: '#2E9BC0', bg: 'rgba(46,155,192,0.1)' },
  vacant_clean: { label: 'Ready',      color: '#2E9E7B', bg: 'rgba(46,158,123,0.1)' },
  out_of_order: { label: 'Out of Order', color: '#C65B4E', bg: 'rgba(198,91,78,0.1)' },
};

const DEPT_CONFIG: Record<Dept, { label: string; color: string; bg: string }> = {
  housekeeping: { label: 'Housekeeping',   color: '#2E9BC0', bg: 'rgba(46,155,192,0.12)' },
  maintenance:  { label: 'Maintenance',    color: '#C65B4E', bg: 'rgba(198,91,78,0.1)' },
  frontdesk:    { label: 'Guest Services', color: '#C29B4E', bg: 'rgba(194,155,78,0.12)' },
};

const ROLE_DEPT: Partial<Record<Role, Dept>> = {
  frontdesk: 'frontdesk', housekeeping: 'housekeeping', maintenance: 'maintenance',
};

// ─── Initial state ────────────────────────────────────────────────────────────

function buildInitialState(): AppState {
  const now = typeof window !== 'undefined' ? Date.now() : 0;
  const rooms: Room[] = [
    { id: '101', floor: 1, status: 'vacant_clean',  vip: false },
    { id: '102', floor: 1, status: 'occupied',       vip: false, guest: 'Smith',    nights: 3 },
    { id: '103', floor: 1, status: 'vacant_dirty',   vip: false },
    { id: '104', floor: 1, status: 'checkout_due',   vip: false, guest: 'Johnson',  nights: 1 },
    { id: '105', floor: 1, status: 'occupied',       vip: false, guest: 'Lee',      nights: 2 },
    { id: '106', floor: 1, status: 'cleaning',       vip: false },
    { id: '107', floor: 1, status: 'vacant_clean',   vip: false },
    { id: '108', floor: 1, status: 'occupied',       vip: true,  guest: 'Williams', nights: 4 },
    { id: '201', floor: 2, status: 'occupied',       vip: false, guest: 'Brown',    nights: 2 },
    { id: '202', floor: 2, status: 'checkout_due',   vip: false, guest: 'Davis',    nights: 1 },
    { id: '203', floor: 2, status: 'vacant_dirty',   vip: false },
    { id: '204', floor: 2, status: 'out_of_order',   vip: false },
    { id: '205', floor: 2, status: 'occupied',       vip: false, guest: 'Miller',   nights: 3 },
    { id: '206', floor: 2, status: 'vacant_clean',   vip: false },
    { id: '207', floor: 2, status: 'cleaning',       vip: false },
    { id: '208', floor: 2, status: 'occupied',       vip: false, guest: 'Wilson',   nights: 2 },
    { id: '301', floor: 3, status: 'occupied',       vip: true,  guest: 'Taylor',   nights: 5 },
    { id: '302', floor: 3, status: 'vacant_clean',   vip: false },
    { id: '303', floor: 3, status: 'checkout_due',   vip: false, guest: 'Anderson', nights: 1 },
    { id: '304', floor: 3, status: 'occupied',       vip: false, guest: 'Thomas',   nights: 2 },
    { id: '305', floor: 3, status: 'vacant_dirty',   vip: false },
    { id: '306', floor: 3, status: 'occupied',       vip: false, guest: 'Jackson',  nights: 3 },
    { id: '307', floor: 3, status: 'vacant_clean',   vip: false },
    { id: '308', floor: 3, status: 'cleaning',       vip: false },
  ];

  const tickets: Ticket[] = [
    { id: 'REQ-1001', room: '205', request_type: 'ac',   title: WORKFLOW.ac.title,   dept: 'maintenance',  priority: 'high', status: 'new',         createdBy: 'Front Desk',              createdAt: now - 900000,  log: [] },
    { id: 'REQ-1002', room: '104', request_type: 'late', title: WORKFLOW.late.title, dept: 'frontdesk',    priority: 'low',  status: 'in_progress', createdBy: 'Guest app · Room 104',     createdAt: now - 1800000, log: ['Accepted by Ana R.'] },
    { id: 'REQ-1003', room: '306', request_type: 'food', title: WORKFLOW.food.title, dept: 'frontdesk',    priority: 'med',  status: 'new',         createdBy: 'Guest app · Room 306',     createdAt: now - 300000,  log: [] },
    { id: 'REQ-1004', room: '103', request_type: 'clean',title: WORKFLOW.clean.title,dept: 'housekeeping', priority: 'med',  status: 'in_progress', createdBy: 'Front Desk',              createdAt: now - 600000,  log: ['Accepted'] },
  ];

  function mkAct(id: string, dept: Dept, message: string, timestamp: number): ActivityEntry {
    return { id, dept, message, timestamp };
  }
  const activity: ActivityEntry[] = [
    mkAct('a1', 'maintenance',  'REQ-1001 opened — AC issue in Room 205',     now - 900000),
    mkAct('a2', 'frontdesk',    'REQ-1002 accepted — Late checkout Room 104',  now - 1800000),
    mkAct('a3', 'frontdesk',    'REQ-1003 opened — Room service Room 306',     now - 300000),
    mkAct('a4', 'housekeeping', 'REQ-1004 accepted — Cleaning Room 103',       now - 600000),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return {
    rooms, tickets, activity,
    unread: { housekeeping: 1, maintenance: 1, frontdesk: 2 },
    flash: {},
    toast: null,
    ticketCounter: 1005,
    activityCounter: 5,
    ambientCount: 0,
    paused: false,
    activeRole: 'frontdesk',
    selectedRoom: null,
    showNotifications: false,
    showLogRequest: false,
    logRequestRoom: '',
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {

    case 'CREATE_TICKET': {
      const { room, request_type, createdBy, isAmbient } = action.payload;
      const wf = WORKFLOW[request_type];
      const ticketId = `REQ-${state.ticketCounter}`;
      const now = Date.now();

      const newTicket: Ticket = {
        id: ticketId, room, request_type,
        title: wf.title, dept: wf.dept, priority: wf.priority,
        status: 'new', createdBy, createdAt: now, log: [],
      };

      const newActivity: ActivityEntry = {
        id: `act-${state.activityCounter}`,
        dept: wf.dept,
        message: `${ticketId} opened — ${wf.title} · Room ${room}`,
        timestamp: now,
        isNew: true,
      };

      let newRooms = state.rooms;
      let newFlash = state.flash;
      if (request_type === 'clean') {
        newRooms = state.rooms.map(r =>
          r.id === room ? { ...r, status: 'vacant_dirty' as RoomStatus } : r
        );
        newFlash = { ...state.flash, [room]: (state.flash[room] || 0) + 1 };
      }

      const dept = wf.dept;
      const deptRole = Object.entries(ROLE_DEPT).find(([, d]) => d === dept)?.[0] as Role | undefined;
      const shouldBadge = state.activeRole !== deptRole;

      const newActivity2 = [newActivity, ...state.activity].slice(0, 30);

      return {
        ...state,
        rooms: newRooms,
        flash: newFlash,
        tickets: [newTicket, ...state.tickets],
        activity: newActivity2,
        ticketCounter: state.ticketCounter + 1,
        activityCounter: state.activityCounter + 1,
        unread: shouldBadge
          ? { ...state.unread, [dept]: state.unread[dept] + 1 }
          : state.unread,
        toast: { message: `${ticketId} dispatched → ${DEPT_CONFIG[dept].label}`, id: `t-${now}` },
        ambientCount: isAmbient ? state.ambientCount + 1 : state.ambientCount,
      };
    }

    case 'ADVANCE_TICKET': {
      const { ticketId } = action.payload;
      const ticket = state.tickets.find(t => t.id === ticketId);
      if (!ticket) return state;

      const now = Date.now();
      let newStatus: TicketStatus = ticket.status === 'new' ? 'in_progress' : 'done';
      const logMsg = newStatus === 'in_progress' ? 'Accepted by Ana R.' : 'Completed by Ana R.';

      let newRooms = state.rooms;
      let newFlash = state.flash;
      let extraActivity: ActivityEntry | null = null;
      let extraUnread = { ...state.unread };

      if (newStatus === 'done') {
        if (ticket.request_type === 'clean') {
          newRooms = state.rooms.map(r =>
            r.id === ticket.room ? { ...r, status: 'vacant_clean' as RoomStatus } : r
          );
          newFlash = { ...state.flash, [ticket.room]: (state.flash[ticket.room] || 0) + 1 };
          extraActivity = {
            id: `act-${state.activityCounter}`,
            dept: 'frontdesk',
            message: `Room ${ticket.room} is ready to sell`,
            timestamp: now, isNew: true,
          };
          const isNotFD = state.activeRole !== 'frontdesk';
          if (isNotFD) extraUnread.frontdesk = (extraUnread.frontdesk || 0) + 1;
        } else if (ticket.dept === 'maintenance') {
          const room = state.rooms.find(r => r.id === ticket.room);
          if (room?.status === 'out_of_order') {
            newRooms = state.rooms.map(r =>
              r.id === ticket.room ? { ...r, status: 'vacant_dirty' as RoomStatus } : r
            );
            newFlash = { ...state.flash, [ticket.room]: (state.flash[ticket.room] || 0) + 1 };
          }
        }
      }

      const actEntry: ActivityEntry = {
        id: `act-${state.activityCounter + (extraActivity ? 1 : 0)}`,
        dept: ticket.dept,
        message: `${ticketId} ${newStatus === 'in_progress' ? 'accepted' : 'resolved'} — ${ticket.title} · Room ${ticket.room}`,
        timestamp: now, isNew: true,
      };

      const newActivityArr = [
        actEntry,
        ...(extraActivity ? [extraActivity] : []),
        ...state.activity,
      ].slice(0, 30);

      return {
        ...state,
        rooms: newRooms,
        flash: newFlash,
        tickets: state.tickets.map(t =>
          t.id === ticketId ? { ...t, status: newStatus, log: [...t.log, logMsg] } : t
        ),
        activity: newActivityArr,
        activityCounter: state.activityCounter + 1 + (extraActivity ? 1 : 0),
        unread: extraUnread,
        toast: {
          message: newStatus === 'in_progress'
            ? `${ticketId} accepted`
            : `${ticketId} completed`,
          id: `t-${now}`,
        },
      };
    }

    case 'CLEAN_ROOM': {
      const { roomId } = action.payload;
      const room = state.rooms.find(r => r.id === roomId);
      if (!room) return state;

      const now = Date.now();
      let newStatus: RoomStatus;
      let msg: string;
      let extraUnread = { ...state.unread };
      let extraActivity: ActivityEntry | null = null;

      if (room.status === 'vacant_dirty') {
        newStatus = 'cleaning';
        msg = `Cleaning started · Room ${roomId}`;
      } else if (room.status === 'cleaning') {
        newStatus = 'vacant_clean';
        msg = `Room ${roomId} marked ready`;
        extraActivity = {
          id: `act-${state.activityCounter}`,
          dept: 'frontdesk',
          message: `Room ${roomId} is ready to sell`,
          timestamp: now, isNew: true,
        };
        if (state.activeRole !== 'frontdesk') extraUnread.frontdesk += 1;
      } else {
        return state;
      }

      const actEntry: ActivityEntry = {
        id: `act-${state.activityCounter + 1}`,
        dept: 'housekeeping',
        message: msg,
        timestamp: now, isNew: true,
      };

      const newActivityArr = [
        actEntry,
        ...(extraActivity ? [extraActivity] : []),
        ...state.activity,
      ].slice(0, 30);

      return {
        ...state,
        rooms: state.rooms.map(r => r.id === roomId ? { ...r, status: newStatus } : r),
        flash: { ...state.flash, [roomId]: (state.flash[roomId] || 0) + 1 },
        activity: newActivityArr,
        activityCounter: state.activityCounter + 2,
        unread: extraUnread,
        toast: { message: msg, id: `t-${now}` },
      };
    }

    case 'CHECKOUT': {
      const { roomId } = action.payload;
      const room = state.rooms.find(r => r.id === roomId);
      if (!room) return state;
      const now = Date.now();

      const actEntry: ActivityEntry = {
        id: `act-${state.activityCounter}`,
        dept: 'housekeeping',
        message: `Room ${roomId} checked out — added to cleaning queue`,
        timestamp: now, isNew: true,
      };

      const shouldBadge = state.activeRole !== 'housekeeping';

      return {
        ...state,
        rooms: state.rooms.map(r =>
          r.id === roomId
            ? { ...r, status: 'vacant_dirty' as RoomStatus, guest: undefined, nights: undefined }
            : r
        ),
        flash: { ...state.flash, [roomId]: (state.flash[roomId] || 0) + 1 },
        activity: [actEntry, ...state.activity].slice(0, 30),
        activityCounter: state.activityCounter + 1,
        unread: shouldBadge
          ? { ...state.unread, housekeeping: state.unread.housekeeping + 1 }
          : state.unread,
        toast: { message: `Room ${roomId} checked out`, id: `t-${now}` },
        selectedRoom: null,
      };
    }

    case 'SET_ROLE': {
      const dept = ROLE_DEPT[action.payload];
      return {
        ...state,
        activeRole: action.payload,
        unread: dept ? { ...state.unread, [dept]: 0 } : state.unread,
        selectedRoom: null,
        showNotifications: false,
        showLogRequest: false,
      };
    }

    case 'SET_ROOM':
      return { ...state, selectedRoom: action.payload, showNotifications: false };

    case 'TOGGLE_NOTIFICATIONS':
      return {
        ...state,
        showNotifications: !state.showNotifications,
        showLogRequest: false,
        selectedRoom: null,
      };

    case 'TOGGLE_LOG_REQUEST':
      return {
        ...state,
        showLogRequest: !state.showLogRequest,
        logRequestRoom: action.payload ?? '',
        showNotifications: false,
      };

    case 'DISMISS_TOAST':
      return { ...state, toast: null };

    case 'TOGGLE_PAUSED':
      return { ...state, paused: !state.paused };

    case 'CLEAR_NEW_ACTIVITY':
      return {
        ...state,
        activity: state.activity.map(a => ({ ...a, isNew: false })),
      };

    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  if (ts === 0) return 'earlier';
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const REQ_ICONS: Record<RequestType, React.ReactNode> = {
  towels: <Droplets size={16} />,
  clean:  <Sparkles  size={16} />,
  ac:     <Wind      size={16} />,
  plumb:  <Waves     size={16} />,
  tv:     <Tv        size={16} />,
  food:   <Coffee    size={16} />,
  late:   <Clock     size={16} />,
  taxi:   <Car       size={16} />,
};

const REQ_LABELS: Record<RequestType, string> = {
  towels: 'Towels', clean: 'Cleaning', ac: 'AC / Heat',
  plumb: 'Plumbing', tv: 'TV / AV', food: 'Room Service',
  late: 'Late Checkout', taxi: 'Taxi',
};

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  frontdesk:    <ConciergeBell size={18} />,
  housekeeping: <Sparkles      size={18} />,
  maintenance:  <Wrench        size={18} />,
  manager:      <LayoutDashboard size={18} />,
};

const ROLE_LABELS: Record<Role, string> = {
  frontdesk: 'Front Desk', housekeeping: 'Housekeeping',
  maintenance: 'Maintenance', manager: 'Manager',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityPill({ p }: { p: Priority }) {
  return (
    <span className={`priority-pill p-${p}`}>
      {p === 'high' ? 'High' : p === 'med' ? 'Med' : 'Low'}
    </span>
  );
}

function StatusPill({ status }: { status: RoomStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="status-pill" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function DeptIcon({ dept, size = 14 }: { dept: Dept; size?: number }) {
  const cfg = DEPT_CONFIG[dept];
  return (
    <div className="activity-icon-wrap" style={{ background: cfg.bg }}>
      {dept === 'housekeeping' && <Sparkles size={size} color={cfg.color} />}
      {dept === 'maintenance'  && <Wrench   size={size} color={cfg.color} />}
      {dept === 'frontdesk'    && <ConciergeBell size={size} color={cfg.color} />}
    </div>
  );
}

interface TP { state: AppState; dispatch: React.Dispatch<Action>; }

// ─── LeftRail ─────────────────────────────────────────────────────────────────

function LeftRail({ state, dispatch }: TP) {
  const roles: Role[] = ['frontdesk', 'housekeeping', 'maintenance', 'manager'];

  function getBadge(role: Role): number {
    const dept = ROLE_DEPT[role];
    return dept ? state.unread[dept] : 0;
  }

  return (
    <nav className="left-rail" aria-label="Roles">
      <div className="rail-brand" aria-label="Aurelia">A</div>
      <div className="rail-nav">
        {roles.map(role => {
          const badge = getBadge(role);
          return (
            <button
              key={role}
              className={`rail-btn${state.activeRole === role ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ROLE', payload: role })}
              aria-label={ROLE_LABELS[role]}
              aria-pressed={state.activeRole === role}
            >
              {ROLE_ICONS[role]}
              <span>{ROLE_LABELS[role].split(' ')[0]}</span>
              {badge > 0 && <span className="rail-badge">{badge}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({ state, dispatch, clock }: TP & { clock: string }) {
  const dept = ROLE_DEPT[state.activeRole];
  const totalUnread = dept ? state.unread[dept] : 0;

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="top-bar-title">
          Aurelia Grand · {ROLE_LABELS[state.activeRole]}
        </div>
        <div className="top-bar-subtitle">24 rooms · 3 floors · evening shift</div>
      </div>
      <div className="top-bar-right">
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'TOGGLE_PAUSED' })}
          aria-label={state.paused ? 'Resume ambient feed' : 'Pause ambient feed'}
          title={state.paused ? 'Resume ambient feed' : 'Pause ambient feed'}
        >
          {state.paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <span className="clock" aria-live="polite">{clock}</span>
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'TOGGLE_NOTIFICATIONS' })}
          aria-label="Notifications"
        >
          <Bell size={15} />
          {totalUnread > 0 && <span className="icon-btn-badge">{totalUnread}</span>}
        </button>
        <div className="user-pill">
          <div className="user-dot" aria-hidden />
          Ana R.
        </div>
      </div>
    </header>
  );
}

// ─── RoomTile ─────────────────────────────────────────────────────────────────

function RoomTile({ room, flashKey, onClick }: { room: Room; flashKey: number; onClick: () => void }) {
  const cfg = STATUS_CONFIG[room.status];
  const prevFlash = useRef(flashKey);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (flashKey !== prevFlash.current) {
      prevFlash.current = flashKey;
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 1200);
      return () => clearTimeout(t);
    }
  }, [flashKey]);

  return (
    <div
      className={`room-tile${animating ? ' flashing' : ''}`}
      style={{ borderLeftColor: cfg.color }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Room ${room.id}, ${cfg.label}${room.guest ? `, ${room.guest}` : ''}`}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {room.vip && (
        <div className="vip-badge" aria-label="VIP"><Star size={12} fill="#C29B4E" /></div>
      )}
      <div>
        <div className="room-number">{room.id}</div>
        <div className="room-guest">
          {room.guest ? `${room.guest} · ${room.nights}n` : ' '}
        </div>
      </div>
      <StatusPill status={room.status} />
    </div>
  );
}

// ─── TicketCard ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, dispatch, actionLabel }: {
  ticket: Ticket;
  dispatch: React.Dispatch<Action>;
  actionLabel?: string;
}) {
  const open = ticket.status !== 'done';
  const label = ticket.status === 'new'
    ? 'Accept'
    : actionLabel ?? 'Complete';

  return (
    <div className="ticket-card">
      <span className="ticket-id">{ticket.id}</span>
      <div className="ticket-info">
        <div className="ticket-title">{ticket.title}</div>
        <div className="ticket-meta">Room {ticket.room} · <PriorityPill p={ticket.priority} /></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
        {open && (
          <button
            className="btn-action"
            onClick={() => dispatch({ type: 'ADVANCE_TICKET', payload: { ticketId: ticket.id } })}
          >
            <Check size={12} />{label}
          </button>
        )}
        {!open && <span style={{ fontSize: 11, color: 'var(--s-vacant_clean)', fontWeight: 600 }}>Done</span>}
      </div>
    </div>
  );
}

// ─── RoomDrawer ───────────────────────────────────────────────────────────────

function RoomDrawer({ state, dispatch }: TP) {
  const room = state.rooms.find(r => r.id === state.selectedRoom);
  if (!room) return null;

  const cfg = STATUS_CONFIG[room.status];
  const roomTickets = state.tickets.filter(t => t.room === room.id && t.status !== 'done');
  const canCheckout = room.status === 'occupied' || room.status === 'checkout_due';

  return (
    <>
      <div className="drawer-overlay" onClick={() => dispatch({ type: 'SET_ROOM', payload: null })} />
      <aside className="drawer" aria-label={`Room ${room.id} details`}>
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 22, color: 'var(--text)' }}>
                {room.id}
              </span>
              <StatusPill status={room.status} />
              {room.vip && <Star size={14} fill="#C29B4E" color="#C29B4E" />}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Floor {room.floor}</div>
          </div>
          <button className="icon-btn" onClick={() => dispatch({ type: 'SET_ROOM', payload: null })} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          {/* Mini cards */}
          <div className="mini-cards">
            <div className="mini-card">
              <div className="mini-card-label">Status</div>
              <div className="mini-card-value" style={{ color: cfg.color }}>{cfg.label}</div>
            </div>
            <div className="mini-card">
              <div className="mini-card-label">Floor</div>
              <div className="mini-card-value">{room.floor}</div>
            </div>
            {room.guest && (
              <div className="mini-card">
                <div className="mini-card-label">Guest</div>
                <div className="mini-card-value">{room.guest}</div>
              </div>
            )}
            {room.nights && (
              <div className="mini-card">
                <div className="mini-card-label">Nights</div>
                <div className="mini-card-value">{room.nights}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {canCheckout && (
              <button
                className="btn-secondary"
                style={{ justifyContent: 'center', padding: '10px 16px' }}
                onClick={() => dispatch({ type: 'CHECKOUT', payload: { roomId: room.id } })}
              >
                <LogOut size={14} />
                Check out → cleaning queue
              </button>
            )}
            <button
              className="btn-secondary"
              style={{ justifyContent: 'center', padding: '10px 16px' }}
              onClick={() => {
                dispatch({ type: 'SET_ROOM', payload: null });
                dispatch({ type: 'TOGGLE_LOG_REQUEST', payload: room.id });
              }}
            >
              <Plus size={14} />
              Log a request for this room
            </button>
          </div>

          {/* Request history */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Open requests
          </div>
          {roomTickets.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-desc">No open requests</div>
            </div>
          ) : (
            <div className="ticket-list">
              {roomTickets.map(t => (
                <TicketCard key={t.id} ticket={t} dispatch={dispatch} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── LogRequestModal ──────────────────────────────────────────────────────────

function LogRequestModal({ state, dispatch }: TP) {
  const [selectedRoom, setSelectedRoom] = useState(state.logRequestRoom || '');
  const [selectedType, setSelectedType] = useState<RequestType | ''>('');

  const wf = selectedType ? WORKFLOW[selectedType] : null;

  function handleDispatch() {
    if (!selectedRoom || !selectedType) return;
    dispatch({
      type: 'CREATE_TICKET',
      payload: { room: selectedRoom, request_type: selectedType, createdBy: 'Ana R.' },
    });
    dispatch({ type: 'TOGGLE_LOG_REQUEST' });
  }

  const reqTypes: RequestType[] = ['towels', 'clean', 'ac', 'plumb', 'tv', 'food', 'late', 'taxi'];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && dispatch({ type: 'TOGGLE_LOG_REQUEST' })}>
      <div className="modal" role="dialog" aria-label="Log request">
        <div className="modal-header">
          <div className="modal-title">Log request</div>
          <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_LOG_REQUEST' })} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <label className="form-label">Room</label>
          <select
            className="form-select"
            value={selectedRoom}
            onChange={e => setSelectedRoom(e.target.value)}
            style={{ marginBottom: 20 }}
          >
            <option value="">Select a room…</option>
            {state.rooms.map(r => (
              <option key={r.id} value={r.id}>
                Room {r.id} — {STATUS_CONFIG[r.status].label}{r.guest ? ` · ${r.guest}` : ''}
              </option>
            ))}
          </select>

          <label className="form-label" style={{ marginBottom: 10 }}>Request type</label>
          <div className="request-grid">
            {reqTypes.map(rt => {
              const w = WORKFLOW[rt];
              const deptCfg = DEPT_CONFIG[w.dept];
              return (
                <button
                  key={rt}
                  className={`req-btn${selectedType === rt ? ' selected' : ''}`}
                  onClick={() => setSelectedType(rt)}
                  aria-pressed={selectedType === rt}
                >
                  <span style={{ color: deptCfg.color }}>{REQ_ICONS[rt]}</span>
                  <span className="req-label">{REQ_LABELS[rt]}</span>
                </button>
              );
            })}
          </div>

          {wf && (
            <div className="routing-preview">
              <ArrowRight size={13} />
              <span>
                Sends to <strong>{DEPT_CONFIG[wf.dept].label}</strong> · priority{' '}
                <strong>{wf.priority}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => dispatch({ type: 'TOGGLE_LOG_REQUEST' })}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!selectedRoom || !selectedType}
            onClick={handleDispatch}
            style={{ opacity: !selectedRoom || !selectedType ? 0.5 : 1 }}
          >
            Dispatch request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NotificationsDrawer ──────────────────────────────────────────────────────

function NotificationsDrawer({ state, dispatch }: TP) {
  return (
    <>
      <div className="drawer-overlay" onClick={() => dispatch({ type: 'TOGGLE_NOTIFICATIONS' })} />
      <aside className="drawer" aria-label="Notifications">
        <div className="drawer-header">
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 }}>
            Activity
          </div>
          <button className="icon-btn" onClick={() => dispatch({ type: 'TOGGLE_NOTIFICATIONS' })} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          {state.activity.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No activity yet</div>
              <div className="empty-desc">Activity will appear here as requests are logged.</div>
            </div>
          ) : (
            <div className="activity-list">
              {state.activity.map(a => (
                <div key={a.id} className={`activity-item${a.isNew ? ' new-item' : ''}`}>
                  <DeptIcon dept={a.dept} size={14} />
                  <div className="activity-content">
                    <div className="activity-message">{a.message}</div>
                    <div className="activity-time">{relTime(a.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function ToastBar({ message }: { message: string }) {
  return <div className="toast" role="status" aria-live="polite">{message}</div>;
}

// ─── FloorBoard ───────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'dirty' | 'ready' | 'occupied';

function FloorBoard({ state, dispatch, filter }: TP & { filter: StatusFilter }) {
  const floors = [1, 2, 3];

  function matchesFilter(room: Room): boolean {
    if (filter === 'all') return true;
    if (filter === 'dirty') return room.status === 'vacant_dirty' || room.status === 'cleaning';
    if (filter === 'ready') return room.status === 'vacant_clean';
    if (filter === 'occupied') return room.status === 'occupied' || room.status === 'checkout_due';
    return true;
  }

  return (
    <div>
      {floors.map(floor => {
        const floorRooms = state.rooms.filter(r => r.floor === floor && matchesFilter(r));
        if (floorRooms.length === 0) return null;
        return (
          <div key={floor} className="floor-section">
            <div className="floor-label">
              Floor {floor}
              <span className="floor-count">{floorRooms.length}</span>
            </div>
            <div className="room-grid">
              {floorRooms.map(room => (
                <RoomTile
                  key={room.id}
                  room={room}
                  flashKey={state.flash[room.id] || 0}
                  onClick={() => dispatch({ type: 'SET_ROOM', payload: room.id })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FrontDeskView ────────────────────────────────────────────────────────────

function FrontDeskView({ state, dispatch }: TP) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const readyCount = state.rooms.filter(r => r.status === 'vacant_clean').length;
  const dueOutCount = state.rooms.filter(r => r.status === 'checkout_due').length;
  const openFD = state.tickets.filter(t => t.dept === 'frontdesk' && t.status !== 'done');
  const ooCount = state.rooms.filter(r => r.status === 'out_of_order').length;

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'dirty', label: 'Dirty' },
    { key: 'ready', label: 'Ready' },
    { key: 'occupied', label: 'Occupied' },
  ];

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Front Desk</h1>
        <button className="btn-primary" onClick={() => dispatch({ type: 'TOGGLE_LOG_REQUEST' })}>
          <Plus size={15} />Log request
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-vacant_clean)' }}>{readyCount}</div>
          <div className="stat-label">Ready to sell</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-checkout_due)' }}>{dueOutCount}</div>
          <div className="stat-label">Due out today</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{openFD.length}</div>
          <div className="stat-label">Open guest requests</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-out_of_order)' }}>{ooCount}</div>
          <div className="stat-label">Out of order</div>
        </div>
      </div>

      {/* Filter + floor board */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-title">Room board</div>
          <div className="segmented">
            {filters.map(f => (
              <button
                key={f.key}
                className={`seg-btn${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <FloorBoard state={state} dispatch={dispatch} filter={filter} />
      </div>

      {/* Guest services queue */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-title">Guest services queue</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{openFD.length} open</span>
        </div>
        {openFD.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">Queue is clear</div>
            <div className="empty-desc">All guest requests have been handled.</div>
          </div>
        ) : (
          <div className="ticket-list">
            {openFD.map(t => <TicketCard key={t.id} ticket={t} dispatch={dispatch} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HousekeepingView ─────────────────────────────────────────────────────────

function HousekeepingView({ state, dispatch }: TP) {
  const toTurn = state.rooms.filter(r => r.status === 'vacant_dirty' || r.status === 'cleaning');
  const openHK = state.tickets.filter(t => t.dept === 'housekeeping' && t.status !== 'done');
  const doneToday = state.tickets.filter(t => t.dept === 'housekeeping' && t.status === 'done').length;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Housekeeping</h1>
        <button className="btn-primary" onClick={() => dispatch({ type: 'TOGGLE_LOG_REQUEST' })}>
          <Plus size={15} />Log request
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-value">{openHK.length}</div>
          <div className="stat-label">Open work orders</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-vacant_dirty)' }}>{toTurn.length}</div>
          <div className="stat-label">Rooms to turn</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-vacant_clean)' }}>{doneToday}</div>
          <div className="stat-label">Completed today</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">7</div>
          <div className="stat-label">Staff on shift</div>
        </div>
      </div>

      {/* Rooms to turn */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-title">Rooms to turn</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{toTurn.length} rooms</span>
        </div>
        {toTurn.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">All rooms are clean</div>
            <div className="empty-desc">No rooms in the cleaning queue.</div>
          </div>
        ) : (
          <div className="turn-grid">
            {toTurn.map(room => {
              const cfg = STATUS_CONFIG[room.status];
              const isDirty = room.status === 'vacant_dirty';
              return (
                <div key={room.id} className="turn-card" style={{ borderLeftColor: cfg.color }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16 }}>
                      {room.id}
                    </span>
                    <StatusPill status={room.status} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Floor {room.floor}</div>
                  <button
                    className="btn-action"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => dispatch({ type: 'CLEAN_ROOM', payload: { roomId: room.id } })}
                  >
                    {isDirty ? <><ArrowRight size={12} />Start</> : <><Check size={12} />Mark ready</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* HK ticket list */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-title">Housekeeping requests</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{openHK.length} open</span>
        </div>
        {openHK.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">All requests resolved</div>
            <div className="empty-desc">Check back when new requests come in.</div>
          </div>
        ) : (
          <div className="ticket-list">
            {openHK.map(t => <TicketCard key={t.id} ticket={t} dispatch={dispatch} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MaintenanceView ──────────────────────────────────────────────────────────

function MaintenanceView({ state, dispatch }: TP) {
  const openMX = state.tickets.filter(t => t.dept === 'maintenance' && t.status !== 'done');
  const ooRooms = state.rooms.filter(r => r.status === 'out_of_order');
  const doneToday = state.tickets.filter(t => t.dept === 'maintenance' && t.status === 'done').length;

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Maintenance</h1>
        <button className="btn-primary" onClick={() => dispatch({ type: 'TOGGLE_LOG_REQUEST' })}>
          <Plus size={15} />Log request
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-value">{openMX.length}</div>
          <div className="stat-label">Open work orders</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-out_of_order)' }}>{ooRooms.length}</div>
          <div className="stat-label">Out of order</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-vacant_clean)' }}>{doneToday}</div>
          <div className="stat-label">Resolved today</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">7</div>
          <div className="stat-label">Staff on shift</div>
        </div>
      </div>

      {/* OOO rooms */}
      {ooRooms.length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <div className="section-title">Out of order rooms</div>
          </div>
          <div className="turn-grid">
            {ooRooms.map(room => (
              <div key={room.id} className="turn-card" style={{ borderLeftColor: '#C65B4E' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 16 }}>{room.id}</span>
                  <StatusPill status={room.status} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Floor {room.floor}</div>
                <div style={{ fontSize: 11, color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} />Resolve ticket to restore
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance ticket list */}
      <div className="section-card">
        <div className="section-card-header">
          <div className="section-title">Maintenance requests</div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{openMX.length} open</span>
        </div>
        {openMX.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">All clear</div>
            <div className="empty-desc">No open maintenance requests.</div>
          </div>
        ) : (
          <div className="ticket-list">
            {openMX.map(t => <TicketCard key={t.id} ticket={t} dispatch={dispatch} actionLabel="Resolve" />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ManagerView ──────────────────────────────────────────────────────────────

function ManagerView({ state }: TP) {
  const total = state.rooms.length;
  const occupied = state.rooms.filter(r => r.status === 'occupied' || r.status === 'checkout_due').length;
  const occupancyPct = Math.round((occupied / total) * 100);
  const openAll = state.tickets.filter(t => t.status !== 'done').length;
  const ready = state.rooms.filter(r => r.status === 'vacant_clean').length;

  const statusCounts = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    key: key as RoomStatus,
    label: cfg.label,
    color: cfg.color,
    count: state.rooms.filter(r => r.status === key).length,
  }));

  const deptCounts = Object.entries(DEPT_CONFIG).map(([key, cfg]) => ({
    key: key as Dept,
    label: cfg.label,
    color: cfg.color,
    count: state.tickets.filter(t => t.dept === key && t.status !== 'done').length,
  }));

  const maxDept = Math.max(...deptCounts.map(d => d.count), 1);

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Command overview</h1>
        <div className="live-pill"><div className="live-dot" />All systems live</div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <div className="stat-value">{occupancyPct}%</div>
          <div className="stat-label">Occupancy</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{openAll}</div>
          <div className="stat-label">Open requests</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--s-vacant_clean)' }}>{ready}</div>
          <div className="stat-label">Ready to sell</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">7</div>
          <div className="stat-label">Staff on shift</div>
        </div>
      </div>

      <div className="two-col">
        {/* Left: charts */}
        <div>
          <div className="section-card" style={{ marginBottom: 16 }}>
            <div className="section-card-header" style={{ marginBottom: 14 }}>
              <div className="section-title">Rooms by status</div>
            </div>
            {statusCounts.map(s => (
              <div key={s.key} className="chart-row">
                <span className="chart-lbl">{s.label}</span>
                <div className="chart-track">
                  <div
                    className="chart-fill"
                    style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
                  />
                </div>
                <span className="chart-val">{s.count}</span>
              </div>
            ))}
          </div>

          <div className="section-card">
            <div className="section-card-header" style={{ marginBottom: 14 }}>
              <div className="section-title">Open requests by department</div>
            </div>
            {deptCounts.map(d => (
              <div key={d.key} className="chart-row">
                <span className="chart-lbl">{d.label}</span>
                <div className="chart-track">
                  <div
                    className="chart-fill"
                    style={{ width: `${(d.count / maxDept) * 100}%`, background: d.color }}
                  />
                </div>
                <span className="chart-val">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: live activity */}
        <div className="section-card" style={{ maxHeight: 480, display: 'flex', flexDirection: 'column' }}>
          <div className="section-card-header" style={{ marginBottom: 4, flexShrink: 0 }}>
            <div className="section-title">Live activity</div>
            <div className="live-pill" style={{ fontSize: 10, padding: '2px 8px' }}>
              <div className="live-dot" />Live
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {state.activity.length === 0 ? (
              <div className="empty-state">
                <div className="empty-desc">No activity yet.</div>
              </div>
            ) : (
              <div className="activity-list">
                {state.activity.map(a => (
                  <div key={a.id} className={`activity-item${a.isNew ? ' new-item' : ''}`}>
                    <DeptIcon dept={a.dept} size={13} />
                    <div className="activity-content">
                      <div className="activity-message">{a.message}</div>
                      <div className="activity-time">{relTime(a.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HotelOpsApp (shell) ──────────────────────────────────────────────────────

function HotelOpsInner() {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const [clock, setClock] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  // Live clock
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    setClock(fmt());
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  // Ambient feed
  useEffect(() => {
    if (stateRef.current.paused) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      if (s.paused || s.ambientCount >= 6) return;
      const occupied = s.rooms.filter(r => r.status === 'occupied');
      if (occupied.length === 0) return;
      const room = occupied[Math.floor(Math.random() * occupied.length)];
      const types: RequestType[] = ['towels', 'ac', 'food', 'tv', 'taxi'];
      const rt = types[Math.floor(Math.random() * types.length)];
      dispatch({
        type: 'CREATE_TICKET',
        payload: { room: room.id, request_type: rt, createdBy: `Guest app · Room ${room.id}`, isAmbient: true },
      });
    }, 15000);
    return () => clearInterval(id);
  }, [state.paused]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!state.toast) return;
    const id = setTimeout(() => dispatch({ type: 'DISMISS_TOAST' }), 3000);
    return () => clearTimeout(id);
  }, [state.toast?.id]);

  return (
    <div className="app-shell">
      <LeftRail state={state} dispatch={dispatch} />
      <TopBar state={state} dispatch={dispatch} clock={clock} />
      <main className="main-stage">
        {state.activeRole === 'frontdesk'    && <FrontDeskView   state={state} dispatch={dispatch} />}
        {state.activeRole === 'housekeeping' && <HousekeepingView state={state} dispatch={dispatch} />}
        {state.activeRole === 'maintenance'  && <MaintenanceView  state={state} dispatch={dispatch} />}
        {state.activeRole === 'manager'      && <ManagerView      state={state} dispatch={dispatch} />}
      </main>

      {state.selectedRoom  && <RoomDrawer            state={state} dispatch={dispatch} />}
      {state.showLogRequest && <LogRequestModal       state={state} dispatch={dispatch} />}
      {state.showNotifications && <NotificationsDrawer state={state} dispatch={dispatch} />}
      {state.toast && <ToastBar message={state.toast.message} />}
    </div>
  );
}

export default function HotelOpsApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div style={{ height: '100vh', background: '#E9ECF1' }} />;
  return <HotelOpsInner />;
}
