"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  Download,
  ChevronLeft,
  ChevronRight,
  Plus,
  ImagePlus,
  Sparkles,
  ShieldCheck,
  BriefcaseBusiness,
  Check,
  X,
} from "lucide-react";
import {
  Complaint,
  Snapshot,
  statuses,
  categories,
  urgencies,
  Urgency,
  Recommendations,
  money,
  repairCost,
  active,
  actionSchema,
} from "@/lib/manager/domain";
import { z } from "zod";
import {
  api,
  Badge,
  cx,
  Empty,
  Modal,
  stamp,
  shortDate,
  downloadCsv,
} from "./ui";
export function ComplaintTable({
  complaints,
  data,
  onOpen,
  compact = false,
}: {
  complaints: Complaint[];
  data: Snapshot;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  if (!complaints.length) return <Empty title="No complaints found" />;
  return (
    <div className="table-scroll">
      <table
        className={cx(
          "complaint-table",
          (compact || data.settings.compactRows) && "compact",
        )}
      >
        <thead>
          <tr>
            <th>Complaint</th>
            <th>Property / Room</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Reported</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((c) => {
            const t = data.technicians.find((t) => t.id === c.technicianId);
            return (
              <tr key={c.id}>
                <td>
                  <button
                    className="complaint-title"
                    onClick={() => onOpen(c.id)}
                  >
                    <span
                      className={cx(
                        "category-icon",
                        c.category === "Electrical"
                          ? "amber"
                          : c.category === "Plumbing"
                            ? "blue"
                            : "purple",
                      )}
                    >
                      <BriefcaseBusiness size={16} />
                    </span>
                    <span>
                      <strong>{c.title}</strong>
                      <small>
                        {c.id}
                        <i>·</i>
                        {c.category}
                      </small>
                    </span>
                  </button>
                </td>
                <td>
                  <span className="cell-main">
                    {data.properties.find((p) => p.id === c.propertyId)?.name}
                  </span>
                  <small>{c.room}</small>
                </td>
                <td>
                  <Badge>{c.urgency}</Badge>
                </td>
                <td>
                  <Badge>{c.status}</Badge>
                </td>
                <td>
                  {t ? (
                    <span className="person-mini">
                      <span className={cx("avatar tiny", t.color)}>
                        {t.initials}
                      </span>
                      {t.name.split(" ")[0]}
                    </span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td className="nowrap">{shortDate(c.createdAt)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`View ${c.id}`}
                    onClick={() => onOpen(c.id)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function exportComplaints(complaints: Complaint[], data: Snapshot) {
  downloadCsv("campusfix-complaints.csv", [
    [
      "ID",
      "Title",
      "Property",
      "Room",
      "Category",
      "Urgency",
      "Status",
      "Technician",
      "Created at",
    ],
    ...complaints.map((c) => [
      c.id,
      c.title,
      data.properties.find((p) => p.id === c.propertyId)?.name || "",
      c.room,
      c.category,
      c.urgency,
      c.status,
      data.technicians.find((t) => t.id === c.technicianId)?.name ||
        "Unassigned",
      c.createdAt,
    ]),
  ]);
}
export function Complaints({
  data,
  property,
  onOpen,
  onCreate,
  initialSearch = "",
}: {
  data: Snapshot;
  property: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  initialSearch?: string;
}) {
  const [search, setSearch] = useState(initialSearch),
    [status, setStatus] = useState("All statuses"),
    [urgency, setUrgency] = useState("All priorities"),
    [category, setCategory] = useState("All categories"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  const filtered = data.complaints.filter(
    (c) =>
      (property === "all" || c.propertyId === property) &&
      (status === "All statuses" || c.status === status) &&
      (urgency === "All priorities" || c.urgency === urgency) &&
      (category === "All categories" || c.category === category) &&
      (!from ||
        c.createdAt >= new Date(from + "T00:00:00+05:30").toISOString()) &&
      (!to ||
        c.createdAt <= new Date(to + "T23:59:59.999+05:30").toISOString()) &&
      `${c.title} ${c.description} ${c.id} ${c.room} ${c.reporter}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAINTENANCE OPERATIONS</div>
          <h1>Complaints</h1>
          <p>Every issue, from first report to a verified repair.</p>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={17} />
          New complaint
        </button>
      </div>
      <div className="panel">
        <div className="filter-bar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search complaints"
              placeholder="Search by issue, ID, room or resident…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            className="button"
            onClick={() => exportComplaints(filtered, data)}
          >
            <Download size={16} />
            Export
          </button>
        </div>
        <div className="filters">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Status filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {["All statuses", ...statuses].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Priority filter"
            value={urgency}
            onChange={(e) => {
              setUrgency(e.target.value);
              setPage(1);
            }}
          >
            {["All priorities", ...urgencies].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Category filter"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            {["All categories", ...categories].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className="date-filter">
            From
            <input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="date-filter">
            To
            <input
              type="date"
              aria-label="To date"
              min={from}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <button
            className="text-link"
            onClick={() => {
              setStatus("All statuses");
              setUrgency("All priorities");
              setCategory("All categories");
              setSearch("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
          >
            Reset
          </button>
        </div>
        <ComplaintTable
          complaints={filtered.slice((current - 1) * 10, current * 10)}
          data={data}
          onOpen={onOpen}
        />
        <div className="pagination">
          <span>
            {filtered.length
              ? `${(current - 1) * 10 + 1}–${Math.min(current * 10, filtered.length)}`
              : "0"}{" "}
            of {filtered.length} complaints
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {current} of {pages}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
export function NewComplaint({
  data,
  onClose,
  onCreated,
}: {
  data: Snapshot;
  onClose: () => void;
  onCreated: (c: Complaint) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [images, setImages] = useState<string[]>([]);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setError("");
    const list = Array.from(files);
    if (list.length + images.length > 3) {
      setError("Use up to three photos.");
      return;
    }
    if (
      list.some(
        (f) =>
          f.size > 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    ) {
      setError("Use JPEG, PNG or WebP photos smaller than 1 MB.");
      return;
    }
    const values = await Promise.all(
      list.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("Could not read this photo."));
            r.readAsDataURL(f);
          }),
      ),
    ).catch((e) => {
      setError(e.message);
      return [];
    });
    setImages((old) => [...old, ...values].slice(0, 3));
  };
  return (
    <Modal
      title="Report a maintenance issue"
      subtitle="A clear report helps the right technician arrive prepared."
      onClose={onClose}
    >
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const c = await api<Complaint>("/complaints", {
              method: "POST",
              body: JSON.stringify({ ...Object.fromEntries(f), images }),
            });
            await onCreated(c);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="full">
          Issue title
          <input
            name="title"
            required
            minLength={5}
            maxLength={120}
            placeholder="e.g. Water leaking under the bathroom sink"
          />
        </label>
        <label className="full">
          What happened?
          <textarea
            name="description"
            required
            minLength={10}
            maxLength={2500}
            rows={4}
            placeholder="Describe the issue, when it started and who is affected."
          />
        </label>
        <label>
          Property
          <select name="propertyId">
            {data.properties.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Room / Location
          <input
            name="room"
            required
            maxLength={50}
            placeholder="B-204 or common area"
          />
        </label>
        <label>
          Reported by
          <input
            name="reporter"
            required
            minLength={2}
            maxLength={80}
            placeholder="Resident or manager name"
          />
        </label>
        <label>
          Priority
          <select name="urgency" defaultValue="Normal">
            {urgencies.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Category
          <select name="category" defaultValue="Other">
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <div className="full">
          <label className="upload-zone">
            <ImagePlus size={23} />
            <strong>Add complaint photos</strong>
            <span>Up to 3 JPEG, PNG or WebP files · 1 MB each</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => void upload(e.target.files)}
            />
          </label>
          {images.length > 0 && (
            <div className="photo-row">
              {images.map((src, i) => (
                <div key={i}>
                  <Image
                    unoptimized
                    width={800}
                    height={600}
                    src={src}
                    alt={`Complaint attachment ${i + 1}`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setImages(images.filter((_, n) => i !== n))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="info-note full">
          <Sparkles size={18} />
          {data.settings.autoAnalyze
            ? "Gemma will analyze the saved report. You can review its category, urgency and reasoning before assignment."
            : "Automatic AI analysis is off. You can request Gemma analysis from complaint details."}
        </div>
        {error && (
          <p className="error-box full" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer full">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Create complaint"}
            <Plus size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
type ActionInput = Omit<z.infer<typeof actionSchema>, "version">;
export function ComplaintDetail({
  c,
  data,
  onClose,
  onRefresh,
  autoAnalyzing = false,
  autoAnalysisError,
}: {
  c: Complaint;
  autoAnalyzing?: boolean;
  autoAnalysisError?: string;
  data: Snapshot;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [note, setNote] = useState(""),
    [priority, setPriority] = useState<Urgency | null>(null),
    [estimate, setEstimate] = useState(
      String(c.estimate ?? (c.repairs[0] ? repairCost(c.repairs[0]) : "")),
    ),
    [recommendations, setRecommendations] = useState<Recommendations | null>(
      null,
    ),
    [recError, setRecError] = useState(""),
    [tech, setTech] = useState(c.technicianId || ""),
    [showReport, setShowReport] = useState(false),
    [parts, setParts] = useState<
      { name: string; quantity: number; unitCost: number }[]
    >([]);
  useEffect(() => {
    let alive = true;
    api<Recommendations>(`/complaints/${c.id}/recommendations`)
      .then((r) => {
        if (alive) {
          setRecommendations(r);
          setTech((current) =>
            r.items.some((x) => x.technicianId === current)
              ? current
              : r.items[0]?.technicianId || "",
          );
          setRecError("");
        }
      })
      .catch((e) => {
        if (alive) setRecError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [c.id, c.version]);
  const action = async (input: ActionInput) => {
    setBusy(input.action);
    setError("");
    setSuccess("");
    try {
      await api(`/complaints/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, version: c.version }),
      });
      await onRefresh();
      setSuccess("Changes saved to repair history.");
      setNote("");
      setShowReport(false);
    } catch (e) {
      setError((e as Error).message);
      await onRefresh();
    } finally {
      setBusy("");
    }
  };
  const analyze = async () => {
    setBusy("analyze");
    setError("");
    try {
      await api(`/complaints/${c.id}/analyze`, {
        method: "POST",
        body: JSON.stringify({ version: c.version }),
      });
      await onRefresh();
      setSuccess(
        "Gemma analysis saved. Review the recommendation before taking action.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const stage =
    c.status === "Completed"
      ? 5
      : c.status === "Awaiting verification"
        ? 4
        : c.status === "In progress"
          ? 3
          : c.status === "Assigned"
            ? 2
            : ["Approved", "Reopened"].includes(c.status)
              ? 1
              : 0;
  const property = data.properties.find((p) => p.id === c.propertyId),
    currentTech = data.technicians.find((t) => t.id === c.technicianId);
  return (
    <Modal
      title={c.id + " · Complaint details"}
      subtitle={`${property?.name} / ${c.room}`}
      onClose={onClose}
      wide
    >
      <div className="detail-title">
        <div>
          <h2>{c.title}</h2>
          <p>
            Reported by {c.reporter} · {stamp(c.createdAt)}
          </p>
        </div>
        <Badge>{c.status}</Badge>
      </div>
      <div className="lifecycle">
        {["Report", "Understand", "Assign", "Repair", "Verify"].map((x, i) => (
          <div
            key={x}
            className={cx(i < stage && "done", i === stage && "current")}
          >
            <span>{i < stage ? <Check size={13} /> : i + 1}</span>
            <small>{x}</small>
          </div>
        ))}
      </div>
      <div className="detail-grid">
        <div>
          <section className="detail-section">
            <h3>The reported issue</h3>
            <p className="description">{c.description}</p>
            <div className="tag-row">
              <Badge>{c.category}</Badge>
              <Badge>{c.urgency}</Badge>
            </div>
            {c.images.length > 0 ? (
              <div className="complaint-images">
                {c.images.map((src, i) => (
                  <Image
                    unoptimized
                    width={800}
                    height={600}
                    key={i}
                    src={src}
                    alt={`Uploaded complaint photo ${i + 1}`}
                  />
                ))}
              </div>
            ) : (
              <p className="muted small">No complaint photos attached.</p>
            )}
          </section>
          <section className="ai-detail">
            <div className="section-head">
              <h3>
                <Sparkles size={17} />
                Gemma analysis
              </h3>
              <button
                className="button small-button"
                disabled={!!busy || autoAnalyzing}
                onClick={analyze}
              >
                {busy === "analyze" || autoAnalyzing
                  ? "Analyzing…"
                  : c.analysis
                    ? "Analyze again"
                    : "Analyze complaint"}
              </button>
            </div>
            {!c.analysis && autoAnalysisError && !autoAnalyzing && (
              <p className="error-box" role="alert">
                {autoAnalysisError}
              </p>
            )}
            {autoAnalyzing && (
              <p className="muted small" role="status">
                Gemma is analyzing the saved complaint…
              </p>
            )}
            {c.analysis ? (
              <>
                <p>{c.analysis.summary}</p>
                <div className="tag-row">
                  <Badge>{c.analysis.category}</Badge>
                  <Badge>{c.analysis.urgency}</Badge>
                </div>
                <p className="small muted">{c.analysis.reason}</p>
                <small className="model-label">
                  {c.analysis.model} · {stamp(c.analysis.analyzedAt)}
                </small>
              </>
            ) : (
              <p className="muted small">
                No AI analysis has been generated for this complaint. Gemma will
                suggest a category, urgency and required specialization.
              </p>
            )}
          </section>
          {c.repairs.length > 0 && (
            <section className="detail-section">
              <h3>Repair reports & costs</h3>
              {c.repairs.map((r) => (
                <div className="repair-report" key={r.id}>
                  <div className="row-between">
                    <strong>
                      {
                        data.technicians.find((t) => t.id === r.technicianId)
                          ?.name
                      }
                    </strong>
                    <Badge>
                      {r.verifiedAt
                        ? "Verified"
                        : r.reopenedAt
                          ? "Reopened"
                          : "Awaiting verification"}
                    </Badge>
                  </div>
                  <p>{r.summary}</p>
                  {r.workPerformed && (
                    <p>
                      <strong>Work performed:</strong> {r.workPerformed}
                    </p>
                  )}
                  {!!r.images?.length && (
                    <div className="complaint-images">
                      {r.images.map((src, i) => (
                        <Image
                          unoptimized
                          width={800}
                          height={600}
                          key={i}
                          src={src}
                          alt={`Repair completion photo ${i + 1}`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="cost-line">
                    <span>Labour</span>
                    <strong>{money(r.labour)}</strong>
                  </div>
                  {r.parts.map((p, i) => (
                    <div className="cost-line" key={i}>
                      <span>
                        {p.name} × {p.quantity}
                      </span>
                      <strong>{money(p.quantity * p.unitCost)}</strong>
                    </div>
                  ))}
                  <div className="cost-line total">
                    <span>Repair total</span>
                    <strong>{money(repairCost(r))}</strong>
                  </div>
                  <small className="muted">
                    Completed {stamp(r.completedAt)}
                    {r.verifiedAt && ` · Verified ${stamp(r.verifiedAt)}`}
                  </small>
                </div>
              ))}
            </section>
          )}
          <section className="detail-section">
            <h3>Complaint timeline</h3>
            <div className="timeline">
              {c.history.map((h) => (
                <div key={h.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{h.action}</strong>
                    <small>
                      {h.actor} · {stamp(h.at)}
                    </small>
                    {h.note && <p>{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-actions">
          <h3>Manager actions</h3>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="success-box" role="status">
              {success}
            </p>
          )}
          <div className="assigned-person">
            <span className={cx("avatar", currentTech?.color || "gray")}>
              {currentTech?.initials || "—"}
            </span>
            <div>
              <strong>{currentTech?.name || "Unassigned"}</strong>
              <small>
                {currentTech
                  ? "Current technician"
                  : "Approve, then assign a specialist"}
              </small>
            </div>
          </div>
          <label>
            Action note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1500}
              placeholder="Required when rejecting or reopening…"
            />
          </label>
          {["Pending", "Reopened"].includes(c.status) && (
            <button
              className="button primary full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => void action({ action: "approve", note })}
            >
              <Check size={17} />
              Approve complaint
            </button>
          )}
          {["Pending", "Approved", "Reopened"].includes(c.status) && (
            <button
              className="button danger-text full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => void action({ action: "reject", note })}
            >
              Reject with reason
            </button>
          )}
          {["Completed", "Rejected", "Awaiting verification"].includes(
            c.status,
          ) && (
            <button
              className="button full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => void action({ action: "reopen", note })}
            >
              Reopen complaint
            </button>
          )}
          {c.status === "Awaiting verification" && (
            <button
              className="button primary full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => void action({ action: "verify", note })}
            >
              <ShieldCheck size={17} />
              Verify & close repair
            </button>
          )}
          {active(c) && (
            <>
              <div className="action-divider" />
              <label>
                Priority
                <select
                  value={priority ?? c.urgency}
                  onChange={(e) => setPriority(e.target.value as Urgency)}
                >
                  {urgencies.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <button
                className="button full-width"
                disabled={!!busy || autoAnalyzing}
                onClick={() =>
                  void action({
                    action: "prioritize",
                    urgency: priority ?? c.urgency,
                    note,
                  })
                }
              >
                Update priority
              </button>
              <label>
                Approved estimate (₹)
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="Labour + parts ceiling"
                />
              </label>
              <button
                className="button full-width"
                disabled={!!busy || autoAnalyzing || estimate === ""}
                onClick={() =>
                  void action({
                    action: "estimate",
                    estimate: Number(estimate),
                    note,
                  })
                }
              >
                Approve estimate
              </button>
            </>
          )}
          {["Approved", "Assigned", "In progress", "Reopened"].includes(
            c.status,
          ) && (
            <>
              <div className="action-divider" />
              <h3>Recommended technicians</h3>
              <p className="small muted">
                {recommendations?.source || "Checking availability…"}. Final
                assignment stays with you.
              </p>
              <button
                className="button small-button"
                disabled={
                  !!busy || autoAnalyzing || !recommendations?.items.length
                }
                onClick={async () => {
                  setBusy("recommendations");
                  setRecError("");
                  try {
                    setRecommendations(
                      await api<Recommendations>(
                        `/complaints/${c.id}/recommendations-ai`,
                        {
                          method: "POST",
                          body: JSON.stringify({ version: c.version }),
                        },
                      ),
                    );
                  } catch (e) {
                    setRecError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                <Sparkles size={14} />
                {busy === "recommendations"
                  ? "Gemma is comparing…"
                  : "Compare matches with Gemma"}
              </button>
              {recommendations?.model && (
                <small className="model-label">{recommendations.model}</small>
              )}
              {recError && <p className="error-box">{recError}</p>}
              {recommendations?.items.length === 0 && (
                <p className="info-note">
                  No verified specialists are currently available.
                </p>
              )}
              {recommendations?.items.map((r, i) => {
                const t = data.technicians.find(
                  (t) => t.id === r.technicianId,
                )!;
                return (
                  <label
                    className={cx(
                      "recommendation",
                      tech === t.id && "selected",
                    )}
                    key={t.id}
                  >
                    <div className="row-between">
                      <span>
                        <input
                          type="radio"
                          name="technician"
                          checked={tech === t.id}
                          onChange={() => setTech(t.id)}
                        />
                        <strong>{t.name}</strong>
                      </span>
                      {i === 0 && (
                        <small className="best-match">Best match</small>
                      )}
                    </div>
                    <p>{r.explanation}</p>
                  </label>
                );
              })}
              <button
                className="button primary full-width"
                disabled={
                  !!busy ||
                  autoAnalyzing ||
                  !recommendations?.items.some((t) => t.technicianId === tech)
                }
                onClick={() =>
                  void action({ action: "assign", technicianId: tech, note })
                }
              >
                {c.technicianId ? "Reassign technician" : "Confirm assignment"}
              </button>
            </>
          )}
          {c.status === "Assigned" && (
            <button
              className="button full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => void action({ action: "start", note })}
            >
              Mark repair in progress
            </button>
          )}
          {["Assigned", "In progress"].includes(c.status) && (
            <button
              className="button full-width"
              disabled={!!busy || autoAnalyzing}
              onClick={() => setShowReport(!showReport)}
            >
              Record completion report
            </button>
          )}
          {showReport && (
            <form
              className="report-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action({
                  action: "report",
                  note,
                  report: {
                    summary: String(f.get("summary")),
                    labour: Number(f.get("labour")),
                    parts,
                  },
                });
              }}
            >
              <p className="small muted">
                Record the technician’s report on their behalf. This action is
                attributed to you.
              </p>
              <label>
                Work completed
                <textarea
                  name="summary"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </label>
              <label>
                Labour charge (₹)
                <input
                  type="number"
                  name="labour"
                  min={0}
                  max={1000000}
                  required
                />
              </label>
              {parts.map((p, i) => (
                <div className="part-row" key={i}>
                  <input
                    aria-label={`Part ${i + 1} name`}
                    placeholder="Part name"
                    value={p.name}
                    required
                    onChange={(e) =>
                      setParts(
                        parts.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Part ${i + 1} quantity`}
                    type="number"
                    min={1}
                    max={1000}
                    value={p.quantity}
                    onChange={(e) =>
                      setParts(
                        parts.map((x, j) =>
                          j === i
                            ? { ...x, quantity: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Part ${i + 1} unit cost`}
                    type="number"
                    min={0}
                    max={100000}
                    value={p.unitCost}
                    onChange={(e) =>
                      setParts(
                        parts.map((x, j) =>
                          j === i
                            ? { ...x, unitCost: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove part ${i + 1}`}
                    onClick={() => setParts(parts.filter((_, j) => i !== j))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setParts([...parts, { name: "", quantity: 1, unitCost: 0 }])
                }
              >
                <Plus size={14} />
                Add part
              </button>
              <button
                className="button primary full-width"
                disabled={!!busy || autoAnalyzing}
              >
                Save completion report
              </button>
            </form>
          )}
        </aside>
      </div>
    </Modal>
  );
}
