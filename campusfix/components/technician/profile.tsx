"use client";

import { useState } from "react";
import { Check, MapPin, ShieldCheck, Wrench } from "lucide-react";
import type { TechnicianProfile } from "@/lib/portal/types";
import { categories, type Category } from "@/lib/manager/domain";
import { portalApi } from "@/components/portal/ui";

export function TechnicianProfileForm({
  technician,
  onSaved,
}: {
  technician: TechnicianProfile;
  onSaved: () => Promise<void>;
}) {
  const [specialization, setSpecialization] = useState<Category[]>(
    technician.specialization,
  );
  const [serviceArea, setServiceArea] = useState(technician.serviceArea);
  const [bio, setBio] = useState(technician.bio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel tech-profile-form">
      <div className="section-head">
        <div>
          <h2>Skills & service area</h2>
          <p>Help managers match the right work to your expertise.</p>
        </div>
        <span className="icon-tile blue">
          <Wrench size={18} />
        </span>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setSaved(false);
          if (!specialization.length) {
            setError("Choose at least one specialization.");
            return;
          }
          setBusy(true);
          try {
            await portalApi("/api/technician/profile", {
              method: "PATCH",
              body: JSON.stringify({
                specialization,
                serviceArea: serviceArea.trim(),
                bio: bio.trim(),
              }),
            });
            await onSaved();
            setSaved(true);
          } catch (ex) {
            setError((ex as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <fieldset className="tech-specializations">
            <legend>Specializations</legend>
            <div>
              {categories.map((category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={specialization.includes(category)}
                    onChange={(e) => {
                      setSaved(false);
                      setSpecialization(
                        e.target.checked
                          ? [...specialization, category]
                          : specialization.filter((s) => s !== category),
                      );
                    }}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Service area
            <input
              value={serviceArea}
              onChange={(e) => {
                setSaved(false);
                setServiceArea(e.target.value);
              }}
              required
              minLength={3}
              maxLength={160}
              placeholder="For example: North campus and residence halls"
            />
          </label>
          <label>
            About your work
            <textarea
              value={bio}
              onChange={(e) => {
                setSaved(false);
                setBio(e.target.value);
              }}
              maxLength={1000}
              rows={4}
              placeholder="Your experience, areas of expertise, and useful service details."
            />
          </label>
          <div className="info-note">
            <ShieldCheck size={17} />
            <span>
              {technician.verified
                ? "Your profile is verified. Changing specializations requires a new manager review and is available after active jobs are finished."
                : "A manager will verify your technician profile. Keeping your skills and service area accurate helps the review."}
            </span>
          </div>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="success-box" role="status">
              Your skills and service area have been saved.
            </p>
          )}
          <div className="form-footer">
            <button className="button primary">
              <Check size={15} />
              {busy ? "Saving…" : "Save technician profile"}
            </button>
          </div>
        </fieldset>
      </form>
      <div className="tech-profile-foot">
        <MapPin size={14} />
        <span>
          Use the availability switch above whenever you go on or off duty.
        </span>
      </div>
    </section>
  );
}
