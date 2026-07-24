import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CaretLeft, CaretRight, Check, DownloadSimple, LockKey, PencilSimple, Plus, Sparkle, SpinnerGap, Trash, UploadSimple, UserCircle, X } from "@phosphor-icons/react";
import { readableError, WardrobeImportFlow } from "./import-flow.jsx";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { colorGroup } from "./color-organization.js";
import {
  BRAND_OPTIONS,
  CURRENCY_OPTIONS,
  FIT_OPTIONS,
  normalizePreferenceList,
  normalizePurchaseCurrency,
  normalizePurchaseMonth,
  normalizePurchasePrice,
  normalizeSizeProfile,
  purchaseMonthValue,
  SIZE_FIELDS,
  SIZE_SYSTEMS,
} from "./wardrobe-metadata.js";

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
const ORGANIZATION_MODES = [
  { id: "custom", label: "My order" },
  { id: "updated", label: "Last updated" },
  { id: "purchase-oldest", label: "Oldest first" },
  { id: "color", label: "Colors" },
];
const ORGANIZATION_MODE_IDS = new Set(ORGANIZATION_MODES.map((mode) => mode.id));
const COLOR_GROUPS = [
  { id: "light-neutrals", label: "Light neutrals", tones: ["#f7f4ed", "#d8cfbd", "#aaa8a3"] },
  { id: "greens", label: "Greens & teals", tones: ["#afbd80", "#487b52", "#1e6666"] },
  { id: "blues", label: "Blues", tones: ["#a9c8dc", "#3d70a3", "#263c72"] },
  { id: "purples", label: "Purples", tones: ["#c8afd4", "#765188", "#432f5c"] },
  { id: "reds", label: "Reds & pinks", tones: ["#e7b1b3", "#b64d55", "#762d3b"] },
  { id: "warm", label: "Yellows & oranges", tones: ["#e4cc6a", "#c7803f", "#934f28"] },
  { id: "browns", label: "Browns", tones: ["#b28d6b", "#76523c", "#3f2b24"] },
  { id: "dark-neutrals", label: "Dark neutrals", tones: ["#686763", "#393a3a", "#171818"] },
  { id: "other", label: "Other colors", tones: ["#aaa19a", "#77716c", "#4b4845"] },
];
const COLOR_GROUP_INDEX = Object.fromEntries(COLOR_GROUPS.map((group, index) => [group.id, index]));
const LEGACY_ORIGINAL_FOCUS = {
  upperbody: [50, 44],
  wholebody_up: [50, 52],
  lowerbody: [50, 68],
  accessories_up: [50, 54],
  shoes: [50, 78],
};
const IMAGE_PREFETCHES = new Map();

function timestampValue(item) {
  const value = Date.parse(item.updatedAt || item.modeledGeneratedAt || item.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function editableItem(item) {
  return {
    name: item.name || "",
    part: item.part,
    color: item.color || "#9a9286",
    secondaryColor: item.secondaryColor || null,
    brand: item.brand || "",
    purchaseMonth: normalizePurchaseMonth(item.purchaseMonth) || "",
    purchasePrice: normalizePurchasePrice(item.purchasePrice) ?? "",
    tags: [...(item.tags || [])],
  };
}

function itemModeledLooks(item) {
  if (Array.isArray(item.modeledLooks)) {
    return item.modeledLooks.filter((look) => look?.id && look?.image);
  }
  return item.modeledImage ? [{
    id: "legacy",
    image: item.modeledImage,
    model: item.modeledModel || null,
    fallbackUsed: Boolean(item.modeledFallbackUsed),
    generatedAt: item.modeledGeneratedAt || null,
  }] : [];
}

function modeledLookSource(look) {
  return look?.preview || look?.image || null;
}

function preferredHeroImage(item) {
  const latestLook = itemModeledLooks(item).at(-1);
  return modeledLookSource(latestLook)
    || item.originalPreview
    || item.originalImage
    || item.imagePreview
    || item.image
    || null;
}

function preloadImage(src) {
  if (!src || typeof Image === "undefined" || IMAGE_PREFETCHES.has(src)) return;
  const image = new Image();
  image.decoding = "async";
  IMAGE_PREFETCHES.set(src, image);
  const release = () => IMAGE_PREFETCHES.set(src, true);
  image.onload = release;
  image.onerror = release;
  image.src = src;
}

function preloadItemPanel(item) {
  [...new Set([
    preferredHeroImage(item),
    item.imagePreview || item.image,
  ].filter(Boolean))].forEach(preloadImage);
}

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
    brand: item.brand || "",
    purchaseMonth: normalizePurchaseMonth(item.purchaseMonth),
    purchasePrice: normalizePurchasePrice(item.purchasePrice),
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

function GalleryItem({
  item,
  selected,
  onOpen,
  draggable = false,
  dragging = false,
  dropTarget = false,
  priority = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const type = TYPE_MAP[item.part]?.singular || "wardrobe item";
  const prefetchedHero = useRef(false);
  const warmHero = () => {
    if (prefetchedHero.current) return;
    prefetchedHero.current = true;
    preloadItemPanel(item);
  };

  return (
    <button
      className={`gallery-item${selected ? " selected" : ""}${dragging ? " is-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`}
      type="button"
      draggable={draggable}
      onClick={() => onOpen(item.id)}
      onPointerEnter={warmHero}
      onFocus={warmHero}
      onDragStart={(event) => onDragStart?.(event, item.id)}
      onDragOver={(event) => onDragOver?.(event, item.id)}
      onDrop={(event) => onDrop?.(event, item.id)}
      onDragEnd={onDragEnd}
      aria-label={`View ${item.name || type}${draggable ? ". Drag to change its position" : ""}`}
      aria-pressed={selected}
      data-testid={`wardrobe-item-${item.id}`}
    >
      <OptimizedImage
        src={item.thumbnail || item.image}
        alt=""
        sizes="(max-width: 520px) calc(50vw - 16px), (max-width: 860px) calc(33vw - 18px), 180px"
        breakpoints={[120, 180, 240, 320, 480]}
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        reveal
      />
    </button>
  );
}

function TagEditor({
  tags,
  onChange,
  placeholder = "Add a detail",
  inputLabel = "Add detail tag",
  addLabel = "Add detail",
}) {
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
          placeholder={placeholder}
          aria-label={inputLabel}
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label={addLabel}>
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

function BrandField({ value, onChange }) {
  const fieldRef = useRef(null);
  const [open, setOpen] = useState(false);
  const normalizedQuery = value.trim().toLowerCase();
  const suggestions = useMemo(() => (
    [...BRAND_OPTIONS].sort((first, second) => {
      const firstStarts = first.toLowerCase().startsWith(normalizedQuery);
      const secondStarts = second.toLowerCase().startsWith(normalizedQuery);
      return Number(secondStarts) - Number(firstStarts) || first.localeCompare(second);
    }).filter((brand) => !normalizedQuery || brand.toLowerCase().includes(normalizedQuery))
  ), [normalizedQuery]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="field brand-field" ref={fieldRef}>
      <label className="field-heading" htmlFor="wardrobe-brand-input">Brand <small>optional</small></label>
      <input
        id="wardrobe-brand-input"
        value={value}
        maxLength="80"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="wardrobe-brand-suggestions"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search or type a brand"
      />
      {open && (
        <div className="brand-suggestions" id="wardrobe-brand-suggestions" role="listbox" aria-label="Brand suggestions">
          {suggestions.length ? suggestions.map((brand) => (
            <button
              type="button"
              role="option"
              aria-selected={brand.toLowerCase() === value.trim().toLowerCase()}
              key={brand}
              onClick={() => {
                onChange(brand);
                setOpen(false);
              }}
            >
              {brand}
            </button>
          )) : <p>Keep typing to use “{value.trim()}” as a custom brand.</p>}
        </div>
      )}
    </div>
  );
}

function ItemEditor({ draft, setDraft, palette, sampling, setSampling, sampleStatus, currency }) {
  const suggestedSecondary = palette.find((color) => color.toLowerCase() !== draft.color?.toLowerCase()) || "#9a9286";
  const currencyOption = CURRENCY_OPTIONS.find((option) => option.id === currency) || CURRENCY_OPTIONS[0];

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

      <BrandField
        value={draft.brand}
        onChange={(brand) => setDraft((current) => ({ ...current, brand }))}
      />

      <label className="field">
        <span>Purchased <small>optional</small></span>
        <input
          type="month"
          value={draft.purchaseMonth}
          onChange={(event) => setDraft((current) => ({ ...current, purchaseMonth: event.target.value }))}
          aria-label="Purchase month and year"
        />
      </label>

      <fieldset className="field purchase-price-field">
        <legend>Purchase price <small>optional</small></legend>
        <div>
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            inputMode="decimal"
            value={draft.purchasePrice}
            onChange={(event) => setDraft((current) => ({ ...current, purchasePrice: event.target.value }))}
            placeholder="79.90"
            aria-label="Purchase price"
          />
          <span className="purchase-price-currency">{currencyOption.label}</span>
        </div>
      </fieldset>

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

function ItemViewer({
  item,
  currency,
  onClose,
  onSave,
  onDelete,
  onGenerateModeled,
  onDeleteModeled,
  onDirtyChange,
  blockedSwitchSignal,
}) {
  const deleteLookButtonRef = useRef(null);
  const deleteCancelButtonRef = useRef(null);
  const imageRef = useRef(null);
  const samplingCanvasRef = useRef(null);
  const shakeTimerRef = useRef(null);
  const activeItemIdRef = useRef(item.id);
  activeItemIdRef.current = item.id;
  const [sampling, setSampling] = useState(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState(item.palette || []);
  const [draft, setDraft] = useState(() => editableItem(item));
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [generatingModeledFor, setGeneratingModeledFor] = useState(null);
  const [deletingModeled, setDeletingModeled] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [generationError, setGenerationError] = useState("");
  const type = TYPE_MAP[item.part]?.singular || "Wardrobe item";
  const modeledLooks = useMemo(() => itemModeledLooks(item), [item]);
  const [modeledIndex, setModeledIndex] = useState(Math.max(0, modeledLooks.length - 1));
  const activeModeledIndex = modeledLooks.length ? Math.min(modeledIndex, modeledLooks.length - 1) : 0;
  const activeModeledLook = modeledLooks[activeModeledIndex] || null;
  const generatingModeled = generatingModeledFor === item.id;
  const hasModeledImage = Boolean(activeModeledLook);
  const hasOriginalImage = Boolean(item.originalImage);
  const hasHeroImage = hasModeledImage || hasOriginalImage;
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const isDirty = useMemo(() => {
    const normalizedTags = (tags) => tags.map((tag) => tag.trim()).filter(Boolean);
    const draftPrice = normalizePurchasePrice(draft.purchasePrice);
    const itemPrice = normalizePurchasePrice(item.purchasePrice);
    return JSON.stringify({
      name: draft.name.trim(),
      part: draft.part,
      color: draft.color?.toLowerCase() || null,
      secondaryColor: draft.secondaryColor?.toLowerCase() || null,
      brand: draft.brand.trim(),
      purchaseMonth: normalizePurchaseMonth(draft.purchaseMonth),
      purchasePrice: draftPrice,
      tags: normalizedTags(draft.tags),
    }) !== JSON.stringify({
      name: (item.name || "").trim(),
      part: item.part,
      color: item.color?.toLowerCase() || null,
      secondaryColor: item.secondaryColor?.toLowerCase() || null,
      brand: (item.brand || "").trim(),
      purchaseMonth: normalizePurchaseMonth(item.purchaseMonth),
      purchasePrice: itemPrice,
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
        if (deleteCandidate) {
          if (!deletingModeled) {
            setDeleteCandidate(null);
            requestAnimationFrame(() => deleteLookButtonRef.current?.focus({ preventScroll: true }));
          }
        } else if (sampling) setSampling(null);
        else requestClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(shakeTimerRef.current);
    };
  }, [deleteCandidate, deletingModeled, requestClose, sampling]);

  useEffect(() => {
    if (deleteCandidate) deleteCancelButtonRef.current?.focus({ preventScroll: true });
  }, [deleteCandidate]);

  useEffect(() => {
    if (!isDirty) setCloseBlocked(false);
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (blockedSwitchSignal) nudgeUnsaved();
  }, [blockedSwitchSignal, nudgeUnsaved]);

  useLayoutEffect(() => {
    setSampling(null);
    samplingCanvasRef.current = null;
    setSampleStatus("");
    setPalette(item.palette || []);
    setDraft(editableItem(item));
    setShowOriginal(false);
    setModeledIndex(Math.max(0, itemModeledLooks(item).length - 1));
    setDeleteCandidate(null);
    setCloseBlocked(false);
    setGenerationError("");
  }, [item]);

  useEffect(() => {
    preloadImage(item.originalPreview || item.originalImage);
    if (modeledLooks.length < 2) return;
    const previous = (activeModeledIndex - 1 + modeledLooks.length) % modeledLooks.length;
    const next = (activeModeledIndex + 1) % modeledLooks.length;
    preloadImage(modeledLookSource(modeledLooks[previous]));
    preloadImage(modeledLookSource(modeledLooks[next]));
  }, [activeModeledIndex, item.originalImage, item.originalPreview, modeledLooks]);

  const cancelEditing = () => {
    setDraft(editableItem(item));
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = () => {
    const purchasePrice = normalizePurchasePrice(draft.purchasePrice);
    onSave({
      ...item,
      ...draft,
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      purchaseMonth: normalizePurchaseMonth(draft.purchaseMonth),
      purchasePrice,
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    });
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

  const generateModeledLook = async () => {
    if (deletingModeled) return;
    if (isDirty) {
      setGenerationError("Save your item changes before generating the modeled look.");
      nudgeUnsaved();
      return;
    }
    const targetItemId = item.id;
    setGeneratingModeledFor(targetItemId);
    setGenerationError("");
    try {
      await onGenerateModeled(targetItemId);
    } catch (requestError) {
      if (activeItemIdRef.current === targetItemId) {
        setGenerationError(readableError(requestError));
      }
    } finally {
      setGeneratingModeledFor((current) => current === targetItemId ? null : current);
    }
  };

  const rotateModeledLook = (direction) => {
    if (modeledLooks.length < 2) return;
    setShowOriginal(false);
    setModeledIndex((current) => {
      const safeCurrent = Math.min(current, modeledLooks.length - 1);
      return (safeCurrent + direction + modeledLooks.length) % modeledLooks.length;
    });
  };

  const requestDeleteModeledLook = () => {
    if (!activeModeledLook || deletingModeled || generatingModeled) return;
    if (isDirty) {
      setGenerationError("Save your item changes before deleting a modeled look.");
      nudgeUnsaved();
      return;
    }
    setDeleteCandidate({
      look: activeModeledLook,
      index: activeModeledIndex,
      total: modeledLooks.length,
    });
  };

  const closeDeleteConfirmation = () => {
    if (deletingModeled) return;
    setDeleteCandidate(null);
    requestAnimationFrame(() => deleteLookButtonRef.current?.focus({ preventScroll: true }));
  };

  const keepDeleteDialogFocus = (event) => {
    if (event.key !== "Tab") return;
    const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const deleteModeledLook = async () => {
    if (!deleteCandidate || deletingModeled) return;
    setDeletingModeled(true);
    setGenerationError("");
    try {
      await onDeleteModeled(item.id, deleteCandidate.look.id);
      setModeledIndex(Math.max(0, deleteCandidate.index - (deleteCandidate.index === deleteCandidate.total - 1 ? 1 : 0)));
      setShowOriginal(false);
      setDeleteCandidate(null);
    } catch (requestError) {
      setGenerationError(readableError(requestError));
      setDeleteCandidate(null);
    } finally {
      setDeletingModeled(false);
    }
  };

  const garmentArtwork = (
    <div
      className={`viewer-art${hasHeroImage ? " viewer-art-floating" : ""}${sampling ? " sampling" : ""}`}
      style={hasHeroImage ? { "--piece-rotation": pieceRotation } : undefined}
    >
      <OptimizedImage
        ref={imageRef}
        src={item.imagePreview || item.image}
        alt={`Selected ${type.toLowerCase()}`}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        reveal
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Click garment to sample</span>}
    </div>
  );

  return (
    <>
    <div className="viewer-entry" aria-hidden={deleteCandidate ? "true" : undefined}>
    <aside className={`viewer editing${hasHeroImage ? " has-hero-image" : ""}${shaking ? " shake" : ""}`} aria-label="Selected wardrobe item">
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label="Close viewer">
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasHeroImage ? (
        <>
          <div className="viewer-heading modeled-heading">
            <div>
              <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
            </div>
          </div>
          <div className="modeled-hero">
            {hasModeledImage && hasOriginalImage ? (
              <button
                className="modeled-hero-toggle"
                type="button"
                aria-pressed={showOriginal}
                onClick={() => setShowOriginal((current) => !current)}
              >
                <OptimizedImage
                  key={showOriginal ? "original" : activeModeledLook.id}
                  className="modeled-hero-photo"
                  src={showOriginal ? item.originalPreview || item.originalImage : modeledLookSource(activeModeledLook)}
                  alt={showOriginal ? `Original photo containing ${draft.name || type}` : `${draft.name || type} modeled look ${activeModeledIndex + 1} of ${modeledLooks.length}`}
                  style={showOriginal ? { objectPosition: originalPhotoPosition(item) } : undefined}
                  sizes="(max-width: 860px) 100vw, 520px"
                  breakpoints={[320, 480, 640, 800, 1040, 1280]}
                  quality={82}
                  priority
                  reveal
                />
              </button>
            ) : (
              <OptimizedImage
                key={hasModeledImage ? activeModeledLook.id : "original"}
                className="modeled-hero-photo"
                src={hasModeledImage ? modeledLookSource(activeModeledLook) : item.originalPreview || item.originalImage}
                alt={hasModeledImage ? `${draft.name || type} modeled look ${activeModeledIndex + 1} of ${modeledLooks.length}` : `Original photo containing ${draft.name || type}`}
                style={!hasModeledImage ? { objectPosition: originalPhotoPosition(item) } : undefined}
                sizes="(max-width: 860px) 100vw, 520px"
                breakpoints={[320, 480, 640, 800, 1040, 1280]}
                quality={82}
                priority
                reveal
              />
            )}
            {hasModeledImage && hasOriginalImage && (
              <span className="modeled-toggle-hint">
                {showOriginal ? "Click photo to see modeled look" : "Click photo to see original"}
              </span>
            )}
            {garmentArtwork}
          </div>
          {hasModeledImage && (
            <div className={`modeled-look-toolbar${modeledLooks.length > 1 ? "" : " single"}`} aria-label="Modeled look controls">
              {modeledLooks.length > 1 && (
                <div className="modeled-look-pagination">
                  <button type="button" onClick={() => rotateModeledLook(-1)} aria-label="Previous modeled look">
                    <CaretLeft size={18} aria-hidden="true" />
                  </button>
                  <span aria-live="polite">{activeModeledIndex + 1} of {modeledLooks.length}</span>
                  <button type="button" onClick={() => rotateModeledLook(1)} aria-label="Next modeled look">
                    <CaretRight size={18} aria-hidden="true" />
                  </button>
                </div>
              )}
              <button
                ref={deleteLookButtonRef}
                className="modeled-look-delete"
                type="button"
                disabled={deletingModeled || generatingModeled}
                onClick={requestDeleteModeledLook}
              >
                <Trash size={14} aria-hidden="true" />
                {deletingModeled ? "Deleting…" : "Delete look"}
              </button>
            </div>
          )}
        </>
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
        {item.id.startsWith("import-") && (
          <section className="modeled-request" aria-label="Modeled look">
            <div>
              <strong>{hasModeledImage ? "Create another styled look" : "See this piece styled on you"}</strong>
              <p>{hasModeledImage ? "Adds a new image without replacing your existing looks." : "Generates and saves one AI image only when you request it."}</p>
            </div>
            <button className="modeled-request__button" type="button" disabled={generatingModeled || deletingModeled} onClick={generateModeledLook}>
              {generatingModeled ? <SpinnerGap className="modeled-request__spinner" size={16} /> : <Sparkle size={16} weight="fill" />}
              {generatingModeled ? "Generating look…" : hasModeledImage ? "Generate another" : "Generate modeled look"}
            </button>
            {generationError && <p className="modeled-request__error" role="alert">{generationError}</p>}
          </section>
        )}

        <ItemEditor
          draft={draft}
          setDraft={setDraft}
          palette={palette}
          sampling={sampling}
          setSampling={setSampling}
          sampleStatus={sampleStatus}
          currency={currency}
        />

        {closeBlocked && <p className="unsaved-notice" role="status">Save or cancel changes before leaving this item.</p>}

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
    {deleteCandidate && (
      <div
        className="look-delete-overlay"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeDeleteConfirmation()}
      >
        <section
          className="look-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="look-delete-title"
          onKeyDown={keepDeleteDialogFocus}
        >
          <button
            className="look-delete-dialog__close"
            type="button"
            onClick={closeDeleteConfirmation}
            disabled={deletingModeled}
            aria-label="Cancel deleting this look"
          >
            <X size={22} weight="light" aria-hidden="true" />
          </button>
          <div className="look-delete-dialog__image">
            <OptimizedImage
              src={modeledLookSource(deleteCandidate.look)}
              alt={`${draft.name || type} modeled look to delete`}
              sizes="(max-width: 520px) calc(100vw - 64px), 400px"
              breakpoints={[320, 480, 640, 800]}
              quality={82}
              priority
              reveal
            />
          </div>
          <div className="look-delete-dialog__body">
            <p className="look-delete-dialog__eyebrow">Delete look</p>
            <h2 id="look-delete-title">Are you sure you want to delete this look?</h2>
          </div>
          <div className="look-delete-dialog__actions">
            <button
              ref={deleteCancelButtonRef}
              className="secondary-button"
              type="button"
              onClick={closeDeleteConfirmation}
              disabled={deletingModeled}
            >
              Cancel
            </button>
            <button className="look-delete-dialog__confirm" type="button" onClick={deleteModeledLook} disabled={deletingModeled}>
              <Trash size={15} aria-hidden="true" />
              {deletingModeled ? "Deleting…" : "Delete look"}
            </button>
          </div>
        </section>
      </div>
    )}
    </>
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

function ProfileSizeEditor({ value, onChange }) {
  const normalized = normalizeSizeProfile(value);
  const system = SIZE_SYSTEMS.find((candidate) => candidate.id === normalized.system) || SIZE_SYSTEMS[0];
  const update = (field, nextValue) => onChange({ ...normalized, [field]: nextValue });

  return (
    <fieldset className="profile-size-editor profile-field-wide">
      <legend>Sizes and fit</legend>
      <p>Choose the sizing system printed on most of your clothes. You can still type any brand-specific size.</p>
      <div className="profile-size-controls">
        <label>
          <span>Sizing system</span>
          <select value={normalized.system} onChange={(event) => update("system", event.target.value)}>
            {SIZE_SYSTEMS.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}
          </select>
        </label>
        <label>
          <span>Preferred fit</span>
          <select value={normalized.fit} onChange={(event) => update("fit", event.target.value)}>
            {FIT_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="profile-size-grid">
        {SIZE_FIELDS.map((field) => {
          const listId = `profile-${normalized.system}-${field.id}-sizes`;
          return (
            <label key={field.id}>
              <span>{field.label} <small>optional</small></span>
              <input
                value={normalized[field.id]}
                list={system.suggestions[field.id]?.length ? listId : undefined}
                maxLength="40"
                onChange={(event) => update(field.id, event.target.value)}
                placeholder={system.examples[field.id]}
              />
              {!!system.suggestions[field.id]?.length && (
                <datalist id={listId}>
                  {system.suggestions[field.id].map((suggestion) => <option value={suggestion} key={suggestion} />)}
                </datalist>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProfilePreferenceList({ label, help, values, onChange, placeholder }) {
  return (
    <fieldset className="profile-preference-list profile-field-wide">
      <legend>{label} <small>optional</small></legend>
      <p>{help}</p>
      <TagEditor
        tags={values}
        onChange={(nextValues) => onChange(normalizePreferenceList(nextValues))}
        placeholder={placeholder}
        inputLabel={`Add ${label.toLowerCase()}`}
        addLabel={`Add ${label.toLowerCase()}`}
      />
    </fieldset>
  );
}

function ProfileEditor({ user, busy, error, onClose, onSave }) {
  const isNew = !user;
  const [draft, setDraft] = useState({
    name: user?.name || "",
    age: user?.age || "",
    fashionStyle: user?.fashionStyle || "",
    sizeProfile: normalizeSizeProfile(user?.sizeProfile),
    sizes: user?.sizes || "",
    preferredCurrency: normalizePurchaseCurrency(user?.preferredCurrency),
    preferredMaterials: normalizePreferenceList(user?.preferredMaterials),
    favoriteColors: normalizePreferenceList(user?.favoriteColors),
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
            <label className="profile-field-wide profile-currency-field">
              <span>Preferred currency</span>
              <select value={draft.preferredCurrency} onChange={(event) => setDraft({ ...draft, preferredCurrency: event.target.value })}>
                {CURRENCY_OPTIONS.map((currency) => <option value={currency.id} key={currency.id}>{currency.label}</option>)}
              </select>
            </label>
            <ProfileSizeEditor value={draft.sizeProfile} onChange={(sizeProfile) => setDraft({ ...draft, sizeProfile })} />
            <label className="profile-field-wide"><span>Additional sizing notes <small>optional</small></span><input maxLength="240" value={draft.sizes} onChange={(event) => setDraft({ ...draft, sizes: event.target.value })} placeholder="This brand runs small; prefer extra room at the shoulders" /></label>
            <ProfilePreferenceList
              label="Preferred materials"
              help="Materials you enjoy wearing or want prioritized in styling."
              values={draft.preferredMaterials}
              onChange={(preferredMaterials) => setDraft({ ...draft, preferredMaterials })}
              placeholder="Linen, cotton, wool…"
            />
            <ProfilePreferenceList
              label="Favorite colors"
              help="Color names or families to favor in supporting pieces and suggestions."
              values={draft.favoriteColors}
              onChange={(favoriteColors) => setDraft({ ...draft, favoriteColors })}
              placeholder="Olive, navy, cream…"
            />
            <label className="profile-field-wide"><span>Other preferences</span><textarea rows="4" maxLength="1200" value={draft.preferences} onChange={(event) => setDraft({ ...draft, preferences: event.target.value })} placeholder="Occasions, styling goals, sensory needs, and anything to avoid." /></label>
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
  const [organizationMode, setOrganizationMode] = useState("custom");
  const [organizationStatus, setOrganizationStatus] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [viewerDirty, setViewerDirty] = useState(false);
  const [blockedSwitchSignal, setBlockedSwitchSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const suppressOpenAfterDrag = useRef(false);

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
      setViewerDirty(false);
      setBlockedSwitchSignal(0);
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
    setViewerDirty(false);
    setBlockedSwitchSignal(0);
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
                  brand: item.brand,
                  purchaseMonth: item.purchaseMonth,
                  purchasePrice: item.purchasePrice,
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

  useEffect(() => {
    const nextMode = ORGANIZATION_MODE_IDS.has(currentUser?.wardrobeSortMode)
      ? currentUser.wardrobeSortMode
      : "custom";
    setOrganizationMode(nextMode);
    setOrganizationStatus("");
    setDraggedId(null);
    setDropTargetId(null);
  }, [currentUserId, currentUser?.wardrobeSortMode]);

  const customOrderedItems = useMemo(() => {
    const sourcePositions = new Map(items.map((item, index) => [item.id, index]));
    return [...items].sort((first, second) => {
      const firstOrder = first.customOrder;
      const secondOrder = second.customOrder;
      const firstHasOrder = Number.isFinite(firstOrder);
      const secondHasOrder = Number.isFinite(secondOrder);
      if (firstHasOrder && secondHasOrder && firstOrder !== secondOrder) return firstOrder - secondOrder;
      if (firstHasOrder !== secondHasOrder) return firstHasOrder ? -1 : 1;
      return sourcePositions.get(first.id) - sourcePositions.get(second.id);
    });
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = activeType === "all"
      ? customOrderedItems
      : customOrderedItems.filter((item) => item.part === activeType);
    if (organizationMode === "custom") return filtered;
    if (organizationMode === "updated") {
      return [...filtered].sort((first, second) => (
        timestampValue(second) - timestampValue(first)
        || first.name.localeCompare(second.name)
      ));
    }
    if (organizationMode === "purchase-oldest") {
      return [...filtered].sort((first, second) => (
        purchaseMonthValue(first) - purchaseMonthValue(second)
        || timestampValue(first) - timestampValue(second)
        || first.name.localeCompare(second.name)
      ));
    }
    return [...filtered].sort((first, second) => {
      const firstColor = colorGroup(first);
      const secondColor = colorGroup(second);
      return (
        COLOR_GROUP_INDEX[firstColor.id] - COLOR_GROUP_INDEX[secondColor.id]
        || firstColor.hue - secondColor.hue
        || secondColor.lightness - firstColor.lightness
        || first.name.localeCompare(second.name)
      );
    });
  }, [activeType, customOrderedItems, organizationMode]);

  const colorSections = useMemo(() => {
    if (organizationMode !== "color") return [];
    return COLOR_GROUPS.map((group) => ({
      ...group,
      items: visibleItems.filter((item) => colorGroup(item).id === group.id),
    })).filter((group) => group.items.length);
  }, [organizationMode, visibleItems]);

  const visibleItemIndex = useMemo(
    () => new Map(visibleItems.map((item, index) => [item.id, index])),
    [visibleItems],
  );

  useEffect(() => {
    if (loading || !visibleItems.length || navigator.connection?.saveData) return undefined;
    const warmVisibleHeroes = () => {
      visibleItems.slice(0, 6).forEach(preloadItemPanel);
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmVisibleHeroes, { timeout: 1800 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(warmVisibleHeroes, 700);
    return () => window.clearTimeout(timeoutId);
  }, [loading, visibleItems]);

  const chooseType = (typeId) => {
    setActiveType(typeId);
  };

  const saveOrganizationMode = async (mode) => {
    if (!ORGANIZATION_MODE_IDS.has(mode) || mode === organizationMode || !currentUserId) return;
    const previousMode = organizationMode;
    setOrganizationMode(mode);
    setDraggedId(null);
    setDropTargetId(null);
    setOrganizationStatus("saving");
    setUsers((current) => current.map((user) => (
      user.id === currentUserId ? { ...user, wardrobeSortMode: mode } : user
    )));
    try {
      const result = await profileApi(`/api/import/wardrobe/organization?user=${encodeURIComponent(currentUserId)}`, {
        method: "PUT",
        body: JSON.stringify({ mode }),
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      setOrganizationStatus("saved");
      window.setTimeout(() => setOrganizationStatus((status) => status === "saved" ? "" : status), 1600);
    } catch (requestError) {
      setOrganizationMode(previousMode);
      setUsers((current) => current.map((user) => (
        user.id === currentUserId ? { ...user, wardrobeSortMode: previousMode } : user
      )));
      setOrganizationStatus("");
      setError(`Could not save this organization mode. ${requestError.message}`);
    }
  };

  const saveCustomOrder = async (sourceId, targetId) => {
    if (!currentUserId || sourceId === targetId || organizationStatus === "saving") return;
    const sourceIndex = customOrderedItems.findIndex((item) => item.id === sourceId);
    const targetIndex = customOrderedItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const previousItems = items;
    const reordered = [...customOrderedItems];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const positions = new Map(reordered.map((item, index) => [item.id, index]));
    setItems((current) => current.map((item) => ({ ...item, customOrder: positions.get(item.id) })));
    setOrganizationStatus("saving");
    try {
      await profileApi(`/api/import/wardrobe/organization?user=${encodeURIComponent(currentUserId)}`, {
        method: "PUT",
        body: JSON.stringify({ ids: reordered.map((item) => item.id) }),
      });
      setOrganizationStatus("saved");
      window.setTimeout(() => setOrganizationStatus((status) => status === "saved" ? "" : status), 1600);
    } catch (requestError) {
      setItems(previousItems);
      setOrganizationStatus("");
      setError(`Could not save your wardrobe order. ${requestError.message}`);
    }
  };

  const beginItemDrag = (event, id) => {
    if (organizationMode !== "custom" || organizationStatus === "saving") {
      event.preventDefault();
      return;
    }
    suppressOpenAfterDrag.current = true;
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const dragOverItem = (event, id) => {
    if (!draggedId || draggedId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(id);
  };

  const dropItem = (event, targetId) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
    setDraggedId(null);
    setDropTargetId(null);
    if (sourceId) void saveCustomOrder(sourceId, targetId);
    window.setTimeout(() => { suppressOpenAfterDrag.current = false; }, 150);
  };

  const finishItemDrag = () => {
    setDraggedId(null);
    setDropTargetId(null);
    window.setTimeout(() => { suppressOpenAfterDrag.current = false; }, 150);
  };

  const openItem = (id) => {
    if (suppressOpenAfterDrag.current) return;
    if (viewerDirty && selectedId && id !== selectedId) {
      setBlockedSwitchSignal((current) => current + 1);
      return;
    }
    setBlockedSwitchSignal(0);
    setSelectedId(id);
  };

  const closeViewer = useCallback(() => {
    setViewerDirty(false);
    setBlockedSwitchSignal(0);
    setSelectedId(null);
  }, []);

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
          brand: updatedItem.brand,
          purchaseMonth: updatedItem.purchaseMonth,
          purchasePrice: updatedItem.purchasePrice,
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
    closeViewer();
  };

  const selectUser = async (userId) => {
    if (userId === currentUserId) return;
    try {
      await profileApi("/api/users/current", { method: "PUT", body: JSON.stringify({ userId }) });
      setCurrentUserId(userId);
      setActiveType("all");
      closeViewer();
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

  const generateModeledLook = async (id) => {
    const generated = await profileApi(`/api/import/wardrobe/${id}/modeled?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
    });
    setItems((current) => current.map((item) => item.id === generated.id ? { ...item, ...generated } : item));
    return generated;
  };

  const deleteModeledLook = async (id, lookId) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/modeled/${encodeURIComponent(lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const logout = async () => {
    try {
      await profileApi("/api/auth/logout", { method: "POST" });
    } finally {
      setAuth((current) => ({ enabled: current?.enabled !== false, authenticated: false }));
      setUsers([]);
      setCurrentUserId(null);
      setItems([]);
      closeViewer();
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
          <div className="gallery-controls">
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
            <div className="organization-control">
              <span className="organization-label">Organize</span>
              <div className="organization-options" role="group" aria-label="Organize wardrobe">
                {ORGANIZATION_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={organizationMode === mode.id ? "active" : ""}
                    onClick={() => saveOrganizationMode(mode.id)}
                    aria-pressed={organizationMode === mode.id}
                    disabled={organizationStatus === "saving"}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <small className="organization-help" aria-live="polite">
                {organizationStatus === "saving"
                  ? "Saving…"
                  : organizationStatus === "saved"
                    ? "Saved"
                    : organizationMode === "custom"
                      ? "Drag pieces to arrange"
                      : organizationMode === "color"
                        ? "Grouped by tone"
                        : organizationMode === "purchase-oldest"
                          ? "Unknown purchase dates appear last"
                          : "Newest changes first"}
              </small>
            </div>
          </div>
        </header>

        {error && <p className="status error">{error}</p>}
        {!error && loading && <p className="status">Loading wardrobe</p>}
        {!error && !loading && !items.length && <p className="status empty">Drop, paste, or add a photo to import your first piece.</p>}

        {!!items.length && (
          <section className={`gallery-grid${organizationMode === "color" ? " is-color-organized" : ""}`} aria-label={`${TYPE_MAP[activeType]?.label || "All"} wardrobe items`}>
            {organizationMode === "color"
              ? colorSections.flatMap((section) => [
                  <header className="color-collection-heading" key={`heading-${section.id}`}>
                    <span className="color-collection-swatches" aria-hidden="true">
                      {section.tones.map((tone) => <i key={tone} style={{ background: tone }} />)}
                    </span>
                    <h2>{section.label}</h2>
                    <span>{section.items.length} {section.items.length === 1 ? "piece" : "pieces"}</span>
                  </header>,
                  ...section.items.map((item) => (
                    <GalleryItem
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onOpen={openItem}
                      priority={(visibleItemIndex.get(item.id) ?? Infinity) < 8}
                    />
                  )),
                ])
              : visibleItems.map((item) => (
                  <GalleryItem
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onOpen={openItem}
                    priority={(visibleItemIndex.get(item.id) ?? Infinity) < 8}
                    draggable={organizationMode === "custom" && organizationStatus !== "saving"}
                    dragging={draggedId === item.id}
                    dropTarget={dropTargetId === item.id}
                    onDragStart={beginItemDrag}
                    onDragOver={dragOverItem}
                    onDrop={dropItem}
                    onDragEnd={finishItemDrag}
                  />
                ))}
          </section>
        )}
      </main>

      {selectedItem && (
        <ItemViewer
          item={selectedItem}
          currency={normalizePurchaseCurrency(currentUser?.preferredCurrency)}
          onClose={closeViewer}
          onSave={saveItem}
          onDelete={deleteItem}
          onGenerateModeled={generateModeledLook}
          onDeleteModeled={deleteModeledLook}
          onDirtyChange={setViewerDirty}
          blockedSwitchSignal={blockedSwitchSignal}
        />
      )}
      {currentUser && (
        <WardrobeImportFlow
          key={`${currentUser.id}:${currentUser.updatedAt}`}
          userId={currentUser.id}
          onGarmentApproved={addImportedItem}
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
