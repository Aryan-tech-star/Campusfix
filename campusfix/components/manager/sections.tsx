"use client";
import { useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Plus,
  Download,
  ClipboardList,
  Clock3,
  Wrench,
  CircleCheck,
  AlertTriangle,
  IndianRupee,
  ShieldCheck,
  Star,
  Search,
  MapPin,
  Send,
  Settings2,
  Check,
  Building2,
  Activity,
  RefreshCw,
} from "lucide-react";
import {
  Snapshot,
  Complaint,
  Technician,
  active,
  assigned,
  complaintCost,
  repairCost,
  money,
  categories,
  AssistantResult,
} from "@/lib/manager/domain";
import {
  Metric,
  SectionHead,
  TextLink,
  Badge,
  Empty,
  Modal,
  cx,
  stamp,
  api,
  Spinner,
} from "./ui";
import { CategoryChart, CostChart } from "./charts";
import { ComplaintTable, exportComplaints } from "./complaints";
type SectionProps = {
  data: Snapshot;
  property: string;
  onOpen: (id: string) => void;
};
const scope = (data: Snapshot, property: string) =>
  data.complaints.filter(
    (c) => property === "all" || c.propertyId === property,
  );
export function Overview({
  data,
  property,
  onOpen,
  onCreate,
  onNavigate,
}: {
  data: Snapshot;
  property: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onNavigate: (tab: string) => void;
}) {
  const [days, setDays] = useState(30);
  const [now] = useState(() => Date.now());
  const all = scope(data, property);
  const complaints = all.filter(
    (c) => now - new Date(c.createdAt).getTime() <= days * 86400000,
  );
  const pending = all.filter((c) =>
      ["Pending", "Approved", "Reopened"].includes(c.status),
    ),
    repairs = all.filter(assigned),
    done = complaints.filter((c) => c.status === "Completed"),
    urgent = all.filter((c) => active(c) && c.urgency === "Emergency"),
    verify = all.filter((c) => c.status === "Awaiting verification");
  const recent = all.slice(0, 5),
    activity = all
      .flatMap((c) => c.history.map((h) => ({ ...h, complaint: c })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PROPERTIES, TAKEN CARE OF</div>
          <h1>
            Everything in good hands<span className="heading-dot">.</span>
          </h1>
          <p>Here’s what’s happening across your maintenance network.</p>
        </div>
        <div className="heading-actions">
          <select
            aria-label="Overview reporting period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
          </select>
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} />
            New complaint
          </button>
        </div>
      </div>
      <div className="metrics-grid">
        <Metric
          label="Total complaints"
          value={complaints.length}
          detail={`Reported in the last ${days} days`}
          icon={<ClipboardList size={18} />}
        />
        <Metric
          label="Pending complaints"
          value={pending.length}
          detail="Open · waiting for the next step"
          tone="amber"
          icon={<Clock3 size={18} />}
        />
        <Metric
          label="Active repairs"
          value={repairs.length}
          detail={`${verify.length} ready for your verification`}
          tone="purple"
          icon={<Wrench size={18} />}
        />
        <Metric
          label="Completed repairs"
          value={done.length}
          detail="Resolved and manager verified"
          tone="green"
          icon={<CircleCheck size={18} />}
        />
        <Metric
          label="Emergency issues"
          value={urgent.length}
          detail="Open · need immediate attention"
          tone="red"
          icon={<AlertTriangle size={18} />}
        />
        <Metric
          label="Maintenance spend"
          value={money(
            all
              .flatMap((c) => c.repairs)
              .filter(
                (r) =>
                  r.verifiedAt &&
                  now - new Date(r.verifiedAt).getTime() <= days * 86400000,
              )
              .reduce((s, r) => s + repairCost(r), 0),
          )}
          detail="Approved labour + parts in period"
          tone="teal"
          icon={<IndianRupee size={18} />}
        />
      </div>
      <div className="insight-banner">
        <div className="insight-icon">
          <Sparkles size={23} />
        </div>
        <div>
          <div className="row-start">
            <strong>A little intelligence. A lot less admin.</strong>
            <span className="gemma-chip">GEMMA AI</span>
          </div>
          <p>
            {urgent.length
              ? `${urgent.length} emergency ${urgent.length === 1 ? "issue needs" : "issues need"} attention. `
              : "Your maintenance workspace is up to date. "}
            Get a live briefing, spot recurring issues, and plan your next move.
          </p>
        </div>
        <button className="button" onClick={() => onNavigate("assistant")}>
          Ask CampusFix
          <Sparkles size={15} />
        </button>
      </div>
      <div className="chart-grid">
        <article className="panel">
          <SectionHead
            title="Needs your attention"
            subtitle="Priority issues and repairs ready for review"
            action={
              <TextLink onClick={() => onNavigate("complaints")}>
                Open queue
              </TextLink>
            }
          />
          <div className="attention-list">
            {[
              ...urgent,
              ...verify,
              ...pending.filter((c) => c.urgency !== "Emergency"),
            ]
              .filter((c,index,list)=>list.findIndex(x=>x.id===c.id)===index)
              .slice(0, 4)
              .map((c) => (
                <button key={c.id} onClick={() => onOpen(c.id)}>
                  <span
                    className={cx(
                      "icon-tile",
                      c.urgency === "Emergency" ? "red" : "amber",
                    )}
                  >
                    {c.urgency === "Emergency" ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <ShieldCheck size={17} />
                    )}
                  </span>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.id} ·{" "}
                      {data.properties.find((p) => p.id === c.propertyId)?.name}
                    </small>
                  </div>
                  <Badge>
                    {c.urgency === "Emergency" ? "Emergency" : c.status}
                  </Badge>
                  <ArrowRight size={15} />
                </button>
              ))}
            {!urgent.length && !verify.length && !pending.length && (
              <Empty title="Everything is taken care of">
                No issues need your review right now.
              </Empty>
            )}
          </div>
        </article>
        <article className="panel">
          <SectionHead
            title="By category"
            subtitle={`Where your attention is going · ${days} days`}
          />
          <CategoryChart complaints={complaints} />
        </article>
      </div>
      <article className="panel recent-panel">
        <SectionHead
          title="Recent complaints"
          subtitle="Keep the next repair moving forward"
          action={
            <TextLink onClick={() => onNavigate("complaints")}>
              View all complaints
            </TextLink>
          }
        />
        <ComplaintTable
          complaints={recent}
          data={data}
          onOpen={onOpen}
          compact
        />
      </article>
      <div className="bottom-grid">
        <article className="panel">
          <SectionHead
            title="Recent activity"
            subtitle="The latest from your shared network"
          />
          <div className="activity-list">
            {activity.map((h) => (
              <button key={h.id} onClick={() => onOpen(h.complaint.id)}>
                <span className="activity-symbol">
                  <Activity size={16} />
                </span>
                <div>
                  <strong>
                    {h.complaint.id} · {h.action}
                  </strong>
                  <p>
                    {h.actor} · {h.complaint.title}
                  </p>
                </div>
                <time>{stamp(h.at)}</time>
              </button>
            ))}
          </div>
        </article>
        <article className="network-card">
          <div className="network-art">
            <Building2 size={47} />
            <span />
            <Wrench size={22} />
            <span />
            <Building2 size={32} />
          </div>
          <span className="eyebrow">ONE CONNECTED NETWORK</span>
          <h2>
            Shared expertise.
            <br />
            Better places to live.
          </h2>
          <p>
            {data.technicians.filter((t) => t.verified && t.available).length}{" "}
            available specialists across {data.properties.length} nearby
            properties. Your maintenance team, without the overhead.
          </p>
          <button onClick={() => onNavigate("technicians")}>
            Explore your network
            <ArrowRight size={16} />
          </button>
        </article>
      </div>
    </>
  );
}
export function Technicians({
  data,
  property,
  onOpen,
  onRefresh,
}: SectionProps & { onRefresh: () => Promise<void> }) {
  const [query, setQuery] = useState(""),
    [specialization, setSpecialization] = useState("All specializations"),
    [available, setAvailable] = useState(false),
    [selected, setSelected] = useState<Technician | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const filtered = data.technicians.filter(
    (t) =>
      t.name.toLowerCase().includes(query.toLowerCase()) &&
      (specialization === "All specializations" ||
        t.specialization.includes(
          specialization as (typeof categories)[number],
        )) &&
      (!available || t.available),
  );
  const selectedTech =
    selected && data.technicians.find((t) => t.id === selected.id);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE PEOPLE BEHIND THE REPAIRS</div>
          <h1>Your technician network</h1>
          <p>Verified local specialists, shared across nearby properties.</p>
        </div>
        <span className="network-count">
          <ShieldCheck size={17} />
          {data.technicians.filter((t) => t.verified).length} verified
          professionals
        </span>
      </div>
      <div className="panel filter-bar standalone-filter">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search technicians"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a technician…"
          />
        </div>
        <select
          aria-label="Specialization filter"
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
        >
          {["All specializations", ...categories].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          Available now
        </label>
      </div>
      <div className="technician-grid">
        {filtered.map((t) => {
          const jobs = data.complaints.filter(
            (c) => c.technicianId === t.id && assigned(c),
          );
          return (
            <article className="panel technician-card" key={t.id}>
              <div className="row-between">
                <span className={cx("avatar large", t.color)}>
                  {t.initials}
                </span>
                <Badge>{t.available ? "Available" : "Off duty"}</Badge>
              </div>
              <h2>
                {t.name}
                <ShieldCheck size={17} />
              </h2>
              <p>{t.specialization.join(" · ")}</p>
              <div className="technician-rating">
                <Star size={14} fill="currentColor" />
                {t.rating}
                <span>· {t.jobsCompleted} network jobs</span>
              </div>
              <div className="technician-stats">
                <div>
                  <strong>{t.reliability}%</strong>
                  <span>Reliability</span>
                </div>
                <div>
                  <strong>{jobs.length}/4</strong>
                  <span>Active jobs</span>
                </div>
                <div>
                  <strong>{t.responseMinutes}m</strong>
                  <span>Avg. response</span>
                </div>
              </div>
              <div className="workload-track">
                <span style={{ width: `${(jobs.length / 4) * 100}%` }} />
              </div>
              <div className="row-between card-footer">
                <small>
                  <MapPin size={13} />
                  Pune local network
                </small>
                <button className="text-link" onClick={() => setSelected(t)}>
                  View profile
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Empty title="No matching technicians" />}
      {selectedTech && (
        <Modal
          title={selectedTech.name}
          subtitle="Verified network technician · service history"
          onClose={() => {
            setSelected(null);
            setError("");
          }}
        >
          <div className="profile-banner">
            <span className={cx("avatar large", selectedTech.color)}>
              {selectedTech.initials}
            </span>
            <div>
              <strong>{selectedTech.specialization.join(" · ")}</strong>
              <p>
                {selectedTech.reliability}% reliability · {selectedTech.rating}
                /5 rating
              </p>
            </div>
          </div>
          <div className="info-note">
            Assignment is approved from an individual complaint, where
            specialization, distance, capacity and availability are checked.
          </div>
          {error && <p className="error-box">{error}</p>}
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api(`/technicians/${selectedTech.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    available: !selectedTech.available,
                    revision: data.revision,
                  }),
                });
                await onRefresh();
              } catch (e) {
                setError((e as Error).message);
                await onRefresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Saving…"
              : selectedTech.available
                ? "Mark off duty"
                : "Mark available"}
          </button>
          <h3 className="subheading">Active jobs across the network</h3>
          {data.complaints
            .filter((c) => c.technicianId === selectedTech.id && assigned(c))
            .map((c) => (
              <button
                className="job-row"
                key={c.id}
                onClick={() => {
                  setSelected(null);
                  onOpen(c.id);
                }}
              >
                <div>
                  <strong>{c.title}</strong>
                  <small>
                    {c.id} ·{" "}
                    {data.properties.find((p) => p.id === c.propertyId)?.name}
                  </small>
                </div>
                <Badge>{c.status}</Badge>
              </button>
            ))}
          {!data.complaints.some(
            (c) => c.technicianId === selectedTech.id && assigned(c),
          ) && <p className="muted">No active jobs.</p>}
          <h3 className="subheading">Repair history in selected properties</h3>
          {scope(data, property)
            .filter((c) =>
              c.repairs.some((r) => r.technicianId === selectedTech.id),
            )
            .slice(0, 10)
            .map((c) => (
              <button
                className="job-row"
                key={c.id}
                onClick={() => {
                  setSelected(null);
                  onOpen(c.id);
                }}
              >
                <div>
                  <strong>{c.title}</strong>
                  <small>
                    {c.id} · {stamp(c.updatedAt)}
                  </small>
                </div>
                <span>{money(complaintCost(c))}</span>
              </button>
            ))}
        </Modal>
      )}
    </>
  );
}
export function Verification({ data, property, onOpen }: SectionProps) {
  const all = scope(data, property),
    waiting = all.filter((c) => c.status === "Awaiting verification");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLOSE THE LOOP</div>
          <h1>Repair verification</h1>
          <p>A job is only done when your property confirms it.</p>
        </div>
        <span className="pill">{waiting.length} awaiting review</span>
      </div>
      <div className="verification-grid">
        {waiting.map((c) => {
          const r = c.repairs[0],
            t = data.technicians.find((t) => t.id === r?.technicianId);
          return (
            <article className="panel verification-card" key={c.id}>
              <div className="row-between">
                <Badge>Awaiting verification</Badge>
                <small>{c.id}</small>
              </div>
              <h2>{c.title}</h2>
              <p className="muted">
                {data.properties.find((p) => p.id === c.propertyId)?.name} ·{" "}
                {c.room}
              </p>
              <div className="verification-report">
                <ShieldCheck size={20} />
                <p>{r?.summary || "Completion report missing."}</p>
              </div>
              <div className="row-between">
                <span className="person-mini">
                  <span className={cx("avatar tiny", t?.color)}>
                    {t?.initials}
                  </span>
                  {t?.name}
                </span>
                <strong className="repair-amount">
                  {r ? money(repairCost(r)) : "—"}
                </strong>
              </div>
              <div className="cost-line">
                <small>Approved estimate</small>
                <strong>
                  {c.estimate === undefined
                    ? "Not approved"
                    : money(c.estimate)}
                </strong>
              </div>
              <button
                className="button primary full-width"
                onClick={() => onOpen(c.id)}
              >
                Review report & verify
                <ArrowRight size={16} />
              </button>
            </article>
          );
        })}
      </div>
      {!waiting.length && (
        <div className="panel">
          <Empty title="All caught up">
            There are no completed repairs waiting for your review.
          </Empty>
        </div>
      )}
      <article className="panel">
        <SectionHead
          title="Verified repair history"
          subtitle="Approved work, parts and costs remain in each complaint timeline"
        />
        <ComplaintTable
          complaints={all.filter((c) => c.status === "Completed").slice(0, 12)}
          data={data}
          onOpen={onOpen}
        />
      </article>
    </>
  );
}
export function Analytics({ data, property, onOpen }: SectionProps) {
  const all = scope(data, property),
    done = all.filter((c) => c.status === "Completed"),
    total = all.reduce((s, c) => s + complaintCost(c), 0),
    hours = done.map(
      (c) =>
        (new Date(
          c.repairs.find((r) => r.verifiedAt)?.verifiedAt || c.updatedAt,
        ).getTime() -
          new Date(c.createdAt).getTime()) /
        3600000,
    ),
    average = hours.length
      ? hours.reduce((a, b) => a + b, 0) / hours.length
      : 0;
  const groups = new Map<string, Complaint[]>();
  all.forEach((c) => {
    const key = `${c.propertyId}|${c.room}|${c.category}`;
    groups.set(key, [...(groups.get(key) || []), c]);
  });
  const recurring = [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BETTER DECISIONS START HERE</div>
          <h1>Maintenance insights</h1>
          <p>Understand costs, recurring issues and network performance.</p>
        </div>
        <button className="button" onClick={() => exportComplaints(all, data)}>
          <Download size={16} />
          Export data
        </button>
      </div>
      <div className="metrics-grid four">
        <Metric
          label="Average resolution"
          value={`${average.toFixed(1)}h`}
          detail="Report to manager verification"
          icon={<Clock3 size={18} />}
        />
        <Metric
          label="Verified repair spend"
          value={money(total)}
          detail="All recorded labour and parts"
          icon={<IndianRupee size={18} />}
          tone="teal"
        />
        <Metric
          label="Recurring locations"
          value={recurring.length}
          detail="Same room, property and category"
          icon={<RefreshCw size={18} />}
          tone="amber"
        />
        <Metric
          label="Resolution rate"
          value={`${all.filter((c) => c.status !== "Rejected").length ? Math.round((done.length / all.filter((c) => c.status !== "Rejected").length) * 100) : 0}%`}
          detail="Verified / non-rejected complaints"
          icon={<CircleCheck size={18} />}
          tone="green"
        />
      </div>
      <div className="chart-grid">
        <article className="panel">
          <SectionHead
            title="Monthly maintenance costs"
            subtitle="Verified repairs · labour and parts · last 6 months"
          />
          <CostChart complaints={all} />
        </article>
        <article className="panel">
          <SectionHead
            title="Common maintenance categories"
            subtitle="All recorded complaints"
          />
          <CategoryChart complaints={all} />
        </article>
      </div>
      <div className="analytics-grid">
        <article className="panel">
          <SectionHead
            title="Recurring issues"
            subtitle="Repeated reports at the same location"
          />
          {recurring.length ? (
            recurring.slice(0, 6).map((g) => (
              <button
                className="recurring-row"
                key={g[0].id}
                onClick={() => onOpen(g[0].id)}
              >
                <span className="icon-tile amber">
                  <RefreshCw size={16} />
                </span>
                <div>
                  <strong>
                    {g[0].category} · Room {g[0].room}
                  </strong>
                  <small>
                    {
                      data.properties.find((p) => p.id === g[0].propertyId)
                        ?.name
                    }
                  </small>
                </div>
                <span className="pill">{g.length} reports</span>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <Empty title="No recurring locations found" />
          )}
        </article>
        <article className="panel">
          <SectionHead
            title="Property performance"
            subtitle="Repair expenditure excludes membership fees"
          />
          <div className="property-stats">
            {data.properties
              .filter((p) => property === "all" || p.id === property)
              .map((p) => {
                const cs = all.filter((c) => c.propertyId === p.id);
                return (
                  <div key={p.id}>
                    <span className="icon-tile blue">
                      <Building2 size={20} />
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {cs.filter(active).length} open ·{" "}
                        {cs.filter((c) => c.status === "Completed").length}{" "}
                        resolved
                      </small>
                    </div>
                    <strong>
                      {money(cs.reduce((s, c) => s + complaintCost(c), 0))}
                    </strong>
                  </div>
                );
              })}
          </div>
        </article>
      </div>
      <article className="panel">
        <SectionHead
          title="Technician performance"
          subtitle="Derived from recorded repairs in the selected properties"
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Technician</th>
                <th>Verified repairs</th>
                <th>Active jobs</th>
                <th>Avg. resolution</th>
                <th>Approved cost</th>
                <th>Revisited repairs</th>
              </tr>
            </thead>
            <tbody>
              {data.technicians.map((t) => {
                const cs = all.filter((c) =>
                    c.repairs.some(
                      (r) => r.technicianId === t.id && r.verifiedAt,
                    ),
                  ),
                  rs = cs.flatMap((c) =>
                    c.repairs
                      .filter((r) => r.technicianId === t.id && r.verifiedAt)
                      .map((r) => ({ r, c })),
                  );
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="person-mini">
                        <span className={cx("avatar tiny", t.color)}>
                          {t.initials}
                        </span>
                        {t.name}
                      </span>
                    </td>
                    <td>{rs.length}</td>
                    <td>
                      {
                        all.filter(
                          (c) => c.technicianId === t.id && assigned(c),
                        ).length
                      }
                    </td>
                    <td>
                      {rs.length
                        ? `${(rs.reduce((s, { r, c }) => s + (new Date(r.verifiedAt!).getTime() - new Date(c.createdAt).getTime()) / 3600000, 0) / rs.length).toFixed(1)}h`
                        : "—"}
                    </td>
                    <td>
                      {money(rs.reduce((s, { r }) => s + repairCost(r), 0))}
                    </td>
                    <td>
                      {
                        all
                          .flatMap((c) => c.repairs)
                          .filter(
                            (r) => r.technicianId === t.id && r.reopenedAt,
                          ).length
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
export function Assistant({
  data,
  onOpen,
}: {
  data: Snapshot;
  onOpen: (id: string) => void;
}) {
  const [question, setQuestion] = useState(
      "What should I focus on today? Summarize pending work, urgent issues and recurring complaints.",
    ),
    [result, setResult] = useState<AssistantResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ask = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<AssistantResult>("/assistant", {
          method: "POST",
          body: JSON.stringify({ question }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chips = (ids: string[]) =>
    ids.map((id) => (
      <button className="complaint-chip" key={id} onClick={() => onOpen(id)}>
        {id}
        <ArrowRight size={12} />
      </button>
    ));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR MAINTENANCE COPILOT</div>
          <h1>Less chasing. More clarity.</h1>
          <p>Ask Gemma to review maintenance across all your properties.</p>
        </div>
        <span className="gemma-chip">
          <Sparkles size={14} />
          REAL GEMMA
        </span>
      </div>
      <article className="assistant-hero">
        <div className="assistant-orb">
          <Sparkles size={34} />
        </div>
        <h2>A clearer picture of what needs you.</h2>
        <p>
          Live complaint context. Structured suggestions.
          <br />
          Every decision stays in your hands.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <textarea
            aria-label="Ask the manager assistant"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            minLength={3}
            maxLength={1000}
            required
            rows={3}
          />
          <div>
            <small>{data.meta.aiModel} · Google AI Studio</small>
            <button
              className="button primary"
              disabled={busy || !data.meta.aiConfigured}
            >
              {busy ? "Thinking…" : "Ask Gemma"}
              <Send size={16} />
            </button>
          </div>
        </form>
        <div className="suggested-prompts">
          {[
            "Which complaints are potentially urgent?",
            "What issues keep recurring?",
            "Summarize pending work and suggest next actions.",
          ].map((p) => (
            <button key={p} onClick={() => setQuestion(p)}>
              {p}
              <ArrowRight size={13} />
            </button>
          ))}
        </div>
      </article>
      {!data.meta.aiConfigured && (
        <p className="error-box">
          Gemma is not configured. Add GEMMA_API_KEY on the server. No demo AI
          responses are used.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <div className="panel">
          <Spinner text="Gemma is reviewing your maintenance records…" />
        </div>
      )}
      {result && (
        <div className="assistant-results">
          <article className="panel briefing">
            <SectionHead
              title="Your maintenance briefing"
              action={
                <span className="saved">
                  <Sparkles size={15} />
                  Generated by Gemma
                </span>
              }
            />
            <p>{result.summary}</p>
            <small className="muted">
              {result.model} · {stamp(result.generatedAt)} · Advisory
              suggestions based on this workspace
            </small>
          </article>
          <div className="analytics-grid">
            <article className="panel briefing">
              <SectionHead title="Potentially urgent" />
              {result.urgent.length ? (
                result.urgent.map((u) => (
                  <div className="ai-item" key={u.complaintId}>
                    <AlertTriangle size={18} />
                    <div>
                      {chips([u.complaintId])}
                      <p>{u.reason}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p>
                  No urgent issues identified by Gemma. Review the complaint
                  queue for updates.
                </p>
              )}
            </article>
            <article className="panel briefing">
              <SectionHead title="Recurring issues" />
              {result.recurring.length ? (
                result.recurring.map((r, i) => (
                  <div className="ai-item" key={i}>
                    <RefreshCw size={18} />
                    <div>
                      <strong>{r.title}</strong>
                      <p>{r.explanation}</p>
                      {chips(r.complaintIds)}
                    </div>
                  </div>
                ))
              ) : (
                <p>No recurring issues identified in the supplied context.</p>
              )}
            </article>
          </div>
          <article className="panel briefing">
            <SectionHead title="Suggested next actions" />
            {result.actions.map((a, i) => (
              <div className="ai-item" key={i}>
                <span className="step-number">{i + 1}</span>
                <div>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                  {chips(a.complaintIds)}
                </div>
              </div>
            ))}
          </article>
        </div>
      )}
    </>
  );
}
export function Settings({
  data,
  onRefresh,
}: {
  data: Snapshot;
  onRefresh: () => Promise<void>;
}) {
  const [settings, setSettings] = useState(data.settings),
    [properties, setProperties] = useState(data.properties),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE CAMPUSFIX YOURS</div>
          <h1>Workspace settings</h1>
          <p>Your profile, properties and dashboard preferences.</p>
        </div>
        <span className="pill">
          <Settings2 size={14} />
          Manager workspace
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSaved(false);
          try {
            await api("/settings", {
              method: "PATCH",
              body: JSON.stringify({
                revision: data.revision,
                settings,
                properties: properties.map(({ id, name, address, rooms }) => ({
                  id,
                  name,
                  address,
                  rooms,
                })),
              }),
            });
            await onRefresh();
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="settings-grid">
          <section className="panel settings-panel">
            <SectionHead
              title="Manager profile"
              subtitle="Used to attribute approvals and repair decisions"
            />
            <div className="form-grid">
              {(
                [
                  ["name", "Full name"],
                  ["email", "Email address"],
                  ["phone", "Phone number"],
                  ["organization", "Workspace name"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type={key === "email" ? "email" : "text"}
                    required
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings({ ...settings, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="panel settings-panel">
            <SectionHead
              title="Notifications & preferences"
              subtitle="Controls your in-app alerts and daily summary"
            />
            {(
              [
                [
                  "emergencyAlerts",
                  "Emergency alerts",
                  "Show urgent complaints in the notification center.",
                ],
                [
                  "verificationAlerts",
                  "Repair verification",
                  "Show repairs waiting for your approval.",
                ],
                [
                  "dailyDigest",
                  "Daily workspace summary",
                  "Show an open-work summary in your notification center.",
                ],
                [
                  "autoAnalyze",
                  "Automatic Gemma analysis",
                  "Analyze new manager-submitted complaints after saving.",
                ],
                [
                  "compactRows",
                  "Compact complaint rows",
                  "Show more rows with tighter table spacing.",
                ],
              ] as const
            ).map(([key, label, detail]) => (
              <label className="toggle-row" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: e.target.checked })
                  }
                />
              </label>
            ))}
          </section>
        </div>
        <section className="panel settings-panel">
          <SectionHead
            title="Your properties"
            subtitle="The property pays membership, labour and parts. Residents do not pay CampusFix directly."
          />
          <div className="property-settings">
            {properties.map((p, i) => (
              <div key={p.id}>
                <div className="row-between">
                  <span className="icon-tile blue">
                    <Building2 size={20} />
                  </span>
                  <small className="muted">
                    Demo membership {money(p.membership)} / month
                  </small>
                </div>
                <label>
                  Property name
                  <input
                    required
                    minLength={2}
                    value={p.name}
                    onChange={(e) =>
                      setProperties(
                        properties.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Address
                  <input
                    required
                    minLength={5}
                    value={p.address}
                    onChange={(e) =>
                      setProperties(
                        properties.map((x, j) =>
                          j === i ? { ...x, address: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Rooms
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    required
                    value={p.rooms}
                    onChange={(e) =>
                      setProperties(
                        properties.map((x, j) =>
                          j === i ? { ...x, rooms: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </section>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="settings-save">
          {saved && (
            <span className="saved" role="status">
              <Check size={17} />
              Settings saved
            </span>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </>
  );
}
