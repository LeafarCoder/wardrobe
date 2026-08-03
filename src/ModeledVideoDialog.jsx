import { Check, Clock, FilmStrip, Play, Sparkle, SpinnerGap, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tr } from "./i18n.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import {
  estimateVideoCost,
  normalizeModeledVideoSettings,
  RECOMMENDED_VIDEO_MODEL,
  resolveModeledVideoAspectRatio,
  VIDEO_AUDIO_OPTIONS,
  VIDEO_ASPECT_RATIO_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_FRAME_OPTIONS,
  VIDEO_MOVEMENT_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
  videoModel,
} from "./video-generation.js";
import "./modeled-video-dialog.css";

function money(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.1 ? 3 : 2,
    maximumFractionDigits: value < 0.1 ? 3 : 2,
  }).format(value);
}

export function ModeledVideoDialog({
  itemName,
  look,
  preferredModel = RECOMMENDED_VIDEO_MODEL,
  onClose,
  onGenerate,
  onPoll,
}) {
  const closeRef = useRef(null);
  const selectedModel = videoModel(preferredModel);
  const [settings, setSettings] = useState(() => normalizeModeledVideoSettings({}, selectedModel.id));
  const [selectedClipId, setSelectedClipId] = useState(() => look.videoClips?.at(-1)?.id || null);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");
  const clips = Array.isArray(look.videoClips) ? look.videoClips : [];
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) || clips.at(-1) || null;
  const movement = VIDEO_MOVEMENT_OPTIONS.find((option) => option.id === settings.movement);
  const durationIndex = Math.max(0, VIDEO_DURATION_OPTIONS.indexOf(settings.duration));
  const combinationSupported = selectedModel.durations.includes(settings.duration)
    && selectedModel.resolutions.includes(settings.resolution)
    && selectedModel.frames.includes(settings.frameType);
  const sourceAspectRatio = resolveModeledVideoAspectRatio("original", { imageRatio: look.context?.imageRatio });
  const selectedAspectRatio = resolveModeledVideoAspectRatio(
    selectedClip?.settings?.aspectRatio || settings.aspectRatio,
    { imageRatio: look.context?.imageRatio },
  );
  const estimate = useMemo(
    () => estimateVideoCost({ ...settings, sourceAspectRatio }),
    [settings, sourceAspectRatio],
  );

  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    if (!selectedClip || !["pending", "in_progress"].includes(selectedClip.status) || polling) return undefined;
    const timeout = setTimeout(async () => {
      setPolling(true);
      try {
        await onPoll(selectedClip.id);
      } catch (requestError) {
        setError(requestError?.message || tr("Could not check the video generation status."));
      } finally {
        setPolling(false);
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [onPoll, polling, selectedClip]);

  const update = (field, value) => setSettings((current) => ({ ...current, [field]: value }));

  const generate = async () => {
    if (submitting || !combinationSupported) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await onGenerate(settings);
      setSelectedClipId(result.clipId);
    } catch (requestError) {
      setError(requestError?.message || tr("Could not start the video generation."));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal((
    <div className="modeled-video-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modeled-video-dialog" role="dialog" aria-modal="true" aria-labelledby="modeled-video-title">
        <header>
          <div>
            <p>{tr("Modeled look video")}</p>
            <h2 id="modeled-video-title">{tr("Bring this look to life")}</h2>
            <span>{tr("Direct a short fashion clip while preserving the person, outfit, and scene.")}</span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={tr("Close video options")}><X size={21} /></button>
        </header>

        <div className="modeled-video-dialog__body">
          <aside className="modeled-video-dialog__preview" style={{ "--modeled-video-preview-ratio": selectedAspectRatio.replace(":", " / ") }}>
            {selectedClip?.status === "completed" && selectedClip.video ? (
              <video src={selectedClip.video} controls playsInline preload="metadata" aria-label={tr("Generated video for {name}", { name: itemName })} />
            ) : (
              <div>
                <OptimizedImage src={look.preview || look.image} alt={tr("Modeled look for {name}", { name: itemName })} sizes="(max-width: 760px) 88vw, 360px" />
                {selectedClip && ["pending", "in_progress"].includes(selectedClip.status) && (
                  <span className="modeled-video-dialog__progress">
                    <SpinnerGap className="spin" size={19} />
                    <strong>{tr("Generating video…")}</strong>
                    <small>{tr("This usually takes several minutes. You can close this window and return later.")}</small>
                  </span>
                )}
              </div>
            )}
            {clips.length > 0 && (
              <div className="modeled-video-dialog__clips" aria-label={tr("Generated clips")}>
                {clips.map((clip, index) => (
                  <button type="button" className={clip.id === selectedClip?.id ? "is-selected" : ""} onClick={() => setSelectedClipId(clip.id)} key={clip.id}>
                    {clip.status === "completed" ? <Play size={13} weight="fill" /> : clip.status === "failed" ? <X size={13} /> : <Clock size={13} />}
                    <span>{tr("Clip {number}", { number: index + 1 })}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="modeled-video-dialog__controls">
            <section className="modeled-video-model-card">
              <FilmStrip size={18} />
              <div><span>{tr("Preferred model")}</span><strong>{selectedModel.label}{selectedModel.id === RECOMMENDED_VIDEO_MODEL ? ` (${tr("recommended")})` : ""}</strong><small>{tr(selectedModel.note)}</small></div>
            </section>

            <fieldset className="modeled-video-fieldset">
              <legend>{tr("Length")}</legend>
              <input
                type="range"
                min="0"
                max={VIDEO_DURATION_OPTIONS.length - 1}
                step="1"
                value={durationIndex}
                onChange={(event) => update("duration", VIDEO_DURATION_OPTIONS[Number(event.target.value)])}
                aria-label={tr("Video length")}
              />
              <div className="modeled-video-duration-labels">
                {VIDEO_DURATION_OPTIONS.map((duration) => (
                  <button type="button" className={settings.duration === duration ? "is-selected" : ""} onClick={() => update("duration", duration)} key={duration}>
                    {duration}s
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="modeled-video-fieldset">
              <legend>{tr("Resolution")}</legend>
              <div className="modeled-video-options is-compact">
                {VIDEO_RESOLUTION_OPTIONS.map((resolution) => {
                  const supported = selectedModel.resolutions.includes(resolution.id);
                  return (
                    <button type="button" className={settings.resolution === resolution.id ? "is-selected" : ""} disabled={!supported} onClick={() => update("resolution", resolution.id)} key={resolution.id}>
                      {settings.resolution === resolution.id && <Check size={12} weight="bold" />}{resolution.label}
                      {!supported && <small>{tr("Unavailable")}</small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="modeled-video-fieldset">
              <legend>{tr("Aspect ratio")}</legend>
              <div className="modeled-video-options is-ratio">
                {VIDEO_ASPECT_RATIO_OPTIONS.map((option) => (
                  <button type="button" className={settings.aspectRatio === option.id ? "is-selected" : ""} onClick={() => update("aspectRatio", option.id)} key={option.id}>
                    {settings.aspectRatio === option.id && <Check size={12} weight="bold" />}
                    <span><strong>{tr(option.label)}</strong><small>{tr(option.description)}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="modeled-video-fieldset">
              <legend>{tr("Use this image as")}</legend>
              <div className="modeled-video-options">
                {VIDEO_FRAME_OPTIONS.map((option) => (
                  <button type="button" className={settings.frameType === option.id ? "is-selected" : ""} disabled={!selectedModel.frames.includes(option.id)} onClick={() => update("frameType", option.id)} key={option.id}>
                    {settings.frameType === option.id && <Check size={12} weight="bold" />}
                    <span><strong>{tr(option.label)}</strong><small>{tr(option.description)}</small></span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="modeled-video-fieldset">
              <legend>{tr("Movement")}</legend>
              <div className="modeled-video-options is-movement">
                {VIDEO_MOVEMENT_OPTIONS.map((option) => (
                  <button type="button" className={settings.movement === option.id ? "is-selected" : ""} onClick={() => update("movement", option.id)} key={option.id}>
                    {settings.movement === option.id && <Check size={12} weight="bold" />}{tr(option.label)}
                  </button>
                ))}
              </div>
            </fieldset>

            {movement?.objectDescription && (
              <label className="modeled-video-text-field">
                <span>{tr("Object to grab")}</span>
                <input value={settings.objectDescription} maxLength="200" placeholder={tr("Example: a red umbrella on the café table")} onChange={(event) => update("objectDescription", event.target.value)} />
              </label>
            )}

            <label className="modeled-video-text-field">
              <span>{tr("Additional direction")} <small>{tr("optional")}</small></span>
              <textarea rows="3" maxLength="600" value={settings.direction} placeholder={tr("Describe camera movement, pace, expression, or any other action…")} onChange={(event) => update("direction", event.target.value)} />
            </label>

            <section className="modeled-video-audio">
              <label>
                <span><strong>{tr("Generate audio")}</strong><small>{tr("Add synchronized ambient sound to the clip.")}</small></span>
                <input type="checkbox" checked={settings.audio} disabled={!selectedModel.audio} onChange={(event) => update("audio", event.target.checked)} />
              </label>
              {!selectedModel.audio && <small>{tr("This model does not offer generated audio.")}</small>}
              {settings.audio && (
                <>
                  <div className="modeled-video-options is-audio">
                    {VIDEO_AUDIO_OPTIONS.map((option) => (
                      <button type="button" className={settings.audioPreset === option.id ? "is-selected" : ""} onClick={() => update("audioPreset", option.id)} key={option.id}>
                        {settings.audioPreset === option.id && <Check size={12} weight="bold" />}{tr(option.label)}
                      </button>
                    ))}
                  </div>
                  <label className="modeled-video-text-field">
                    <span>{tr("Sound direction")} <small>{tr("optional")}</small></span>
                    <textarea rows="2" maxLength="400" value={settings.audioDirection} placeholder={tr("Describe timing, intensity, distance, or another sound…")} onChange={(event) => update("audioDirection", event.target.value)} />
                  </label>
                </>
              )}
            </section>

            <section className="modeled-video-estimate" aria-live="polite">
              <div><span>{tr("Estimated generation cost")}</span><strong>{money(estimate)}</strong></div>
              <small>{tr("Estimate for {model}, {duration}s at {resolution}, {audio}. OpenRouter charges the actual provider cost.", { model: selectedModel.label, duration: settings.duration, resolution: settings.resolution, audio: tr(settings.audio ? "with audio" : "without audio") })}</small>
            </section>

            {!selectedModel.durations.includes(settings.duration) && <p className="modeled-video-error">{tr("{model} does not support {duration}-second clips. Choose another length or change the preferred model in AI & costs.", { model: selectedModel.label, duration: settings.duration })}</p>}
            {selectedClip?.status === "failed" && <p className="modeled-video-error">{selectedClip.error || tr("Video generation failed. Try again.")}</p>}
            {error && <p className="modeled-video-error" role="alert">{error}</p>}
          </div>
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>{tr("Close")}</button>
          <button className="primary-button" type="button" disabled={submitting || !combinationSupported} onClick={generate}>
            {submitting ? <SpinnerGap className="spin" size={15} /> : <Sparkle size={15} weight="fill" />}
            {tr(submitting ? "Starting…" : "Generate video")}
          </button>
        </footer>
      </section>
    </div>
  ), document.body);
}
