import { Check, Sparkle, SpinnerGap, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { tr } from "./i18n.js";
import {
  EMPTY_MODELED_LOOK_CONTEXT,
  MODELED_LOOK_CONTEXT_OPTIONS,
} from "./modeled-look-context.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import "./modeled-look-dialog.css";

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <fieldset className="modeled-context__group">
      <legend>{tr(label)}</legend>
      <div className="modeled-context__choices">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "is-selected" : ""}
            aria-pressed={value === option.id}
            onClick={() => onChange(value === option.id ? "" : option.id)}
          >
            {value === option.id && <Check size={12} weight="bold" aria-hidden="true" />}
            {tr(option.label)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ModeledLookDialog({
  garmentName,
  colorVersions,
  busy,
  onClose,
  onGenerate,
}) {
  const closeButtonRef = useRef(null);
  const [variantId, setVariantId] = useState(null);
  const [context, setContext] = useState(() => ({ ...EMPTY_MODELED_LOOK_CONTEXT }));
  const [error, setError] = useState("");
  const settingOptions = context.environmentType === "inside"
    ? MODELED_LOOK_CONTEXT_OPTIONS.insideSetting
    : context.environmentType === "outside"
      ? MODELED_LOOK_CONTEXT_OPTIONS.outsideSetting
      : [];

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const update = (field, value) => {
    setContext((current) => ({
      ...current,
      [field]: value,
      ...(field === "environmentType" ? { setting: "" } : {}),
    }));
  };

  const submit = async () => {
    setError("");
    try {
      await onGenerate(variantId, context);
    } catch (requestError) {
      setError(requestError?.message || tr("Could not create the style look"));
    }
  };

  return (
    <div
      className="modeled-context-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section className="modeled-context" role="dialog" aria-modal="true" aria-labelledby="modeled-context-title">
        <header>
          <div>
            <p>{tr("Create a style look")}</p>
            <h2 id="modeled-context-title">{tr("Direct the new photo")}</h2>
            <span>{tr("Choose only what matters. Leave everything blank for a freely composed image.")}</span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} aria-label={tr("Close style look options")}>
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        <div className="modeled-context__body">
          {colorVersions.length > 1 && (
            <fieldset className="modeled-context__group modeled-context__versions">
              <legend>{tr("Garment version")}</legend>
              <div className="modeled-context__version-list">
                {colorVersions.map((version, index) => {
                  const selected = (version.id || null) === variantId;
                  return (
                    <button
                      key={version.id || "original"}
                      type="button"
                      className={selected ? "is-selected" : ""}
                      aria-pressed={selected}
                      onClick={() => setVariantId(version.id || null)}
                    >
                      <OptimizedImage src={version.thumbnail || version.preview || version.image} alt="" sizes="64px" />
                      <span>{tr(version.original ? "Original" : "Color version {number}", { number: index })}</span>
                      {selected && <Check size={13} weight="bold" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="modeled-context__columns">
            <div>
              <ChoiceGroup label="Pose" options={MODELED_LOOK_CONTEXT_OPTIONS.pose} value={context.pose} onChange={(value) => update("pose", value)} />
              <ChoiceGroup label="Body orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.bodyOrientation} value={context.bodyOrientation} onChange={(value) => update("bodyOrientation", value)} />
              <ChoiceGroup label="Head orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.headOrientation} value={context.headOrientation} onChange={(value) => update("headOrientation", value)} />
            </div>
            <div>
              <ChoiceGroup label="Environment" options={MODELED_LOOK_CONTEXT_OPTIONS.environmentType} value={context.environmentType} onChange={(value) => update("environmentType", value)} />
              {settingOptions.length > 0 && (
                <ChoiceGroup
                  label={context.environmentType === "inside" ? "Interior setting" : "Open-air setting"}
                  options={settingOptions}
                  value={context.setting}
                  onChange={(value) => update("setting", value)}
                />
              )}
              <ChoiceGroup label="Weather" options={MODELED_LOOK_CONTEXT_OPTIONS.weather} value={context.weather} onChange={(value) => update("weather", value)} />
              <ChoiceGroup label="Expression" options={MODELED_LOOK_CONTEXT_OPTIONS.expression} value={context.expression} onChange={(value) => update("expression", value)} />
            </div>
          </div>

          <label className="modeled-context__additional">
            <span>{tr("More direction")}</span>
            <textarea
              value={context.additionalDirection}
              maxLength={800}
              rows={3}
              placeholder={tr("Add any other detail for this photo…")}
              onChange={(event) => update("additionalDirection", event.target.value)}
            />
            <small>{tr("Optional · {count}/800", { count: context.additionalDirection.length })}</small>
          </label>
        </div>

        <footer>
          <div>
            <strong>{garmentName}</strong>
            <span>{tr("Selections apply only to this new image.")}</span>
          </div>
          {error && <p className="modeled-context__error" role="alert">{error}</p>}
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
          <button className="primary-button" type="button" onClick={submit} disabled={busy}>
            {busy ? <SpinnerGap className="modeled-context__spinner" size={16} aria-hidden="true" /> : <Sparkle size={16} weight="fill" aria-hidden="true" />}
            {tr(busy ? "Creating style look…" : "Create look")}
          </button>
        </footer>
      </section>
    </div>
  );
}
