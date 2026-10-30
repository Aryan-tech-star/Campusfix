"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  ImagePlus,
  Info,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type {
  PortalComplaint,
  TechnicianAdvice,
  TechnicianSnapshot,
} from "@/lib/portal/types";
import type { Repair } from "@/lib/manager/domain";
import { money, repairCost } from "@/lib/manager/domain";
import {
  Badge,
  Modal,
  portalApi,
  readPhotos,
  stamp,
} from "@/components/portal/ui";

type ReportInput = {
  summary: string;
  workPerformed: string;
  labour: number;
  parts: { name: string; quantity: number; unitCost: number }[];
  images: string[];
};

export function JobDetail({
  complaint: c,
  data,
  onClose,
  onChanged,
}: {
  complaint: PortalComplaint;
  data: TechnicianSnapshot;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportDraft, setReportDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState<TechnicianAdvice | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const owned =
    c.technicianId === data.technician.id &&
    !["DECLINED", "CANCELLED"].includes(c.assignment?.status || "");
  const pending = owned && c.assignment?.status === "PENDING";
  const accepted = owned && c.assignment?.status === "ACCEPTED";
  const canWork = accepted && data.technician.verified;
  const canReport = canWork && c.status === "In progress";
  const aiAvailable =
    data.meta.aiEnabled &&
    data.meta.aiConfigured &&
    data.technician.verified &&
    c.technicianId === data.technician.id;
  const property = data.properties.find((p) => p.id === c.propertyId);
  const act = async (
    action: "accept" | "decline" | "start" | "progress" | "complete",
    report?: ReportInput,
  ) => {
    setBusy(action);
    setError("");
    try {
      await portalApi(
        `/api/technician/jobs/${encodeURIComponent(c.id)}/actions`,
        {
          method: "POST",
          body: JSON.stringify({
            version: c.version,
            action,
            note: note.trim(),
            ...(report ? { report } : {}),
          }),
        },
      );
      setNote("");
      setDeclining(false);
      setShowReport(false);
      await onChanged(
        action === "complete"
          ? "Repair report submitted. This job is awaiting manager verification."
          : action === "accept"
            ? "Assignment accepted. Start the job when you begin work."
            : action === "decline"
              ? "Assignment declined. Your manager has been notified."
              : action === "start"
                ? "Job started. You can now add progress updates."
                : "Progress update saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const requestAdvice = async () => {
    setAiBusy(true);
    setAiError("");
    try {
      setAdvice(
        await portalApi<TechnicianAdvice>(
          `/api/ai/technician/${encodeURIComponent(c.id)}/advice`,
          {
            method: "POST",
            body: JSON.stringify(
              question.trim() ? { question: question.trim() } : {},
            ),
          },
        ),
      );
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };
  return (
    <Modal
      title="Job details"
      subtitle={`${c.id} · Assigned ${c.assignment ? stamp(c.assignment.assignedAt) : stamp(c.createdAt)}`}
      onClose={onClose}
      wide
    >
      <div className="detail-title">
        <div>
          <h2>{c.title}</h2>
          <p className="tech-detail-location">
            <MapPin size={14} />
            {property?.name || c.propertyId} · Room {c.room}
          </p>
        </div>
        <Badge>{pending ? "Pending acceptance" : c.status}</Badge>
      </div>
      <div className="tag-row">
        <Badge>{c.urgency}</Badge>
        <span className="pill">{c.category}</span>
        {c.estimate !== undefined && (
          <span className="pill">Approved estimate: {money(c.estimate)}</span>
        )}
      </div>
      {c.status === "Awaiting verification" && (
        <div className="info-note tech-detail-note">
          <ShieldCheck size={18} />
          <span>
            Your report is submitted. The job remains open until the manager
            checks the repair and verifies it.
          </span>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="detail-grid tech-detail-grid">
        <div>
          <section className="detail-section">
            <h3>Reported issue</h3>
            <p className="description">{c.description}</p>
            {c.images.length > 0 && (
              <PhotoGallery images={c.images} label="Reported issue" />
            )}
          </section>
          {c.assignment?.instructions && (
            <section className="tech-instructions">
              <h3>
                <ClipboardCheck size={16} />
                Manager’s instructions
              </h3>
              <p>{c.assignment.instructions}</p>
            </section>
          )}
          {c.assignment?.declineReason && (
            <p className="info-note">
              Assignment declined: {c.assignment.declineReason}
            </p>
          )}
          <section className="tech-ai-panel">
            <div className="tech-ai-title">
              <span className="icon-tile purple">
                <Sparkles size={18} />
              </span>
              <div>
                <h3>Gemma repair assistant</h3>
                <small>Advisory support for this job</small>
              </div>
              <span className="tech-ai-pill">AI</span>
            </div>
            <p>
              Explore possible causes and inspection considerations. Confirm
              every suggestion against conditions on site and your training.
            </p>
            {!aiAvailable && (
              <div className="info-note">
                <Info size={16} />
                {!data.meta.aiEnabled
                  ? "AI assistance is disabled for this workspace."
                  : !data.meta.aiConfigured
                    ? "Gemma is not configured yet. Your manager can enable the connection."
                    : !data.technician.verified
                      ? "Your profile must be verified before using job assistance."
                      : "AI assistance is available for jobs currently assigned to you."}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestAdvice();
              }}
            >
              <label>
                What would you like help with?{" "}
                <span className="tech-optional">Optional</span>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="For example: What should I inspect before replacing this part?"
                  disabled={!aiAvailable || aiBusy}
                />
              </label>
              <button
                className="button small-button tech-ai-button"
                disabled={!aiAvailable || aiBusy}
              >
                <Sparkles size={14} />
                {aiBusy
                  ? "Asking Gemma…"
                  : advice
                    ? "Ask again"
                    : "Get repair guidance"}
              </button>
            </form>
            {aiError && (
              <p className="error-box" role="alert">
                {aiError}
              </p>
            )}
            {advice && (
              <div className="tech-ai-result" aria-live="polite">
                <p>{advice.summary}</p>
                {advice.potentialCauses.length > 0 && (
                  <>
                    <h4>Potential causes</h4>
                    <ul>
                      {advice.potentialCauses.map((cause, i) => (
                        <li key={i}>{cause}</li>
                      ))}
                    </ul>
                  </>
                )}
                {advice.considerations.length > 0 && (
                  <>
                    <h4>Inspection considerations</h4>
                    <ul>
                      {advice.considerations.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                {advice.reportSummary && (
                  <>
                    <h4>Suggested report wording</h4>
                    <p>{advice.reportSummary}</p>
                    {canReport && !showReport && (
                      <button
                        className="button small-button"
                        onClick={() => {
                          setReportDraft(advice.reportSummary);
                          setShowReport(true);
                        }}
                      >
                        Start report with this draft <ArrowRight size={13} />
                      </button>
                    )}
                  </>
                )}
                <p className="tech-ai-disclaimer">
                  <ShieldCheck size={14} />
                  {advice.disclaimer ||
                    "AI guidance may be inaccurate. Verify suggestions and follow your professional safety procedures."}
                </p>
                <small className="model-label">
                  {advice.model} · Generated {stamp(advice.generatedAt)}
                </small>
              </div>
            )}
          </section>
          {showReport && canReport && (
            <CompletionForm
              initialSummary={reportDraft}
              busy={busy === "complete"}
              onSubmit={(report) => act("complete", report)}
              onCancel={() => setShowReport(false)}
            />
          )}
          {c.repairs.filter((r) => r.technicianId === data.technician.id)
            .length > 0 && (
            <section className="detail-section">
              <h3>Your repair reports</h3>
              {c.repairs
                .filter((r) => r.technicianId === data.technician.id)
                .map((r) => (
                  <RepairReport key={r.id} repair={r} />
                ))}
            </section>
          )}
          <section className="detail-section">
            <h3>Activity timeline</h3>
            <div className="timeline">
              {c.history.map((item) => (
                <div key={item.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{item.action}</strong>
                    <small>
                      {item.actor} · {stamp(item.at)}
                    </small>
                    {item.note && <p>{item.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-actions tech-job-actions">
          <h3>Manage this job</h3>
          {!owned && (
            <p className="tech-muted">
              This assignment is in your history. No actions are available.
            </p>
          )}
          {owned && !data.technician.verified && (
            <div className="info-note">
              <ShieldCheck size={16} />
              <span>
                Your profile needs manager verification before you can work on
                assignments.
              </span>
            </div>
          )}
          {pending && (
            <>
              <p className="tech-muted">
                Review the issue and instructions before accepting this
                assignment.
              </p>
              <button
                className="button primary"
                onClick={() => void act("accept")}
                disabled={!!busy || !data.technician.verified}
              >
                <Check size={16} />
                {busy === "accept" ? "Accepting…" : "Accept assignment"}
              </button>
              {!declining ? (
                <button
                  className="button"
                  onClick={() => setDeclining(true)}
                  disabled={!!busy}
                >
                  Decline assignment
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("decline");
                  }}
                >
                  <label>
                    Reason for declining
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      minLength={5}
                      maxLength={1500}
                      required
                      rows={3}
                      placeholder="Help your manager find the right next step."
                      disabled={!!busy}
                    />
                  </label>
                  <div className="tech-action-buttons">
                    <button
                      className="button small-button danger-text"
                      disabled={!!busy || note.trim().length < 5}
                    >
                      {busy === "decline" ? "Declining…" : "Confirm decline"}
                    </button>
                    <button
                      className="text-link"
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        setDeclining(false);
                        setNote("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {canWork && c.status === "Assigned" && (
            <>
              <p className="tech-muted">
                You’ve accepted this assignment. Start it when you begin the
                repair.
              </p>
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() => void act("start")}
              >
                <Wrench size={16} />
                {busy === "start" ? "Starting…" : "Start work"}
              </button>
            </>
          )}
          {canReport && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("progress");
                }}
              >
                <label>
                  Progress update
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    minLength={5}
                    maxLength={1500}
                    required
                    placeholder="What have you checked or completed? Any blockers?"
                    rows={4}
                    disabled={!!busy}
                  />
                </label>
                <button
                  className="button full-width"
                  disabled={!!busy || note.trim().length < 5}
                >
                  {busy === "progress"
                    ? "Saving update…"
                    : "Post progress update"}
                </button>
              </form>
              <div className="action-divider" />
              <h3>Ready for verification?</h3>
              <p className="tech-muted">
                Document the work, parts, cost, and photos. Your manager will
                verify the repair.
              </p>
              <button
                className="button primary"
                disabled={!!busy || showReport}
                onClick={() => {
                  setReportDraft("");
                  setShowReport(true);
                }}
              >
                <ClipboardCheck size={16} />
                {showReport ? "Report form is open" : "Submit repair report"}
              </button>
            </>
          )}
          {c.status === "Awaiting verification" && (
            <>
              <span className="icon-tile purple">
                <ShieldCheck size={20} />
              </span>
              <p className="tech-muted">
                No further action is needed right now. Your manager will review
                your report and may reopen the job if more work is needed.
              </p>
            </>
          )}
          {c.status === "Completed" && (
            <p className="success-box">
              <Check size={14} /> This repair has been verified.
            </p>
          )}
          <div className="action-divider" />
          <h3>Location</h3>
          <p className="tech-muted">
            {property?.name || c.propertyId}
            <br />
            {property?.address}
            <br />
            Room {c.room}
          </p>
          <h3>Assignment received</h3>
          <p className="tech-muted">
            {stamp(c.assignment?.assignedAt || c.createdAt)}
          </p>
        </aside>
      </div>
    </Modal>
  );
}

function PhotoGallery({ images, label }: { images: string[]; label: string }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div>
      <div className="complaint-images tech-photo-gallery">
        {images.map((src, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setExpanded(expanded === i ? null : i)}
            aria-expanded={expanded === i}
            aria-label={`View ${label.toLowerCase()} photo ${i + 1}`}
          >
            <Image
              src={src}
              width={320}
              height={220}
              alt={`${label} photo ${i + 1}`}
              unoptimized
            />
          </button>
        ))}
      </div>
      {expanded !== null && (
        <div className="tech-expanded-photo">
          <Image
            src={images[expanded]}
            width={900}
            height={650}
            alt={`${label} photo ${expanded + 1}, expanded`}
            unoptimized
          />
          <button
            type="button"
            className="button small-button"
            onClick={() => setExpanded(null)}
          >
            Close photo <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function RepairReport({ repair: r }: { repair: Repair }) {
  return (
    <article className="repair-report">
      <div className="row-between">
        <strong>{stamp(r.completedAt)}</strong>
        <Badge>
          {r.reopenedAt
            ? "Reopened"
            : r.verifiedAt
              ? "Verified"
              : "Awaiting verification"}
        </Badge>
      </div>
      <p className="description">{r.summary}</p>
      {r.workPerformed && (
        <p className="description">
          <strong>Work performed</strong>
          <br />
          {r.workPerformed}
        </p>
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
        <span>Total repair cost</span>
        <strong>{money(repairCost(r))}</strong>
      </div>
      {!!r.images?.length && (
        <PhotoGallery images={r.images} label="Completed work" />
      )}
    </article>
  );
}

function CompletionForm({
  initialSummary,
  busy,
  onSubmit,
  onCancel,
}: {
  initialSummary: string;
  busy: boolean;
  onSubmit: (report: ReportInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [workPerformed, setWorkPerformed] = useState("");
  const [labour, setLabour] = useState("0");
  const [parts, setParts] = useState<
    { id: number; name: string; quantity: string; unitCost: string }[]
  >([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const total =
    Number(labour || 0) +
    parts.reduce(
      (sum, p) => sum + Number(p.quantity || 0) * Number(p.unitCost || 0),
      0,
    );
  const changePart = (
    id: number,
    field: "name" | "quantity" | "unitCost",
    value: string,
  ) => setParts(parts.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  return (
    <section className="tech-completion">
      <div className="tech-completion-head">
        <span className="icon-tile green">
          <ClipboardCheck size={18} />
        </span>
        <div>
          <h3>Repair completion report</h3>
          <p>Describe the work you actually performed.</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (summary.trim().length < 10 || workPerformed.trim().length < 10) {
            setError(
              "Add at least 10 characters to both the summary and work performed.",
            );
            return;
          }
          void onSubmit({
            summary: summary.trim(),
            workPerformed: workPerformed.trim(),
            labour: Number(labour),
            parts: parts.map((p) => ({
              name: p.name.trim(),
              quantity: Number(p.quantity),
              unitCost: Number(p.unitCost),
            })),
            images,
          });
        }}
      >
        <fieldset disabled={busy || uploading}>
          <div className="form-grid">
            <label className="full">
              Repair summary
              <textarea
                autoFocus
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                placeholder="Summarize the issue found and the result of the repair."
              />
            </label>
            <label className="full">
              Work performed
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                placeholder="Document checks, adjustments, replacements, and how you tested the result."
              />
            </label>
            <label>
              Labour charge (₹)
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={labour}
                onChange={(e) => setLabour(e.target.value)}
              />
            </label>
          </div>
          <div className="tech-parts-head">
            <h4>
              Parts used <span className="tech-optional">Optional</span>
            </h4>
            <button
              type="button"
              className="text-link"
              disabled={parts.length >= 30}
              onClick={() =>
                setParts([
                  ...parts,
                  {
                    id: Math.max(0, ...parts.map((p) => p.id)) + 1,
                    name: "",
                    quantity: "1",
                    unitCost: "0",
                  },
                ])
              }
            >
              <Plus size={14} />
              Add part
            </button>
          </div>
          {parts.map((p, i) => (
            <div className="tech-part-row" key={p.id}>
              <label>
                Part {i + 1}
                <input
                  required
                  maxLength={100}
                  value={p.name}
                  placeholder="Part name"
                  onChange={(e) => changePart(p.id, "name", e.target.value)}
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  required
                  min="1"
                  max="1000"
                  step="1"
                  value={p.quantity}
                  onChange={(e) => changePart(p.id, "quantity", e.target.value)}
                />
              </label>
              <label>
                Unit cost (₹)
                <input
                  type="number"
                  required
                  min="0"
                  max="100000"
                  step="0.01"
                  value={p.unitCost}
                  onChange={(e) => changePart(p.id, "unitCost", e.target.value)}
                />
              </label>
              <button
                className="icon-button danger-text"
                type="button"
                aria-label={`Remove part ${i + 1}`}
                onClick={() =>
                  setParts(parts.filter((item) => item.id !== p.id))
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="cost-line total tech-report-total">
            <span>Total reported cost</span>
            <strong>{money(total)}</strong>
          </div>
          <label className="upload-zone tech-upload">
            <ImagePlus size={23} />
            <strong>Attach work photos</strong>
            <span>Up to 3 JPG, PNG, or WebP images · 1 MB each</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={images.length >= 3 || uploading || busy}
              aria-label="Attach completed work photos"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                setUploading(true);
                setError("");
                try {
                  const added = await readPhotos(files, images.length);
                  setImages([...images, ...added]);
                } catch (ex) {
                  setError((ex as Error).message);
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {uploading && (
            <p className="tech-muted" role="status">
              Preparing photos…
            </p>
          )}
          {images.length > 0 && (
            <div className="photo-row">
              {images.map((src, i) => (
                <div key={i}>
                  <Image
                    src={src}
                    width={90}
                    height={70}
                    alt={`Work photo ${i + 1}`}
                    unoptimized
                  />
                  <button
                    type="button"
                    aria-label={`Remove work photo ${i + 1}`}
                    onClick={() =>
                      setImages(images.filter((_, index) => index !== i))
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="info-note tech-report-note">
            <ShieldCheck size={17} />
            <span>
              Submitting changes this job to{" "}
              <strong>Awaiting verification</strong>. Your manager confirms the
              repair and final cost.
            </span>
          </div>
          <div className="form-footer">
            <button className="button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button className="button primary">
              <Check size={15} />
              {busy ? "Submitting…" : "Submit for verification"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
