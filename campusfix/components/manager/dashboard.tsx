"use client";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  UsersRound,
  ShieldCheck,
  ChartNoAxesCombined,
  Settings2,
  Sparkles,
  Building2,
  ChevronDown,
  Bell,
  Search,
  Menu,
  X,
  ArrowUpRight,
  CircleHelp,
  LogOut,
  Wrench,
  RefreshCw,
  CircleCheck,
  AlertTriangle,
} from "lucide-react";
import { Snapshot, active } from "@/lib/manager/domain";
import { api, Spinner, cx, Modal } from "./ui";
import { Complaints, ComplaintDetail, NewComplaint } from "./complaints";
import {
  Overview,
  Technicians,
  Verification,
  Analytics,
  Assistant,
  Settings,
} from "./sections";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "complaints", label: "Complaints", icon: ClipboardList },
  { id: "technicians", label: "Technicians", icon: UsersRound },
  { id: "verification", label: "Repair verification", icon: ShieldCheck },
  { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
];
export default function Dashboard() {
  const [data, setData] = useState<Snapshot | null>(null),
    [tab, setTab] = useState(() => {
      if (typeof window === "undefined") return "overview";
      const hash = window.location.hash.slice(1);
      return [...navigation.map((x) => x.id), "assistant", "settings"].includes(
        hash,
      )
        ? hash
        : "overview";
    }),
    [property, setProperty] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false),
    [analyzingId, setAnalyzingId] = useState<string | null>(null),
    [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({}),
    [sidebar, setSidebar] = useState(false),
    [notifications, setNotifications] = useState(false),
    [help, setHelp] = useState(false),
    [error, setError] = useState(""),
    [unauthorized, setUnauthorized] = useState(false),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(false),
    [globalSearch, setGlobalSearch] = useState(""),
    [searchKey, setSearchKey] = useState(0),
    [loginBusy, setLoginBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const d = await api<Snapshot>();
      setData(d);
      setError("");
      setUnauthorized(false);
    } catch (e) {
      const ex = e as Error & { status?: number };
      setError(ex.message);
      setUnauthorized(ex.status === 401);
    }
  }, []);
  const navigate = (id: string) => {
    setTab(id);
    setSidebar(false);
    setNotifications(false);
    window.history.replaceState(null, "", `/manager#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    let cancelled = false;
    api<Snapshot>()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
          setUnauthorized(false);
        }
      })
      .catch((e: Error & { status?: number }) => {
        if (!cancelled) {
          setError(e.message);
          setUnauthorized(e.status === 401);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const complaint = data?.complaints.find((c) => c.id === selected);
  if (unauthorized)
    return (
      <div className="login-page">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            const password = new FormData(e.currentTarget).get("password");
            setLoginBusy(true);
            try {
              await api("/session", {
                method: "POST",
                body: JSON.stringify({ password }),
              });
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoginBusy(false);
            }
          }}
        >
          <Brand />
          <h1>Welcome to your workspace.</h1>
          <p>Sign in to keep your properties running smoothly.</p>
          <label>
            Manager password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full-width" disabled={loginBusy}>
            {loginBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  if (!data)
    return (
      <div className="initial-load">
        <Brand />
        {error ? (
          <>
            <p className="error-box">{error}</p>
            <button className="button" onClick={() => void refresh()}>
              Retry connection
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  const pending = data.complaints.filter((c) => c.status === "Pending").length,
    verification = data.complaints.filter(
      (c) => c.status === "Awaiting verification",
    ).length;
  const alerts = data.complaints.filter(
    (c) =>
      (data.settings.emergencyAlerts &&
        c.urgency === "Emergency" &&
        active(c)) ||
      (data.settings.verificationAlerts &&
        c.status === "Awaiting verification"),
  );
  const title =
    [
      ...navigation,
      { id: "assistant", label: "AI assistant" },
      { id: "settings", label: "Settings" },
    ].find((x) => x.id === tab)?.label || "Overview";
  return (
    <div className="manager-shell">
      <a className="skip-link" href="#manager-content">
        Skip to content
      </a>
      {sidebar && (
        <div className="sidebar-scrim" onClick={() => setSidebar(false)} />
      )}
      <aside className={cx("sidebar", sidebar && "open")}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-card">
          <span className="workspace-icon">
            <Building2 size={19} />
          </span>
          <div>
            <strong>{data.settings.organization}</strong>
            <small>Manager workspace</small>
          </div>
          <span className="online-dot" />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              className={cx("nav-item", tab === n.id && "active")}
              key={n.id}
              onClick={() => navigate(n.id)}
              aria-current={tab === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "complaints" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
              {n.id === "verification" && verification > 0 && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <span className="nav-caption">YOUR COPILOT</span>
        <button
          className={cx("nav-item", tab === "assistant" && "active")}
          onClick={() => navigate("assistant")}
        >
          <Sparkles size={19} />
          AI assistant<span className="ai-label">GEMMA</span>
        </button>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <span className="icon-tile blue">
            <Wrench size={19} />
          </span>
          <strong>A better repair, together.</strong>
          <p>One shared team. Every property covered.</p>
          <button onClick={() => setHelp(true)}>
            How CampusFix works
            <ArrowUpRight size={14} />
          </button>
        </div>
        <button
          className={cx("nav-item", tab === "settings" && "active")}
          onClick={() => navigate("settings")}
        >
          <Settings2 size={19} />
          Settings
        </button>
        <button className="profile-button" onClick={() => navigate("settings")}>
          <span className="avatar profile">
            {data.settings.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{data.settings.name}</strong>
            <small>Property manager</small>
          </span>
          <ChevronDown size={15} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button hamburger"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Workspace<span>/</span>
              <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <form
              className="top-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSearchKey((k) => k + 1);
                navigate("complaints");
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search workspace complaints"
                placeholder="Search anything…"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <div className="property-select">
              <Building2 size={16} />
              <select
                aria-label="Select property"
                value={property}
                onChange={(e) => setProperty(e.target.value)}
              >
                <option value="all">All properties</option>
                {data.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="topbar-separator" />
            <button
              className="icon-button notification-button"
              aria-label={`Notifications, ${alerts.length} alerts`}
              onClick={() => setNotifications(!notifications)}
              aria-expanded={notifications}
            >
              <Bell size={20} />
              {alerts.length > 0 && <i />}
            </button>
            <button
              className="avatar profile top-avatar"
              aria-label="Open profile settings"
              onClick={() => navigate("settings")}
            >
              {data.settings.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </button>
          </div>
        </header>
        {notifications && (
          <div className="notification-panel">
            <div className="row-between">
              <h3>Your notifications</h3>
              <button
                className="icon-button"
                aria-label="Close notifications"
                onClick={() => setNotifications(false)}
              >
                <X size={17} />
              </button>
            </div>
            {data.settings.dailyDigest && (
              <p className="digest">
                Today’s workspace: {data.complaints.filter(active).length} open
                complaints · {verification} repairs to verify.
              </p>
            )}
            {alerts.length ? (
              alerts.map((c) => (
                <button
                  className="notification-item"
                  key={c.id}
                  onClick={() => {
                    setSelected(c.id);
                    setNotifications(false);
                  }}
                >
                  {c.urgency === "Emergency" ? (
                    <AlertTriangle size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  <span>
                    <strong>{c.title}</strong>
                    <small>
                      {c.id} · {c.status}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">
                No alerts match your notification preferences.
              </p>
            )}
            <button className="text-link" onClick={() => navigate("settings")}>
              Manage preferences
              <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        <main id="manager-content" className="workspace-main">
          <div className="workspace-status">
            <span>
              <i className="online-dot" />{" "}
              {data.meta.demo
                ? "Demo workspace · sample property data"
                : "Manager workspace"}
            </span>
            <button
              className="text-link"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                await refresh();
                setLoading(false);
              }}
            >
              <RefreshCw size={12} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {tab === "overview" && (
            <Overview
              data={data}
              property={property}
              onOpen={setSelected}
              onCreate={() => setCreate(true)}
              onNavigate={navigate}
            />
          )}{" "}
          {tab === "complaints" && (
            <Complaints
              key={searchKey}
              data={data}
              property={property}
              onOpen={setSelected}
              onCreate={() => setCreate(true)}
              initialSearch={globalSearch}
            />
          )}{" "}
          {tab === "technicians" && (
            <Technicians
              data={data}
              property={property}
              onOpen={setSelected}
              onRefresh={refresh}
            />
          )}{" "}
          {tab === "verification" && (
            <Verification
              data={data}
              property={property}
              onOpen={setSelected}
            />
          )}{" "}
          {tab === "analytics" && (
            <Analytics data={data} property={property} onOpen={setSelected} />
          )}{" "}
          {tab === "assistant" && (
            <Assistant data={data} onOpen={setSelected} />
          )}{" "}
          {tab === "settings" && <Settings data={data} onRefresh={refresh} />}
          <footer className="workspace-footer">
            <span>
              CampusFix <i>·</i> Good spaces. Well maintained.
            </span>
            <div>
              <button onClick={() => setHelp(true)}>
                <CircleHelp size={13} />
                How it works
              </button>
              {!data.meta.demo && (
                <button
                  onClick={async () => {
                    await api("/session", { method: "DELETE" });
                    setData(null);
                    await refresh();
                  }}
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              )}
              <span>All times IST</span>
            </div>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {complaint && (
        <ComplaintDetail
          key={complaint.id}
          autoAnalyzing={analyzingId === complaint.id}
          autoAnalysisError={analysisErrors[complaint.id]}
          c={complaint}
          data={data}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}{" "}
      {create && (
        <NewComplaint
          data={data}
          onClose={() => setCreate(false)}
          onCreated={async (c) => {
            setCreate(false);
            if (data.settings.autoAnalyze) setAnalyzingId(c.id);
            await refresh();
            setSelected(c.id);
            setToast("Complaint saved.");
            if (data.settings.autoAnalyze) {
              try {
                await api(`/complaints/${c.id}/analyze`, {
                  method: "POST",
                  body: JSON.stringify({ version: c.version }),
                });
                await refresh();
                setToast("Complaint saved and analyzed by Gemma.");
              } catch (e) {
                setToast(`Complaint saved. ${(e as Error).message}`);
                setAnalysisErrors((previous) => ({
                  ...previous,
                  [c.id]: (e as Error).message,
                }));
              } finally {
                setAnalyzingId(null);
              }
            }
          }}
        />
      )}{" "}
      {help && (
        <Modal
          title="One network. A complete repair."
          subtitle="Built for small hostels and PG managers"
          onClose={() => setHelp(false)}
        >
          <div className="help-steps">
            {[
              [
                "Report",
                "A student, warden or manager describes a problem and attaches photos.",
              ],
              [
                "Understand",
                "Review Gemma’s category and urgency suggestions, then approve the complaint.",
              ],
              [
                "Assign",
                "Compare verified specialists by distance, workload and reliability. You approve the assignment.",
              ],
              [
                "Repair",
                "Approve an estimate and record the technician’s completion report, labour and parts.",
              ],
              [
                "Verify",
                "Confirm the repair is resolved. Reopen it with a reason if the problem returns.",
              ],
            ].map(([title, text], i) => (
              <div key={title}>
                <span className="step-number">{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="info-note">
            The hostel or PG is the customer. Membership covers coordination;
            labour and parts are recorded separately. Demo prices are
            illustrative.
          </div>
        </Modal>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Wrench size={21} strokeWidth={2.6} />
      </span>
      <strong>
        Campus<span>Fix</span>
      </strong>
      <i />
    </div>
  );
}
