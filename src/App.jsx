import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, DownloadSimple, LockKey, PencilSimple, Plus, Trash, UploadSimple, UserCircle, X } from "@phosphor-icons/react";
import { WardrobeImportFlow } from "./import-flow.jsx";
import { OptimizedImage } from "./OptimizedImage.jsx";

const STORAGE_KEY = "open-wardrobe-edits-v1";
const DELETED_STORAGE_KEY = "open-wardrobe-deleted-v1";

const TYPES = [
  { id: "all", label: "All" },
  { id: "upperbody", label: "Tops", singular: "Top" },
  { id: "wholebody_up", label: "Jackets", singular: "Jacket" },
  { id: "lowerbody", label: "Bottoms", singular: "Bottom" },
  { id: "accessories_up", label: "Accessories", singular: "Accessory" },
  { id: "shoes", label: "Shoes", singular: "Shoes" },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));
const TYPE_ORDER = Object.fromEntries(TYPES.slice(1).map((type, index) => [type.id, index]));
const LEGACY_ORIGINAL_FOCUS = {
  upperbody: [50, 44],
  wholebody_up: [50, 52],
  lowerbody: [50, 68],
  accessories_up: [50, 54],
  shoes: [50, 78],
};

function originalPhotoPosition(item) {
  const center = (box) => box && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(box[key])))
    ? {
        x: (Number(box.x) + (Number(box.width) / 2)) / 10,
        y: (Number(box.y) + (Number(box.height) / 2)) / 10,
      }
    : null;
  const outfitCenter = center(item.originalFocusBox);
  const itemCenter = center(item.boundingBox);
  if (outfitCenter || itemCenter) {
    const horizontal = Math.max(5, Math.min(95, outfitCenter && itemCenter
      ? (outfitCenter.x * 0.4) + (itemCenter.x * 0.6)
      : (outfitCenter || itemCenter).x));
    const vertical = Math.max(8, Math.min(92, outfitCenter && itemCenter
      ? (outfitCenter.y * 0.35) + (itemCenter.y * 0.65)
      : (outfitCenter || itemCenter).y));
    return `${horizontal.toFixed(1)}% ${vertical.toFixed(1)}%`;
  }
  const [horizontal, vertical] = LEGACY_ORIGINAL_FOCUS[item.part] || [50, 52];
  return `${horizontal}% ${vertical}%`;
}

function userStorageKey(base, userId) {
  return `${base}:${userId || "default"}`;
}

function readEdits(userId) {
  try {
    const scoped = localStorage.getItem(userStorageKey(STORAGE_KEY, userId));
    const legacy = userId === "default" ? localStorage.getItem(STORAGE_KEY) : null;
    return JSON.parse(scoped || legacy || "{}");
  } catch {
    return {};
  }
}


function persistEdit(item, userId) {
  const edits = readEdits(userId);
  edits[item.id] = {
    name: item.name || "",
    part: item.part,
    color: item.color || null,
    secondaryColor: item.secondaryColor || null,
    tags: item.tags || [],
  };
  localStorage.setItem(userStorageKey(STORAGE_KEY, userId), JSON.stringify(edits));
}

function removePersistedEdit(id, userId) {
  const edits = readEdits(userId);
  delete edits[id];
  localStorage.setItem(userStorageKey(STORAGE_KEY, userId), JSON.stringify(edits));
}

function readDeletedItems(userId) {
  try {
    const scoped = localStorage.getItem(userStorageKey(DELETED_STORAGE_KEY, userId));
    const legacy = userId === "default" ? localStorage.getItem(DELETED_STORAGE_KEY) : null;
    const value = JSON.parse(scoped || legacy || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function persistDeletedItem(id, userId) {
  const deleted = readDeletedItems(userId);
  deleted.add(id);
  localStorage.setItem(userStorageKey(DELETED_STORAGE_KEY, userId), JSON.stringify([...deleted]));
}

function removePersistedDeletedItem(id, userId) {
  const deleted = readDeletedItems(userId);
  deleted.delete(id);
  localStorage.setItem(userStorageKey(DELETED_STORAGE_KEY, userId), JSON.stringify([...deleted]));
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("Could not read that photo."));
  reader.readAsDataURL(file);
});

async function profileApi(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("wardrobe:unauthorized"));
    const error = new Error(value.error || "The profile could not be saved.");
    error.status = response.status;
    error.code = value.code;
    throw error;
  }
  return value;
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(first, second) {
  return Math.sqrt(
    ((first.red - second.red) ** 2)
    + ((first.green - second.green) ** 2)
    + ((first.blue - second.blue) ** 2),
  );
}

function extractPalette(image) {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 72) continue;

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const key = `${Math.round(red / 28)}-${Math.round(green / 28)}-${Math.round(blue / 28)}`;
    const current = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0 };
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.count += 1;
    buckets.set(key, current);
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const selected = [];
  for (const color of ranked) {
    if (selected.every((existing) => colorDistance(existing, color) > 38)) selected.push(color);
    if (selected.length === 5) break;
  }

  return selected.map((color) => rgbToHex(color.red, color.green, color.blue));
}

function buildSamplingCanvas(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function sampleImageColor(image, canvas, event) {
  const bounds = image.getBoundingClientRect();
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const imageX = Math.floor((event.clientX - bounds.left - offsetX) / scale);
  const imageY = Math.floor((event.clientY - bounds.top - offsetY) / scale);

  if (imageX < 0 || imageY < 0 || imageX >= canvas.width || imageY >= canvas.height) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  for (let radius = 0; radius <= 18; radius += 2) {
    const startX = Math.max(0, imageX - radius);
    const startY = Math.max(0, imageY - radius);
    const width = Math.min(canvas.width - startX, (radius * 2) + 1);
    const height = Math.min(canvas.height - startY, (radius * 2) + 1);
    const data = context.getImageData(startX, startY, width, height).data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 96) return rgbToHex(data[index], data[index + 1], data[index + 2]);
    }
  }

  return null;
}

function GalleryItem({ item, selected, onOpen }) {
  const type = TYPE_MAP[item.part]?.singular || "wardrobe item";

  return (
    <button
      className={`gallery-item${selected ? " selected" : ""}`}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`View ${item.name || type}`}
      aria-pressed={selected}
      data-testid={`wardrobe-item-${item.id}`}
    >
      <OptimizedImage
        src={item.thumbnail || item.image}
        alt=""
        sizes="(max-width: 520px) calc(50vw - 16px), (max-width: 860px) calc(33vw - 18px), 180px"
        breakpoints={[120, 180, 240, 320, 480]}
      />
    </button>
  );
}

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const nextTag = input.trim().replace(/^#/, "");
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return;
    onChange([...tags, nextTag]);
    setInput("");
  };

  return (
    <div className="tag-editor">
      <div className="editable-tags">
        {tags.map((tag) => (
          <span className="editable-tag" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={`Remove ${tag}`}>
              <X size={12} weight="regular" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a detail"
          aria-label="Add detail tag"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Add detail">
          <Plus size={15} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ColorControl({ label, field, value, palette, onChange, sampling, setSampling, optional = false, onClear, onAdd }) {
  if (optional && !value) {
    return (
      <div className="color-slot empty-color-slot">
        <div className="color-slot-heading">
          <span>{label}</span>
          <small>Optional</small>
        </div>
        <p>No distinct secondary color detected.</p>
        <button className="add-secondary-button" type="button" onClick={onAdd}>Add secondary color</button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && <button type="button" onClick={onClear}>Remove</button>}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Choose ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Selected</small>
          <strong>{value || "Custom"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Image suggestions</span>
        <small>Click to apply</small>
      </div>
      <div className="palette" aria-label={`${label} suggestions from image`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Use ${color} as ${label.toLowerCase()}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        {sampling === field ? "Cancel picking" : `Pick ${label.toLowerCase()} from image`}
      </button>
    </div>
  );
}

function ItemEditor({ draft, setDraft, palette, sampling, setSampling, sampleStatus }) {
  const suggestedSecondary = palette.find((color) => color.toLowerCase() !== draft.color?.toLowerCase()) || "#9a9286";

  return (
    <div className="item-editor">
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder={TYPE_MAP[draft.part]?.singular || "Wardrobe item"}
        />
      </label>

      <label className="field">
        <span>Category</span>
        <select value={draft.part} onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}>
          {TYPES.slice(1).map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
        </select>
      </label>

      <fieldset className="color-field">
        <legend>Colors</legend>
        <div className="colors-editor">
          <ColorControl
            label="Primary color"
            field="primary"
            value={draft.color}
            palette={palette}
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            sampling={sampling}
            setSampling={setSampling}
          />
          <ColorControl
            label="Secondary color"
            field="secondary"
            value={draft.secondaryColor}
            palette={palette}
            onChange={(secondaryColor) => setDraft((current) => ({ ...current, secondaryColor }))}
            sampling={sampling}
            setSampling={setSampling}
            optional
            onClear={() => setDraft((current) => ({ ...current, secondaryColor: null }))}
            onAdd={() => setDraft((current) => ({ ...current, secondaryColor: suggestedSecondary }))}
          />
        </div>
        <p className="color-help" aria-live="polite">{sampling ? `Click anywhere on the garment to sample the ${sampling} color.` : sampleStatus || "Primary colors come from the image. A secondary is suggested only when a distinct color has meaningful coverage."}</p>
      </fieldset>

      <div className="field details-field">
        <span>Details</span>
        <TagEditor tags={draft.tags} onChange={(tags) => setDraft((current) => ({ ...current, tags }))} />
      </div>
    </div>
  );
}

function ItemViewer({ item, onClose, onSave, onDelete }) {
  const closeButtonRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const [sampling, setSampling] = useState(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState(item.palette || []);
  const [draft, setDraft] = useState({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const type = TYPE_MAP[item.part]?.singular || "Wardrobe item";
  const hasModeledImage = Boolean(item.modeledImage);
  const hasOriginalImage = Boolean(item.originalImage);
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const isDirty = useMemo(() => {
    const normalizedTags = (tags) => tags.map((tag) => tag.trim()).filter(Boolean);
    return JSON.stringify({
      name: draft.name.trim(),
      part: draft.part,
      color: draft.color?.toLowerCase() || null,
      secondaryColor: draft.secondaryColor?.toLowerCase() || null,
      tags: normalizedTags(draft.tags),
    }) !== JSON.stringify({
      name: (item.name || "").trim(),
      part: item.part,
      color: item.color?.toLowerCase() || null,
      secondaryColor: item.secondaryColor?.toLowerCase() || null,
      tags: normalizedTags(item.tags || []),
    });
  }, [draft, item]);

  const nudgeUnsaved = useCallback(() => {
    setCloseBlocked(true);
    setShaking(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShaking(true));
    });
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setShaking(false), 420);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirty) nudgeUnsaved();
    else onClose();
  }, [isDirty, nudgeUnsaved, onClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (sampling) setSampling(null);
        else requestClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("viewer-open");
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open");
      clearTimeout(shakeTimerRef.current);
    };
  }, [requestClose, sampling]);

  useEffect(() => {
    if (!isDirty) setCloseBlocked(false);
  }, [isDirty]);

  useEffect(() => {
    setSampling(null);
    setSampleStatus("");
    setPalette(item.palette || []);
    setDraft({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
    setShowOriginal(false);
  }, [item]);

  const cancelEditing = () => {
    setDraft({ name: item.name || "", part: item.part, color: item.color || "#9a9286", secondaryColor: item.secondaryColor || null, tags: [...(item.tags || [])] });
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = () => {
    onSave({ ...item, ...draft, name: draft.name.trim(), tags: draft.tags.map((tag) => tag.trim()).filter(Boolean) });
    setSampling(null);
    setSampleStatus("Changes saved.");
  };

  const handleImageLoad = (event) => {
    samplingCanvasRef.current = buildSamplingCanvas(event.currentTarget);
    const extracted = extractPalette(event.currentTarget);
    setPalette([...new Set([...(item.palette || []), ...extracted])].slice(0, 5));
  };

  const handleImageClick = (event) => {
    if (!sampling || !samplingCanvasRef.current) return;
    const color = sampleImageColor(event.currentTarget, samplingCanvasRef.current, event);
    if (!color) {
      setSampleStatus("That spot is transparent—try directly on the garment.");
      return;
    }
    const targetField = sampling === "secondary" ? "secondaryColor" : "color";
    setDraft((current) => ({ ...current, [targetField]: color }));
    setPalette((current) => [color, ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase())].slice(0, 5));
    setSampleStatus(`Sampled ${color} as the ${sampling} color.`);
    setSampling(null);
  };

  const garmentArtwork = (
    <div
      className={`viewer-art${hasModeledImage ? " viewer-art-floating" : ""}${sampling ? " sampling" : ""}`}
      style={hasModeledImage ? { "--piece-rotation": pieceRotation } : undefined}
    >
      <OptimizedImage
        ref={imageRef}
        src={item.image}
        alt={`Selected ${type.toLowerCase()}`}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Click garment to sample</span>}
    </div>
  );

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <div className="viewer-entry">
    <aside className={`viewer editing${hasModeledImage ? " has-modeled-image" : ""}${shaking ? " shake" : ""}`} role="dialog" aria-modal="true" aria-label="Selected wardrobe item">
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label="Close viewer" ref={closeButtonRef}>
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasModeledImage ? (
        <div className="modeled-hero">
          {hasOriginalImage ? (
            <button
              className="modeled-hero-toggle"
              type="button"
              aria-pressed={showOriginal}
              onClick={() => setShowOriginal((current) => !current)}
            >
              <OptimizedImage
                className="modeled-hero-photo"
                src={showOriginal ? item.originalImage : item.modeledImage}
                alt={showOriginal ? `Original photo containing ${draft.name || type}` : `${draft.name || type} worn by a model`}
                style={showOriginal ? { objectPosition: originalPhotoPosition(item) } : undefined}
                sizes="(max-width: 860px) 100vw, 520px"
                breakpoints={[320, 480, 640, 800, 1040, 1280]}
                quality={82}
                priority
              />
            </button>
          ) : (
            <OptimizedImage
              className="modeled-hero-photo"
              src={item.modeledImage}
              alt={`${draft.name || type} worn by a model`}
              sizes="(max-width: 860px) 100vw, 520px"
              breakpoints={[320, 480, 640, 800, 1040, 1280]}
              quality={82}
              priority
            />
          )}
          {hasOriginalImage && (
            <span className="modeled-toggle-hint">
              {showOriginal ? "Click photo to see modeled look" : "Click photo to see original"}
            </span>
          )}
          <div className="viewer-heading modeled-heading">
            <div>
              <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
            </div>
          </div>
          {garmentArtwork}
        </div>
      ) : (
        <>
          <div className="viewer-heading">
            <div>
              <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
            </div>
          </div>
          {garmentArtwork}
        </>
      )}

      <div className="viewer-details editing">
        <ItemEditor
          draft={draft}
          setDraft={setDraft}
          palette={palette}
          sampling={sampling}
          setSampling={setSampling}
          sampleStatus={sampleStatus}
        />

        {closeBlocked && <p className="unsaved-notice" role="status">Save or cancel changes before closing.</p>}

        <div className="viewer-actions">
          <button className="delete-button" type="button" onClick={() => onDelete(item.id)}>
            <Trash size={15} weight="regular" aria-hidden="true" /> Delete
          </button>
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={cancelEditing}>Cancel</button>
          <button className="primary-button" type="button" onClick={saveEditing}>
            <Check size={15} weight="bold" aria-hidden="true" /> Save
          </button>
        </div>
      </div>
    </aside>
    </div>
    </div>
  );
}

function PasswordGate({ error: statusError, onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(statusError || "");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await profileApi("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="password-gate">
      <form onSubmit={submit}>
        <span className="password-gate__mark"><LockKey size={26} weight="light" aria-hidden="true" /></span>
        <p>Private wardrobe</p>
        <h1>Enter the shared password</h1>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </label>
        {error && <p className="password-gate__error" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password}>{busy ? "Unlocking…" : "Open wardrobe"}</button>
        <small>Access is shared with anyone who knows this password.</small>
      </form>
    </main>
  );
}

function ProfileAvatar({ user, size = "medium" }) {
  const reference = user?.referenceImages?.[0];
  return (
    <span className={`profile-avatar is-${size}`}>
      {reference ? <img src={reference.url} alt="" /> : <UserCircle size={size === "large" ? 40 : 24} weight="light" aria-hidden="true" />}
    </span>
  );
}

function ProfileMenu({ users, currentUser, onSelect, onAdd, onEdit, onExport, onLogout }) {
  const detailsRef = useRef(null);
  const closeMenu = () => { if (detailsRef.current) detailsRef.current.open = false; };

  return (
    <details className="profile-menu" ref={detailsRef}>
      <summary>
        <ProfileAvatar user={currentUser} />
        <span className="profile-menu__current">
          <small>Wardrobe</small>
          <strong>{currentUser?.name || "Choose user"}</strong>
        </span>
        <CaretDown size={14} aria-hidden="true" />
      </summary>
      <div className="profile-menu__popover">
        <p className="profile-menu__label">Switch wardrobe</p>
        <div className="profile-menu__users">
          {users.map((user) => (
            <button
              className={user.id === currentUser?.id ? "is-current" : ""}
              type="button"
              key={user.id}
              onClick={() => { onSelect(user.id); closeMenu(); }}
            >
              <ProfileAvatar user={user} />
              <span><strong>{user.name}</strong><small>{user.fashionStyle || `${user.referenceImages?.length || 0} reference photo${user.referenceImages?.length === 1 ? "" : "s"}`}</small></span>
              {user.id === currentUser?.id && <Check size={14} weight="bold" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="profile-menu__actions">
          <button type="button" onClick={() => { onEdit(); closeMenu(); }}><PencilSimple size={14} /> Edit profile</button>
          <button type="button" onClick={() => { onAdd(); closeMenu(); }}><Plus size={14} /> Add person</button>
          <button className="profile-menu__export" type="button" onClick={() => { onExport(); closeMenu(); }} title="Includes every person's wardrobe and photos">
            <DownloadSimple size={14} /> Download all data
          </button>
          {onLogout && <button className="profile-menu__logout" type="button" onClick={() => { onLogout(); closeMenu(); }}><LockKey size={14} /> Lock wardrobe</button>}
        </div>
      </div>
    </details>
  );
}

function ProfileEditor({ user, busy, error, onClose, onSave }) {
  const isNew = !user;
  const [draft, setDraft] = useState({
    name: user?.name || "",
    age: user?.age || "",
    fashionStyle: user?.fashionStyle || "",
    sizes: user?.sizes || "",
    preferences: user?.preferences || "",
  });
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const previews = useMemo(() => files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  const chooseReferences = (event) => {
    const selected = [...event.target.files].filter((file) => file.type.startsWith("image/"));
    if (selected.length > 3) {
      setFileError("Choose no more than three reference photos.");
      setFiles(selected.slice(0, 3));
    } else {
      setFileError("");
      setFiles(selected);
    }
    event.target.value = "";
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isNew && !files.length) {
      setFileError("Add at least one reference photo.");
      return;
    }
    const referenceImages = files.length
      ? await Promise.all(files.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })))
      : undefined;
    await onSave({ ...draft, age: draft.age === "" ? null : Number(draft.age), ...(referenceImages ? { referenceImages } : {}) });
  };

  const visibleReferences = previews.length ? previews : (user?.referenceImages || []);

  return (
    <div className="profile-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="profile-editor" onSubmit={submit}>
        <header>
          <div>
            <p>{isNew ? "New wardrobe" : "Personal profile"}</p>
            <h2>{isNew ? "Add a person" : `Edit ${user.name}`}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close profile editor"><X size={20} /></button>
        </header>

        <div className="profile-editor__body">
          <div className="profile-reference-field">
            <div className="profile-reference-field__heading">
              <span>Reference photos</span>
              <small>1–3 photos</small>
            </div>
            {!!visibleReferences.length && (
              <div className="profile-reference-grid">
                {visibleReferences.map((reference) => <img src={reference.url} alt="" key={reference.id || reference.url} />)}
              </div>
            )}
            <label className="profile-upload">
              <UploadSimple size={17} />
              <span>{files.length ? "Choose different photos" : user?.referenceImages?.length ? "Replace reference photos" : "Choose reference photos"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseReferences} />
            </label>
            <p>Use clear, complementary photos of the same person. Replacing photos affects future modeled images only.</p>
            {fileError && <small className="profile-field-error">{fileError}</small>}
          </div>

          <div className="profile-fields">
            <label><span>Name</span><input required maxLength="80" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Rafael" /></label>
            <label><span>Age <small>optional</small></span><input type="number" min="1" max="120" value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} placeholder="32" /></label>
            <label className="profile-field-wide"><span>Fashion style</span><input maxLength="240" value={draft.fashionStyle} onChange={(event) => setDraft({ ...draft, fashionStyle: event.target.value })} placeholder="Minimal, relaxed tailoring, quiet colors" /></label>
            <label className="profile-field-wide"><span>Sizes and fit</span><input maxLength="240" value={draft.sizes} onChange={(event) => setDraft({ ...draft, sizes: event.target.value })} placeholder="Usually M tops, 32 trousers; prefers a relaxed fit" /></label>
            <label className="profile-field-wide"><span>Preferences</span><textarea rows="4" maxLength="1200" value={draft.preferences} onChange={(event) => setDraft({ ...draft, preferences: event.target.value })} placeholder="Favorite colors, materials, occasions, styling goals, and anything to avoid." /></label>
          </div>
          {error && <p className="profile-save-error" role="alert">{error}</p>}
        </div>

        <footer>
          <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="profile-save" type="submit" disabled={busy || !draft.name.trim()}><Check size={14} weight="bold" /> {busy ? "Saving…" : "Save profile"}</button>
        </footer>
      </form>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState(null);
  const [authError, setAuthError] = useState("");
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profileEditor, setProfileEditor] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [items, setItems] = useState([]);
  const [activeType, setActiveType] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    profileApi("/api/auth/status")
      .then(setAuth)
      .catch((requestError) => {
        setAuth({ enabled: true, authenticated: false });
        setAuthError(requestError.message);
        setLoading(false);
      });
    const onUnauthorized = () => {
      setAuth((current) => ({ enabled: Boolean(current?.enabled), authenticated: false }));
      setUsers([]);
      setCurrentUserId(null);
      setItems([]);
      setSelectedId(null);
    };
    window.addEventListener("wardrobe:unauthorized", onUnauthorized);
    return () => window.removeEventListener("wardrobe:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    if (!auth?.authenticated) return;
    profileApi("/api/users")
      .then((result) => {
        setUsers(result.users || []);
        setCurrentUserId(result.currentUserId);
      })
      .catch((requestError) => {
        setError(requestError.message);
        setLoading(false);
      });
  }, [auth?.authenticated]);

  useEffect(() => {
    if (!auth?.authenticated || !currentUserId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setItems([]);
    setSelectedId(null);
    fetch(`/api/import/wardrobe?user=${encodeURIComponent(currentUserId)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401) window.dispatchEvent(new Event("wardrobe:unauthorized"));
          throw new Error("Could not load the wardrobe.");
        }
        return response.json();
      })
      .then(async (loadedItems) => {
        const edits = readEdits(currentUserId);
        const deleted = readDeletedItems(currentUserId);
        const visibleItems = loadedItems.filter((item) => !deleted.has(item.id));
        const mergedItems = visibleItems.map((item) => ({ ...item, ...(edits[item.id] || {}) }));
        const migrations = [
          ...mergedItems
            .filter((item) => item.id.startsWith("import-") && edits[item.id])
            .map(async (item) => {
              await profileApi(`/api/import/wardrobe/${item.id}?user=${encodeURIComponent(currentUserId)}`, {
                method: "PATCH",
                body: JSON.stringify({
                  name: item.name,
                  part: item.part,
                  color: item.color,
                  secondaryColor: item.secondaryColor,
                  tags: item.tags,
                }),
              });
              removePersistedEdit(item.id, currentUserId);
            }),
          ...[...deleted]
            .filter((id) => id.startsWith("import-"))
            .map(async (id) => {
              const response = await fetch(`/api/import/wardrobe/${id}?user=${encodeURIComponent(currentUserId)}`, { method: "DELETE" });
              if (!response.ok && response.status !== 404) throw new Error("Could not migrate a locally deleted item.");
              removePersistedDeletedItem(id, currentUserId);
            }),
        ];
        const migrationResults = await Promise.allSettled(migrations);
        if (migrationResults.some((result) => result.status === "rejected")) {
          console.warn("[wardrobe] Some browser-only edits could not be moved into the portable database.");
        }
        if (!cancelled) setItems(mergedItems);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auth?.authenticated, currentUserId]);

  const currentUser = users.find((user) => user.id === currentUserId) || null;
  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const visibleItems = useMemo(() => {
    const filtered = activeType === "all" ? items : items.filter((item) => item.part === activeType);
    return [...filtered].sort((a, b) => {
      if (activeType === "all") {
        const typeDifference = (TYPE_ORDER[a.part] ?? 99) - (TYPE_ORDER[b.part] ?? 99);
        if (typeDifference) return typeDifference;
      }
      return a.id.localeCompare(b.id);
    });
  }, [activeType, items]);

  const chooseType = (typeId) => {
    setActiveType(typeId);
    setSelectedId(null);
  };

  const saveItem = async (updatedItem) => {
    setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item));
    persistEdit(updatedItem, currentUserId);
    if (!updatedItem.id.startsWith("import-")) return;
    try {
      const saved = await profileApi(`/api/import/wardrobe/${updatedItem.id}?user=${encodeURIComponent(currentUserId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: updatedItem.name,
          part: updatedItem.part,
          color: updatedItem.color,
          secondaryColor: updatedItem.secondaryColor,
          tags: updatedItem.tags,
        }),
      });
      removePersistedEdit(updatedItem.id, currentUserId);
      setItems((current) => current.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
    } catch (requestError) {
      setError(`${requestError.message} Your change is still saved in this browser.`);
    }
  };

  const deleteItem = async (id) => {
    if (id.startsWith("import-")) {
      try {
        const response = await fetch(`/api/import/wardrobe/${id}?user=${encodeURIComponent(currentUserId)}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error("Could not delete the imported item.");
      } catch (requestError) {
        setError(requestError.message);
        return;
      }
    }
    setItems((current) => current.filter((item) => item.id !== id));
    removePersistedEdit(id, currentUserId);
    if (id.startsWith("import-")) removePersistedDeletedItem(id, currentUserId);
    else persistDeletedItem(id, currentUserId);
    setSelectedId(null);
  };

  const selectUser = async (userId) => {
    if (userId === currentUserId) return;
    try {
      await profileApi("/api/users/current", { method: "PUT", body: JSON.stringify({ userId }) });
      setCurrentUserId(userId);
      setActiveType("all");
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const downloadPersonalData = async () => {
    setError("");
    const migrations = users.flatMap((user) => {
      const edits = readEdits(user.id);
      const deleted = readDeletedItems(user.id);
      return [
        ...Object.entries(edits)
          .filter(([id]) => id.startsWith("import-"))
          .map(async ([id, edit]) => {
            try {
              await profileApi(`/api/import/wardrobe/${id}?user=${encodeURIComponent(user.id)}`, {
                method: "PATCH",
                body: JSON.stringify(edit),
              });
              removePersistedEdit(id, user.id);
            } catch (requestError) {
              if (requestError.status === 404) {
                removePersistedEdit(id, user.id);
                return;
              }
              throw requestError;
            }
          }),
        ...[...deleted]
          .filter((id) => id.startsWith("import-"))
          .map(async (id) => {
            const response = await fetch(`/api/import/wardrobe/${id}?user=${encodeURIComponent(user.id)}`, { method: "DELETE" });
            if (!response.ok && response.status !== 404) throw new Error(`Could not prepare ${user.name}'s deleted items for export.`);
            removePersistedDeletedItem(id, user.id);
          }),
      ];
    });
    const results = await Promise.allSettled(migrations);
    if (results.some((result) => result.status === "rejected")) {
      setError("The backup could not include every browser-only change. Check your connection and try the download again.");
      return;
    }
    window.location.assign("/api/export");
  };

  const saveProfile = async (input) => {
    setProfileBusy(true);
    setProfileError("");
    try {
      const editingUser = profileEditor === "new" ? null : users.find((user) => user.id === profileEditor);
      const result = await profileApi(editingUser ? `/api/users/${editingUser.id}` : "/api/users", {
        method: editingUser ? "PATCH" : "POST",
        body: JSON.stringify(input),
      });
      setUsers((current) => editingUser
        ? current.map((user) => user.id === result.user.id ? result.user : user)
        : [...current, result.user]);
      if (!editingUser) {
        setCurrentUserId(result.currentUserId);
        setActiveType("all");
      }
      setProfileEditor(null);
    } catch (requestError) {
      setProfileError(requestError.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const addImportedItem = useCallback((newItem) => {
    setItems((current) => current.some((item) => item.id === newItem.id) ? current : [...current, newItem]);
  }, []);

  const attachImportedModeledImage = useCallback((jobId, modeledImage) => {
    const id = `import-${jobId}`;
    setItems((current) => current.map((item) => item.id === id ? { ...item, modeledImage } : item));
  }, []);

  const logout = async () => {
    try {
      await profileApi("/api/auth/logout", { method: "POST" });
    } finally {
      setAuth((current) => ({ enabled: current?.enabled !== false, authenticated: false }));
      setUsers([]);
      setCurrentUserId(null);
      setItems([]);
      setSelectedId(null);
    }
  };

  if (auth === null) return <main className="password-gate"><p className="status">Checking access</p></main>;
  if (!auth.authenticated) {
    return <PasswordGate error={authError} onAuthenticated={(result) => { setAuthError(""); setAuth(result); setLoading(true); }} />;
  }

  return (
    <div className={`app-shell${selectedItem ? " has-selection" : ""}`}>
      <main className="gallery-pane">
        <header className="gallery-header">
          <div className="gallery-meta-row">
            <div>
              <p className="wardrobe-owner">{currentUser?.name || "Wardrobe"}</p>
              <p className="piece-count">{items.length} {items.length === 1 ? "piece" : "pieces"}</p>
            </div>
            {!!currentUser && (
              <ProfileMenu
                users={users}
                currentUser={currentUser}
                onSelect={selectUser}
                onAdd={() => { setProfileError(""); setProfileEditor("new"); }}
                onEdit={() => { setProfileError(""); setProfileEditor(currentUser.id); }}
                onExport={downloadPersonalData}
                onLogout={auth.enabled ? logout : null}
              />
            )}
          </div>
          <nav className="category-nav" aria-label="Filter wardrobe by item type">
            {TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={activeType === type.id ? "active" : ""}
                onClick={() => chooseType(type.id)}
                aria-pressed={activeType === type.id}
              >
                {type.label}
              </button>
            ))}
          </nav>
        </header>

        {error && <p className="status error">{error}</p>}
        {!error && loading && <p className="status">Loading wardrobe</p>}
        {!error && !loading && !items.length && <p className="status empty">Drop, paste, or add a photo to import your first piece.</p>}

        {!!items.length && (
          <section className="gallery-grid" aria-label={`${TYPE_MAP[activeType]?.label || "All"} wardrobe items`}>
            {visibleItems.map((item) => (
              <GalleryItem
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onOpen={setSelectedId}
              />
            ))}
          </section>
        )}
      </main>

      {selectedItem && <ItemViewer item={selectedItem} onClose={() => setSelectedId(null)} onSave={saveItem} onDelete={deleteItem} />}
      {currentUser && (
        <WardrobeImportFlow
          key={`${currentUser.id}:${currentUser.updatedAt}`}
          userId={currentUser.id}
          onGarmentApproved={addImportedItem}
          onModeledApproved={attachImportedModeledImage}
        />
      )}
      {profileEditor && (
        <ProfileEditor
          user={profileEditor === "new" ? null : users.find((user) => user.id === profileEditor)}
          busy={profileBusy}
          error={profileError}
          onClose={() => !profileBusy && setProfileEditor(null)}
          onSave={saveProfile}
        />
      )}
    </div>
  );
}
