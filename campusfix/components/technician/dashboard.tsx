"use client";

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Check,
  CircleCheck,
  Clock3,
  Download,
  History,
  LayoutDashboard,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import type { PortalComplaint, TechnicianSnapshot } from "@/lib/portal/types";
import { categories, money, repairCost } from "@/lib/manager/domain";
import { downloadCsv } from "@/components/manager/ui";
import {
  Badge,
  Empty,
  Metric,
  NotificationsPanel,
  PortalLoading,
  PortalShell,
  ProfilePanel,
  SectionHead,
  portalApi,
  shortDate,
  stamp,
  usePortalSnapshot,
} from "@/components/portal/ui";
import { JobDetail } from "./job-detail";
import { TechnicianProfileForm } from "./profile";

const isCurrent = (c: PortalComplaint, technicianId: string) =>
  c.technicianId === technicianId &&
  !["DECLINED", "CANCELLED"].includes(c.assignment?.status ?? "") &&
  !["Completed", "Rejected"].includes(c.status);

export default function TechnicianDashboard() {
  const { data, error, refresh, refreshing } =
    usePortalSnapshot<TechnicianSnapshot>("/api/technician");
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "overview";
    const hash = window.location.hash.slice(1);
    return ["overview", "jobs", "history", "notifications", "profile"].includes(
      hash,
    )
      ? hash
      : "overview";
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const navigate = (next: string) => {
    setTab(next);
    window.history.replaceState(null, "", `/technician#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (!data) return <PortalLoading error={error} onRetry={refresh} />;
  const current = data.complaints.filter((c) =>
    isCurrent(c, data.technician.id),
  );
  const pending = current.filter((c) => c.assignment?.status === "PENDING");
  const progress = current.filter((c) => c.status === "In progress");
  const awaiting = current.filter((c) => c.status === "Awaiting verification");
  const completed = data.complaints.filter((c) =>
    c.repairs.some(
      (r) => r.technicianId === data.technician.id && r.verifiedAt,
    ),
  );
  const complaint = data.complaints.find((c) => c.id === selected);
  const switchAvailability = async () => {
    setAvailabilityBusy(true);
    setAvailabilityError("");
    try {
      await portalApi("/api/technician/profile", {
        method: "PATCH",
        body: JSON.stringify({ available: !data.technician.available }),
      });
      await refresh();
      setToast(
        data.technician.available
          ? "You are now off duty. Existing jobs remain in your queue."
          : "You are available for assignments.",
      );
    } catch (e) {
      setAvailabilityError((e as Error).message);
    } finally {
      setAvailabilityBusy(false);
    }
  };
  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "jobs",
      label: "Assigned jobs",
      icon: BriefcaseBusiness,
      count: current.length,
    },
    { id: "history", label: "Repair history", icon: History },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      count: data.notifications.filter((n) => !n.readAt).length,
    },
  ];
  return (
    <PortalShell
      user={data.user}
      roleLabel="Technician"
      workspaceName="Technician workspace"
      nav={nav}
      activeTab={tab}
      onNavigate={navigate}
      notifications={data.notifications}
      onRefresh={refresh}
      onOpenComplaint={setSelected}
      toast={toast}
      onDismissToast={() => setToast("")}
    >
      {error && (
        <p className="error-box" role="alert">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            Try again
          </button>
        </p>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR TECHNICIAN WORKSPACE</div>
          <h1>
            {tab === "overview"
              ? `Good to see you, ${data.user.name.split(" ")[0]}.`
              : tab === "jobs"
                ? "Assigned jobs"
                : tab === "history"
                  ? "Repair history"
                  : tab === "profile"
                    ? "My profile"
                    : "Notifications"}
          </h1>
          <p>
            {tab === "overview"
              ? "Your skills. Better hostels. Let’s get to work."
              : tab === "jobs"
                ? "Review assignments, share progress, and document every repair."
                : tab === "history"
                  ? "A clear record of your work and its verification status."
                  : tab === "profile"
                    ? "Keep your details, skills, and availability up to date."
                    : "Assignment requests and updates, all in one place."}
          </p>
        </div>
        {tab !== "notifications" && (
          <button
            className={`tech-availability ${data.technician.available ? "available" : ""}`}
            role="switch"
            aria-checked={data.technician.available}
            aria-label="Available for assignments"
            disabled={
              availabilityBusy ||
              (!data.technician.verified && !data.technician.available)
            }
            onClick={() => void switchAvailability()}
          >
            <span className="tech-switch">
              <i />
            </span>
            <span>
              {availabilityBusy
                ? "Updating…"
                : data.technician.available
                  ? "Available for jobs"
                  : "Off duty"}
            </span>
          </button>
        )}
      </div>
      {availabilityError && (
        <p className="error-box" role="alert">
          {availabilityError}
        </p>
      )}
      {!data.technician.verified && (
        <div className="tech-verification" role="status">
          <ShieldCheck size={22} />
          <div>
            <strong>Your profile is awaiting verification</strong>
            <p>
              A manager will verify your profile before you can accept new jobs.
              Complete your skills and service details while you wait.
            </p>
          </div>
          <button
            className="button small-button"
            onClick={() => navigate("profile")}
          >
            Review profile <ArrowRight size={14} />
          </button>
        </div>
      )}
      {tab === "overview" && (
        <>
          <div className="metrics-grid four">
            <Metric
              label="Awaiting your response"
              value={pending.length}
              detail="New assignments to review"
              icon={<BriefcaseBusiness size={18} />}
              tone="blue"
            />
            <Metric
              label="Work in progress"
              value={progress.length}
              detail="Repairs currently underway"
              icon={<Wrench size={18} />}
              tone="amber"
            />
            <Metric
              label="Awaiting verification"
              value={awaiting.length}
              detail="Reports submitted to manager"
              icon={<ShieldCheck size={18} />}
              tone="purple"
            />
            <Metric
              label="Verified repairs"
              value={completed.length}
              detail="Jobs with verified repair reports"
              icon={<CircleCheck size={18} />}
              tone="green"
            />
          </div>
          <div className="tech-home-grid">
            <section className="panel">
              <SectionHead
                title="Your work queue"
                subtitle="New requests and active work, ordered by priority"
                action={
                  <button
                    className="text-link"
                    onClick={() => navigate("jobs")}
                  >
                    View all jobs <ArrowRight size={14} />
                  </button>
                }
              />
              {current.length ? (
                <div className="tech-queue">
                  {[...current]
                    .sort(
                      (a, b) =>
                        Number(b.assignment?.status === "PENDING") -
                          Number(a.assignment?.status === "PENDING") ||
                        ["Emergency", "High", "Normal", "Low"].indexOf(
                          a.urgency,
                        ) -
                          ["Emergency", "High", "Normal", "Low"].indexOf(
                            b.urgency,
                          ),
                    )
                    .slice(0, 4)
                    .map((c) => (
                      <JobCard
                        key={c.id}
                        complaint={c}
                        data={data}
                        onOpen={setSelected}
                        compact
                      />
                    ))}
                </div>
              ) : (
                <Empty title="You’re all caught up">
                  New assignments will appear here. Keep your availability up to
                  date so your manager knows when you’re ready.
                </Empty>
              )}
            </section>
            <div>
              <section className="panel tech-profile-summary">
                <div className="tech-profile-top">
                  <span
                    className="avatar large"
                    style={{
                      background: data.technician.color || "#eaf1ff",
                      color: "#365697",
                    }}
                  >
                    {data.technician.initials}
                  </span>
                  <div>
                    <h2>{data.user.name}</h2>
                    <span
                      className={`tech-verified-label ${data.technician.verified ? "verified" : ""}`}
                    >
                      <ShieldCheck size={13} />
                      {data.technician.verified
                        ? "Verified technician"
                        : "Verification pending"}
                    </span>
                  </div>
                </div>
                <div className="tech-rating">
                  <span>
                    <Star size={15} />
                    <strong>
                      {data.technician.rating
                        ? data.technician.rating.toFixed(1)
                        : "—"}
                    </strong>{" "}
                    rating
                  </span>
                  <span>
                    <Check size={15} />
                    <strong>{data.technician.jobsCompleted}</strong> completed
                  </span>
                </div>
                <div className="tech-skill-chips">
                  {data.technician.specialization.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <p className="tech-muted tech-area">
                  <MapPin size={14} />
                  {data.technician.serviceArea ||
                    "Add your service area in your profile"}
                </p>
                <button
                  className="button full-width"
                  onClick={() => navigate("profile")}
                >
                  Manage profile <ArrowRight size={14} />
                </button>
              </section>
              <section className="tech-advice-card">
                <span className="icon-tile purple">
                  <Sparkles size={19} />
                </span>
                <h2>A second pair of eyes</h2>
                <p>
                  Open a job to ask Gemma for possible causes, inspection
                  considerations, or a repair report draft.
                </p>
                <span className="tech-advisory">
                  AI suggestions support your judgment.
                </span>
              </section>
            </div>
          </div>
          <section className="panel">
            <SectionHead
              title="Today’s assignments"
              subtitle="Assignments received today, in Indian Standard Time"
            />
            <div className="tech-today">
              {data.complaints.filter(
                (c) =>
                  c.assignment &&
                  new Date(c.assignment.assignedAt).toLocaleDateString(
                    "en-IN",
                    { timeZone: "Asia/Kolkata" },
                  ) ===
                    new Date().toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    }),
              ).length ? (
                data.complaints
                  .filter(
                    (c) =>
                      c.assignment &&
                      new Date(c.assignment.assignedAt).toLocaleDateString(
                        "en-IN",
                        { timeZone: "Asia/Kolkata" },
                      ) ===
                        new Date().toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        }),
                  )
                  .map((c) => (
                    <button key={c.id} onClick={() => setSelected(c.id)}>
                      <span className="icon-tile blue">
                        <Clock3 size={17} />
                      </span>
                      <span>
                        <strong>{c.title}</strong>
                        <small>
                          {
                            data.properties.find((p) => p.id === c.propertyId)
                              ?.name
                          }{" "}
                          · Room {c.room}
                        </small>
                      </span>
                      <Badge>{c.status}</Badge>
                      <ArrowRight size={15} />
                    </button>
                  ))
              ) : (
                <p className="tech-muted">
                  No new assignments today. Your existing work is listed above.
                </p>
              )}
            </div>
          </section>
        </>
      )}
      {tab === "jobs" && (
        <Jobs data={data} complaints={current} onOpen={setSelected} />
      )}
      {tab === "history" && <RepairHistory data={data} onOpen={setSelected} />}
      {tab === "notifications" && (
        <NotificationsPanel
          notifications={data.notifications}
          onRefresh={refresh}
          onOpenComplaint={setSelected}
        />
      )}
      {tab === "profile" && (
        <div className="tech-settings-grid">
          <ProfilePanel
            user={data.user}
            onSaved={async () => {
              await refresh();
              setToast("Your personal details have been saved.");
            }}
          />
          <TechnicianProfileForm
            key={data.technician.id}
            technician={data.technician}
            onSaved={async () => {
              await refresh();
              setToast("Your technician profile has been saved.");
            }}
          />
        </div>
      )}
      {complaint && (
        <JobDetail
          key={complaint.id}
          complaint={complaint}
          data={data}
          onClose={() => setSelected(null)}
          onChanged={async (message) => {
            await refresh();
            setToast(message);
          }}
        />
      )}
    </PortalShell>
  );
}

function JobCard({
  complaint: c,
  data,
  onOpen,
  compact = false,
}: {
  complaint: PortalComplaint;
  data: TechnicianSnapshot;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const pending = c.assignment?.status === "PENDING";
  return (
    <article className={`tech-job-card ${compact ? "compact" : ""}`}>
      <div className="tech-job-top">
        <span
          className={`icon-tile ${c.category === "Electrical" ? "amber" : c.category === "Plumbing" ? "blue" : "purple"}`}
        >
          <Wrench size={19} />
        </span>
        <span className="tech-job-ref">{c.id}</span>
        <Badge>{c.urgency}</Badge>
      </div>
      <button className="tech-job-title" onClick={() => onOpen(c.id)}>
        {c.title}
      </button>
      <p className="tech-job-location">
        <MapPin size={13} />
        {data.properties.find((p) => p.id === c.propertyId)?.name ||
          c.propertyId}
        <span>·</span>Room {c.room}
      </p>
      {!compact && <p className="tech-job-description">{c.description}</p>}
      <div className="tech-job-bottom">
        <div>
          <Badge>{pending ? "Pending acceptance" : c.status}</Badge>
          <small>{c.category}</small>
        </div>
        <button
          className={`button small-button ${pending ? "primary" : ""}`}
          onClick={() => onOpen(c.id)}
        >
          {pending
            ? "Review request"
            : c.status === "Awaiting verification"
              ? "View report"
              : "Open job"}
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

function Jobs({
  data,
  complaints,
  onOpen,
}: {
  data: TechnicianSnapshot;
  complaints: PortalComplaint[];
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const rows = complaints.filter(
    (c) =>
      (!query ||
        `${c.id} ${c.title} ${c.room} ${data.properties.find((p) => p.id === c.propertyId)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (status === "all" ||
        (status === "pending"
          ? c.assignment?.status === "PENDING"
          : status === "accepted"
            ? c.assignment?.status === "ACCEPTED" && c.status === "Assigned"
            : c.status === status)) &&
      (category === "all" || c.category === category),
  );
  return (
    <>
      <div className="panel tech-filters">
        <label className="tech-search">
          <Search size={17} />
          <span className="sr-only">Search assigned jobs</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by job, room, or property…"
          />
        </label>
        <label>
          <span className="sr-only">Filter by assignment status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All active jobs</option>
            <option value="pending">Awaiting acceptance</option>
            <option value="accepted">Accepted · ready to start</option>
            <option>In progress</option>
            <option>Awaiting verification</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All specializations</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="tech-result-count">
        {rows.length} {rows.length === 1 ? "job" : "jobs"}
        {status !== "all" || category !== "all" || query
          ? " match your filters"
          : " in your queue"}
      </p>
      {rows.length ? (
        <div className="tech-jobs-grid">
          {rows.map((c) => (
            <JobCard key={c.id} complaint={c} data={data} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={
              complaints.length ? "No matching jobs" : "No active assignments"
            }
          >
            {complaints.length
              ? "Try another search or reset your filters."
              : "New jobs assigned to you will appear here."}
          </Empty>
          {complaints.length > 0 && (
            <div className="tech-empty-action">
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setCategory("all");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function RepairHistory({
  data,
  onOpen,
}: {
  data: TechnicianSnapshot;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const records = data.complaints
    .flatMap((c) =>
      c.repairs
        .filter((r) => r.technicianId === data.technician.id)
        .map((r) => ({ complaint: c, repair: r })),
    )
    .sort((a, b) => b.repair.completedAt.localeCompare(a.repair.completedAt));
  const rows = records.filter(
    ({ complaint: c, repair: r }) =>
      (!query ||
        `${c.id} ${c.title} ${r.summary}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "verified"
          ? !!r.verifiedAt
          : filter === "reopened"
            ? !!r.reopenedAt
            : !r.verifiedAt && !r.reopenedAt)),
  );
  return (
    <section className="panel">
      <SectionHead
        title="Repair reports"
        subtitle="Submitted work remains open until manager verification"
        action={
          <button
            className="button small-button"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv("campusfix-repair-history.csv", [
                [
                  "Job",
                  "Title",
                  "Property",
                  "Room",
                  "Submitted",
                  "Status",
                  "Summary",
                  "Labour (INR)",
                  "Parts (INR)",
                  "Total (INR)",
                ],
                ...rows.map(({ complaint: c, repair: r }) => [
                  c.id,
                  c.title,
                  data.properties.find((p) => p.id === c.propertyId)?.name ||
                    c.propertyId,
                  c.room,
                  r.completedAt,
                  r.reopenedAt
                    ? "Reopened"
                    : r.verifiedAt
                      ? "Verified"
                      : "Awaiting verification",
                  r.summary,
                  r.labour,
                  repairCost(r) - r.labour,
                  repairCost(r),
                ]),
              ])
            }
          >
            <Download size={14} />
            Export CSV
          </button>
        }
      />
      <div className="tech-filters">
        <label className="tech-search">
          <Search size={16} />
          <span className="sr-only">Search repair history</span>
          <input
            placeholder="Search repair reports…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Verification status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All reports</option>
            <option value="verified">Verified</option>
            <option value="awaiting">Awaiting verification</option>
            <option value="reopened">Reopened</option>
          </select>
        </label>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="complaint-table">
            <thead>
              <tr>
                <th>Repair / job</th>
                <th>Submitted</th>
                <th>Verification</th>
                <th>Repair cost</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ complaint: c, repair: r }) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="complaint-title"
                      onClick={() => onOpen(c.id)}
                    >
                      <span className="category-icon blue">
                        <Wrench size={16} />
                      </span>
                      <span>
                        <strong>{c.title}</strong>
                        <small>
                          {c.id} · {c.category}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="cell-main">
                      {shortDate(r.completedAt)}
                    </span>
                    <small>
                      {data.properties.find((p) => p.id === c.propertyId)?.name}{" "}
                      · {c.room}
                    </small>
                  </td>
                  <td>
                    <Badge>
                      {r.reopenedAt
                        ? "Reopened"
                        : r.verifiedAt
                          ? "Verified"
                          : "Awaiting verification"}
                    </Badge>
                    {r.verifiedAt && <small>{stamp(r.verifiedAt)}</small>}
                  </td>
                  <td>
                    <strong className="cell-main">
                      {money(repairCost(r))}
                    </strong>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View report for ${c.title}`}
                      onClick={() => onOpen(c.id)}
                    >
                      <ArrowRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No repair reports found">
          {records.length
            ? "Try another search or verification filter."
            : "Your submitted repair reports will appear here, with costs and verification status."}
        </Empty>
      )}
    </section>
  );
}
