import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, Plus, SpinnerGap, Trash, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import "./import-flow.css";

const API = "/api/import/jobs";
const CONFIG_API = "/api/import/config";
const PARTS = [
  ["upperbody", "Tops"],
  ["wholebody_up", "Jackets"],
  ["lowerbody", "Bottoms"],
  ["accessories_up", "Accessories"],
  ["shoes", "Shoes"],
];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("Could not read that image."));
  reader.readAsDataURL(file);
});

async function api(path, options, userId) {
  const url = new URL(path, window.location.origin);
  if (userId) url.searchParams.set("user", userId);
  const response = await fetch(`${url.pathname}${url.search}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && value.code === "authentication_required") {
      window.dispatchEvent(new Event("wardrobe:unauthorized"));
    }
    const requestError = new Error(value.error || value.detail || "The import job could not be updated.");
    requestError.status = response.status;
    requestError.code = value.code;
    throw requestError;
  }
  return value;
}

export function readableError(error) {
  const message = typeof error === "string" ? error : error?.message || "";
  const keyName = message.match(/\b(?:OPENROUTER|OPENAI)_API_KEY\b/i)?.[0]?.toUpperCase();
  if (keyName && /(not configured|required|missing|add)/i.test(message)) {
    return `Add ${keyName} to .env, then restart the app.`;
  }
  if (/(incorrect|invalid).*(api key)|api key.*(incorrect|invalid)|authentication|unauthorized/i.test(message) || error?.status === 401) {
    if (/rejected the api key/i.test(message)) return message;
    return `The configured AI provider rejected the API key. Check ${keyName || "the API key in .env"}, make sure it is active, then restart the app.`;
  }
  if (/insufficient_quota|quota|billing|credits|payment required/i.test(message) || error?.status === 402) {
    if (/has no available credit/i.test(message)) return message;
    return "The configured AI provider account has no available credit. Check its credits and spending limits, then try again.";
  }
  if (/model.*(not found|does not exist|unavailable)|access to.*model|permission.*model/i.test(message)) {
    if (/could not find or access|denied access/i.test(message)) return message;
    return "The configured AI model is unavailable to this API key. Check the model names in .env, then restart the app.";
  }
  if (/failed to fetch|network|ECONN|could not reach (?:OpenAI|OpenRouter)/i.test(message)) {
    if (/could not reach (?:OpenAI|OpenRouter)/i.test(message)) return message;
    return "The app could not reach the configured AI provider. Check your internet connection and API base URL, then try again.";
  }
  if (/request body too large/i.test(message)) {
    return "That image is too large. Choose a smaller image and try again.";
  }
  if (/unsupported image|input buffer|could not read.*image|image payload is empty/i.test(message)) {
    return "The app could not read that image. Try a JPEG, PNG, or WebP file.";
  }
  if (!message || /internal server error/i.test(message)) {
    return "The AI request failed on the server. Check the backend logs and try again.";
  }
  return message;
}

function setupError(status) {
  if (status?.configurationError) return status.configurationError;
  const apiKeyName = status?.apiKeyName || "OPENAI_API_KEY";
  const providerLabel = status?.providerLabel ? ` for ${status.providerLabel}` : "";
  if (status?.hasApiKey === false) return `Add ${apiKeyName} to .env${providerLabel}, then restart the app.`;
  return status?.error || "The importer setup could not be verified. Check the terminal and restart the app.";
}

function ImportToast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`import-toast is-${toast.tone || "error"}`} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"}>
      <WarningCircle size={20} weight="fill" aria-hidden="true" />
      <div className="import-toast__copy">
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
      <button className="import-toast__close" type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={17} /></button>
    </div>
  );
}

function deriveStatus(job) {
  const crop = job.stages?.crop;
  const garment = job.stages?.garment;
  if (job.error || crop?.status === "failed" || garment?.status === "failed") return { tone: "error", text: "Import needs attention", detail: crop?.error || garment?.error || job.error };
  if (garment?.status === "review") return { tone: "ready", text: "Ready for review" };
  if (garment?.status === "approved") return { tone: "complete", text: "Added to wardrobe" };
  if (crop?.status === "review") return { tone: "ready", text: "Crop ready for review" };
  if (crop?.status === "approved") return { tone: "processing", text: "Creating garment image" };
  if (crop?.status === "rejected" || garment?.status === "rejected") return { tone: "complete", text: "Import declined" };
  return { tone: "processing", text: "Extracting clothing from image" };
}

function reviewStageFor(job) {
  if (job.stages?.garment?.status === "review") return "garment";
  if (job.stages?.crop?.status === "review") return "crop";
  return null;
}

function hasCleanupFailure(job) {
  return job.stages?.garment?.status === "failed" && Boolean(job.stages?.garment?.failedAssetUrl);
}

function defaultDraft(job) {
  const metadata = job.metadata || {};
  return {
    name: metadata.name || "New piece",
    part: metadata.part || "upperbody",
    color: metadata.color || "#d8d0c2",
    secondaryColor: metadata.secondaryColor || "",
    tags: Array.isArray(metadata.tags) ? metadata.tags.join(", ") : (metadata.tags || ""),
  };
}

function ReviewEditor({ job, stage, draft, setDraft, regenPrompt, setRegenPrompt, busy, onAction }) {
  const asset = job.stages[stage]?.assetUrl;
  const isCrop = stage === "crop";
  const isGarment = stage === "garment";
  const primaryValid = HEX_COLOR.test(draft.color);
  const secondaryValid = !draft.secondaryColor || HEX_COLOR.test(draft.secondaryColor);
  return (
    <div className="import-editor">
      <img className="import-editor__preview" src={asset} alt={isCrop ? "Detected item crop" : isGarment ? "Extracted garment" : "Generated modeled look"} />
      <div className="import-fields">
        <p className="import-editor__stage">{isCrop ? "Detected item" : isGarment ? "Garment image" : "Modeled image"}</p>
        {isCrop ? <p className="import-card__detail">Check that this crop contains the complete intended item. Approving it starts the clean garment-image generation.</p> : isGarment ? (
          <>
            <div className="import-field"><label htmlFor={`name-${job.id}`}>Name</label><input id={`name-${job.id}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
            <div className="import-field"><label htmlFor={`part-${job.id}`}>Category</label><select id={`part-${job.id}`} value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}>{PARTS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></div>
            <div className="import-field"><label htmlFor={`primary-${job.id}`}>Primary color</label><div className="import-color-row"><input id={`primary-${job.id}`} type="color" value={primaryValid ? draft.color : "#000000"} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><input aria-label="Primary color hex" aria-invalid={!primaryValid} value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></div>{!primaryValid && <small className="import-field-error">Use a six-digit hex color, such as #d8d0c2.</small>}</div>
            <div className="import-field"><label htmlFor={`secondary-${job.id}`}>Secondary color <span>optional</span></label><input id={`secondary-${job.id}`} type="text" aria-invalid={!secondaryValid} placeholder="#hex or leave blank" value={draft.secondaryColor} onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })} />{!secondaryValid && <small className="import-field-error">Use a six-digit hex color or leave this empty.</small>}</div>
            <div className="import-field"><label htmlFor={`tags-${job.id}`}>Details</label><input id={`tags-${job.id}`} value={draft.tags} placeholder="casual, cotton, striped" onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></div>
            <p className="import-card__detail">Adding this piece finishes the import. A modeled look is generated only if you request one later from the item panel.</p>
          </>
        ) : <p className="import-card__detail">Approve this editorial image to attach it to the new wardrobe piece, or regenerate it with a more specific direction.</p>}
        {!isCrop && <div className="import-field import-regenerate-field">
          <label htmlFor={`regenerate-${job.id}-${stage}`}>Regeneration direction <span>optional</span></label>
          <textarea id={`regenerate-${job.id}-${stage}`} rows="3" value={regenPrompt} onChange={(event) => setRegenPrompt(event.target.value)} placeholder={isGarment ? "Example: preserve the original zipper and remove the retail tag" : "Example: use a quiet evening street and show the full garment"} />
        </div>}
        <div className="import-actions">
          <button className="import-button" disabled={busy} onClick={() => onAction("reject")}><Trash size={14} /> Reject</button>
          {!isCrop && <button className="import-button" disabled={busy} onClick={() => onAction("regenerate", regenPrompt)}><ArrowCounterClockwise size={14} /> Regenerate</button>}
          <button className="import-button import-button--primary" disabled={busy || (isGarment && (!draft.name.trim() || !primaryValid || !secondaryValid))} onClick={() => onAction("approve")}><Check size={14} weight="bold" /> {isCrop ? "Use crop" : isGarment ? "Add to wardrobe" : "Approve"}</button>
        </div>
      </div>
    </div>
  );
}

function CleanupEditor({ job, tolerance, setTolerance, busy, onPreview, onAccept }) {
  const stage = job.stages.garment;
  const contaminated = stage.cleanupDiagnostics?.contaminatedPixels;
  const previewTimer = useRef(null);
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  const updateTolerance = (next) => {
    setTolerance(next);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => onPreview(next), 300);
  };
  return (
    <div className="import-cleanup-editor">
      <p className="import-editor__stage">Background cleanup</p>
      <p className="import-card__detail">The generated garment is preserved below. Adjust the cleanup locally—this does not call the image model again.</p>
      <div className="import-cleanup-comparison">
        <figure><img src={stage.failedAssetUrl} alt="Generated garment on its chroma background" /><figcaption>Generated source</figcaption></figure>
        <figure><img src={stage.cleanupPreviewUrl || stage.failedAssetUrl} alt="Transparent garment cleanup preview" /><figcaption>{stage.cleanupPreviewUrl ? "Cleanup preview" : "Preview appears here"}</figcaption></figure>
      </div>
      <div className="import-field import-cleanup-strength">
        <label htmlFor={`cleanup-${job.id}`}>Cleanup strength <strong>{tolerance}</strong></label>
        <input id={`cleanup-${job.id}`} type="range" min="18" max="110" step="2" value={tolerance} onChange={(event) => updateTolerance(Number(event.target.value))} />
        <div className="import-cleanup-scale"><span>Preserve more edge detail</span><span>Remove more background</span></div>
      </div>
      {Number.isFinite(contaminated) && <p className="import-card__detail">The automated check sees {contaminated.toLocaleString()} tinted edge {contaminated === 1 ? "pixel" : "pixels"}. If the preview looks clean, you can still use it.</p>}
      <div className="import-actions">
        <button className="import-button" disabled={busy} onClick={() => onPreview(tolerance)}><ArrowCounterClockwise size={14} /> Preview cleanup</button>
        <button className="import-button import-button--primary" disabled={busy} onClick={onAccept}><Check size={14} weight="bold" /> Use this cleanup</button>
      </div>
    </div>
  );
}

export function WardrobeImportFlow({ userId, onGarmentApproved }) {
  const inputRef = useRef(null);
  const notifiedFailures = useRef(new Set());
  const [jobs, setJobs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [regenerationPrompts, setRegenerationPrompts] = useState({});
  const [cleanupTolerances, setCleanupTolerances] = useState({});
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [toast, setToast] = useState(null);
  const [notice, setNotice] = useState(null);
  const [setup, setSetup] = useState(null);

  const showError = useCallback((error, title = "Import failed") => {
    setToast({ id: Date.now(), tone: "error", title, message: readableError(error) });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 9000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    api(CONFIG_API, undefined, userId)
      .then((status) => {
        setSetup(status);
        if (!status.ready) showError(setupError(status), "Import setup required");
      })
      .catch((requestError) => {
        const status = { ready: false, error: readableError(requestError) };
        setSetup(status);
        showError(status.error, "Could not check import setup");
      });
    api(API, undefined, userId)
      .then((storedJobs) => {
        const visibleJobs = storedJobs.filter((job) => job.status !== "complete" && job.stages?.crop?.status !== "rejected" && job.stages?.garment?.status !== "rejected");
        setJobs(visibleJobs);
        setDrafts(Object.fromEntries(visibleJobs.map((job) => [job.id, defaultDraft(job)])));
      })
      .catch((requestError) => showError(requestError, "Could not load imports"));
  }, [showError, userId]);

  const refresh = useCallback(async (id) => {
    try {
      const next = await api(`${API}/${id}`, undefined, userId);
      const failedStage = ["crop", "garment"].find((stage) => next.stages?.[stage]?.status === "failed");
      const failureDetail = next.error || (failedStage ? next.stages[failedStage]?.error : null);
      if (failureDetail) {
        const signature = `${next.id}:${failedStage || "job"}:${next.stages?.[failedStage]?.updatedAt || next.updatedAt}:${failureDetail}`;
        if (!notifiedFailures.current.has(signature)) {
          notifiedFailures.current.add(signature);
          showError(failureDetail, failedStage === "garment" ? "Garment image failed" : "Import failed");
        }
      }
      setJobs((current) => current.map((job) => job.id === id ? next : job));
      setDrafts((current) => current[id] ? current : { ...current, [id]: defaultDraft(next) });
    } catch (requestError) { showError(requestError); }
  }, [showError, userId]);

  useEffect(() => {
    if (!jobs.some((job) => job.stages?.crop?.status === "approved" && ["processing", "pending", "queued"].includes(job.stages?.garment?.status))) return undefined;
    const timer = setInterval(() => jobs.forEach((job) => refresh(job.id)), 900);
    return () => clearInterval(timer);
  }, [jobs, refresh]);

  const submitFiles = useCallback(async (files) => {
    if (!setup?.ready) {
      setOpen(true);
      showError(setupError(setup), "Import setup required");
      return;
    }
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      showError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setDragging(false); setNotice(null); setOpen(true);
    for (const [index, file] of images.entries()) {
      setAnalysis({ current: index + 1, total: images.length, name: file.name });
      try {
        const imageDataUrl = await fileToDataUrl(file);
        const result = await api(API, { method: "POST", body: JSON.stringify({ imageDataUrl, metadata: { name: file.name.replace(/\.[^.]+$/, "") } }) }, userId);
        const createdJobs = result.jobs || [result];
        if (!createdJobs.length && result.noClothingDetected) {
          setNotice({ tone: "complete", text: "No clothing detected", detail: `We couldn’t find a distinct wearable item in ${file.name}. Try a clearer or more tightly framed image.` });
          setOpen(true);
          continue;
        }
        setJobs((current) => [...current, ...createdJobs]);
        setDrafts((current) => ({ ...current, ...Object.fromEntries(createdJobs.map((job) => [job.id, defaultDraft(job)])) }));
      } catch (requestError) {
        showError(requestError, `Could not import ${file.name}`);
      }
    }
    setAnalysis(null);
  }, [setup, showError, userId]);

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event) => { if (![...event.dataTransfer.types].includes("Files")) return; event.preventDefault(); depth += 1; setDragging(true); };
    const onDragOver = (event) => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); };
    const onDragLeave = (event) => { event.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const onDrop = (event) => { event.preventDefault(); depth = 0; setDragging(false); submitFiles(event.dataTransfer.files); };
    const onPaste = (event) => { const files = [...event.clipboardData.files]; if (files.some((file) => file.type.startsWith("image/"))) { event.preventDefault(); submitFiles(files); } };
    window.addEventListener("dragenter", onDragEnter); window.addEventListener("dragover", onDragOver); window.addEventListener("dragleave", onDragLeave); window.addEventListener("drop", onDrop); window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("dragenter", onDragEnter); window.removeEventListener("dragover", onDragOver); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("drop", onDrop); window.removeEventListener("paste", onPaste); };
  }, [submitFiles]);

  const perform = async (job, stage, action, prompt = "") => {
    setBusyId(job.id);
    try {
      if (stage === "garment" && action === "approve") {
        const draft = drafts[job.id];
        const metadata = { ...draft, secondaryColor: draft.secondaryColor || null, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
        await api(`${API}/${job.id}/metadata`, { method: "PATCH", body: JSON.stringify({ metadata }) }, userId);
        const updated = await api(`${API}/${job.id}/stages/garment/approve`, { method: "POST" }, userId);
        onGarmentApproved?.(updated.importedRecord || {
          id: `import-${job.id}`,
          ...metadata,
          boundingBox: updated.metadata?.boundingBox || job.metadata?.boundingBox || null,
          originalFocusBox: updated.originalFocusBox || job.originalFocusBox || null,
          image: `/api/import/library/import-${job.id}-garment.png?user=${encodeURIComponent(userId)}`,
          thumbnail: `/api/import/library/import-${job.id}-garment.png?user=${encodeURIComponent(userId)}`,
          modeledImage: null,
          originalImage: `/api/import/library/import-${job.id}-original.png?user=${encodeURIComponent(userId)}`,
          palette: [metadata.color, metadata.secondaryColor].filter(Boolean),
          importJobId: job.id,
        });
        const remainingJobs = jobs.filter((item) => item.id !== job.id);
        setJobs(remainingJobs);
        setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== job.id)));
        setSelectedReviewId(null);
        if (!remainingJobs.length) setOpen(false);
      } else {
        const updated = await api(`${API}/${job.id}/stages/${stage}/${action}`, { method: "POST", body: action === "regenerate" ? JSON.stringify({ prompt }) : undefined }, userId);
        const removeFromQueue = action === "reject" || (stage === "modeled" && action === "approve");
        const remainingJobs = removeFromQueue ? jobs.filter((item) => item.id !== job.id) : null;
        setJobs((current) => removeFromQueue ? current.filter((item) => item.id !== job.id) : current.map((item) => item.id === job.id ? updated : item));
        if (removeFromQueue) {
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== job.id)));
          setSelectedReviewId(null);
          if (!remainingJobs.length) setOpen(false);
        }
        if (action === "regenerate") setRegenerationPrompts((current) => ({ ...current, [`${job.id}:${stage}`]: "" }));
      }
    } catch (requestError) { showError(requestError); }
    finally { setBusyId(null); }
  };

  const performCleanup = async (job, action, requestedTolerance) => {
    setBusyId(job.id);
    try {
      const tolerance = requestedTolerance ?? cleanupTolerances[job.id] ?? job.stages?.garment?.cleanupTolerance ?? 46;
      const updated = await api(`${API}/${job.id}/stages/garment/cleanup-${action}`, { method: "POST", body: JSON.stringify({ tolerance }) }, userId);
      setJobs((current) => current.map((item) => item.id === job.id ? updated : item));
      setCleanupTolerances((current) => ({ ...current, [job.id]: updated.stages?.garment?.cleanupTolerance ?? tolerance }));
      setSelectedReviewId(job.id);
    } catch (requestError) { showError(requestError); }
    finally { setBusyId(null); }
  };

  const deleteJob = async (job) => {
    setBusyId(job.id);
    try {
      await api(`${API}/${job.id}`, { method: "DELETE" }, userId);
      const remaining = jobs.filter((item) => item.id !== job.id);
      setJobs(remaining);
      setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== job.id)));
      if (selectedReviewId === job.id) setSelectedReviewId(null);
      if (!remaining.length) setOpen(false);
    } catch (requestError) { showError(requestError); }
    finally { setBusyId(null); }
  };

  const active = jobs[jobs.length - 1];
  const setupRequired = setup?.ready === false;
  const setupLoading = setup === null;
  const activeStatus = analysis
    ? { tone: "processing", text: `Analyzing ${analysis.current} of ${analysis.total}` }
    : setupLoading
      ? { tone: "processing", text: "Checking setup" }
      : setupRequired
        ? { tone: "error", text: "Setup required" }
        : active
          ? deriveStatus(active)
          : notice;
  const readyCount = jobs.filter((job) => deriveStatus(job).tone === "ready").length;
  const selectedReviewJob = jobs.find((job) => job.id === selectedReviewId && (reviewStageFor(job) || hasCleanupFailure(job)));
  const reviewJob = selectedReviewJob || jobs.find((job) => reviewStageFor(job)) || jobs.find((job) => hasCleanupFailure(job)) || active;
  const reviewStage = reviewJob ? reviewStageFor(reviewJob) : null;
  const progress = 0;
  const hasImportActivity = Boolean(jobs.length || notice || analysis || setupLoading || setupRequired);

  return (
    <>
      <ImportToast toast={toast} onDismiss={() => setToast(null)} />
      <input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={!setup?.ready || Boolean(analysis)} onChange={(event) => { submitFiles(event.target.files); event.target.value = ""; }} />
      <div className="import-drop-overlay" data-active={dragging && !setupRequired} aria-hidden={!dragging || setupRequired}><div className="import-drop-target is-over"><UploadSimple size={34} weight="light" /><h2>Drop clothing images</h2><p>A single garment or a photo of a full outfit works. Your wardrobe stays exactly where you left it.</p></div></div>
      <aside className={`import-tray${hasImportActivity ? " is-expanded" : ""}`} aria-label="Wardrobe imports">
        <button className="import-tray__button" type="button" onClick={() => setupRequired || hasImportActivity ? setOpen(true) : inputRef.current?.click()} aria-label={setupRequired ? "Open setup instructions" : hasImportActivity ? "Open import progress" : "Add clothes"}>{activeStatus?.tone === "processing" ? <SpinnerGap size={19} className="import-spinner" /> : activeStatus?.tone === "error" ? <WarningCircle size={19} /> : readyCount ? <span>{readyCount}</span> : notice ? <X size={18} /> : <Plus size={19} />}</button>
        <div className="import-tray__actions">{active && <img className="import-tray__preview" src={active.stages?.garment?.assetUrl || active.stages?.garment?.failedAssetUrl || active.stages?.crop?.assetUrl || active.originalAssetUrl} alt="" />}<span className="import-tray__label">{activeStatus?.text || "Add clothes"}</span>{!setupRequired && <button className="import-icon-button" type="button" disabled={Boolean(analysis)} onClick={() => inputRef.current?.click()} aria-label="Choose images"><UploadSimple size={17} /></button>}</div>
      </aside>
      <div className="import-popover-backdrop" data-open={open} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section className="import-popover" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <header className="import-popover__header"><div><p className="import-popover__eyebrow">Wardrobe import</p><h2 className="import-popover__title" id="import-title">{analysis ? "Analyzing your image" : readyCount ? `${readyCount} ready for review` : activeStatus?.tone === "error" ? "Import needs attention" : jobs.length ? "Preparing new pieces" : notice?.text || "Add to your wardrobe"}</h2></div><button className="import-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close import progress"><X size={20} /></button></header>
          {!jobs.length ? analysis ? <div className="import-analysis" role="status" aria-live="polite"><SpinnerGap size={32} className="import-spinner" /><h2>Analyzing your image</h2><p>Finding each garment in <strong>{analysis.name}</strong>. This can take a little while.</p><span>{analysis.current} of {analysis.total}</span></div> : setupRequired ? <div className="import-drop-target import-setup-warning"><WarningCircle size={30} /><h2>Setup required</h2><p>{setupError(setup)}</p></div> : <div className="import-drop-target"><UploadSimple size={28} /><h2>{notice ? "Try another image" : "Choose or paste an image"}</h2><p>{notice?.detail || "We’ll isolate each clothing item, suggest its details, and hold everything for your approval."}</p><button className="import-button import-button--primary" disabled={!setup?.ready} onClick={() => { setNotice(null); inputRef.current?.click(); }}>Choose images</button></div> : (
            <>
              <div className={`import-progress${activeStatus?.tone !== "processing" ? " is-reviewing" : progress < 100 ? " is-indeterminate" : ""}`}><div className="import-progress__meta"><span>{activeStatus?.text}</span><span>{jobs.length} {jobs.length === 1 ? "item" : "items"}</span></div>{activeStatus?.tone === "processing" && <div className="import-progress__track"><div className="import-progress__bar" style={{ "--import-progress": `${progress}%` }} /></div>}</div>
              {reviewJob && reviewStage ? <ReviewEditor job={reviewJob} stage={reviewStage} draft={drafts[reviewJob.id] || defaultDraft(reviewJob)} setDraft={(draft) => setDrafts((current) => ({ ...current, [reviewJob.id]: draft }))} regenPrompt={regenerationPrompts[`${reviewJob.id}:${reviewStage}`] || ""} setRegenPrompt={(prompt) => setRegenerationPrompts((current) => ({ ...current, [`${reviewJob.id}:${reviewStage}`]: prompt }))} busy={busyId === reviewJob.id} onAction={(action, prompt) => perform(reviewJob, reviewStage, action, prompt)} /> : reviewJob && hasCleanupFailure(reviewJob) ? <CleanupEditor job={reviewJob} tolerance={cleanupTolerances[reviewJob.id] ?? reviewJob.stages.garment.cleanupTolerance ?? 46} setTolerance={(tolerance) => setCleanupTolerances((current) => ({ ...current, [reviewJob.id]: tolerance }))} busy={busyId === reviewJob.id} onPreview={(tolerance) => performCleanup(reviewJob, "preview", tolerance)} onAccept={() => performCleanup(reviewJob, "accept")} /> : null}
              <div className="import-card-list">{jobs.map((job) => { const status = deriveStatus(job); const itemName = drafts[job.id]?.name || job.metadata?.name || "New piece"; const failedStage = job.stages?.garment?.status === "failed" ? "garment" : null; return <article className={`import-card is-${status.tone}${reviewJob?.id === job.id ? " is-selected" : ""}`} key={job.id}><img className="import-card__image" src={job.stages?.garment?.assetUrl || job.stages?.garment?.failedAssetUrl || job.stages?.crop?.assetUrl || job.originalAssetUrl} alt="" /><div className="import-card__body"><h3 className="import-card__title">{itemName}</h3><p className="import-card__detail import-card__detail--status" data-tone={status.tone}>{status.tone === "error" ? status.detail : status.text}</p></div><div className="import-card__actions">{status.tone === "ready" && <button className="import-icon-button" onClick={() => { setSelectedReviewId(job.id); setOpen(true); }} aria-label={`Review ${itemName}`}><Check size={17} /></button>}{failedStage && <button className="import-button import-card__retry" disabled={busyId === job.id} onClick={() => perform(job, failedStage, "regenerate", "")}><ArrowCounterClockwise size={14} /> Retry</button>}<button className="import-icon-button import-card__delete" disabled={busyId === job.id} onClick={() => deleteJob(job)} aria-label={`Delete ${itemName} from import queue`}><Trash size={16} /></button></div></article>; })}</div>
              <div className="import-actions"><button className="import-button" disabled={Boolean(analysis)} onClick={() => inputRef.current?.click()}><Plus size={14} /> Add another</button></div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
