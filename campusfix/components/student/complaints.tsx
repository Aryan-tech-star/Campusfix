"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  Clock3,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { categories, statuses, urgencies } from "@/lib/manager/domain";
import type { Category, Urgency } from "@/lib/manager/domain";
import type {
  ComplaintResult,
  ComplaintSubmission,
  PortalComplaint,
  StudentSnapshot,
} from "@/lib/portal/types";
import {
  Badge,
  Empty,
  Modal,
  categoryLabel,
  cx,
  portalApi,
  readPhotos,
  shortDate,
  stamp,
} from "@/components/portal/ui";

export function ComplaintList({
  complaints,
  onOpen,
  onCreate,
  compact = false,
}: {
  complaints: PortalComplaint[];
  onOpen: (id: string) => void;
  onCreate?: () => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const filtered = [...complaints]
    .filter((c) => {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(c.createdAt));
      return (
        (status === "all" || c.status === status) &&
        (category === "all" || c.category === category) &&
        (!from || date >= from) &&
        (!to || date <= to) &&
        `${c.id} ${c.title} ${c.description} ${c.room}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      );
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageSize = compact ? 5 : 8;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  return (
    <section className="panel portal-complaint-panel">
      {compact ? (
        <div className="section-head">
          <div>
            <h2>Your recent complaints</h2>
            <p>Follow each repair from report to resolution.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="search-input">
              <Search size={18} />
              <input
                aria-label="Search your complaints"
                placeholder="Search by issue or complaint ID…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <span className="muted small">
              {filtered.length} complaint{filtered.length !== 1 && "s"}
            </span>
          </div>
          <div className="filters">
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
            <label className="date-filter">
              From
              <input
                aria-label="Created from date"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="date-filter">
              To
              <input
                aria-label="Created to date"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {(search ||
              status !== "all" ||
              category !== "all" ||
              from ||
              to) && (
              <button
                className="text-link"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setCategory("all");
                  setFrom("");
                  setTo("");
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </>
      )}
      {rows.length ? (
        <div className="table-scroll">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Complaint</th>
                <th>Category</th>
                <th>Status</th>
                <th>Reported</th>
                <th aria-label="View complaint" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button
                      className="portal-complaint-title"
                      onClick={() => onOpen(c.id)}
                    >
                      <strong>{c.title}</strong>
                      <span>
                        {c.id} <i>·</i> Room {c.room}
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="portal-category">
                      {categoryLabel(c.category)}
                    </span>
                  </td>
                  <td>
                    <Badge>{c.status}</Badge>
                  </td>
                  <td className="nowrap muted">{shortDate(c.createdAt)}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${c.title}`}
                      onClick={() => onOpen(c.id)}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            complaints.length
              ? "No matching complaints"
              : "A fresh start for your space"
          }
        >
          {complaints.length ? (
            "Try another search or clear your filters."
          ) : (
            <>
              <span>Your reported issues will appear here.</span>
              {onCreate && (
                <button
                  className="button primary portal-empty-action"
                  onClick={onCreate}
                >
                  <ImagePlus size={15} />
                  Report your first issue
                </button>
              )}
            </>
          )}
        </Empty>
      )}
      {!compact && filtered.length > 0 && (
        <div className="pagination">
          <span>
            Showing {(current - 1) * pageSize + 1}–
            {Math.min(current * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div>
            <button
              className="button"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              {current} / {pages}
            </span>
            <button
              className="button"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function ReportComplaint({
  data,
  onCreated,
  onCancel,
}: {
  data: StudentSnapshot;
  onCreated: (result: ComplaintResult) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  return (
    <div className="portal-report-layout">
      <section className="panel portal-report-card">
        <div className="section-head">
          <div>
            <h2>Tell us what needs fixing</h2>
            <p>A few details help your team get the right repair started.</p>
          </div>
          <span className="icon-tile blue">
            <Wrench size={18} />
          </span>
        </div>
        <form
          className="portal-report-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || reading) return;
            const form = new FormData(event.currentTarget);
            const input: ComplaintSubmission = {
              title: String(form.get("title") || "").trim(),
              description: String(form.get("description") || "").trim(),
              category: form.get("category") as Category,
              urgency: form.get("urgency") as Urgency,
              propertyId: data.property.id,
              room: String(form.get("room") || "").trim(),
              images,
            };
            if (input.title.length < 5 || input.description.length < 10) {
              setError(
                "Add a title with at least 5 characters and a description with at least 10 characters.",
              );
              return;
            }
            setBusy(true);
            setError("");
            try {
              const result = await portalApi<ComplaintResult>(
                "/api/student/complaints",
                { method: "POST", body: JSON.stringify(input) },
              );
              await onCreated(result);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="portal-fieldset">
            <div className="form-grid">
              <label className="full">
                Issue title <span className="portal-required">Required</span>
                <input
                  name="title"
                  placeholder="e.g. Washbasin tap keeps leaking"
                  required
                  minLength={5}
                  maxLength={120}
                />
              </label>
              <label>
                Category
                <select name="category" defaultValue="Plumbing" required>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Urgency
                <select name="urgency" defaultValue="Normal" required>
                  {urgencies.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label>
                Property
                <input value={data.property.name} readOnly />
              </label>
              <label>
                Room / location
                <input
                  name="room"
                  defaultValue={data.user.room || ""}
                  placeholder="e.g. A-204 or shared kitchen"
                  required
                  maxLength={50}
                />
              </label>
              <label className="full">
                What’s happening?{" "}
                <span className="portal-required">Required</span>
                <textarea
                  name="description"
                  rows={5}
                  placeholder="Describe the problem, where it is, and when you first noticed it."
                  required
                  minLength={10}
                  maxLength={2500}
                />
              </label>
              <div className="full">
                <div className="portal-upload-heading">
                  <strong>Add photos</strong>
                  <span>Optional · {images.length}/3</span>
                </div>
                <label
                  className={cx(
                    "portal-photo-drop",
                    images.length === 3 && "disabled",
                  )}
                >
                  <ImagePlus size={25} />
                  <strong>
                    {reading ? "Reading photos…" : "Choose photos of the issue"}
                  </strong>
                  <span>JPG, PNG or WebP · up to 1 MB each</span>
                  <input
                    aria-label="Attach complaint photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={reading || images.length === 3}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      if (!files.length) return;
                      setReading(true);
                      setPhotoError("");
                      try {
                        const photos = await readPhotos(files, images.length);
                        setImages((previous) => [...previous, ...photos]);
                      } catch (e) {
                        setPhotoError((e as Error).message);
                      } finally {
                        setReading(false);
                      }
                    }}
                  />
                </label>
                {photoError && (
                  <p className="error-box" role="alert">
                    {photoError}
                  </p>
                )}
                {images.length > 0 && (
                  <div className="portal-photo-previews">
                    {images.map((src, index) => (
                      <div key={index}>
                        <Image
                          src={src}
                          alt={`Complaint attachment ${index + 1}`}
                          width={104}
                          height={90}
                          unoptimized
                        />
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove photo ${index + 1}`}
                          onClick={() =>
                            setImages(images.filter((_, i) => i !== index))
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <button type="button" className="button" onClick={onCancel}>
                Cancel
              </button>
              <button className="button primary" disabled={busy || reading}>
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <ArrowRight size={16} />
                )}
                {busy ? "Submitting complaint…" : "Submit complaint"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>
      <aside className="portal-report-aside">
        <div className="panel portal-how-card">
          <span className="icon-tile blue">
            <ShieldCheck size={20} />
          </span>
          <h2>From reported to repaired.</h2>
          <p>Your manager and repair team take it from here.</p>
          {[
            [
              "01",
              "Report the issue",
              "Share details and photos of the problem.",
            ],
            [
              "02",
              "We coordinate the repair",
              "Your manager reviews and assigns a specialist.",
            ],
            [
              "03",
              "Follow every update",
              "Track the work and final verification here.",
            ],
          ].map(([number, title, text]) => (
            <div className="portal-how-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="portal-soft-note">
          <Sparkles size={19} />
          <div>
            <strong>A little help from Gemma</strong>
            <p>
              {data.meta.aiConfigured && data.meta.aiEnabled
                ? "AI can suggest a category and urgency. Your manager makes the final call."
                : "Your report goes straight to the property team for review."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

const progressSteps = [
  "Reported",
  "Approved",
  "Assigned",
  "In progress",
  "Awaiting verification",
  "Completed",
];
const stepIndex: Record<string, number> = {
  Pending: 0,
  Approved: 1,
  Assigned: 2,
  "In progress": 3,
  "Awaiting verification": 4,
  Completed: 5,
  Reopened: 0,
  Rejected: 0,
};

export function ComplaintDetail({
  complaint: c,
  data,
  onClose,
  onRefresh,
  aiError: initialAiError,
}: {
  complaint: PortalComplaint;
  data: StudentSnapshot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  aiError?: string;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState(initialAiError || "");
  const history = [...c.history].sort((a, b) => b.at.localeCompare(a.at));
  const index = stepIndex[c.status];
  return (
    <Modal
      title="Complaint details"
      subtitle={`${c.id} · Reported ${stamp(c.createdAt)}`}
      wide
      onClose={onClose}
    >
      <div className="portal-detail-heading">
        <div>
          <h2>{c.title}</h2>
          <p>
            <MapPin size={14} />
            {data.property.name} · Room {c.room}
          </p>
        </div>
        <div className="portal-badges">
          <Badge>{c.status}</Badge>
          <Badge>{c.urgency}</Badge>
        </div>
      </div>
      <ol className="portal-progress" aria-label="Repair progress">
        {progressSteps.map((step, i) => (
          <li
            key={step}
            className={cx(i < index && "done", i === index && "current")}
          >
            <span>{i < index ? <Check size={13} /> : i + 1}</span>
            <strong>{step}</strong>
          </li>
        ))}
      </ol>
      {c.status === "Reopened" && (
        <div className="portal-branch">
          <RefreshIcon />
          <div>
            <strong>This complaint has been reopened</strong>
            <p>
              The issue needs another look. Earlier repair reports and updates
              remain below.
            </p>
          </div>
        </div>
      )}
      {c.status === "Rejected" && (
        <div className="info-note">
          <strong>Complaint not approved.</strong> Check the activity below for
          your manager’s reason.
        </div>
      )}
      <div className="portal-detail-grid">
        <div>
          <section className="portal-detail-section">
            <h3>The reported issue</h3>
            <p className="portal-description">{c.description}</p>
            <span className="portal-category">{categoryLabel(c.category)}</span>
            {c.images.length > 0 && (
              <PhotoGallery images={c.images} label="Reported issue" />
            )}
          </section>
          <section className="portal-detail-section">
            <div className="portal-section-row">
              <h3>Repair reports</h3>
              <span className="muted small">{c.repairs.length} recorded</span>
            </div>
            {c.repairs.length ? (
              c.repairs.map((repair) => (
                <article className="portal-repair" key={repair.id}>
                  <div className="portal-section-row">
                    <strong>
                      {repair.reopenedAt
                        ? "Repair reopened"
                        : repair.verifiedAt
                          ? "Verified repair"
                          : "Awaiting manager verification"}
                    </strong>
                    <span
                      className={cx(
                        "icon-tile",
                        repair.verifiedAt ? "green" : "blue",
                      )}
                    >
                      {repair.verifiedAt ? (
                        <ShieldCheck size={17} />
                      ) : (
                        <Wrench size={17} />
                      )}
                    </span>
                  </div>
                  <p>{repair.summary}</p>
                  {repair.workPerformed && (
                    <div className="portal-work-notes">
                      <small>WORK PERFORMED</small>
                      <p>{repair.workPerformed}</p>
                    </div>
                  )}
                  <small className="muted">
                    Submitted {stamp(repair.completedAt)}
                    {repair.verifiedAt &&
                      ` · Verified ${stamp(repair.verifiedAt)}`}
                  </small>
                  {!!repair.images?.length && (
                    <PhotoGallery
                      images={repair.images}
                      label="Completed repair"
                    />
                  )}
                </article>
              ))
            ) : (
              <div className="portal-quiet-state">
                <Wrench size={20} />
                <p>
                  Repair notes and completion photos will appear here once the
                  work is done.
                </p>
              </div>
            )}
          </section>
          <section className="portal-detail-section">
            <h3>Activity & updates</h3>
            <div className="timeline portal-history">
              {history.length ? (
                history.map((item) => (
                  <div key={item.id}>
                    <span className="timeline-dot" />
                    <strong>{item.action}</strong>
                    <small>
                      {item.actor} · {stamp(item.at)}
                    </small>
                    {item.note && <p>{item.note}</p>}
                  </div>
                ))
              ) : (
                <div>
                  <span className="timeline-dot" />
                  <strong>Complaint reported</strong>
                  <small>{stamp(c.createdAt)}</small>
                </div>
              )}
            </div>
          </section>
        </div>
        <aside>
          <section className="portal-detail-section portal-technician-card">
            <div className="portal-section-row">
              <h3>Your technician</h3>
              <Wrench size={17} />
            </div>
            {c.technician ? (
              <>
                <span className="avatar profile portal-tech-avatar">
                  {c.technician.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <h2>{c.technician.name}</h2>
                <p>
                  {c.technician.specialization.map(categoryLabel).join(" · ")}
                </p>
                {c.technician.phone && (
                  <a
                    className="button full-width"
                    href={`tel:${c.technician.phone.replace(/[^+\d]/g, "")}`}
                  >
                    <Phone size={14} />
                    {c.technician.phone}
                  </a>
                )}
                {c.assignment && (
                  <div className="portal-assignment">
                    <small>Assigned {stamp(c.assignment.assignedAt)}</small>
                    {c.assignment.instructions && (
                      <p>{c.assignment.instructions}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="portal-quiet-state">
                <Clock3 size={22} />
                <p>
                  {c.status === "Rejected"
                    ? "No technician is assigned."
                    : "Your manager will assign the right specialist after reviewing this issue."}
                </p>
              </div>
            )}
          </section>
          <section className="portal-ai-card">
            <div className="portal-section-row">
              <h3>
                <Sparkles size={17} />
                Gemma insight
              </h3>
              <span className="gemma-chip">AI</span>
            </div>
            {c.analysis ? (
              <>
                <p>{c.analysis.summary}</p>
                <div className="portal-badges">
                  <Badge>{c.analysis.category}</Badge>
                  <Badge>{c.analysis.urgency}</Badge>
                </div>
                <p className="portal-ai-reason">{c.analysis.reason}</p>
                <small>
                  Suggested by {c.analysis.model} · Your manager reviews every
                  decision.
                </small>
              </>
            ) : (
              <>
                <p>
                  {analyzing
                    ? "Gemma is reviewing your report…"
                    : "A category and urgency suggestion can help your manager review this report."}
                </p>
                {data.meta.aiEnabled && data.meta.aiConfigured ? (
                  <button
                    className="button full-width"
                    disabled={analyzing}
                    onClick={async () => {
                      setAnalyzing(true);
                      setAiError("");
                      try {
                        await portalApi(
                          `/api/ai/complaints/${encodeURIComponent(c.id)}/analyze`,
                          {
                            method: "POST",
                            body: JSON.stringify({ version: c.version }),
                          },
                        );
                        await onRefresh();
                      } catch (e) {
                        setAiError((e as Error).message);
                      } finally {
                        setAnalyzing(false);
                      }
                    }}
                  >
                    {analyzing ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {analyzing
                      ? "Analyzing…"
                      : aiError
                        ? "Retry analysis"
                        : "Analyze with Gemma"}
                  </button>
                ) : (
                  <small>
                    Your property team will review this report directly.
                  </small>
                )}
              </>
            )}
            {aiError && !c.analysis && (
              <p className="error-box" role="alert">
                {aiError}
              </p>
            )}
          </section>
        </aside>
      </div>
    </Modal>
  );
}

function RefreshIcon() {
  return <Clock3 size={20} />;
}

export function PhotoGallery({
  images,
  label,
}: {
  images: string[];
  label: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <div className="portal-gallery">
        {images.map((src, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setSelected(i)}
            aria-label={`Enlarge ${label.toLowerCase()} photo ${i + 1}`}
            aria-expanded={selected === i}
          >
            <Image
              src={src}
              alt={`${label} photo ${i + 1}`}
              width={100}
              height={80}
              unoptimized
            />
          </button>
        ))}
      </div>
      {selected !== null && (
        <div className="portal-photo-expanded">
          <div className="portal-section-row">
            <span>
              {label} · Photo {selected + 1} of {images.length}
            </span>
            <button
              className="icon-button"
              aria-label="Close enlarged photo"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </div>
          <Image
            src={images[selected]}
            alt={`${label} photo ${selected + 1}`}
            width={1200}
            height={900}
            unoptimized
          />
        </div>
      )}
    </>
  );
}

export function RepairHistory({
  complaints,
  onOpen,
}: {
  complaints: PortalComplaint[];
  onOpen: (id: string) => void;
}) {
  const repairs = complaints
    .flatMap((c) => c.repairs.map((repair) => ({ complaint: c, repair })))
    .sort((a, b) => b.repair.completedAt.localeCompare(a.repair.completedAt));
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>Your repair record</h2>
          <p>A complete history of work done for your reported issues.</p>
        </div>
        <span className="portal-counter">{repairs.length}</span>
      </div>
      {repairs.length ? (
        <div className="portal-repair-list">
          {repairs.map(({ complaint, repair }) => (
            <article key={repair.id}>
              <span
                className={cx(
                  "icon-tile",
                  repair.verifiedAt ? "green" : "blue",
                )}
              >
                {repair.verifiedAt ? (
                  <CircleCheck size={20} />
                ) : (
                  <Wrench size={20} />
                )}
              </span>
              <div>
                <div className="portal-section-row">
                  <button
                    className="portal-complaint-title"
                    onClick={() => onOpen(complaint.id)}
                  >
                    <strong>{complaint.title}</strong>
                    <span>
                      {complaint.id} · Room {complaint.room}
                    </span>
                  </button>
                  <Badge>
                    {repair.reopenedAt
                      ? "Reopened"
                      : repair.verifiedAt
                        ? "Completed"
                        : "Awaiting verification"}
                  </Badge>
                </div>
                <p>{repair.summary}</p>
                {repair.workPerformed && (
                  <p className="portal-work-summary">{repair.workPerformed}</p>
                )}
                <div className="portal-section-row">
                  <small className="muted">
                    {stamp(repair.completedAt)} ·{" "}
                    {complaint.technician?.name || "Repair team"}
                  </small>
                  <button
                    className="text-link"
                    onClick={() => onOpen(complaint.id)}
                  >
                    View full report
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No repairs recorded yet">
          Completed work and technician notes will appear here as your
          complaints are resolved.
        </Empty>
      )}
    </section>
  );
}
