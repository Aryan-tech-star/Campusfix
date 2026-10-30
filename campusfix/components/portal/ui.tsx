"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Bell,
  Building2,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  LogOut,
  Menu,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wrench,
  X,
  ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Notification, SessionUser } from "@/lib/portal/types";
import { cx, Empty, Spinner, stamp } from "@/components/manager/ui";

export {
  Badge,
  Empty,
  Spinner,
  Modal,
  Metric,
  stamp,
  shortDate,
  cx,
  SectionHead,
} from "@/components/manager/ui";

export async function portalApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // A full navigation discards the expired session and every cached portal view.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (response.status === 401) window.location.assign("/login");
    const error = new Error(
      data.error || "We couldn’t complete that request. Please try again.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export function usePortalSnapshot<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (mounted.current) setRefreshing(true);
    try {
      const snapshot = await portalApi<T>(path);
      if (mounted.current && request === generation.current) {
        setData(snapshot);
        setError("");
      }
    } catch (e) {
      if (mounted.current && request === generation.current)
        setError((e as Error).message);
    } finally {
      if (mounted.current && request === generation.current)
        setRefreshing(false);
    }
  }, [path]);
  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  return { data, setData, error, refresh, refreshing };
}

export function Brand() {
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

export function PortalLoading({
  error,
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="manager-shell portal initial-load">
      <Brand />
      {error ? (
        <>
          <p className="error-box" role="alert">
            {error}
          </p>
          <button className="button" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <Spinner text="Getting your workspace ready…" />
      )}
    </div>
  );
}

export type PortalNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
};
type ShellProps = {
  user: SessionUser;
  roleLabel: string;
  workspaceName: string;
  nav: PortalNavItem[];
  activeTab: string;
  onNavigate: (id: string) => void;
  notifications: Notification[];
  onRefresh: () => void | Promise<void>;
  onOpenComplaint: (id: string) => void;
  children: ReactNode;
  toast?: string;
  onDismissToast?: () => void;
};

export function PortalShell({
  user,
  roleLabel,
  workspaceName,
  nav,
  activeTab,
  onNavigate,
  notifications,
  onRefresh,
  onOpenComplaint,
  children,
  toast,
  onDismissToast,
}: ShellProps) {
  const router = useRouter();
  const [sidebar, setSidebar] = useState(false);
  const [notices, setNotices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const unread = notifications.filter((n) => !n.readAt).length;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  const title =
    nav.find((n) => n.id === activeTab)?.label ||
    (activeTab === "profile" ? "My profile" : "Overview");
  const navigate = (id: string) => {
    onNavigate(id);
    setSidebar(false);
    setNotices(false);
    window.history.replaceState(null, "", `${window.location.pathname}#${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const signOut = async () => {
    setSigningOut(true);
    try {
      await portalApi("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSigningOut(false);
    }
  };
  useEffect(() => {
    if (!sidebar) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebar(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [sidebar]);
  return (
    <div className="manager-shell portal">
      <a className="skip-link" href="#portal-content">
        Skip to content
      </a>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
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
            <strong>{workspaceName}</strong>
            <small>{roleLabel} workspace</small>
          </div>
          <span className="online-dot" />
        </div>
        <span className="nav-caption">YOUR WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={cx("nav-item", activeTab === n.id && "active")}
              aria-current={activeTab === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {!!n.count && <span className="nav-count">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <span className="icon-tile blue">
            <ShieldCheck size={18} />
          </span>
          <strong>A better repair, together.</strong>
          <p>Every update. Every repair. All in one place.</p>
        </div>
        <button
          className={cx("nav-item", activeTab === "profile" && "active")}
          onClick={() => navigate("profile")}
        >
          <Settings2 size={19} />
          My profile
        </button>
        <button
          className="nav-item portal-signout"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <LogOut size={18} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <button className="profile-button" onClick={() => navigate("profile")}>
          <span className="avatar profile">{initials}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{roleLabel}</small>
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
              {roleLabel}
              <span>/</span>
              <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="portal-location">
              <Building2 size={15} />
              {workspaceName}
            </span>
            <div className="topbar-separator" />
            <button
              className="icon-button notification-button"
              aria-label={`Notifications, ${unread} unread`}
              aria-expanded={notices}
              onClick={() => setNotices(!notices)}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <button
              className="avatar profile top-avatar"
              aria-label="Open my profile"
              onClick={() => navigate("profile")}
            >
              {initials}
            </button>
          </div>
        </header>
        {notices && (
          <div className="notification-panel portal-notification-popover">
            <div className="row-between">
              <h3>Notifications</h3>
              <button
                className="icon-button"
                aria-label="Close notifications"
                onClick={() => setNotices(false)}
              >
                <X size={18} />
              </button>
            </div>
            <NotificationsPanel
              compact
              notifications={notifications}
              onRefresh={onRefresh}
              onOpenComplaint={(id) => {
                setNotices(false);
                onOpenComplaint(id);
              }}
            />
          </div>
        )}
        <main id="portal-content" className="workspace-main">
          <div className="workspace-status">
            <span>
              <i className="online-dot" />
              Your updates, in sync
            </span>
            <button
              className="text-link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRefresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={12} className={busy ? "spin" : ""} />
              Refresh
            </button>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {children}
          <footer className="workspace-footer">
            <span>
              CampusFix <i>·</i> Good spaces. Well maintained.
            </span>
            <span>All times IST</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          {onDismissToast && (
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={onDismissToast}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function NotificationsPanel({
  notifications,
  onRefresh,
  onOpenComplaint,
  compact = false,
}: {
  notifications: Notification[];
  onRefresh: () => void | Promise<void>;
  onOpenComplaint: (id: string) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unread = notifications.filter((n) => !n.readAt);
  const mark = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      await portalApi("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={cx("portal-notifications", !compact && "panel")}
      aria-label="Notification updates"
    >
      <div className="portal-notification-summary">
        <span>
          {unread.length
            ? `${unread.length} unread update${unread.length === 1 ? "" : "s"}`
            : "You’re all caught up"}
        </span>
        <button
          className="text-link"
          disabled={busy || !unread.length}
          onClick={() => void mark(unread.map((n) => n.id))}
        >
          <CheckCheck size={15} />
          Mark all read
        </button>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {notifications.length ? (
        [...notifications]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((n) => (
            <button
              className={cx("portal-notice", !n.readAt && "unread")}
              key={n.id}
              disabled={busy}
              onClick={async () => {
                if (!n.readAt) await mark([n.id]);
                if (n.complaintId) onOpenComplaint(n.complaintId);
              }}
            >
              <span className="portal-notice-icon">
                <Bell size={17} />
              </span>
              <span>
                <strong>{n.title}</strong>
                <span className="portal-notice-message">{n.message}</span>
                <time dateTime={n.createdAt}>{stamp(n.createdAt)}</time>
              </span>
              {n.complaintId && <ArrowUpRight size={16} />}
              {!n.readAt && <i className="portal-unread-dot" />}
            </button>
          ))
      ) : (
        <Empty title="No updates yet">
          We’ll let you know when there’s news about your repairs.
        </Empty>
      )}
    </section>
  );
}

export function ProfilePanel({
  user,
  onSaved,
  children,
}: {
  user: SessionUser;
  onSaved?: (user: SessionUser) => void | Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="portal-profile-layout">
      <section className="panel portal-profile-card">
        <div className="section-head">
          <div>
            <h2>Personal details</h2>
            <p>Keep your contact information up to date.</p>
          </div>
          <span className="icon-tile blue">
            <Settings2 size={18} />
          </span>
        </div>
        <form
          className="portal-profile-form"
          onChange={() => setSaved(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            setSaved(false);
            try {
              const updated = await portalApi<SessionUser>("/api/profile", {
                method: "PATCH",
                body: JSON.stringify({
                  name: String(values.get("name") || "").trim(),
                  phone: String(values.get("phone") || "").trim(),
                }),
              });
              await onSaved?.(updated);
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label>
              Full name
              <input
                name="name"
                defaultValue={user.name}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone}
                maxLength={30}
                autoComplete="tel"
              />
            </label>
            <label className="full">
              Email address
              <input value={user.email} readOnly type="email" />
              <small className="muted">
                Your email identifies your account.
              </small>
            </label>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            {saved && (
              <span className="saved" role="status">
                <CircleCheck size={15} />
                Profile updated
              </span>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
      <aside className="panel portal-account-card">
        <span className="avatar profile">
          {user.name
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
        <h2>{user.name}</h2>
        <span className="portal-role-label">{user.role.toLowerCase()}</span>
        <p>{user.room ? `Room ${user.room}` : "CampusFix community"}</p>
        <div className="portal-account-note">
          <ShieldCheck size={18} />
          <p>
            Your workspace shows the repairs and updates connected to your
            account.
          </p>
        </div>
        {children}
      </aside>
    </div>
  );
}

export const categoryLabel = (category: string) =>
  category === "RO / Water"
    ? "RO / Water Purifier"
    : category === "Lock repair"
      ? "Locks"
      : category;

export async function readPhotos(
  files: File[],
  existing = 0,
): Promise<string[]> {
  if (files.length + existing > 3)
    throw new Error("You can attach up to 3 photos.");
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("Choose JPG, PNG or WebP images.");
    if (file.size > 1024 * 1024)
      throw new Error(
        `${file.name} is too large. Each photo must be 1 MB or smaller.`,
      );
  }
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(
              new Error("This photo couldn’t be read. Please choose it again."),
            );
          reader.readAsDataURL(file);
        }),
    ),
  );
}
