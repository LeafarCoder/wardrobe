import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowsLeftRight, Camera, Check, Clipboard, CoatHanger, Crop, Dress, FolderOpen, Handbag, ImageSquare, Pants, Plus, Sneaker, SpinnerGap, Trash, TShirt, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { formatNumber, getLocale, tr } from "./i18n.js";
import { LightSelect } from "./LightSelect.jsx";
import { ProductStage } from "./ProductStage.jsx";
import "./import-flow.css";

const API = "/api/import/jobs";
const CONFIG_API = "/api/import/config";
const PARTS = [
  ["upperbody", "Tops", TShirt],
  ["wholebody_up", "Outerwear", CoatHanger],
  ["lowerbody", "Bottoms", Pants],
  ["wholebody", "Dresses & one-pieces", Dress],
  ["shoes", "Shoes", Sneaker],
  ["accessories_up", "Accessories", Handbag],
];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error(tr("The app could not read that image. Try a JPEG, PNG, or WebP file.")));
  reader.readAsDataURL(file);
});

function clipboardImageFiles(clipboardData) {
  const itemFiles = [...(clipboardData?.items || [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (itemFiles.length) return itemFiles;
  return [...(clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
}

async function api(path, options, userId) {
  const url = new URL(path, window.location.origin);
  if (userId) url.searchParams.set("user", userId);
  const response = await fetch(`${url.pathname}${url.search}`, {
    ...options,
    headers: { "Content-Type": "application/json", "Accept-Language": getLocale(), ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && value.code === "authentication_required") {
      window.dispatchEvent(new Event("wardrobe:unauthorized"));
    }
    const requestError = new Error(tr(value.error || value.detail || "The import job could not be updated."));
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
    return tr("Add {keyName} to .env, then restart the app.", { keyName });
  }
  if (/(incorrect|invalid).*(api key)|api key.*(incorrect|invalid)|authentication|unauthorized/i.test(message) || error?.status === 401) {
    return tr("The configured AI provider rejected the API key. Check {keyName}, make sure it is active, then restart the app.", { keyName: keyName || tr("the API key in .env") });
  }
  if (/insufficient_quota|quota|billing|credits|payment required/i.test(message) || error?.status === 402) {
    return tr("The configured AI provider account has no available credit. Check its credits and spending limits, then try again.");
  }
  if (/model.*(not found|does not exist|unavailable)|access to.*model|permission.*model/i.test(message)) {
    return tr("The configured AI model is unavailable to this API key. Check the model names in .env, then restart the app.");
  }
  if (/failed to fetch|network|ECONN|could not reach (?:OpenAI|OpenRouter)/i.test(message)) {
    return tr("The app could not reach the configured AI provider. Check your internet connection and API base URL, then try again.");
  }
  if (/request body too large/i.test(message)) {
    return tr("That image is too large. Choose a smaller image and try again.");
  }
  if (/unsupported image|input buffer|could not read.*image|image payload is empty/i.test(message)) {
    return tr("The app could not read that image. Try a JPEG, PNG, or WebP file.");
  }
  if (!message || /internal server error/i.test(message)) {
    return tr("The AI request failed on the server. Check the backend logs and try again.");
  }
  return tr(message);
}

function setupError(status) {
  if (status?.configurationError) return status.configurationError;
  const apiKeyName = status?.apiKeyName || "OPENAI_API_KEY";
  const providerLabel = status?.providerLabel ? ` for ${status.providerLabel}` : "";
  if (status?.hasApiKey === false) return tr("Add {apiKeyName} to .env{providerLabel}, then restart the app.", { apiKeyName, providerLabel });
  return status?.error ? tr(status.error) : tr("The importer setup could not be verified. Check the terminal and restart the app.");
}

function ImportToast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`import-toast is-${toast.tone || "error"}`} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"}>
      {toast.tone === "complete"
        ? <Check size={20} weight="bold" aria-hidden="true" />
        : <WarningCircle size={20} weight="fill" aria-hidden="true" />}
      <div className="import-toast__copy">
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
      <button className="import-toast__close" type="button" onClick={onDismiss} aria-label={tr("Dismiss notification")}><X size={17} /></button>
    </div>
  );
}

function ImportSourcePicker({ disabled, notice, onChooseFiles, onDropFiles, onReadClipboard, onTakePhoto }) {
  const [dropActive, setDropActive] = useState(false);
  const pasteShortcut = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";

  return (
    <div
      className="import-source-picker"
      aria-label={tr("Choose how to add clothing images")}
    >
      <div className="import-source-picker__intro">
        <ImageSquare size={25} weight="light" aria-hidden="true" />
        <div>
          <h3>{tr(notice ? "Try another image" : "Choose where your images come from")}</h3>
          <p>{notice?.detail ? tr(notice.detail) : tr("Add one garment photo or a full outfit. You can select several images at once.")}</p>
        </div>
      </div>

      <div className="import-source-options">
        <button className="import-source-option" type="button" disabled={disabled} onClick={onChooseFiles}>
          <span className="import-source-option__icon"><FolderOpen size={23} weight="light" /></span>
          <span>
            <strong>{tr("Load from computer")}</strong>
            <small>{tr("Select one or more JPEG, PNG, or WebP images.")}</small>
          </span>
        </button>

        <div
          className={`import-source-option import-source-option--drop${dropActive ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}
          role="group"
          aria-label={tr("Drop clothing images here")}
          onDragEnter={(event) => {
            if (disabled) return;
            event.preventDefault();
            event.stopPropagation();
            setDropActive(true);
          }}
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDropActive(false);
            if (!disabled) onDropFiles(event.dataTransfer.files);
          }}
        >
          <span className="import-source-option__icon"><UploadSimple size={23} weight="light" /></span>
          <span>
            <strong>{tr("Drag and drop")}</strong>
            <small>{tr("Drop images here from Finder or File Explorer.")}</small>
          </span>
        </div>

        <button className="import-source-option" type="button" disabled={disabled} onClick={onReadClipboard}>
          <span className="import-source-option__icon"><Clipboard size={23} weight="light" /></span>
          <span>
            <strong>{tr("Paste from clipboard")}</strong>
            <small>{tr("Copy an image, then click here or press {shortcut}.", { shortcut: pasteShortcut })}</small>
          </span>
        </button>

        <button className="import-source-option" type="button" disabled={disabled} onClick={onTakePhoto}>
          <span className="import-source-option__icon"><Camera size={23} weight="light" /></span>
          <span>
            <strong>{tr("Take a photo")}</strong>
            <small>{tr("Use a phone camera or this computer’s webcam.")}</small>
          </span>
        </button>
      </div>
      <p className="import-source-picker__privacy">{tr("Images are stored in your wardrobe and sent to your configured AI provider for garment extraction.")}</p>
    </div>
  );
}

function cameraAccessError(error) {
  if (!window.isSecureContext) {
    return tr("Camera access requires a secure HTTPS connection or localhost.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return tr("This browser does not support camera capture. Choose an image from the device instead.");
  }
  const permissionsPolicy = document.permissionsPolicy || document.featurePolicy;
  if (permissionsPolicy?.allowsFeature && !permissionsPolicy.allowsFeature("camera")) {
    return tr("Camera access is disabled by this site’s security policy. Reload the page after the app is updated.");
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return tr("Camera access was not allowed. Allow camera access in the browser, then try again.");
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return tr("No available camera was found on this device.");
  }
  if (error?.name === "NotReadableError" || error?.name === "AbortError") {
    return tr("The camera is already in use or could not be started. Close other camera apps and try again.");
  }
  return tr("The camera could not be started. Check the browser’s camera permission and try again.");
}

function CameraCapture({ onBack, onCapture, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [status, setStatus] = useState("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [captured, setCaptured] = useState(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setStatus("starting");
      setErrorMessage("");
      stopCamera();
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
          throw Object.assign(new Error("camera_unavailable"), { name: "SecurityError" });
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];
        setActiveDeviceId(videoTrack?.getSettings?.().deviceId || "");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const available = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(available.filter((device) => device.kind === "videoinput"));
          setStatus("ready");
        }
      } catch (error) {
        if (cancelled) return;
        const message = cameraAccessError(error);
        setStatus("error");
        setErrorMessage(message);
        onError(error, message);
      }
    };
    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onError, selectedDeviceId, stopCamera]);

  useEffect(() => () => {
    if (captured?.url) URL.revokeObjectURL(captured.url);
  }, [captured]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      const message = tr("Wait for the camera preview to appear, then try again.");
      setErrorMessage(message);
      onError(new Error("camera_not_ready"), message);
      return;
    }
    const maximumDimension = 2048;
    const scale = Math.min(1, maximumDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        const message = tr("The photo could not be captured. Try again.");
        setErrorMessage(message);
        onError(new Error("camera_capture_failed"), message);
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `wardrobe-camera-${timestamp}.jpg`, { type: "image/jpeg" });
      setCaptured((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { file, url: URL.createObjectURL(file) };
      });
    }, "image/jpeg", .92);
  };

  const retake = () => {
    setCaptured((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setErrorMessage("");
  };

  const cameraOptions = devices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || tr("Camera {number}", { number: index + 1 }),
  }));

  return (
    <div className="import-camera">
      <div className="import-camera__heading">
        <button className="import-button" type="button" onClick={onBack}>
          <ArrowCounterClockwise size={14} aria-hidden="true" /> {tr("Back")}
        </button>
        {cameraOptions.length > 1 && !captured && (
          <div className="import-camera__selector">
            <span>{tr("Camera")}</span>
            <LightSelect
              value={selectedDeviceId || activeDeviceId || cameraOptions[0]?.value}
              onChange={setSelectedDeviceId}
              options={cameraOptions}
              ariaLabel={tr("Choose camera")}
            />
          </div>
        )}
      </div>
      <div className="import-camera__viewport">
        {captured
          ? <img src={captured.url} alt={tr("Captured wardrobe photo")} />
          : <video ref={videoRef} autoPlay muted playsInline aria-label={tr("Live camera preview")} />}
        {!captured && status === "starting" && (
          <div className="import-camera__state" role="status">
            <SpinnerGap size={24} className="import-spinner" />
            <span>{tr("Starting camera…")}</span>
          </div>
        )}
        {!captured && status === "error" && (
          <div className="import-camera__state is-error" role="alert">
            <WarningCircle size={24} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
      <p>{tr("Keep the garment or complete outfit inside the frame. The photo is captured only when you press the shutter.")}</p>
      <div className="import-camera__actions">
        {captured ? (
          <>
            <button className="import-button" type="button" onClick={retake}>
              <ArrowCounterClockwise size={15} /> {tr("Retake")}
            </button>
            <button className="import-button import-button--primary" type="button" onClick={() => onCapture(captured.file)}>
              <Check size={15} weight="bold" /> {tr("Use photo")}
            </button>
          </>
        ) : (
          <button
            className="import-camera__shutter"
            type="button"
            disabled={status !== "ready"}
            onClick={takePhoto}
            aria-label={tr("Take photo")}
          >
            <span />
          </button>
        )}
      </div>
    </div>
  );
}

function deriveStatus(job) {
  const crop = job.stages?.crop;
  const garment = job.stages?.garment;
  if (job.error || crop?.status === "failed" || garment?.status === "failed") return { tone: "error", text: tr("Import needs attention"), detail: readableError(crop?.error || garment?.error || job.error) };
  if (job.duplicateReview?.status === "review") return { tone: "duplicate", text: tr("Possible duplicate"), detail: tr("Compare before creating a new garment.") };
  if (garment?.status === "review") return { tone: "ready", text: tr("Ready for review") };
  if (garment?.status === "approved") return { tone: "complete", text: tr("Added to wardrobe") };
  if (crop?.status === "review") return { tone: "ready", text: tr("Crop ready for review") };
  if (crop?.status === "approved") return { tone: "processing", text: tr("Creating garment image") };
  if (crop?.status === "rejected" || garment?.status === "rejected") return { tone: "complete", text: tr("Import declined") };
  return { tone: "processing", text: tr("Extracting clothing from image") };
}

function reviewStageFor(job) {
  if (job.stages?.garment?.status === "review") return "garment";
  if (job.stages?.crop?.status === "review") return "crop";
  return null;
}

function hasCleanupFailure(job) {
  return job.stages?.garment?.status === "failed" && Boolean(job.stages?.garment?.failedAssetUrl);
}

function hasDuplicateReview(job) {
  return job.duplicateReview?.status === "review" && Boolean(job.duplicateReview?.candidate);
}

function defaultDraft(job) {
  const metadata = job.metadata || {};
  return {
    name: metadata.name || tr("New garment"),
    part: metadata.part || "upperbody",
    color: metadata.color || "#d8d0c2",
    secondaryColor: metadata.secondaryColor || "",
    tags: Array.isArray(metadata.tags) ? metadata.tags.join(", ") : (metadata.tags || ""),
  };
}

function ImportQueueCard({ job, draft, selected, busy, deferred, confirmDelete, onReview, onRetry, onDelete }) {
  const status = deriveStatus(job);
  const itemName = draft?.name || job.metadata?.name || tr("New garment");
  const failedStage = job.stages?.garment?.status === "failed" ? "garment" : null;
  const reviewable = hasDuplicateReview(job) || Boolean(reviewStageFor(job)) || hasCleanupFailure(job);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    if (!deleteArmed) return undefined;
    const timer = window.setTimeout(() => setDeleteArmed(false), 7000);
    return () => window.clearTimeout(timer);
  }, [deleteArmed]);

  return (
    <article className={`import-card is-${status.tone}${selected ? " is-selected" : ""}`}>
      <ProductStage className="import-card__stage" interactive animated>
        <img
          className="import-card__image"
          src={job.stages?.garment?.assetUrl || job.stages?.garment?.failedAssetUrl || job.stages?.crop?.assetUrl || job.originalAssetUrl}
          alt=""
        />
      </ProductStage>
      <div className="import-card__body">
        <h3 className="import-card__title">{itemName}</h3>
        <p className="import-card__detail import-card__detail--status" data-tone={status.tone}>
          {status.tone === "error" ? readableError(status.detail) : deferred ? tr("Ready after crop review") : status.text}
        </p>
      </div>
      <div className="import-card__actions">
        {reviewable && (
          <button
            className={`import-icon-button${hasDuplicateReview(job) ? " import-card__compare" : ""}`}
            type="button"
            onClick={() => {
              setDeleteArmed(false);
              onReview();
            }}
            aria-label={tr(hasDuplicateReview(job) ? "Compare possible duplicate {itemName}" : "Review {itemName}", { itemName })}
          >
            {hasDuplicateReview(job) ? <ArrowsLeftRight size={17} /> : <Check size={17} />}
          </button>
        )}
        {failedStage && (
          <button className="import-button import-card__retry" type="button" disabled={busy} onClick={() => onRetry(failedStage)}>
            <ArrowCounterClockwise size={14} /> {tr("Retry")}
          </button>
        )}
        <button
          className={`import-icon-button import-card__delete${deleteArmed ? " is-confirming" : ""}`}
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirmDelete && !deleteArmed) {
              setDeleteArmed(true);
              return;
            }
            onDelete();
          }}
          aria-label={tr(deleteArmed ? "Confirm deletion of {itemName}" : "Delete {itemName} from import queue", { itemName })}
        >
          {deleteArmed ? <><Check size={14} weight="bold" /><span>{tr("Confirm")}</span></> : <Trash size={16} />}
        </button>
      </div>
    </article>
  );
}

function ImportQueueBoard({ jobs, drafts, selectedId, busyId, onReview, onRetry, onReject, onDelete }) {
  const inspection = jobs.filter((job) => job.stages?.crop?.status === "review" || hasDuplicateReview(job));
  const creation = jobs.filter((job) => !inspection.includes(job));
  const reviewingCrops = inspection.some((job) => job.stages?.crop?.status === "review");
  const lane = (id, step, title, description, entries) => (
    <section className="import-queue-lane" aria-labelledby={`import-lane-${id}`}>
      <header className="import-queue-lane__header">
        <span>{step}</span>
        <div>
          <h3 id={`import-lane-${id}`}>{tr(title)}</h3>
          <p>{tr(description)}</p>
        </div>
        <strong>{entries.length}</strong>
      </header>
      <div className="import-queue-lane__items">
        {entries.length ? entries.map((job) => (
          <ImportQueueCard
            key={job.id}
            job={job}
            draft={drafts[job.id]}
            selected={selectedId === job.id}
            busy={busyId === job.id}
            deferred={id === "create" && reviewingCrops && job.stages?.garment?.status === "review"}
            confirmDelete={id === "create" && job.stages?.garment?.status === "review" && Boolean(job.stages?.garment?.assetUrl)}
            onReview={() => onReview(job)}
            onRetry={(stage) => onRetry(job, stage)}
            onDelete={() => (
              id === "create" && job.stages?.garment?.status === "review"
                ? onReject(job)
                : onDelete(job)
            )}
          />
        )) : <p className="import-queue-lane__empty">{tr(id === "inspect" ? "Nothing needs checking." : "No garments are being created yet.")}</p>}
      </div>
    </section>
  );
  return (
    <div className="import-queue-board">
      {lane("inspect", "1", "Identify & compare", "Check detected crops and resolve likely duplicates.", inspection)}
      {lane("create", "2", "Create garments", "Generate, refine, and approve clean garment images.", creation)}
    </div>
  );
}

function DuplicateComparisonDrawer({ job, busy, onClose, onMerge, onKeep }) {
  const candidate = job.duplicateReview?.candidate;
  if (!candidate) return null;
  const partLabel = PARTS.find(([id]) => id === candidate.part)?.[1] || "Garment";
  const match = Math.round((job.duplicateReview?.score || 0) * 100);
  const sourceCount = Number(candidate.sourcePhotoCount) || 0;
  return (
    <div className="import-duplicate-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <aside className="import-duplicate-drawer" aria-labelledby="duplicate-drawer-title">
        <header className="import-duplicate-drawer__header">
          <div>
            <p>{tr("Possible duplicate")}</p>
            <h2 id="duplicate-drawer-title">{tr("Is this the same garment?")}</h2>
          </div>
          <button className="import-icon-button" type="button" disabled={busy} onClick={onClose} aria-label={tr("Close comparison")}><X size={20} /></button>
        </header>
        <div className="import-duplicate-drawer__body">
          <p className="import-duplicate-intro">{tr("This looks similar to something already in this wardrobe. Compare them before spending credits on another garment image.")}</p>
          <div className="import-duplicate-score">
            <span>{tr("Match strength")}</span>
            <strong>{match}%</strong>
          </div>
          <div className="import-duplicate-comparison">
            <figure>
              <img src={job.stages?.crop?.assetUrl || job.originalAssetUrl} alt={tr("Newly detected garment")} />
              <figcaption><span>{tr("New photo")}</span><strong>{job.metadata?.name || tr("Detected garment")}</strong></figcaption>
            </figure>
            <figure>
              <img src={candidate.image || candidate.thumbnail} alt={tr("Existing wardrobe garment")} />
              <figcaption><span>{tr("In your wardrobe")}</span><strong>{candidate.name}</strong></figcaption>
            </figure>
          </div>
          <dl className="import-duplicate-facts">
            <div><dt>{tr("Category")}</dt><dd>{tr(partLabel)}</dd></div>
            <div><dt>{tr("Color")}</dt><dd><i style={{ background: candidate.color }} /> {candidate.color}</dd></div>
            <div><dt>{tr("Brand")}</dt><dd>{candidate.brand || tr("No brand")}</dd></div>
            <div><dt>{tr("Source photos")}</dt><dd>{tr(sourceCount === 1 ? "{count} photo" : "{count} photos", { count: sourceCount })}</dd></div>
          </dl>
          {!!candidate.tags?.length && <div className="import-duplicate-tags">{candidate.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
          <div className="import-duplicate-note">
            <ImageSquare size={18} aria-hidden="true" />
            <p>{tr("Merging keeps the existing garment and adds this upload to its source-photo gallery.")}</p>
          </div>
        </div>
        <footer className="import-duplicate-drawer__actions">
          <button className="import-button" type="button" disabled={busy} onClick={onKeep}>{tr("Keep as new")}</button>
          <button className="import-button import-button--primary" type="button" disabled={busy} onClick={onMerge}>
            {busy ? <SpinnerGap size={14} className="import-spinner" /> : <ArrowsLeftRight size={14} />}
            {tr("Merge with existing")}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function normalizedCropBox(value = {}) {
  const number = (key, fallback) => Number.isFinite(Number(value[key])) ? Math.round(Number(value[key])) : fallback;
  const x = Math.max(0, Math.min(970, number("x", 0)));
  const y = Math.max(0, Math.min(970, number("y", 0)));
  const width = Math.max(30, Math.min(1000 - x, number("width", 1000 - x)));
  const height = Math.max(30, Math.min(1000 - y, number("height", 1000 - y)));
  return { x, y, width, height };
}

function ManualCropEditor({ job, busy, onSave }) {
  const canvasRef = useRef(null);
  const interaction = useRef(null);
  const suggested = normalizedCropBox(job.suggestedBoundingBox || job.metadata?.boundingBox);
  const [box, setBox] = useState(() => normalizedCropBox(job.metadata?.boundingBox));
  const [savedBox, setSavedBox] = useState(() => normalizedCropBox(job.metadata?.boundingBox));

  useEffect(() => {
    const next = normalizedCropBox(job.metadata?.boundingBox);
    setBox(next);
    setSavedBox(next);
  }, [job.id, job.metadata?.boundingBox?.x, job.metadata?.boundingBox?.y, job.metadata?.boundingBox?.width, job.metadata?.boundingBox?.height]);

  const beginInteraction = (event) => {
    if (busy || !canvasRef.current) return;
    const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || "move";
    interaction.current = {
      handle,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      box,
      rect: canvasRef.current.getBoundingClientRect(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveInteraction = (event) => {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - active.x) / Math.max(1, active.rect.width)) * 1000;
    const dy = ((event.clientY - active.y) / Math.max(1, active.rect.height)) * 1000;
    const start = active.box;
    const minimum = 45;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;
    if (active.handle === "move") {
      left = Math.max(0, Math.min(1000 - start.width, start.x + dx));
      top = Math.max(0, Math.min(1000 - start.height, start.y + dy));
      right = left + start.width;
      bottom = top + start.height;
    } else {
      if (active.handle.includes("w")) left = Math.max(0, Math.min(right - minimum, start.x + dx));
      if (active.handle.includes("e")) right = Math.min(1000, Math.max(left + minimum, start.x + start.width + dx));
      if (active.handle.includes("n")) top = Math.max(0, Math.min(bottom - minimum, start.y + dy));
      if (active.handle.includes("s")) bottom = Math.min(1000, Math.max(top + minimum, start.y + start.height + dy));
    }
    setBox(normalizedCropBox({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }));
  };

  const endInteraction = (event) => {
    if (interaction.current?.pointerId === event.pointerId) interaction.current = null;
  };
  const changed = ["x", "y", "width", "height"].some((key) => box[key] !== savedBox[key]);

  return (
    <div className="import-crop-editor">
      <div className="import-crop-canvas" ref={canvasRef}>
        <img src={job.originalAssetUrl} alt={tr("Original upload with editable crop")} draggable="false" />
        <div
          className="import-crop-selection"
          style={{
            left: `${box.x / 10}%`,
            top: `${box.y / 10}%`,
            width: `${box.width / 10}%`,
            height: `${box.height / 10}%`,
          }}
          onPointerDown={beginInteraction}
          onPointerMove={moveInteraction}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
        >
          {["nw", "ne", "sw", "se"].map((handle) => (
            <i key={handle} data-crop-handle={handle} data-position={handle} aria-hidden="true" />
          ))}
          <span><Crop size={15} /> {tr("Drag to move · corners to resize")}</span>
        </div>
      </div>
      <div className="import-crop-toolbar">
        <div className="import-crop-toolbar__copy">
          <p>{tr("Keep only the intended garment inside the box. Adjusting this crop is local and does not use AI credits.")}</p>
          {!!job.cropAdjustment?.length && (
            <p className="import-crop-adjustment-note">
              {tr("We tightened the original AI box because it included most of another detected garment. You can still adjust it.")}
            </p>
          )}
          {job.cropDiagnostics?.lowDetail && (
            <p className="import-crop-detail-warning">
              <WarningCircle size={17} weight="fill" />
              {tr("This item is very small in the source photo. Wardrobe will magnify it, but a closer photo will produce a much more reliable cutout.")}
            </p>
          )}
        </div>
        <div className="import-crop-toolbar__actions">
          <button className="import-button" type="button" disabled={busy} onClick={() => setBox(suggested)}>
            {tr("Reset suggestion")}
          </button>
          <button className="import-button" type="button" disabled={busy || !changed} onClick={async () => {
            await onSave(box);
            setSavedBox(box);
          }}>
            {busy ? <SpinnerGap size={14} className="import-spinner" /> : <Crop size={14} />}
            {tr("Save crop")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewEditor({ job, stage, draft, setDraft, regenPrompt, setRegenPrompt, busy, onAction, onCropSave }) {
  const asset = job.stages[stage]?.assetUrl;
  const isCrop = stage === "crop";
  const isGarment = stage === "garment";
  const primaryValid = HEX_COLOR.test(draft.color);
  const secondaryValid = !draft.secondaryColor || HEX_COLOR.test(draft.secondaryColor);
  return (
    <div className="import-editor">
      {isCrop && (
        <header className="import-editor__garment-heading">
          <p>{tr("Crop for")}</p>
          <h2>{draft.name || job.metadata?.name || tr("Detected garment")}</h2>
          <span>{tr("This selection will be used to create a new garment in your wardrobe.")}</span>
        </header>
      )}
      {isCrop
        ? <ManualCropEditor job={job} busy={busy} onSave={onCropSave} />
        : (
          <ProductStage className="import-editor__preview-stage" interactive animated>
            <img className="import-editor__preview" src={asset} alt={tr(isGarment ? "Extracted garment" : "Generated modeled look")} />
          </ProductStage>
        )}
      <div className="import-fields">
        <p className="import-editor__stage">{tr(isCrop ? "Detected item" : isGarment ? "Garment image" : "Modeled image")}</p>
        {isCrop ? <p className="import-card__detail">{tr("Duplicate matching is complete. Check that the box contains only the intended garment, adjust it if needed, then continue.")}</p> : isGarment ? (
          <>
            <div className="import-field"><label htmlFor={`name-${job.id}`}>{tr("Name")}</label><input id={`name-${job.id}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
            <div className="import-field">
              <label>{tr("Category")}</label>
              <LightSelect
                value={draft.part}
                onChange={(part) => setDraft({ ...draft, part })}
                options={PARTS.map(([id, label, CategoryIcon]) => ({
                  value: id,
                  label: tr(label),
                  icon: <CategoryIcon size={17} weight="regular" />,
                }))}
                ariaLabel={tr("Category")}
              />
            </div>
            <div className="import-field"><label htmlFor={`primary-${job.id}`}>{tr("Primary color")}</label><div className="import-color-row"><input id={`primary-${job.id}`} type="color" value={primaryValid ? draft.color : "#000000"} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /><input aria-label={tr("Primary color hex")} aria-invalid={!primaryValid} value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></div>{!primaryValid && <small className="import-field-error">{tr("Use a six-digit hex color, such as #d8d0c2.")}</small>}</div>
            <div className="import-field"><label htmlFor={`secondary-${job.id}`}>{tr("Secondary color")} <span>{tr("optional")}</span></label><input id={`secondary-${job.id}`} type="text" aria-invalid={!secondaryValid} placeholder={tr("#hex or leave blank")} value={draft.secondaryColor} onChange={(event) => setDraft({ ...draft, secondaryColor: event.target.value })} />{!secondaryValid && <small className="import-field-error">{tr("Use a six-digit hex color or leave this empty.")}</small>}</div>
            <div className="import-field"><label htmlFor={`tags-${job.id}`}>{tr("Details")}</label><input id={`tags-${job.id}`} value={draft.tags} placeholder={tr("casual, cotton, striped")} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></div>
            <p className="import-card__detail">{tr("Adding this garment finishes the import. A modeled look is generated only if you request one later from the item panel.")}</p>
          </>
        ) : <p className="import-card__detail">{tr("Approve this editorial image to attach it to the new wardrobe garment, or regenerate it with a more specific direction.")}</p>}
        {!isCrop && <div className="import-field import-regenerate-field">
          <label htmlFor={`regenerate-${job.id}-${stage}`}>{tr("Regeneration direction")} <span>{tr("optional")}</span></label>
          <textarea id={`regenerate-${job.id}-${stage}`} rows="3" value={regenPrompt} onChange={(event) => setRegenPrompt(event.target.value)} placeholder={tr(isGarment ? "Example: preserve the original zipper and remove the retail tag" : "Example: use a quiet evening street and show the full garment")} />
          {isGarment && <small>{tr("Regenerate calls the image model again using the current crop and your direction. It uses AI credits but does not change the crop. Write the correction in any language; it overrides conflicting visual clues.")}</small>}
        </div>}
        <div className="import-actions">
          <button className="import-button" disabled={busy} onClick={() => onAction("reject")}><Trash size={14} /> {tr("Reject")}</button>
          {!isCrop && <button className="import-button" disabled={busy || (isGarment && (!draft.name.trim() || !primaryValid || !secondaryValid))} onClick={() => onAction("regenerate", regenPrompt)}><ArrowCounterClockwise size={14} /> {tr("Regenerate")}</button>}
          <button className="import-button import-button--primary" disabled={busy || (isGarment && (!draft.name.trim() || !primaryValid || !secondaryValid))} onClick={() => onAction("approve")}><Check size={14} weight="bold" /> {tr(isCrop ? "Use crop" : isGarment ? "Add to wardrobe" : "Approve")}</button>
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
      <p className="import-editor__stage">{tr("Background cleanup")}</p>
      <p className="import-card__detail">{tr("The generated garment is preserved below. Adjust the cleanup locally—this does not call the image model again.")}</p>
      <div className="import-cleanup-comparison">
        <figure><img src={stage.failedAssetUrl} alt={tr("Generated garment on its chroma background")} /><figcaption>{tr("Generated source")}</figcaption></figure>
        <figure><img src={stage.cleanupPreviewUrl || stage.failedAssetUrl} alt={tr("Transparent garment cleanup preview")} /><figcaption>{tr(stage.cleanupPreviewUrl ? "Cleanup preview" : "Preview appears here")}</figcaption></figure>
      </div>
      <div className="import-field import-cleanup-strength">
        <label htmlFor={`cleanup-${job.id}`}>{tr("Cleanup strength")} <strong>{tolerance}</strong></label>
        <input id={`cleanup-${job.id}`} type="range" min="18" max="110" step="2" value={tolerance} onChange={(event) => updateTolerance(Number(event.target.value))} />
        <div className="import-cleanup-scale"><span>{tr("Preserve more edge detail")}</span><span>{tr("Remove more background")}</span></div>
      </div>
      {Number.isFinite(contaminated) && <p className="import-card__detail">{tr("The automated check sees {count} tinted edge {unit}. If the preview looks clean, you can still use it.", { count: formatNumber(contaminated), unit: tr(contaminated === 1 ? "pixel" : "pixels") })}</p>}
      <div className="import-actions">
        <button className="import-button" disabled={busy} onClick={() => onPreview(tolerance)}><ArrowCounterClockwise size={14} /> {tr("Preview cleanup")}</button>
        <button className="import-button import-button--primary" disabled={busy} onClick={onAccept}><Check size={14} weight="bold" /> {tr("Use this cleanup")}</button>
      </div>
    </div>
  );
}

export function WardrobeImportFlow({ userId, onGarmentApproved }) {
  const inputRef = useRef(null);
  const sourcePickerRef = useRef(null);
  const notifiedFailures = useRef(new Set());
  const [jobs, setJobs] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [regenerationPrompts, setRegenerationPrompts] = useState({});
  const [cleanupTolerances, setCleanupTolerances] = useState({});
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [selectedReviewStage, setSelectedReviewStage] = useState(null);
  const [duplicateReviewId, setDuplicateReviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [toast, setToast] = useState(null);
  const [notice, setNotice] = useState(null);
  const [setup, setSetup] = useState(null);

  const showError = useCallback((error, title = "Import failed") => {
    setToast({ id: Date.now(), tone: "error", title: tr(title), message: readableError(error) });
  }, []);
  const showCameraError = useCallback((error, message) => {
    showError(message || error, "Could not open camera");
  }, [showError]);

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
        const firstDuplicate = visibleJobs.find(hasDuplicateReview);
        if (firstDuplicate) setDuplicateReviewId(firstDuplicate.id);
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
    if (!jobs.some((job) => (
      job.stages?.crop?.status === "approved"
      && job.duplicateReview?.status !== "review"
      && ["processing", "pending", "queued"].includes(job.stages?.garment?.status)
    ))) return undefined;
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
      showError(tr("Choose a JPEG, PNG, or WebP image."));
      return;
    }
    setDragging(false); setNotice(null); setSourcePickerOpen(false); setOpen(true);
    const previewTimestamp = Date.now();
    const analysisPhotos = images.map((file, index) => {
      const fallbackExtension = file.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "png";
      return {
        file,
        name: file.name || `clipboard-image-${previewTimestamp}-${index + 1}.${fallbackExtension}`,
        url: URL.createObjectURL(file),
      };
    });
    let pendingDuplicateId = null;
    setAnalysis({
      current: 1,
      total: analysisPhotos.length,
      name: analysisPhotos[0].name,
      photos: analysisPhotos.map(({ name, url }) => ({ name, url })),
    });
    try {
      for (const [index, photo] of analysisPhotos.entries()) {
        const { file, name: fileName } = photo;
        setAnalysis((current) => ({
          ...current,
          current: index + 1,
          name: fileName,
        }));
        try {
        const imageDataUrl = await fileToDataUrl(file);
        const result = await api(API, {
          method: "POST",
          body: JSON.stringify({
            imageDataUrl,
            sourceFileName: fileName,
            metadata: { name: fileName.replace(/\.[^.]+$/, "") },
          }),
        }, userId);
        const createdJobs = result.jobs || [result];
        if (!createdJobs.length && result.noClothingDetected) {
          setNotice({ tone: "complete", text: tr("No clothing detected"), detail: tr("We couldn’t find a distinct wearable item in {fileName}. Try a clearer or more tightly framed image.", { fileName }) });
          setOpen(true);
          continue;
        }
        setJobs((current) => [...current, ...createdJobs]);
        setDrafts((current) => ({ ...current, ...Object.fromEntries(createdJobs.map((job) => [job.id, defaultDraft(job)])) }));
        const firstDuplicate = createdJobs.find(hasDuplicateReview);
        if (firstDuplicate && !pendingDuplicateId) pendingDuplicateId = firstDuplicate.id;
        } catch (requestError) {
          showError(requestError, tr("Could not import {fileName}", { fileName }));
        }
      }
    } finally {
      setAnalysis(null);
      window.setTimeout(() => analysisPhotos.forEach(({ url }) => URL.revokeObjectURL(url)), 1000);
    }
    if (pendingDuplicateId) setDuplicateReviewId((current) => current || pendingDuplicateId);
  }, [setup, showError, userId]);

  const showSourcePicker = useCallback(() => {
    setNotice(null);
    setCameraOpen(false);
    setSourcePickerOpen(true);
    setOpen(true);
  }, []);

  const closeImporter = useCallback(() => {
    setOpen(false);
    setSourcePickerOpen(false);
    setCameraOpen(false);
  }, []);

  const handlePaste = useCallback((event) => {
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) {
      showError(tr("There is no image on your clipboard. Copy an image, then try again."), "Could not paste image");
      return;
    }
    event.preventDefault();
    submitFiles(files);
  }, [showError, submitFiles]);

  const readClipboard = useCallback(async () => {
    if (!navigator.clipboard?.read) {
      const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
      showError(tr("This browser cannot read the clipboard from a button. Copy an image, keep this window open, and press {shortcut}.", { shortcut }), "Paste with your keyboard");
      sourcePickerRef.current?.focus();
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageBlobs = [];
      for (const item of clipboardItems) {
        const imageType = item.types.find((value) => value.startsWith("image/"));
        if (imageType) imageBlobs.push(await item.getType(imageType));
      }
      if (!imageBlobs.length) {
        showError(tr("There is no image on your clipboard. Copy an image, then try again."), "Could not paste image");
        return;
      }
      const timestamp = Date.now();
      const files = imageBlobs.map((blob, index) => {
        const subtype = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9.+-]/gi, "") || "png";
        return new File([blob], `clipboard-${timestamp}-${index + 1}.${subtype}`, { type: blob.type });
      });
      submitFiles(files);
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘V" : "Ctrl+V";
        showError(tr("Clipboard access was not allowed. Copy the image again, then press {shortcut} while this window is open.", { shortcut }), "Could not access clipboard");
      } else {
        showError(error, "Could not paste image");
      }
      sourcePickerRef.current?.focus();
    }
  }, [showError, submitFiles]);

  useEffect(() => {
    if (open && (sourcePickerOpen || (!jobs.length && !analysis && setup?.ready !== false))) {
      sourcePickerRef.current?.focus();
    }
  }, [analysis, jobs.length, open, setup?.ready, sourcePickerOpen]);

  const sourceChooserVisible = open && (sourcePickerOpen || !jobs.length) && setup?.ready !== false;

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event) => {
      if (![...event.dataTransfer.types].includes("Files")) return;
      event.preventDefault();
      if (sourceChooserVisible) {
        setDragging(false);
        return;
      }
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event) => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); };
    const onDragLeave = (event) => {
      event.preventDefault();
      if (sourceChooserVisible) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDrop = (event) => { event.preventDefault(); depth = 0; setDragging(false); submitFiles(event.dataTransfer.files); };
    window.addEventListener("dragenter", onDragEnter); window.addEventListener("dragover", onDragOver); window.addEventListener("dragleave", onDragLeave); window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragenter", onDragEnter); window.removeEventListener("dragover", onDragOver); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("drop", onDrop); };
  }, [sourceChooserVisible, submitFiles]);

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
        setSelectedReviewStage(null);
        if (!remainingJobs.length) closeImporter();
      } else {
        if (stage === "garment" && action === "regenerate") {
          const draft = drafts[job.id];
          const metadata = {
            ...draft,
            secondaryColor: draft.secondaryColor || null,
            tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          };
          await api(`${API}/${job.id}/metadata`, {
            method: "PATCH",
            body: JSON.stringify({ metadata }),
          }, userId);
        }
        const updated = await api(`${API}/${job.id}/stages/${stage}/${action}`, { method: "POST", body: action === "regenerate" ? JSON.stringify({ prompt }) : undefined }, userId);
        const removeFromQueue = action === "reject" || (stage === "modeled" && action === "approve");
        const remainingJobs = removeFromQueue ? jobs.filter((item) => item.id !== job.id) : null;
        setJobs((current) => removeFromQueue ? current.filter((item) => item.id !== job.id) : current.map((item) => item.id === job.id ? updated : item));
        if (stage === "crop" && action === "approve" && hasDuplicateReview(updated)) {
          setDuplicateReviewId(job.id);
        }
        if (stage === "crop" || action === "reject" || action === "regenerate") {
          setSelectedReviewId(null);
          setSelectedReviewStage(null);
        }
        if (removeFromQueue) {
          setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== job.id)));
          setSelectedReviewId(null);
          setSelectedReviewStage(null);
          if (!remainingJobs.length) closeImporter();
        }
        if (action === "regenerate") setRegenerationPrompts((current) => ({ ...current, [`${job.id}:${stage}`]: "" }));
      }
    } catch (requestError) { showError(requestError); }
    finally { setBusyId(null); }
  };

  const performDuplicate = async (job, action) => {
    setBusyId(job.id);
    try {
      const result = await api(`${API}/${job.id}/duplicate/${action}`, { method: "POST" }, userId);
      if (action === "merge") {
        onGarmentApproved?.(result.importedRecord);
        const remainingJobs = jobs.filter((item) => item.id !== job.id);
        setJobs(remainingJobs);
        setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== job.id)));
        setSelectedReviewId(null);
        setSelectedReviewStage(null);
        setDuplicateReviewId(null);
        setToast({
          id: Date.now(),
          tone: "complete",
          title: tr("Garment merged"),
          message: tr("The new source photo was added to {name}.", { name: result.importedRecord?.name || tr("the existing garment") }),
        });
        if (!remainingJobs.length) closeImporter();
      } else {
        setJobs((current) => current.map((item) => item.id === job.id ? result : item));
        setDuplicateReviewId(null);
        const nextStage = reviewStageFor(result);
        setSelectedReviewId(nextStage ? job.id : null);
        setSelectedReviewStage(nextStage);
      }
    } catch (requestError) {
      showError(requestError, action === "merge" ? "Could not merge garments" : "Could not continue import");
    } finally {
      setBusyId(null);
    }
  };

  const saveCrop = async (job, boundingBox) => {
    setBusyId(job.id);
    try {
      const updated = await api(`${API}/${job.id}/crop`, {
        method: "PATCH",
        body: JSON.stringify({ boundingBox }),
      }, userId);
      setJobs((current) => current.map((item) => item.id === job.id ? updated : item));
      setSelectedReviewId(job.id);
      setSelectedReviewStage("crop");
      setToast({
        id: Date.now(),
        tone: "complete",
        title: tr("Crop updated"),
        message: tr("The new crop is ready. No AI credits were used."),
      });
      return updated;
    } catch (requestError) {
      showError(requestError, "Could not update crop");
      throw requestError;
    } finally {
      setBusyId(null);
    }
  };

  const performCleanup = async (job, action, requestedTolerance) => {
    setBusyId(job.id);
    try {
      const tolerance = requestedTolerance ?? cleanupTolerances[job.id] ?? job.stages?.garment?.cleanupTolerance ?? 46;
      const updated = await api(`${API}/${job.id}/stages/garment/cleanup-${action}`, { method: "POST", body: JSON.stringify({ tolerance }) }, userId);
      setJobs((current) => current.map((item) => item.id === job.id ? updated : item));
      setCleanupTolerances((current) => ({ ...current, [job.id]: updated.stages?.garment?.cleanupTolerance ?? tolerance }));
      setSelectedReviewId(job.id);
      setSelectedReviewStage(updated.stages?.garment?.status === "review" ? "garment" : "cleanup");
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
      if (selectedReviewId === job.id) {
        setSelectedReviewId(null);
        setSelectedReviewStage(null);
      }
      if (duplicateReviewId === job.id) setDuplicateReviewId(null);
      if (!remaining.length) closeImporter();
    } catch (requestError) { showError(requestError); }
    finally { setBusyId(null); }
  };

  const active = jobs[jobs.length - 1];
  const setupRequired = setup?.ready === false;
  const setupLoading = setup === null;
  const activeStatus = analysis
    ? { tone: "processing", text: tr("Analyzing {current} of {total}", analysis) }
    : setupLoading
      ? { tone: "processing", text: tr("Checking setup") }
      : setupRequired
        ? { tone: "error", text: tr("Setup required") }
        : active
          ? deriveStatus(active)
          : notice;
  const readyCount = jobs.filter((job) => ["ready", "duplicate"].includes(deriveStatus(job).tone)).length;
  const duplicateReviewJob = jobs.find((job) => job.id === duplicateReviewId && hasDuplicateReview(job)) || null;
  const selectedReviewJob = jobs.find((job) => (
    job.id === selectedReviewId
    && (selectedReviewStage === "cleanup"
      ? hasCleanupFailure(job)
      : job.stages?.[selectedReviewStage]?.status === "review")
  ));
  const nextCropReviewJob = jobs.find((job) => job.stages?.crop?.status === "review");
  const cropReviewComplete = !nextCropReviewJob;
  const nextGarmentReviewJob = cropReviewComplete
    ? jobs.find((job) => job.stages?.garment?.status === "review")
    : null;
  const nextCleanupJob = cropReviewComplete ? jobs.find(hasCleanupFailure) : null;
  const reviewJob = selectedReviewJob || nextCropReviewJob || nextGarmentReviewJob || nextCleanupJob || active;
  const reviewStage = selectedReviewJob
    ? (selectedReviewStage === "cleanup" ? null : selectedReviewStage)
    : nextCropReviewJob
      ? "crop"
      : nextGarmentReviewJob
        ? "garment"
        : null;
  const progress = 0;
  const hasImportActivity = Boolean(jobs.length || notice || analysis || setupLoading || setupRequired);

  return (
    <>
      <ImportToast toast={toast} onDismiss={() => setToast(null)} />
      <input ref={inputRef} type="file" accept="image/*" multiple hidden disabled={!setup?.ready || Boolean(analysis)} onChange={(event) => { submitFiles(event.target.files); event.target.value = ""; }} />
      <div className="import-drop-overlay" data-active={dragging && !setupRequired} aria-hidden={!dragging || setupRequired}><div className="import-drop-target is-over"><UploadSimple size={34} weight="light" /><h2>{tr("Drop clothing images")}</h2><p>{tr("A single garment or a photo of a full outfit works. Your wardrobe stays exactly where you left it.")}</p></div></div>
      <aside className={`import-tray${hasImportActivity ? " is-expanded" : ""}`} aria-label={tr("Wardrobe imports")}>
        <button className="import-tray__button" type="button" onClick={() => setupRequired || hasImportActivity ? setOpen(true) : showSourcePicker()} aria-label={tr(setupRequired ? "Open setup instructions" : hasImportActivity ? "Open import progress" : "Add clothes")}>{activeStatus?.tone === "processing" ? <SpinnerGap size={19} className="import-spinner" /> : activeStatus?.tone === "error" ? <WarningCircle size={19} /> : readyCount ? <span>{readyCount}</span> : notice ? <X size={18} /> : <span className="import-tray__photo-icon" aria-hidden="true"><ImageSquare size={20} weight="regular" /><Plus className="import-tray__photo-plus" size={10} weight="bold" /></span>}</button>
        <div className="import-tray__actions">{active && <img className="import-tray__preview" src={active.stages?.garment?.assetUrl || active.stages?.garment?.failedAssetUrl || active.stages?.crop?.assetUrl || active.originalAssetUrl} alt="" />}<span className="import-tray__label">{activeStatus?.text || tr("Add clothes")}</span></div>
      </aside>
      <div className="import-popover-backdrop" data-open={open} onMouseDown={(event) => event.target === event.currentTarget && closeImporter()}>
        <section className="import-popover" ref={sourcePickerRef} role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} onPaste={(event) => !cameraOpen && (sourcePickerOpen || !jobs.length) && handlePaste(event)}>
          <header className="import-popover__header"><div><p className="import-popover__eyebrow">{tr("Wardrobe import")}</p><h2 className="import-popover__title" id="import-title">{analysis ? tr("Analyzing your image") : cameraOpen ? tr("Take a photo") : !setupRequired && (sourcePickerOpen || !jobs.length) ? tr("Add clothes") : readyCount ? tr("{count} ready for review", { count: readyCount }) : activeStatus?.tone === "error" ? tr("Import needs attention") : jobs.length ? tr("Preparing new garments") : notice?.text || tr("Add to your wardrobe")}</h2></div><button className="import-icon-button" type="button" onClick={closeImporter} aria-label={tr("Close import")}><X size={20} /></button></header>
          {analysis ? (
            <div className={`import-analysis${analysis.photos?.length > 1 ? " has-multiple" : ""}`} role="status" aria-live="polite">
              <div className="import-analysis__photos" aria-label={tr("Photos being analyzed")}>
                {analysis.photos?.map((photo, index) => {
                  const current = index + 1 === analysis.current;
                  const complete = index + 1 < analysis.current;
                  return (
                    <figure className={`${current ? "is-current" : ""}${complete ? " is-complete" : ""}`} aria-current={current ? "step" : undefined} key={`${photo.name}-${index}`}>
                      <img src={photo.url} alt={tr("Uploaded photo {number}: {name}", { number: index + 1, name: photo.name })} />
                      <figcaption>
                        <span>{complete ? <Check size={12} weight="bold" /> : current ? <SpinnerGap size={12} className="import-spinner" /> : index + 1}</span>
                        <strong>{photo.name}</strong>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <div className="import-analysis__status">
                <SpinnerGap size={25} className="import-spinner" />
                <div>
                  <h2>{tr("Analyzing your image")}</h2>
                  <p>{tr("Finding each garment in {name}. This can take a little while.", { name: analysis.name })}</p>
                </div>
                <span>{tr("{current} of {total}", analysis)}</span>
              </div>
            </div>
          ) : setupRequired ? <div className="import-drop-target import-setup-warning"><WarningCircle size={30} /><h2>{tr("Setup required")}</h2><p>{setupError(setup)}</p></div> : cameraOpen ? (
            <CameraCapture
              onBack={() => setCameraOpen(false)}
              onError={showCameraError}
              onCapture={(file) => {
                setCameraOpen(false);
                submitFiles([file]);
              }}
            />
          ) : sourcePickerOpen || !jobs.length ? <ImportSourcePicker disabled={!setup?.ready} notice={notice} onChooseFiles={() => inputRef.current?.click()} onDropFiles={submitFiles} onReadClipboard={readClipboard} onTakePhoto={() => setCameraOpen(true)} /> : (
            <>
              <div className={`import-progress${activeStatus?.tone !== "processing" ? " is-reviewing" : progress < 100 ? " is-indeterminate" : ""}`}><div className="import-progress__meta"><span>{activeStatus?.text}</span><span>{tr(jobs.length === 1 ? "{count} item" : "{count} items", { count: jobs.length })}</span></div>{activeStatus?.tone === "processing" && <div className="import-progress__track"><div className="import-progress__bar" style={{ "--import-progress": `${progress}%` }} /></div>}</div>
              {reviewJob && reviewStage ? <ReviewEditor job={reviewJob} stage={reviewStage} draft={drafts[reviewJob.id] || defaultDraft(reviewJob)} setDraft={(draft) => setDrafts((current) => ({ ...current, [reviewJob.id]: draft }))} regenPrompt={regenerationPrompts[`${reviewJob.id}:${reviewStage}`] || ""} setRegenPrompt={(prompt) => setRegenerationPrompts((current) => ({ ...current, [`${reviewJob.id}:${reviewStage}`]: prompt }))} busy={busyId === reviewJob.id} onAction={(action, prompt) => perform(reviewJob, reviewStage, action, prompt)} onCropSave={(boundingBox) => saveCrop(reviewJob, boundingBox)} /> : reviewJob && hasCleanupFailure(reviewJob) ? <CleanupEditor job={reviewJob} tolerance={cleanupTolerances[reviewJob.id] ?? reviewJob.stages.garment.cleanupTolerance ?? 46} setTolerance={(tolerance) => setCleanupTolerances((current) => ({ ...current, [reviewJob.id]: tolerance }))} busy={busyId === reviewJob.id} onPreview={(tolerance) => performCleanup(reviewJob, "preview", tolerance)} onAccept={() => performCleanup(reviewJob, "accept")} /> : null}
              <ImportQueueBoard
                jobs={jobs}
                drafts={drafts}
                selectedId={duplicateReviewId || reviewJob?.id}
                busyId={busyId}
                onReview={(job) => {
                  if (hasDuplicateReview(job)) setDuplicateReviewId(job.id);
                  else {
                    const stage = hasCleanupFailure(job) ? "cleanup" : reviewStageFor(job);
                    setSelectedReviewId(job.id);
                    setSelectedReviewStage(stage);
                  }
                  setOpen(true);
                }}
                onRetry={(job, stage) => perform(job, stage, "regenerate", "")}
                onReject={(job) => perform(job, "garment", "reject")}
                onDelete={deleteJob}
              />
              <div className="import-actions"><button className="import-button" disabled={Boolean(analysis)} onClick={showSourcePicker}><Plus size={14} /> {tr("Add another")}</button></div>
            </>
          )}
          {duplicateReviewJob && (
            <DuplicateComparisonDrawer
              job={duplicateReviewJob}
              busy={busyId === duplicateReviewJob.id}
              onClose={() => setDuplicateReviewId(null)}
              onMerge={() => performDuplicate(duplicateReviewJob, "merge")}
              onKeep={() => performDuplicate(duplicateReviewJob, "keep")}
            />
          )}
        </section>
      </div>
    </>
  );
}
