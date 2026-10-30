"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  CircleCheck,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { categories } from "@/lib/manager/domain";
import type { Category } from "@/lib/manager/domain";

type Role = "STUDENT" | "MANAGER" | "TECHNICIAN";
type Mode = "login" | "register";
type AuthOptions = {
  properties: { id: string; name: string }[];
  demo: boolean;
};

const roles = [
  {
    value: "STUDENT",
    title: "Student",
    description: "Your space, sorted",
    icon: GraduationCap,
  },
  {
    value: "MANAGER",
    title: "Admin / Manager",
    description: "Manage your hostel",
    icon: Building2,
  },
  {
    value: "TECHNICIAN",
    title: "Technician",
    description: "Make things work",
    icon: Wrench,
  },
] as const;

function PasswordField({ registering }: { registering: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor="auth-password">Password</label>
      <span className="auth-input-icon auth-password">
        <LockKeyhole size={17} aria-hidden="true" />
        <input
          id="auth-password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete={registering ? "new-password" : "current-password"}
          placeholder={
            registering ? "Create a password" : "Enter your password"
          }
          minLength={registering ? 12 : 1}
          maxLength={128}
          required
          aria-describedby={registering ? "auth-password-help" : undefined}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      {registering && (
        <small id="auth-password-help">
          Use at least 12 characters. A memorable phrase works well.
        </small>
      )}
    </div>
  );
}

function WelcomePanel() {
  return (
    <aside className="auth-story" aria-label="About CampusFix">
      <div className="auth-story-top">
        <div className="auth-brand" aria-label="CampusFix">
          <span className="auth-brand-icon">
            <Building2 size={22} strokeWidth={1.8} />
          </span>
          <strong>
            Campus<span>Fix</span>
            <i />
          </strong>
        </div>
        <span className="auth-network-label">
          THE SHARED MAINTENANCE NETWORK
        </span>
      </div>
      <div className="auth-story-content">
        <span className="auth-eyebrow">
          <span /> Better spaces. Better days.
        </span>
        <h2>
          A little care.
          <br />A better <span>place.</span>
        </h2>
        <p className="auth-story-description">
          From the first report to the final fix, bring students, hostel
          managers, and a shared network of technicians together.
        </p>
        <div
          className="auth-preview"
          aria-label="The CampusFix repair workflow"
        >
          <div className="auth-preview-head">
            <span className="auth-preview-icon">
              <Wrench size={20} />
            </span>
            <div>
              <strong>Every repair, connected.</strong>
              <span>One place to keep things moving</span>
            </div>
            <ArrowUpRight size={19} />
          </div>
          <div className="auth-workflow">
            <div>
              <span className="auth-step-icon">
                <Mail size={17} />
              </span>
              <span>
                <strong>Report it</strong>
                <small>Students share what needs attention</small>
              </span>
              <Check size={16} className="auth-step-check" />
            </div>
            <div>
              <span className="auth-step-icon">
                <Building2 size={17} />
              </span>
              <span>
                <strong>Coordinate it</strong>
                <small>Managers connect the right people</small>
              </span>
              <Check size={16} className="auth-step-check" />
            </div>
            <div>
              <span className="auth-step-icon">
                <CheckCheck size={17} />
              </span>
              <span>
                <strong>Make it right</strong>
                <small>Technicians repair. Managers verify.</small>
              </span>
              <CircleCheck size={18} className="auth-step-complete" />
            </div>
          </div>
          <div className="auth-preview-foot">
            <Sparkles size={14} />
            <span>Supported by Gemma insights</span>
            <span className="auth-ai-tag">AI ASSISTED</span>
          </div>
        </div>
        <div className="auth-story-points">
          <span>
            <CircleCheck size={15} /> A clear path to resolution
          </span>
          <span>
            <ShieldCheck size={15} /> A role for everyone
          </span>
        </div>
      </div>
      <div className="auth-story-footer">
        <span>Built for the places you call home.</span>
        <span className="auth-footer-mark">
          <Building2 size={14} /> CampusFix
        </span>
      </div>
    </aside>
  );
}

export function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("STUDENT");
  const [options, setOptions] = useState<AuthOptions>({
    properties: [],
    demo: false,
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [specializations, setSpecializations] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const submitPending = useRef(false);
  const registering = mode === "register";
  const managerRegistration = registering && role === "MANAGER";

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    async function loadOptions() {
      try {
        const response = await fetch("/api/auth/options", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Could not load hostel options. Please try again.");
        const data: AuthOptions | null = await response.json();
        if (
          !data ||
          !Array.isArray(data.properties) ||
          !data.properties.every(
            (property) =>
              property &&
              typeof property.id === "string" &&
              typeof property.name === "string",
          )
        ) {
          throw new Error("Could not load hostel options. Please try again.");
        }
        setOptions({ properties: data.properties, demo: data.demo === true });
        setOptionsError("");
      } catch (cause) {
        if (!controller.signal.aborted || timedOut) {
          setOptionsError(
            cause instanceof Error && cause.name !== "AbortError"
              ? cause.message
              : "Loading hostel options took too long. Please try again.",
          );
        }
      } finally {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setOptionsLoading(false);
      }
    }
    void loadOptions();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [optionsAttempt]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitPending.current || managerRegistration) return;
    setError("");
    if (registering && role === "TECHNICIAN" && !specializations.length) {
      showError(
        "Choose at least one specialization so managers can match you with the right work.",
      );
      return;
    }
    if (
      registering &&
      role === "STUDENT" &&
      (optionsLoading || optionsError || !options.properties.length)
    ) {
      showError(
        "Hostel registration options are unavailable. Please try again or contact your hostel manager.",
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      role,
      email: String(form.get("email") || "").trim(),
      password: String(form.get("password") || ""),
    };
    if (registering) {
      payload.name = String(form.get("name") || "").trim();
      payload.phone = String(form.get("phone") || "").trim();
      if (role === "STUDENT") {
        payload.propertyId = String(form.get("propertyId") || "");
        payload.room = String(form.get("room") || "").trim();
        payload.inviteCode = String(form.get("inviteCode") || "").trim();
      } else {
        payload.specialization = specializations;
      }
    }
    submitPending.current = true;
    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "We couldn’t complete that request. Please try again.",
        );
      }
      if (
        !data ||
        typeof data.redirect !== "string" ||
        !["/student", "/manager", "/technician"].includes(data.redirect)
      ) {
        throw new Error(
          "Your request completed, but the workspace could not be opened. Please sign in again.",
        );
      }
      window.location.assign(data.redirect);
    } catch (cause) {
      submitPending.current = false;
      setBusy(false);
      showError(
        cause instanceof Error && cause.name === "AbortError"
          ? "The request took too long. Please try signing in before creating another account."
          : cause instanceof TypeError
            ? "We couldn’t connect to CampusFix. Check your connection and try again."
            : cause instanceof Error
              ? cause.message
              : "Something went wrong. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <main className="auth-shell">
      <WelcomePanel />
      <section className="auth-main" aria-labelledby="auth-heading">
        <div className="auth-mobile-brand">
          <span className="auth-brand-icon">
            <Building2 size={20} />
          </span>
          <strong>
            Campus<span>Fix</span>
          </strong>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-section-label">
            <span /> YOUR HOSTEL, CONNECTED
          </div>
          <div className="auth-heading">
            <h1 id="auth-heading">
              {registering ? "Find your place here." : "Welcome back."}
            </h1>
            <p>
              {registering
                ? "Join your hostel’s maintenance community."
                : "A better day at your hostel starts here."}
            </p>
          </div>
          <div
            className="auth-mode-switch"
            role="group"
            aria-label="Choose account action"
          >
            <button
              type="button"
              aria-pressed={!registering}
              disabled={busy}
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={registering}
              disabled={busy}
              onClick={() => switchMode("register")}
            >
              Create an account
            </button>
          </div>
          <fieldset className="auth-role-fieldset" disabled={busy}>
            <legend>
              {registering ? "I’m joining as a" : "I’m signing in as a"}
            </legend>
            <div className="auth-role-grid">
              {roles.map(({ value, title, description, icon: Icon }) => (
                <label className="auth-role-card" key={value}>
                  <input
                    type="radio"
                    name="account-role"
                    value={value}
                    checked={role === value}
                    onChange={() => {
                      setRole(value);
                      setError("");
                    }}
                  />
                  <span className="auth-role-content">
                    <span className="auth-role-indicator">
                      <Check size={10} />
                    </span>
                    <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {managerRegistration ? (
            <div className="auth-manager-access">
              <span className="auth-access-icon">
                <KeyRound size={25} />
              </span>
              <h2>Manager access, made personal.</h2>
              <p>
                Admin and hostel manager accounts are provisioned by the
                CampusFix operator. Contact your network administrator to
                request access.
              </p>
              <button
                className="auth-submit"
                type="button"
                onClick={() => switchMode("login")}
              >
                Sign in with your manager account <ArrowRight size={17} />
              </button>
              <small>
                Already have an invitation? Your operator will provide your
                account details.
              </small>
            </div>
          ) : (
            <form
              key={`${mode}-${role}`}
              className="auth-form"
              onSubmit={submit}
              aria-busy={busy}
            >
              <fieldset className="auth-form-fields" disabled={busy}>
                <legend className="auth-sr-only">
                  {registering
                    ? "Account registration details"
                    : "Sign-in details"}
                </legend>
                {registering && (
                  <div className="auth-field-row">
                    <label className="auth-field">
                      <span>Full name</span>
                      <input
                        name="name"
                        autoComplete="name"
                        placeholder="Your full name"
                        required
                        minLength={2}
                        maxLength={80}
                      />
                    </label>
                    <label className="auth-field">
                      <span>
                        Phone <small>Optional</small>
                      </span>
                      <input
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="Your phone number"
                        maxLength={30}
                      />
                    </label>
                  </div>
                )}
                <label className="auth-field">
                  <span>Email address</span>
                  <span className="auth-input-icon">
                    <Mail size={17} aria-hidden="true" />
                    <input
                      name="email"
                      type="email"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com"
                      maxLength={160}
                      required
                    />
                  </span>
                </label>
                <PasswordField registering={registering} />
                {registering && role === "STUDENT" && (
                  <div className="auth-registration-section">
                    <div className="auth-section-heading">
                      <Building2 size={16} />
                      <span>Your hostel or PG</span>
                    </div>
                    <div className="auth-field-row auth-hostel-row">
                      <label className="auth-field">
                        <span>Hostel / property</span>
                        <select
                          name="propertyId"
                          defaultValue=""
                          required
                          disabled={
                            optionsLoading ||
                            !!optionsError ||
                            !options.properties.length
                          }
                        >
                          <option value="" disabled>
                            {optionsLoading
                              ? "Loading hostels…"
                              : "Choose your hostel"}
                          </option>
                          {options.properties.map((property) => (
                            <option key={property.id} value={property.id}>
                              {property.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="auth-field">
                        <span>Room number</span>
                        <input
                          name="room"
                          autoComplete="off"
                          placeholder="e.g. A-204"
                          required
                          maxLength={50}
                        />
                      </label>
                    </div>
                    {optionsError ? (
                      <div className="auth-options-error" role="status">
                        <span>{optionsError}</span>
                        <button
                          type="button"
                          disabled={optionsLoading}
                          onClick={() => {
                            setOptionsLoading(true);
                            setOptionsError("");
                            setOptionsAttempt((attempt) => attempt + 1);
                          }}
                        >
                          Try again
                        </button>
                      </div>
                    ) : (
                      !optionsLoading &&
                      !options.properties.length && (
                        <p className="auth-options-error" role="status">
                          No hostels are open for registration yet. Contact your
                          hostel manager for help.
                        </p>
                      )
                    )}
                    <label className="auth-field">
                      <span>Hostel invitation code</span>
                      <span className="auth-input-icon">
                        <KeyRound size={17} aria-hidden="true" />
                        <input
                          name="inviteCode"
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="Enter the code from your manager"
                          required
                          maxLength={100}
                          aria-describedby="auth-invite-help"
                        />
                      </span>
                      <small id="auth-invite-help">
                        Ask your hostel manager for your property’s invitation
                        code.
                      </small>
                    </label>
                  </div>
                )}
                {registering && role === "TECHNICIAN" && (
                  <div className="auth-registration-section">
                    <fieldset className="auth-specializations">
                      <legend>
                        What do you specialize in?{" "}
                        <span>Select one or more</span>
                      </legend>
                      <div>
                        {categories.map((category) => (
                          <label key={category}>
                            <input
                              type="checkbox"
                              name="specialization"
                              value={category}
                              checked={specializations.includes(category)}
                              onChange={(event) =>
                                setSpecializations((current) =>
                                  event.target.checked
                                    ? [...current, category]
                                    : current.filter(
                                        (item) => item !== category,
                                      ),
                                )
                              }
                            />
                            <span>{category}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="auth-info-note">
                      <ShieldCheck size={19} />
                      <div>
                        <strong>
                          A quick verification before your first job
                        </strong>
                        <p>
                          You can set up your profile after joining. A manager
                          must verify your account before you can receive
                          assignments.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div
                  ref={errorRef}
                  className={error ? "auth-error" : "auth-error-empty"}
                  role={error ? "alert" : undefined}
                  tabIndex={-1}
                >
                  {error}
                </div>
                <button
                  className="auth-submit"
                  type="submit"
                  disabled={
                    busy ||
                    (registering &&
                      role === "STUDENT" &&
                      (optionsLoading ||
                        !!optionsError ||
                        !options.properties.length))
                  }
                >
                  {busy ? (
                    <>
                      <Loader2 size={18} className="auth-spin" />
                      <span>
                        {registering
                          ? "Creating your account…"
                          : "Opening your workspace…"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        {registering
                          ? "Create my account"
                          : "Sign in to your workspace"}
                      </span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </fieldset>
              {!registering && (
                <p className="auth-account-help">
                  Need help signing in? Contact your hostel manager or network
                  administrator.
                </p>
              )}
              <p className="auth-mode-prompt">
                {registering
                  ? "Already part of CampusFix?"
                  : "New to the community?"}{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => switchMode(registering ? "login" : "register")}
                >
                  {registering ? "Sign in" : "Create an account"}
                  <ArrowUpRight size={13} />
                </button>
              </p>
            </form>
          )}
          {options.demo && (
            <div className="auth-demo-note">
              <span>DEMO WORKSPACE</span>
              <p>Demo account credentials are in the local handoff.</p>
            </div>
          )}
          <div className="auth-security-note">
            <LockKeyhole size={13} />
            <span>Your account. Your role. Your workspace.</span>
          </div>
        </div>
        <footer className="auth-main-footer">
          <span>Care for your hostel, together.</span>
          <span>CampusFix</span>
        </footer>
      </section>
    </main>
  );
}
