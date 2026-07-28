import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Phone, Mail, CheckCircle2, AlertTriangle, TriangleAlert, Clock3,
  Trash2, Pencil, X, Users, Wallet, BellRing, Repeat, Briefcase,
  PauseCircle, PlayCircle, ListChecks,
} from 'lucide-react';

const STORAGE_KEY = 'agency-collections-v1';

// Simple localStorage-backed persistence (this app runs standalone,
// outside the Claude.ai artifacts sandbox, so it uses the browser's
// own storage instead of the Claude-only window.storage API).
const storage = {
  async get(key) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? { key, value: v } : null;
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
};

const palette = {
  bg: '#0F1419',
  surface: '#161B22',
  surfaceHover: '#1B222B',
  border: '#252C36',
  borderLight: '#333C48',
  textPrimary: '#E8EAED',
  textSecondary: '#8B94A3',
  textMuted: '#5B6472',
  gold: '#C9A227',
  goldSoft: 'rgba(201,162,39,0.14)',
  overdue: '#E5484D',
  overdueSoft: 'rgba(229,72,77,0.14)',
  dueSoon: '#E0A130',
  dueSoonSoft: 'rgba(224,161,48,0.14)',
  paid: '#45B26B',
  paidSoft: 'rgba(69,178,107,0.14)',
  upcoming: '#5B8DEF',
  upcomingSoft: 'rgba(91,141,239,0.14)',
  neutralSoft: 'rgba(139,148,163,0.14)',
};

const sansFont = "'IBM Plex Sans', system-ui, sans-serif";
const monoFont = "'IBM Plex Mono', 'SFMono-Regular', monospace";
const inputStyle = { background: palette.bg, border: `1px solid ${palette.border}`, color: palette.textPrimary };

function daysBetween(a, b) {
  const msPerDay = 86400000;
  const u1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const u2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((u2 - u1) / msPerDay);
}
function formatCurrency(n) {
  return '\u20B9' + Math.round(n || 0).toLocaleString('en-IN');
}
function formatDate(str) {
  if (!str) return '\u2014';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatPeriod(period) {
  if (!period) return '';
  return new Date(period + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function currentPeriodStr() { return todayStr().slice(0, 7); }
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function getChargeDerived(charge, today) {
  const due = (charge.totalAmount || 0) - (charge.amountPaid || 0);
  const isPaid = due <= 0.5;
  const dueDate = new Date(charge.dueDate + 'T00:00:00');
  const daysOverdue = daysBetween(dueDate, today);
  let status;
  if (isPaid) status = 'paid';
  else if (daysOverdue > 0) status = 'overdue';
  else if (daysOverdue >= -7) status = 'duesoon';
  else status = 'upcoming';
  const isPartial = (charge.amountPaid || 0) > 0 && !isPaid;
  let needsFollowUp = false;
  if (!isPaid && daysOverdue > 0) {
    if (!charge.lastFollowUp) needsFollowUp = true;
    else {
      const lf = new Date(charge.lastFollowUp + 'T00:00:00');
      if (daysBetween(lf, today) >= 3) needsFollowUp = true;
    }
  }
  return { due, isPaid, isPartial, daysOverdue, status, needsFollowUp };
}

const STATUS_META = {
  paid: { label: 'Paid', color: palette.paid, soft: palette.paidSoft, Icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: palette.overdue, soft: palette.overdueSoft, Icon: AlertTriangle },
  duesoon: { label: 'Due soon', color: palette.dueSoon, soft: palette.dueSoonSoft, Icon: Clock3 },
  upcoming: { label: 'Upcoming', color: palette.upcoming, soft: palette.upcomingSoft, Icon: Clock3 },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  const { Icon } = meta;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: meta.soft, color: meta.color }}>
      <Icon size={12} strokeWidth={2.5} /> {meta.label}
    </span>
  );
}
function KindBadge({ kind }) {
  const isRecurring = kind === 'recurring';
  const Icon = isRecurring ? Repeat : Briefcase;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0" style={{ background: isRecurring ? palette.upcomingSoft : palette.neutralSoft, color: isRecurring ? palette.upcoming : palette.textSecondary }}>
      <Icon size={10} /> {isRecurring ? 'Recurring' : 'Project'}
    </span>
  );
}
function EngagementStatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: active ? palette.paidSoft : palette.neutralSoft, color: active ? palette.paid : palette.textMuted }}>
      {active ? 'Active' : 'Paused'}
    </span>
  );
}
function DueCaption({ r }) {
  if (r.isPaid) return null;
  if (r.daysOverdue > 0) return <span style={{ color: palette.overdue }} className="text-xs font-medium">{r.daysOverdue}d overdue</span>;
  if (r.daysOverdue === 0) return <span style={{ color: palette.dueSoon }} className="text-xs font-medium">Due today</span>;
  return <span style={{ color: palette.textMuted }} className="text-xs">Due in {-r.daysOverdue}d</span>;
}

export default function AgencyCollections() {
  const [data, setData] = useState({ clients: [], engagements: [], charges: [] });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState('followups');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [sortBy, setSortBy] = useState('dueDate');

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        setData(res ? JSON.parse(res.value) : { clients: [], engagements: [], charges: [] });
      } catch (e) {
        setData({ clients: [], engagements: [], charges: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next) {
    setData(next);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }

  function openClientAdd() { setModal({ type: 'client', mode: 'add' }); setForm({ name: '', contact: '', notes: '' }); }
  function openClientEdit(c) { setModal({ type: 'client', mode: 'edit', id: c.id }); setForm({ name: c.name, contact: c.contact, notes: c.notes || '' }); }
  function openEngagementAdd(clientId, kind) {
    setModal({ type: 'engagement', mode: 'add', clientId, kind });
    setForm({ label: '', monthlyAmount: '', startDate: todayStr(), notes: '' });
  }
  function openEngagementEdit(e) {
    setModal({ type: 'engagement', mode: 'edit', id: e.id, kind: e.kind });
    setForm({ label: e.label, monthlyAmount: e.monthlyAmount != null ? String(e.monthlyAmount) : '', startDate: e.startDate || todayStr(), notes: e.notes || '' });
  }
  function openChargeAdd(engagement, prefill) {
    prefill = prefill || {};
    const isRec = engagement.kind === 'recurring';
    setModal({ type: 'charge', mode: 'add', engagementId: engagement.id, kind: engagement.kind });
    setForm({
      period: prefill.period || (isRec ? currentPeriodStr() : ''),
      label: '',
      totalAmount: prefill.totalAmount != null ? String(prefill.totalAmount) : (isRec && engagement.monthlyAmount ? String(engagement.monthlyAmount) : ''),
      amountPaid: '0',
      invoiceDate: todayStr(),
      dueDate: prefill.dueDate || (isRec ? currentPeriodStr() + '-05' : todayStr()),
      notes: '',
    });
  }
  function openChargeEdit(charge, kind) {
    setModal({ type: 'charge', mode: 'edit', id: charge.id, engagementId: charge.engagementId, kind });
    setForm({
      period: charge.period || '', label: charge.label,
      totalAmount: String(charge.totalAmount), amountPaid: String(charge.amountPaid),
      invoiceDate: charge.invoiceDate, dueDate: charge.dueDate, notes: charge.notes || '',
    });
  }

  function submitModal(e) {
    e.preventDefault();
    if (modal.type === 'client') {
      if (!form.name.trim()) return;
      const client = { id: modal.mode === 'edit' ? modal.id : newId(), name: form.name.trim(), contact: (form.contact || '').trim(), notes: (form.notes || '').trim() };
      const clients = modal.mode === 'edit' ? data.clients.map((c) => (c.id === modal.id ? client : c)) : [...data.clients, client];
      persist({ ...data, clients });
    } else if (modal.type === 'engagement') {
      if (!form.label.trim()) return;
      const kind = modal.kind;
      const prior = modal.mode === 'edit' ? data.engagements.find((x) => x.id === modal.id) : null;
      const eng = {
        id: modal.mode === 'edit' ? modal.id : newId(),
        clientId: modal.mode === 'edit' ? prior.clientId : modal.clientId,
        kind,
        label: form.label.trim(),
        status: prior ? prior.status : 'active',
        pausedSince: prior ? prior.pausedSince : null,
        monthlyAmount: kind === 'recurring' ? (parseFloat(form.monthlyAmount) || 0) : null,
        startDate: form.startDate || todayStr(),
        notes: (form.notes || '').trim(),
      };
      const engagements = modal.mode === 'edit' ? data.engagements.map((x) => (x.id === modal.id ? eng : x)) : [...data.engagements, eng];
      persist({ ...data, engagements });
    } else if (modal.type === 'charge') {
      const kind = modal.kind;
      if (kind === 'recurring' && !form.period) return;
      if (kind === 'project' && !form.label.trim()) return;
      if (!form.totalAmount || !form.dueDate) return;
      const prior = modal.mode === 'edit' ? data.charges.find((x) => x.id === modal.id) : null;
      const label = kind === 'recurring' ? formatPeriod(form.period) : form.label.trim();
      const charge = {
        id: modal.mode === 'edit' ? modal.id : newId(),
        engagementId: modal.mode === 'edit' ? prior.engagementId : modal.engagementId,
        period: kind === 'recurring' ? form.period : null,
        label,
        totalAmount: parseFloat(form.totalAmount) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
        invoiceDate: form.invoiceDate || todayStr(),
        dueDate: form.dueDate,
        lastFollowUp: prior ? (prior.lastFollowUp || null) : null,
        notes: (form.notes || '').trim(),
      };
      const charges = modal.mode === 'edit' ? data.charges.map((x) => (x.id === modal.id ? charge : x)) : [...data.charges, charge];
      persist({ ...data, charges });
    }
    setModal(null);
  }

  function toggleEngagement(id) {
    persist({ ...data, engagements: data.engagements.map((e) => (e.id === id ? { ...e, status: e.status === 'active' ? 'paused' : 'active', pausedSince: e.status === 'active' ? todayStr() : null } : e)) });
  }
  function markFollowedUp(id) {
    persist({ ...data, charges: data.charges.map((c) => (c.id === id ? { ...c, lastFollowUp: todayStr() } : c)) });
  }
  function performDelete() {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    if (type === 'client') {
      const engIds = data.engagements.filter((e) => e.clientId === id).map((e) => e.id);
      persist({
        clients: data.clients.filter((c) => c.id !== id),
        engagements: data.engagements.filter((e) => e.clientId !== id),
        charges: data.charges.filter((c) => !engIds.includes(c.engagementId)),
      });
    } else if (type === 'engagement') {
      persist({ ...data, engagements: data.engagements.filter((e) => e.id !== id), charges: data.charges.filter((c) => c.engagementId !== id) });
    } else if (type === 'charge') {
      persist({ ...data, charges: data.charges.filter((c) => c.id !== id) });
    }
    setConfirmDelete(null);
  }

  const enrichedCharges = useMemo(() => data.charges.map((charge) => {
    const engagement = data.engagements.find((e) => e.id === charge.engagementId) || null;
    const client = engagement ? data.clients.find((c) => c.id === engagement.clientId) : null;
    return { ...charge, ...getChargeDerived(charge, today), engagement, client, clientId: client ? client.id : null, clientName: client ? client.name : 'Unknown client', engagementLabel: engagement ? engagement.label : '', engagementKind: engagement ? engagement.kind : null };
  }), [data, today]);

  const missingInvoices = useMemo(() => {
    const period = currentPeriodStr();
    return data.engagements
      .filter((e) => e.kind === 'recurring' && e.status === 'active')
      .filter((e) => !data.charges.some((c) => c.engagementId === e.id && c.period === period))
      .map((e) => ({ engagement: e, client: data.clients.find((c) => c.id === e.clientId) }));
  }, [data]);

  const buckets = useMemo(() => {
    const amounts = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    const counts = { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    enrichedCharges.forEach((r) => {
      if (r.isPaid) return;
      if (r.daysOverdue <= 0) { amounts.current += r.due; counts.current++; }
      else if (r.daysOverdue <= 30) { amounts.b1 += r.due; counts.b1++; }
      else if (r.daysOverdue <= 60) { amounts.b2 += r.due; counts.b2++; }
      else if (r.daysOverdue <= 90) { amounts.b3 += r.due; counts.b3++; }
      else { amounts.b4 += r.due; counts.b4++; }
    });
    const total = amounts.current + amounts.b1 + amounts.b2 + amounts.b3 + amounts.b4;
    return { amounts, counts, total };
  }, [enrichedCharges]);

  const totals = useMemo(() => {
    const outstanding = enrichedCharges.filter((r) => !r.isPaid).reduce((s, r) => s + r.due, 0);
    const overdueRows = enrichedCharges.filter((r) => r.status === 'overdue');
    const dueSoonRows = enrichedCharges.filter((r) => r.status === 'duesoon');
    const needsFollowUp = enrichedCharges.filter((r) => r.needsFollowUp).length;
    return { outstanding, overdue: overdueRows.reduce((s, r) => s + r.due, 0), overdueCount: overdueRows.length, dueSoon: dueSoonRows.reduce((s, r) => s + r.due, 0), dueSoonCount: dueSoonRows.length, needsFollowUp };
  }, [enrichedCharges]);

  const filtered = enrichedCharges
    .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
    .filter((r) => (kindFilter === 'all' ? true : r.engagementKind === kindFilter))
    .filter((r) => (clientFilter === 'all' ? true : r.clientId === clientFilter))
    .filter((r) => {
      const q = search.toLowerCase();
      if (!q) return true;
      return r.clientName.toLowerCase().includes(q) || r.engagementLabel.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'dueDate') return new Date(a.dueDate) - new Date(b.dueDate);
      if (sortBy === 'amount') return b.due - a.due;
      if (sortBy === 'overdue') return b.daysOverdue - a.daysOverdue;
      return 0;
    });

  const bucketDefs = [
    { key: 'current', label: 'Not yet due', color: palette.upcoming },
    { key: 'b1', label: '1\u201330 days', color: '#E0A130' },
    { key: 'b2', label: '31\u201360 days', color: '#E08830' },
    { key: 'b3', label: '61\u201390 days', color: '#DD6738' },
    { key: 'b4', label: '90+ days', color: palette.overdue },
  ];

  return (
    <div style={{ background: palette.bg, fontFamily: sansFont, color: palette.textPrimary, minHeight: '100vh' }} className="w-full">
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea { font-family: ${sansFont}; }
        ::placeholder { color: ${palette.textMuted}; }
        input:focus, select:focus, textarea:focus { outline: 2px solid ${palette.gold}; outline-offset: 0px; }
        button:focus-visible, a:focus-visible { outline: 2px solid ${palette.gold}; outline-offset: 2px; }
        .scrollbar-thin::-webkit-scrollbar { height: 6px; width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: ${palette.borderLight}; border-radius: 4px; }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-5 py-8 md:px-8 md:py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-semibold tracking-widest mb-1" style={{ color: palette.gold, letterSpacing: '0.12em' }}>AGENCY COLLECTIONS</div>
            <h1 className="text-2xl md:text-3xl font-semibold">Collections</h1>
            <p className="text-sm mt-1" style={{ color: palette.textSecondary }}>Retainers and projects, one place to chase what's owed.</p>
          </div>
          <div className="flex rounded-lg p-1 self-start sm:self-auto" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
            <button onClick={() => setTab('followups')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: tab === 'followups' ? palette.goldSoft : 'transparent', color: tab === 'followups' ? palette.gold : palette.textSecondary }}>
              <ListChecks size={14} /> Follow-ups
            </button>
            <button onClick={() => setTab('clients')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: tab === 'clients' ? palette.goldSoft : 'transparent', color: tab === 'clients' ? palette.gold : palette.textSecondary }}>
              <Users size={14} /> Clients
            </button>
          </div>
        </div>

        {saveError && (
          <div className="mb-6 px-4 py-2.5 rounded-lg text-sm" style={{ background: palette.overdueSoft, color: palette.overdue }}>
            Couldn't save your last change. Check your connection and try again.
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: palette.textMuted }}>Loading…</div>
        ) : tab === 'clients' ? (
          <ClientsView
            data={data}
            enrichedCharges={enrichedCharges}
            onAddClient={openClientAdd}
            onEditClient={openClientEdit}
            onDeleteClient={(id) => setConfirmDelete({ type: 'client', id })}
            onAddEngagement={openEngagementAdd}
            onEditEngagement={openEngagementEdit}
            onDeleteEngagement={(id) => setConfirmDelete({ type: 'engagement', id })}
            onToggleEngagement={toggleEngagement}
            onAddCharge={openChargeAdd}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            performDelete={performDelete}
          />
        ) : (
          <FollowUpsView
            data={data}
            totals={totals}
            buckets={buckets}
            bucketDefs={bucketDefs}
            missingInvoices={missingInvoices}
            filtered={filtered}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            kindFilter={kindFilter} setKindFilter={setKindFilter}
            clientFilter={clientFilter} setClientFilter={setClientFilter}
            sortBy={sortBy} setSortBy={setSortBy}
            onAddCharge={openChargeAdd}
            onEditCharge={(c) => openChargeEdit(c, c.engagementKind)}
            onFollowUp={markFollowedUp}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            performDelete={performDelete}
            goToClients={() => setTab('clients')}
          />
        )}
      </div>

      {modal && <ModalForm modal={modal} form={form} setForm={setForm} onSubmit={submitModal} onClose={() => setModal(null)} />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, isCount }) {
  return (
    <div className="rounded-xl p-4" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} style={{ color: palette.textMuted }} />
        <span className="text-xs" style={{ color: palette.textMuted }}>{label}</span>
      </div>
      <div className="text-xl font-semibold" style={{ color, fontFamily: isCount ? sansFont : monoFont }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: palette.textMuted }}>{sub}</div>}
    </div>
  );
}

function FollowUpsView({ data, totals, buckets, bucketDefs, missingInvoices, filtered, search, setSearch, statusFilter, setStatusFilter, kindFilter, setKindFilter, clientFilter, setClientFilter, sortBy, setSortBy, onAddCharge, onEditCharge, onFollowUp, confirmDelete, setConfirmDelete, performDelete, goToClients }) {
  if (data.clients.length === 0) {
    return (
      <div className="rounded-xl py-16 px-6 text-center" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
        <Users size={28} style={{ color: palette.textMuted, margin: '0 auto 12px' }} />
        <div className="font-medium mb-1">No clients yet</div>
        <p className="text-sm mb-5" style={{ color: palette.textSecondary }}>Add a client and their services in the Clients tab to start tracking dues here.</p>
        <button onClick={goToClients} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm" style={{ background: palette.gold, color: '#151107' }}>
          <Plus size={16} strokeWidth={2.5} /> Go to Clients
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Wallet} label="Total outstanding" value={formatCurrency(totals.outstanding)} color={palette.textPrimary} />
        <StatCard icon={TriangleAlert} label="Overdue" value={formatCurrency(totals.overdue)} sub={`${totals.overdueCount} due${totals.overdueCount === 1 ? '' : 's'}`} color={palette.overdue} />
        <StatCard icon={Clock3} label="Due within 7 days" value={formatCurrency(totals.dueSoon)} sub={`${totals.dueSoonCount} due${totals.dueSoonCount === 1 ? '' : 's'}`} color={palette.dueSoon} />
        <StatCard icon={BellRing} label="Needs follow-up" value={totals.needsFollowUp} sub="not contacted in 3+ days" color={palette.gold} isCount />
      </div>

      {missingInvoices.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: palette.goldSoft, border: `1px solid rgba(201,162,39,0.3)` }}>
          <div className="text-xs font-semibold mb-3" style={{ color: palette.gold }}>{missingInvoices.length} recurring client{missingInvoices.length === 1 ? '' : 's'} missing an invoice for {formatPeriod(currentPeriodStr())}</div>
          <div className="flex flex-col gap-2">
            {missingInvoices.map(({ engagement, client }) => (
              <div key={engagement.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{client ? client.name : 'Unknown client'}</span>
                  <span style={{ color: palette.textSecondary }}> \u2014 {engagement.label}</span>
                </span>
                <button onClick={() => onAddCharge(engagement)} className="px-3 py-1.5 rounded-lg text-xs font-medium shrink-0" style={{ background: palette.gold, color: '#151107' }}>
                  Add invoice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {buckets.total > 0 && (
        <div className="rounded-xl p-5 mb-6" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
          <div className="text-xs font-semibold tracking-wide mb-3" style={{ color: palette.textSecondary, letterSpacing: '0.06em' }}>AGING OF OUTSTANDING BALANCE</div>
          <div className="flex w-full h-3 rounded-full overflow-hidden mb-4" style={{ background: palette.border }}>
            {bucketDefs.map((b) => {
              const amt = buckets.amounts[b.key];
              const pct = buckets.total > 0 ? (amt / buckets.total) * 100 : 0;
              if (pct <= 0) return null;
              return <div key={b.key} style={{ width: `${pct}%`, background: b.color, minWidth: amt > 0 ? '3px' : 0 }} title={`${b.label}: ${formatCurrency(amt)}`} />;
            })}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {bucketDefs.map((b) => (
              <div key={b.key} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                <span style={{ color: palette.textSecondary }}>{b.label}</span>
                <span style={{ color: palette.textPrimary, fontFamily: monoFont }}>{formatCurrency(buckets.amounts[b.key])}</span>
                <span style={{ color: palette.textMuted }}>({buckets.counts[b.key]})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: palette.textMuted }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, service, invoice" className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm shrink-0" style={{ background: palette.surface, border: `1px solid ${palette.border}`, color: palette.textSecondary }}>
          <option value="all">All clients</option>
          {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm shrink-0" style={{ background: palette.surface, border: `1px solid ${palette.border}`, color: palette.textSecondary }}>
          <option value="all">All types</option>
          <option value="recurring">Recurring</option>
          <option value="project">Project</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-3 py-2.5 rounded-lg text-sm shrink-0" style={{ background: palette.surface, border: `1px solid ${palette.border}`, color: palette.textSecondary }}>
          <option value="dueDate">Sort: Due date</option>
          <option value="amount">Sort: Amount due</option>
          <option value="overdue">Sort: Most overdue</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-thin mb-4">
        {[{ key: 'all', label: 'All' }, { key: 'overdue', label: 'Overdue' }, { key: 'duesoon', label: 'Due soon' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'paid', label: 'Paid' }].map((f) => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} className="px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0" style={{ background: statusFilter === f.key ? palette.goldSoft : palette.surface, color: statusFilter === f.key ? palette.gold : palette.textSecondary, border: `1px solid ${statusFilter === f.key ? 'transparent' : palette.border}` }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: `1px solid ${palette.border}` }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: palette.surface }}>
              {['Client & service', 'Amount', 'Due date', 'Status', 'Last follow-up', ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-semibold tracking-wide" style={{ color: palette.textMuted, letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ChargeRow key={r.id} r={r} onEdit={() => onEditCharge(r)} onFollowUp={() => onFollowUp(r.id)} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} onDelete={performDelete} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-sm" style={{ color: palette.textMuted, background: palette.surface }}>No dues match this view.</div>}
      </div>

      <div className="md:hidden flex flex-col gap-3">
        {filtered.map((r) => (
          <ChargeMobileCard key={r.id} r={r} onEdit={() => onEditCharge(r)} onFollowUp={() => onFollowUp(r.id)} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} onDelete={performDelete} />
        ))}
        {filtered.length === 0 && <div className="py-12 text-center text-sm rounded-xl" style={{ color: palette.textMuted, background: palette.surface, border: `1px solid ${palette.border}` }}>No dues match this view.</div>}
      </div>
    </>
  );
}

function ChargeRow({ r, onEdit, onFollowUp, confirmDelete, setConfirmDelete, onDelete }) {
  const confirming = confirmDelete && confirmDelete.type === 'charge' && confirmDelete.id === r.id;
  return (
    <tr style={{ borderTop: `1px solid ${palette.border}` }}>
      <td className="px-4 py-3 align-top">
        <div className="font-medium">{r.clientName}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <KindBadge kind={r.engagementKind} />
          <span className="text-xs" style={{ color: palette.textMuted }}>{r.engagementLabel}</span>
        </div>
        <div className="text-xs mt-0.5" style={{ color: palette.textMuted, fontFamily: monoFont }}>{r.label}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div style={{ fontFamily: monoFont, color: palette.textPrimary }}>{formatCurrency(r.due)}</div>
        {r.isPartial && <div className="text-xs mt-0.5" style={{ color: palette.textMuted, fontFamily: monoFont }}>of {formatCurrency(r.totalAmount)}</div>}
      </td>
      <td className="px-4 py-3 align-top">
        <div style={{ fontFamily: monoFont, color: palette.textSecondary }}>{formatDate(r.dueDate)}</div>
        <div className="mt-0.5"><DueCaption r={r} /></div>
      </td>
      <td className="px-4 py-3 align-top"><StatusBadge status={r.status} /></td>
      <td className="px-4 py-3 align-top">
        <div className="text-xs" style={{ color: palette.textSecondary }}>{r.lastFollowUp ? formatDate(r.lastFollowUp) : 'Never'}</div>
        {r.needsFollowUp && <div className="text-xs mt-0.5 font-medium" style={{ color: palette.gold }}>Flag: follow up</div>}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center justify-end gap-1">
          {!r.isPaid && <button onClick={onFollowUp} title="Mark followed up today" className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><CheckCircle2 size={15} /></button>}
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Pencil size={14} /></button>
          {confirming ? (
            <span className="flex items-center gap-1 text-xs">
              <button onClick={onDelete} className="px-2 py-1 rounded" style={{ color: palette.overdue, background: palette.overdueSoft }}>Delete</button>
              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded" style={{ color: palette.textMuted }}>Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete({ type: 'charge', id: r.id })} title="Delete" className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Trash2 size={14} /></button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ChargeMobileCard({ r, onEdit, onFollowUp, confirmDelete, setConfirmDelete, onDelete }) {
  const confirming = confirmDelete && confirmDelete.type === 'charge' && confirmDelete.id === r.id;
  return (
    <div className="rounded-xl p-4" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-medium">{r.clientName}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <KindBadge kind={r.engagementKind} />
            <span className="text-xs" style={{ color: palette.textMuted }}>{r.engagementLabel}</span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: palette.textMuted, fontFamily: monoFont }}>{r.label}</div>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-lg" style={{ fontFamily: monoFont, color: palette.textPrimary }}>{formatCurrency(r.due)}</div>
          {r.isPartial && <div className="text-xs" style={{ color: palette.textMuted, fontFamily: monoFont }}>of {formatCurrency(r.totalAmount)}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ fontFamily: monoFont, color: palette.textSecondary }}>{formatDate(r.dueDate)}</div>
          <DueCaption r={r} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs" style={{ color: palette.textSecondary }}>
        <span>
          Last follow-up: {r.lastFollowUp ? formatDate(r.lastFollowUp) : 'Never'}
          {r.needsFollowUp && <span className="ml-2 font-medium" style={{ color: palette.gold }}>Flag</span>}
        </span>
        <div className="flex items-center gap-1">
          {!r.isPaid && <button onClick={onFollowUp} className="p-1.5" style={{ color: palette.textMuted }}><CheckCircle2 size={15} /></button>}
          <button onClick={onEdit} className="p-1.5" style={{ color: palette.textMuted }}><Pencil size={14} /></button>
          {confirming ? (
            <>
              <button onClick={onDelete} className="px-2 py-1 rounded text-xs" style={{ color: palette.overdue, background: palette.overdueSoft }}>Delete</button>
              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded text-xs" style={{ color: palette.textMuted }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete({ type: 'charge', id: r.id })} className="p-1.5" style={{ color: palette.textMuted }}><Trash2 size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientsView({ data, enrichedCharges, onAddClient, onEditClient, onDeleteClient, onAddEngagement, onEditEngagement, onDeleteEngagement, onToggleEngagement, onAddCharge, confirmDelete, setConfirmDelete, performDelete }) {
  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={onAddClient} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm" style={{ background: palette.gold, color: '#151107' }}>
          <Plus size={16} strokeWidth={2.5} /> Add client
        </button>
      </div>

      {data.clients.length === 0 ? (
        <div className="rounded-xl py-16 px-6 text-center" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
          <Users size={28} style={{ color: palette.textMuted, margin: '0 auto 12px' }} />
          <div className="font-medium mb-1">No clients yet</div>
          <p className="text-sm" style={{ color: palette.textSecondary }}>Add a client, then add their recurring services or one-time projects.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data.clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              engagements={data.engagements.filter((e) => e.clientId === client.id)}
              enrichedCharges={enrichedCharges}
              onEditClient={() => onEditClient(client)}
              onDeleteClient={() => onDeleteClient(client.id)}
              onAddEngagement={(kind) => onAddEngagement(client.id, kind)}
              onEditEngagement={onEditEngagement}
              onDeleteEngagement={onDeleteEngagement}
              onToggleEngagement={onToggleEngagement}
              onAddCharge={onAddCharge}
              confirmDelete={confirmDelete}
              setConfirmDelete={setConfirmDelete}
              performDelete={performDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ClientCard({ client, engagements, enrichedCharges, onEditClient, onDeleteClient, onAddEngagement, onEditEngagement, onDeleteEngagement, onToggleEngagement, onAddCharge, confirmDelete, setConfirmDelete, performDelete }) {
  const clientCharges = enrichedCharges.filter((c) => c.clientId === client.id);
  const outstanding = clientCharges.filter((c) => !c.isPaid).reduce((s, c) => s + c.due, 0);
  const confirmingClient = confirmDelete && confirmDelete.type === 'client' && confirmDelete.id === client.id;

  return (
    <div className="rounded-xl p-4 md:p-5" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="font-semibold text-base">{client.name}</div>
          {client.contact && (
            <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: palette.textMuted }}>
              {client.contact.includes('@') ? <Mail size={11} /> : <Phone size={11} />} {client.contact}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {outstanding > 0 && <span className="text-xs px-2 py-1 rounded-full" style={{ background: palette.goldSoft, color: palette.gold, fontFamily: monoFont }}>{formatCurrency(outstanding)} due</span>}
          <button onClick={onEditClient} className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Pencil size={14} /></button>
          {confirmingClient ? (
            <span className="flex items-center gap-1 text-xs">
              <button onClick={performDelete} className="px-2 py-1 rounded" style={{ color: palette.overdue, background: palette.overdueSoft }}>Delete</button>
              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded" style={{ color: palette.textMuted }}>Cancel</button>
            </span>
          ) : (
            <button onClick={onDeleteClient} className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Trash2 size={14} /></button>
          )}
        </div>
      </div>

      {engagements.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {engagements.map((eng) => (
            <EngagementRow key={eng.id} engagement={eng} charges={clientCharges.filter((c) => c.engagementId === eng.id)} onEdit={() => onEditEngagement(eng)} onDelete={() => setConfirmDelete({ type: 'engagement', id: eng.id })} onToggle={() => onToggleEngagement(eng.id)} onAddCharge={() => onAddCharge(eng)} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} performDelete={performDelete} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onAddEngagement('recurring')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: `1px solid ${palette.border}`, color: palette.textSecondary }}>
          <Repeat size={13} /> Add recurring service
        </button>
        <button onClick={() => onAddEngagement('project')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: `1px solid ${palette.border}`, color: palette.textSecondary }}>
          <Briefcase size={13} /> Add project
        </button>
      </div>
    </div>
  );
}

function EngagementRow({ engagement, charges, onEdit, onDelete, onToggle, onAddCharge, confirmDelete, setConfirmDelete, performDelete }) {
  const outstanding = charges.filter((c) => !c.isPaid).reduce((s, c) => s + c.due, 0);
  const confirming = confirmDelete && confirmDelete.type === 'engagement' && confirmDelete.id === engagement.id;
  const isRecurring = engagement.kind === 'recurring';
  return (
    <div className="rounded-lg p-3" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{engagement.label}</span>
            <KindBadge kind={engagement.kind} />
            <EngagementStatusBadge status={engagement.status} />
          </div>
          <div className="text-xs mt-1" style={{ color: palette.textMuted }}>
            {isRecurring && engagement.monthlyAmount ? `${formatCurrency(engagement.monthlyAmount)}/mo \u00B7 ` : ''}
            {charges.length} invoice{charges.length === 1 ? '' : 's'}
            {outstanding > 0 ? ` \u00B7 ${formatCurrency(outstanding)} outstanding` : ''}
            {engagement.status === 'paused' && engagement.pausedSince ? ` \u00B7 paused since ${formatDate(engagement.pausedSince)}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onAddCharge} className="px-2.5 py-1.5 rounded-md text-xs font-medium" style={{ background: palette.goldSoft, color: palette.gold }}>+ Invoice</button>
          <button onClick={onToggle} title={engagement.status === 'active' ? 'Pause' : 'Resume'} className="p-1.5 rounded-md" style={{ color: palette.textMuted }}>
            {engagement.status === 'active' ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
          </button>
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Pencil size={14} /></button>
          {confirming ? (
            <span className="flex items-center gap-1 text-xs">
              <button onClick={performDelete} className="px-2 py-1 rounded" style={{ color: palette.overdue, background: palette.overdueSoft }}>Delete</button>
              <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 rounded" style={{ color: palette.textMuted }}>Cancel</button>
            </span>
          ) : (
            <button onClick={onDelete} title="Delete" className="p-1.5 rounded-md" style={{ color: palette.textMuted }}><Trash2 size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? 'col-span-2' : 'col-span-1'}>
      <label className="block text-xs font-medium mb-1.5" style={{ color: palette.textSecondary }}>{label}</label>
      {children}
    </div>
  );
}

function ModalForm({ modal, form, setForm, onSubmit, onClose }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  let title = '';
  if (modal.type === 'client') title = modal.mode === 'edit' ? 'Edit client' : 'Add client';
  if (modal.type === 'engagement') title = (modal.mode === 'edit' ? 'Edit ' : 'Add ') + (modal.kind === 'recurring' ? 'recurring service' : 'project');
  if (modal.type === 'charge') title = (modal.mode === 'edit' ? 'Edit ' : 'Add ') + (modal.kind === 'recurring' ? 'monthly invoice' : 'milestone');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} className="w-full max-w-lg rounded-xl p-6 max-h-[90vh] overflow-y-auto scrollbar-thin" style={{ background: palette.surface, border: `1px solid ${palette.borderLight}`, fontFamily: sansFont, color: palette.textPrimary }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} style={{ color: palette.textMuted }}><X size={18} /></button>
        </div>

        {modal.type === 'client' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client name *" full><input required value={form.name} onChange={set('name')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="e.g. Rahul Traders" /></Field>
            <Field label="Contact (phone or email)" full><input value={form.contact} onChange={set('contact')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="9xxxxxxxxx or email" /></Field>
            <Field label="Notes" full><textarea value={form.notes} onChange={set('notes')} style={inputStyle} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" placeholder="Anything worth remembering" /></Field>
          </div>
        )}

        {modal.type === 'engagement' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={modal.kind === 'recurring' ? 'Service name *' : 'Project name *'} full>
              <input required value={form.label} onChange={set('label')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder={modal.kind === 'recurring' ? 'e.g. Social media management' : 'e.g. Website redesign'} />
            </Field>
            {modal.kind === 'recurring' && (
              <Field label="Monthly amount (suggested)"><input type="number" min="0" step="0.01" value={form.monthlyAmount} onChange={set('monthlyAmount')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="0" /></Field>
            )}
            <Field label={modal.kind === 'recurring' ? 'Start date' : 'Kickoff date'}><input type="date" value={form.startDate} onChange={set('startDate')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" /></Field>
            <Field label="Notes" full><textarea value={form.notes} onChange={set('notes')} style={inputStyle} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" placeholder="Scope, terms, anything useful" /></Field>
          </div>
        )}

        {modal.type === 'charge' && (
          <div className="grid grid-cols-2 gap-3">
            {modal.kind === 'recurring' ? (
              <Field label="Billing month *" full>
                <input required type="month" value={form.period} onChange={set('period')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" />
                {form.period && <div className="text-xs mt-1" style={{ color: palette.textMuted }}>Logged as: {formatPeriod(form.period)}</div>}
              </Field>
            ) : (
              <Field label="Milestone name *" full><input required value={form.label} onChange={set('label')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="e.g. Advance (50%)" /></Field>
            )}
            <Field label="Amount *"><input required type="number" min="0" step="0.01" value={form.totalAmount} onChange={set('totalAmount')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="0" /></Field>
            <Field label="Amount paid so far"><input type="number" min="0" step="0.01" value={form.amountPaid} onChange={set('amountPaid')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" placeholder="0" /></Field>
            <Field label="Invoice date"><input type="date" value={form.invoiceDate} onChange={set('invoiceDate')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" /></Field>
            <Field label="Due date *"><input required type="date" value={form.dueDate} onChange={set('dueDate')} style={inputStyle} className="w-full px-3 py-2 rounded-lg text-sm" /></Field>
            <Field label="Notes" full><textarea value={form.notes} onChange={set('notes')} style={inputStyle} rows={2} className="w-full px-3 py-2 rounded-lg text-sm resize-none" placeholder="Anything worth remembering" /></Field>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: palette.textSecondary, border: `1px solid ${palette.border}` }}>Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: palette.gold, color: '#151107' }}>{modal.mode === 'edit' ? 'Save changes' : 'Add'}</button>
        </div>
      </form>
    </div>
  );
}
