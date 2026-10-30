"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Clock3,
  House,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { active } from "@/lib/manager/domain";
import type { ComplaintResult, StudentSnapshot } from "@/lib/portal/types";
import {
  Metric,
  NotificationsPanel,
  PortalLoading,
  PortalShell,
  ProfilePanel,
  stamp,
  usePortalSnapshot,
} from "@/components/portal/ui";
import {
  ComplaintDetail,
  ComplaintList,
  RepairHistory,
  ReportComplaint,
} from "./complaints";

const tabs = [
  "overview",
  "complaints",
  "report",
  "history",
  "notifications",
  "profile",
];

export default function StudentDashboard() {
  const { data, setData, error, refresh } =
    usePortalSnapshot<StudentSnapshot>("/api/student");
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>(
    {},
  );
  useEffect(() => {
    const sync = () => {
      const value = window.location.hash.slice(1);
      if (tabs.includes(value)) setTab(value);
    };
    const initial = window.setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("hashchange", sync);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (next: string) => {
    setTab(next);
    window.history.replaceState(null, "", `/student#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (!data)
    return <PortalLoading error={error} onRetry={() => void refresh()} />;
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "complaints",
      label: "My complaints",
      icon: ClipboardList,
      count: data.complaints.filter(active).length,
    },
    { id: "report", label: "Report an issue", icon: Plus },
    { id: "history", label: "Repair history", icon: Wrench },
    { id: "notifications", label: "Notifications", icon: Bell, count: unread },
  ];
  const complaint = data.complaints.find((c) => c.id === selected);
  const created = async (result: ComplaintResult) => {
    if (result.aiError)
      setAnalysisErrors((previous) => ({
        ...previous,
        [result.complaint.id]: result.aiError!,
      }));
    setData((previous) =>
      previous
        ? {
            ...previous,
            complaints: [
              result.complaint,
              ...previous.complaints.filter(
                (c) => c.id !== result.complaint.id,
              ),
            ],
          }
        : previous,
    );
    await refresh();
    navigate("complaints");
    setSelected(result.complaint.id);
    setToast(
      result.aiError
        ? "Complaint submitted. Your property team can review it while AI analysis is unavailable."
        : "Complaint submitted. Your property team has been notified.",
    );
  };
  return (
    <PortalShell
      user={data.user}
      roleLabel="Student"
      workspaceName={data.property.name}
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
          {error} Your last loaded information is shown below.
        </p>
      )}
      {tab === "overview" && (
        <Overview data={data} onOpen={setSelected} onNavigate={navigate} />
      )}
      {tab === "complaints" && (
        <>
          <PageHeading
            eyebrow="YOUR SPACE, TAKEN CARE OF"
            title="My complaints"
            subtitle="Every issue you’ve reported, with every update in one place."
            action={() => navigate("report")}
          />
          <ComplaintList
            complaints={data.complaints}
            onOpen={setSelected}
            onCreate={() => navigate("report")}
          />
        </>
      )}
      {tab === "report" && (
        <>
          <PageHeading
            eyebrow="LET’S GET IT FIXED"
            title="Report an issue"
            subtitle="Tell us what’s wrong. We’ll help get your space back to normal."
          />
          <ReportComplaint
            data={data}
            onCreated={created}
            onCancel={() => navigate("complaints")}
          />
        </>
      )}
      {tab === "history" && (
        <>
          <PageHeading
            eyebrow="THE WORK BEHIND THE REPAIR"
            title="Repair history"
            subtitle="Technician notes, completed work and verified resolutions."
          />
          <RepairHistory complaints={data.complaints} onOpen={setSelected} />
        </>
      )}
      {tab === "notifications" && (
        <>
          <PageHeading
            eyebrow="KEEPING YOU IN THE LOOP"
            title="Notifications"
            subtitle="The latest from your property manager and repair team."
          />
          <NotificationsPanel
            notifications={data.notifications}
            onRefresh={refresh}
            onOpenComplaint={setSelected}
          />
        </>
      )}
      {tab === "profile" && (
        <>
          <PageHeading
            eyebrow="YOUR CAMPUSFIX ACCOUNT"
            title="My profile"
            subtitle="Your details help the repair team stay in touch."
          />
          <ProfilePanel
            key={data.user.id}
            user={data.user}
            onSaved={async () => {
              await refresh();
            }}
          />
        </>
      )}
      {complaint && (
        <ComplaintDetail
          key={complaint.id}
          complaint={complaint}
          data={data}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
          aiError={analysisErrors[complaint.id]}
        />
      )}
    </PortalShell>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{subtitle}</p>
      </div>
      {action && (
        <button className="button primary" onClick={action}>
          <Plus size={16} />
          Report an issue
        </button>
      )}
    </div>
  );
}

function Overview({
  data,
  onOpen,
  onNavigate,
}: {
  data: StudentSnapshot;
  onOpen: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  const complaints = data.complaints;
  const open = complaints.filter(active);
  const inProgress = complaints.filter((c) =>
    ["Assigned", "In progress"].includes(c.status),
  );
  const completed = complaints.filter((c) => c.status === "Completed");
  const activity = complaints
    .flatMap((c) => c.history.map((item) => ({ ...item, complaint: c })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const firstName = data.user.name.split(" ")[0];
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE LESS HASSLE. A BETTER PLACE TO LIVE."
        title={`Welcome back, ${firstName}`}
        subtitle="Your space deserves a little care. We’re here to help."
        action={() => onNavigate("report")}
      />
      <div className="metrics-grid four">
        <Metric
          label="Total complaints"
          value={complaints.length}
          detail="Every issue you’ve reported"
          icon={<ClipboardList size={17} />}
        />
        <Metric
          label="Open complaints"
          value={open.length}
          detail="Your team is taking care of these"
          tone="orange"
          icon={<Clock3 size={17} />}
        />
        <Metric
          label="Repairs underway"
          value={inProgress.length}
          detail="Assigned or currently being repaired"
          tone="purple"
          icon={<Wrench size={17} />}
        />
        <Metric
          label="Resolved"
          value={completed.length}
          detail="Repairs verified by your manager"
          tone="green"
          icon={<CircleCheck size={17} />}
        />
      </div>
      <div className="portal-welcome-banner">
        <span className="portal-welcome-icon">
          <House size={26} />
        </span>
        <div>
          <span className="eyebrow">YOUR HOSTEL</span>
          <h2>
            {data.property.name}
            <span> / </span>Room {data.user.room || "—"}
          </h2>
          <p>
            {open.length
              ? `${open.length} open complaint${open.length > 1 ? "s" : ""}. Your repair team will keep you updated here.`
              : "Everything looking good? We’re always here when you need a repair."}
          </p>
        </div>
        <span className="portal-live-pill">
          <span className="online-dot" />
          Connected to your team
        </span>
      </div>
      <div className="portal-overview-grid">
        <div>
          <ComplaintList
            complaints={complaints}
            compact
            onOpen={onOpen}
            onCreate={() => onNavigate("report")}
          />
          {complaints.length > 0 && (
            <div className="portal-panel-action">
              <button
                className="text-link"
                onClick={() => onNavigate("complaints")}
              >
                View all my complaints
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          <section className="panel portal-activity-panel">
            <div className="section-head">
              <div>
                <h2>Latest activity</h2>
                <p>Small updates. A clearer picture.</p>
              </div>
              <CalendarDays size={18} className="muted" />
            </div>
            {activity.length ? (
              <div className="portal-activity-list">
                {activity.map((item) => (
                  <button
                    key={`${item.complaint.id}-${item.id}`}
                    onClick={() => onOpen(item.complaint.id)}
                  >
                    <span className="activity-symbol">
                      <CircleCheck size={15} />
                    </span>
                    <div>
                      <strong>{item.action}</strong>
                      <p>{item.complaint.title}</p>
                      <small>{item.actor}</small>
                    </div>
                    <time dateTime={item.at}>{stamp(item.at)}</time>
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="portal-quiet-state">
                <Clock3 size={24} />
                <p>
                  Your latest complaint and repair updates will appear here.
                </p>
              </div>
            )}
          </section>
        </div>
        <aside>
          <section className="panel portal-how-card">
            <span className="icon-tile blue">
              <ShieldCheck size={20} />
            </span>
            <h2>
              You report.
              <br />
              We take it from here.
            </h2>
            <p>One shared team, from the first report to the final check.</p>
            {[
              ["01", "Describe the issue"],
              ["02", "Follow your repair"],
              ["03", "Get back to your day"],
            ].map(([n, title]) => (
              <div className="portal-simple-step" key={n}>
                <span>{n}</span>
                <strong>{title}</strong>
              </div>
            ))}
            <button
              className="button full-width"
              onClick={() => onNavigate("report")}
            >
              Report an issue
              <ArrowUpRight size={15} />
            </button>
          </section>
          <div className="portal-soft-note">
            <Sparkles size={20} />
            <div>
              <strong>Built for a smoother stay</strong>
              <p>
                Clear updates, verified repairs, and your entire repair history
                in one place.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
