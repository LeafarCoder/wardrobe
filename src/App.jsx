import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowSquareOut, ArrowsDownUp, ArrowsLeftRight, BookmarkSimple, CalendarBlank, CalendarDots, CaretDown, CaretLeft, CaretRight, Check, ClockCounterClockwise, CloudSun, CoatHanger, Crop, CrosshairSimple, DownloadSimple, Dress, Eye, EyeSlash, FunnelSimple, GoogleLogo, Handbag, ImageSquare, Info, Key, Link, ListBullets, ListNumbers, LockKey, MagnifyingGlass, MapPin, Palette, Pants, PencilSimple, Plus, Rows, Sneaker, Sparkle, SpinnerGap, SquaresFour, SuitcaseRolling, Tag, Trash, TShirt, UserCircle, WarningCircle, X } from "@phosphor-icons/react";
import { readableError, WardrobeImportFlow } from "./import-flow.jsx";
import { BrandIcon } from "./BrandIcon.jsx";
import { CareIcon } from "./CareIcon.jsx";
import { ConnectionsDialog } from "./ConnectionsDialog.jsx";
import {
  connectionInvitationPath,
  connectionInvitationResponsePath,
  connectionInvitationsPath,
  connectionPath,
  connectionsPath,
} from "./connection-paths.js";
import { CITY_SUGGESTIONS } from "./city-suggestions.js";
import { GarmentColorPreview } from "./GarmentColorPreview.jsx";
import { DayDatePicker } from "./DayDatePicker.jsx";
import { formatDate, getLocale, LANGUAGE_OPTIONS, setLocale, tr, useLocale } from "./i18n.js";
import { LightSelect, LightTypeahead } from "./LightSelect.jsx";
import { formatMonthYear, MonthYearPicker } from "./MonthYearPicker.jsx";
import { ModeledLookDialog } from "./ModeledLookDialog.jsx";
import { modeledLookContextDetails } from "./modeled-look-context.js";
import { imageFallbackToast, withoutFallbackNotice } from "./image-fallback-notice.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { OriginalPhotoGallery } from "./OriginalPhotoGallery.jsx";
import { cropCenteredCoverPosition, originalPhotoPosition } from "./original-photo-position.js";
import { OutfitStudio } from "./OutfitStudio.jsx";
import { TutorialWalkthrough } from "./TutorialWalkthrough.jsx";
import {
  isValidOpenRouterKey,
  notifyOpenRouterKeyRequired,
  OPENROUTER_KEY_REQUIRED_EVENT,
} from "./openrouter-key.js";
import { ProductStage } from "./ProductStage.jsx";
import { aiModelLabel, AI_TASKS, formatAiCost, normalizeAiPreferences } from "./ai-preferences.js";
import { garmentVariationColors, normalizeHexColor } from "./garment-recolor.js";
import {
  CARE_GROUPS,
  careInstructionCount,
  normalizeCareInstructions,
  selectedCareInstructions,
} from "./garment-care.js";
import {
  GARMENT_VARIANT_THRESHOLD_DEFAULT,
  GARMENT_VARIANT_THRESHOLD_MAX,
  GARMENT_VARIANT_THRESHOLD_MIN,
  GARMENT_ORIGINAL_VERSION_ID,
  garmentColorVariants,
  garmentVersionFanSlot,
  garmentVersionLayout,
  garmentVersionOrder,
  garmentVersionSpreadAngle,
  garmentVersionSpreadMetrics,
  moveGarmentVersion,
  selectedGarmentVariantId,
} from "./garment-variants.js";
import {
  preferredStoreOptions,
  STORE_OPTIONS,
  storeSearchUrl,
} from "./store-search.js";
import {
  BRAND_OPTIONS,
  CURRENCY_OPTIONS,
  FIT_OPTIONS,
  HEIGHT_UNIT_OPTIONS,
  normalizePreferenceList,
  normalizePurchaseCurrency,
  normalizePurchaseMonth,
  normalizePurchasePrice,
  normalizeSizeProfile,
  purchaseMonthValue,
  SIZE_FIELDS,
  SIZE_SYSTEMS,
  suggestedHeightUnit,
} from "./wardrobe-metadata.js";
import {
  activeFilterCount,
  collectFacetOptions,
  DEFAULT_WARDROBE_FILTERS,
  GARMENT_FIT_SUGGESTIONS,
  GRID_DENSITIES,
  groupWardrobeItems,
  itemFacetValues,
  MATERIAL_SUGGESTIONS,
  normalizeWardrobeDisplayPreferences,
  normalizeGarmentFacetList,
  normalizeGarmentSeasons,
  normalizeSavedViews,
  normalizeWardrobeFilters,
  SEASON_OPTIONS,
  WARDROBE_BACKGROUND_STYLES,
  WARDROBE_DETAIL_FIELDS,
  WARDROBE_SHOWCASE_MODES,
  wardrobeItemMatches,
} from "./wardrobe-discovery.js";
import { withWardrobeUser } from "./user-scope.js";
import { collectOriginalPhotoLibrary } from "./original-photo-library.js";
import { collectGeneratedPhotoLibrary } from "./generated-photo-library.js";
import {
  GARMENT_MEDIA_GENERATED,
  GARMENT_MEDIA_ORIGINAL,
  garmentMediaId,
  garmentMediaPreloadSources,
  garmentMediaPreviewSource,
  moveGarmentMedia,
  orderedGarmentMedia,
} from "./garment-media.js";

const STORAGE_KEY = "open-wardrobe-edits-v1";
const DELETED_STORAGE_KEY = "open-wardrobe-deleted-v1";
const EMPTY_CONNECTION_DATA = Object.freeze({
  incomingInvites: [],
  outgoingInvites: [],
  grantedToMe: [],
  sharedByMe: [],
  notificationCount: 0,
});

const TYPES = [
  { id: "all", label: "All" },
  { id: "upperbody", label: "Tops", singular: "Top", icon: TShirt },
  { id: "wholebody_up", label: "Outerwear", singular: "Outerwear item", icon: CoatHanger },
  { id: "lowerbody", label: "Bottoms", singular: "Bottom", icon: Pants },
  { id: "wholebody", label: "Dresses & one-pieces", singular: "Dress or one-piece", icon: Dress },
  { id: "shoes", label: "Shoes", singular: "Shoes", icon: Sneaker },
  { id: "accessories_up", label: "Accessories", singular: "Accessory", icon: Handbag },
];

const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));
const SORT_MODES = [
  { id: "custom", label: "My order", icon: ListNumbers },
  { id: "updated", label: "Last updated", icon: ClockCounterClockwise },
  { id: "purchase-oldest", label: "Oldest first", icon: CalendarBlank },
];
const GROUP_MODES = [
  { id: "none", label: "No grouping", icon: Rows },
  { id: "color", label: "Colors", icon: Palette },
  { id: "type", label: "Garment type", icon: TShirt },
  { id: "brand", label: "Brand", icon: Tag },
  { id: "purchase-year", label: "Acquisition year", icon: CalendarBlank },
];
const SORT_MODE_IDS = new Set(SORT_MODES.map((mode) => mode.id));
const GROUP_MODE_IDS = new Set(GROUP_MODES.map((mode) => mode.id));
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
    secondHand: Boolean(item.secondHand),
    acquiredFree: Boolean(item.acquiredFree),
    tags: [...(item.tags || [])],
    sizes: normalizeGarmentFacetList(item.sizes),
    fits: normalizeGarmentFacetList(item.fits),
    materials: normalizeGarmentFacetList(item.materials),
    seasons: normalizeGarmentSeasons(item.seasons),
    careInstructions: normalizeCareInstructions(item.careInstructions),
  };
}

function itemModeledLooks(item) {
  if (Array.isArray(item.modeledLooks)) {
    return item.modeledLooks.filter((look) => look?.id && look?.image && !look.vaultedAt);
  }
  return item.modeledImage ? [{
    id: "legacy",
    image: item.modeledImage,
    model: item.modeledModel || null,
    fallbackUsed: Boolean(item.modeledFallbackUsed),
    generatedAt: item.modeledGeneratedAt || null,
  }] : [];
}

function itemSourcePhotos(item) {
  const source = Array.isArray(item.sourcePhotos) ? item.sourcePhotos.filter((photo) => photo?.image) : [];
  if (source.length) return source;
  return item.originalImage ? [{
    id: "original",
    image: item.originalImage,
    preview: item.originalPreview || null,
    boundingBox: item.boundingBox || null,
    focusBox: item.originalFocusBox || null,
  }] : [];
}

function garmentRegenerationDraft(item) {
  const candidate = item.garmentRegenerationCandidate;
  const metadata = candidate?.metadata || item;
  const sourcePhotos = itemSourcePhotos(item);
  const availableIds = new Set(sourcePhotos.map((photo) => photo.id));
  const candidateIds = Array.isArray(candidate?.sourcePhotoIds)
    ? candidate.sourcePhotoIds.filter((id) => availableIds.has(id)).slice(0, 3)
    : [];
  return {
    name: metadata.name || item.name || "",
    part: metadata.part || item.part || "upperbody",
    color: metadata.color || item.color || "#9a9286",
    secondaryColor: metadata.secondaryColor || "",
    characteristics: Array.isArray(metadata.tags) ? metadata.tags.join(", ") : "",
    direction: "",
    sourcePhotoIds: candidateIds.length ? candidateIds : sourcePhotos.slice(0, 3).map((photo) => photo.id),
  };
}

function itemColorVersions(item) {
  const versions = [{
    id: null,
    image: item.image,
    preview: item.imagePreview || item.image,
    thumbnail: item.thumbnail || item.imagePreview || item.image,
    primaryColor: item.color || null,
    secondaryColor: item.secondaryColor || null,
    original: true,
  }, ...garmentColorVariants(item)];
  const byId = new Map(versions.map((version) => [version.id || GARMENT_ORIGINAL_VERSION_ID, version]));
  return garmentVersionOrder(item).map((id) => byId.get(id)).filter(Boolean);
}

function itemSelectedColorVersionIndex(item, versions = itemColorVersions(item)) {
  const selectedId = selectedGarmentVariantId(item);
  const index = selectedId ? versions.findIndex((version) => version.id === selectedId) : 0;
  return index >= 0 ? index : 0;
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
    purchasePrice: item.acquiredFree ? null : normalizePurchasePrice(item.purchasePrice),
    secondHand: Boolean(item.secondHand),
    acquiredFree: Boolean(item.acquiredFree),
    tags: item.tags || [],
    sizes: normalizeGarmentFacetList(item.sizes),
    fits: normalizeGarmentFacetList(item.fits),
    materials: normalizeGarmentFacetList(item.materials),
    seasons: normalizeGarmentSeasons(item.seasons),
    careInstructions: normalizeCareInstructions(item.careInstructions),
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
  reader.onerror = () => reject(reader.error || new Error(tr("Could not read that photo.")));
  reader.readAsDataURL(file);
});

async function profileApi(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "Accept-Language": getLocale(), ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("wardrobe:unauthorized"));
    const error = new Error(tr(value.error || "The profile could not be saved."));
    error.status = response.status;
    error.code = value.code;
    notifyOpenRouterKeyRequired(error);
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
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0);
  return canvas;
}

function sampleImageColor(image, canvas, event) {
  const bounds = image.getBoundingClientRect();
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
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
  display,
  selected,
  mergeMode = false,
  mergeSource = false,
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
  const type = tr(TYPE_MAP[item.part]?.singular || "wardrobe item");
  const displayPreferences = normalizeWardrobeDisplayPreferences(display);
  const detailsVisible = displayPreferences.mode === "details";
  const backgroundStyle = WARDROBE_BACKGROUND_STYLES.find(
    (style) => style.id === displayPreferences.backgroundStyle,
  ) || WARDROBE_BACKGROUND_STYLES[0];
  const hasTileBackground = backgroundStyle.id !== "none";
  const visibleFields = new Set(displayPreferences.detailFields);
  const detailRows = [
    ["materials", tr("Material"), itemFacetValues(item, "materials")],
    ["sizes", tr("Size"), item.sizes],
    ["fits", tr("Fit"), itemFacetValues(item, "fits")],
    ["seasons", tr("Season"), item.seasons?.map((value) => tr(SEASON_OPTIONS.find((season) => season.id === value)?.label || value))],
  ].filter(([field, , values]) => visibleFields.has(field) && values?.length);
  const prefetchedHero = useRef(false);
  const warmHero = () => {
    if (prefetchedHero.current) return;
    prefetchedHero.current = true;
    preloadItemPanel(item);
  };

  return (
    <button
      className={`gallery-item${detailsVisible ? " has-details" : ""}${hasTileBackground ? " has-tile-background" : ""}${selected ? " selected" : ""}${mergeMode ? " is-merge-option" : ""}${mergeSource ? " is-merge-source" : ""}${dragging ? " is-dragging" : ""}${dropTarget ? " is-drop-target" : ""}`}
      type="button"
      draggable={draggable}
      onClick={() => onOpen(item.id)}
      onPointerEnter={warmHero}
      onFocus={warmHero}
      onDragStart={(event) => onDragStart?.(event, item.id)}
      onDragOver={(event) => onDragOver?.(event, item.id)}
      onDrop={(event) => onDrop?.(event, item.id)}
      onDragEnd={onDragEnd}
      aria-label={tr(
        mergeSource
          ? "Current garment: {name}"
          : mergeMode
            ? "Select {name} to merge"
            : draggable ? "View {name}. Drag to change its position" : "View {name}",
        { name: item.name || type },
      )}
      aria-pressed={selected}
      data-testid={`wardrobe-item-${item.id}`}
      data-tutorial="garment-card"
    >
      <span
        className="gallery-item__media"
        style={hasTileBackground ? {
          backgroundColor: backgroundStyle.color,
        } : undefined}
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
        {detailsVisible && (
          <span className="gallery-item__swatches" aria-hidden="true">
            {[item.color, item.secondaryColor].filter(Boolean).map((color) => (
              <i key={color} style={{ backgroundColor: color }} />
            ))}
          </span>
        )}
      </span>
      {detailsVisible && (
        <span className="gallery-item__details">
          {visibleFields.has("name") && <strong>{item.name || type}</strong>}
          {visibleFields.has("brand") && item.brand && (
            <span className="gallery-item__brand">
              <BrandIcon brand={item.brand} size={15} />
              <span>{item.brand}</span>
            </span>
          )}
          {visibleFields.has("tags") && !!item.tags?.length && (
            <span className="gallery-item__tags">
              {item.tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}
            </span>
          )}
          {detailRows.map(([field, label, values]) => (
            <span className="gallery-item__detail-row" key={field}>
              <small>{label}</small>
              <span>{values.join(", ")}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function TagEditor({
  tags,
  onChange,
  placeholder = tr("Add a detail"),
  inputLabel = tr("Add detail tag"),
  addLabel = tr("Add detail"),
  suggestions = [],
  emptyLabel = "",
}) {
  const [input, setInput] = useState("");

  const addTag = (candidate = input) => {
    const nextTag = candidate.trim().replace(/^#/, "");
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return;
    onChange([...tags, nextTag]);
    setInput("");
  };

  return (
    <div className="tag-editor">
      <div className="editable-tags">
        {!tags.length && emptyLabel && <span className="tag-editor__empty">{emptyLabel}</span>}
        {tags.map((tag) => (
          <span className="editable-tag" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((existing) => existing !== tag))} aria-label={tr("Remove {tag}", { tag })}>
              <X size={12} weight="regular" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <LightTypeahead
          value={input}
          onChange={setInput}
          options={suggestions.map((suggestion) => ({ value: tr(suggestion), label: tr(suggestion) }))}
          onSelect={(suggestion) => addTag(suggestion)}
          onCommit={() => addTag()}
          placeholder={placeholder}
          ariaLabel={inputLabel}
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label={addLabel}>
          <Plus size={15} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function CompactSavedColors({ primaryColor, secondaryColor, onEdit }) {
  const editableSwatch = (color, field) => (
    <button
      className={`compact-saved-colors__swatch${color ? "" : " is-empty"}`}
      type="button"
      onClick={onEdit}
      style={color ? { "--saved-color": color } : undefined}
      aria-label={tr(field === "primary" ? "Edit primary color" : "Edit secondary color")}
      title={tr(field === "primary" ? "Edit primary color" : "Edit secondary color")}
    >
      <span aria-hidden="true">
        <PencilSimple size={12} weight="bold" />
      </span>
    </button>
  );

  return (
    <div className="compact-saved-colors">
      <div className="compact-saved-colors__value">
        <span>{tr("Primary color")}</span>
        <div>
          {editableSwatch(primaryColor, "primary")}
          <strong>{primaryColor}</strong>
        </div>
      </div>
      <div className="compact-saved-colors__value">
        <span>{tr("Secondary color")} <small>{tr("optional")}</small></span>
        <div>
          {editableSwatch(secondaryColor, "secondary")}
          {secondaryColor ? <strong>{secondaryColor}</strong> : <p>{tr("Not selected")}</p>}
        </div>
      </div>
    </div>
  );
}

function ColorStudioPane({
  label,
  field,
  value,
  palette,
  sampling,
  setSampling,
  onChange,
  optional = false,
  onClear,
}) {
  const fallbackColor = normalizeHexColor(value) || normalizeHexColor(palette[0]) || "#9a9286";
  return (
    <section className="color-studio__pane">
      <div className="color-studio__pane-heading">
        <div>
          <h3>{label}</h3>
          {optional && <span>{tr("Optional")}</span>}
        </div>
        {optional && value && (
          <button type="button" onClick={onClear}>{tr("Remove")}</button>
        )}
      </div>

      <label className={`color-studio__selected${value ? "" : " is-empty"}`}>
        <input
          type="color"
          value={fallbackColor}
          onChange={(event) => onChange(event.target.value)}
          aria-label={tr("Choose {label}", { label: label.toLocaleLowerCase(getLocale()) })}
        />
        <i style={value ? { backgroundColor: value } : undefined} aria-hidden="true">
          {!value && <Plus size={18} weight="regular" />}
        </i>
        <span>
          <small>{value ? tr("Selected color") : tr("Choose any color")}</small>
          <strong>{value || tr("Not selected")}</strong>
        </span>
      </label>

      <div className="color-studio__suggestion-heading">
        <span>{tr("Image suggestions")}</span>
        <small>{tr("Click to apply")}</small>
      </div>
      <div className="color-studio__palette" aria-label={tr("{label} suggestions from image", { label })}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={tr("Use {color} as {label}", { color, label: label.toLocaleLowerCase(getLocale()) })}
            title={color}
          />
        ))}
      </div>
      <button
        className={`color-studio__sample${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => current === field ? null : field)}
      >
        <ImageSquare size={16} weight="regular" aria-hidden="true" />
        {sampling === field
          ? tr("Cancel picking")
          : tr("Pick {label} from garment", { label: label.toLocaleLowerCase(getLocale()) })}
      </button>
    </section>
  );
}

function GarmentColorStudio({
  name,
  image,
  primaryColor,
  secondaryColor,
  palette,
  sampling,
  setSampling,
  sampleStatus,
  onPrimaryChange,
  onSecondaryChange,
  onSecondaryClear,
  onImageLoad,
  onImageClick,
  onClose,
  closeButtonRef,
  onKeyDown,
}) {
  return (
    <div
      className="color-studio-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="color-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-studio-title"
        onKeyDown={onKeyDown}
      >
        <header className="color-studio__header">
          <div>
            <p>{tr("Garment colors")}</p>
            <h2 id="color-studio-title">{tr("Edit garment colors")}</h2>
            <span>{tr("Choose the saved colors for this garment.")}</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={tr("Close color editor")}
          >
            <X size={23} weight="light" aria-hidden="true" />
          </button>
        </header>

        <div className="color-studio__body">
          <ColorStudioPane
            label={tr("Primary color")}
            field="primary"
            value={primaryColor}
            palette={palette}
            sampling={sampling}
            setSampling={setSampling}
            onChange={onPrimaryChange}
          />
          <div className={`color-studio__garment${sampling ? " is-sampling" : ""}`}>
            <p>{name}</p>
            <div>
              <img
                src={image}
                alt={tr("Garment used to sample colors")}
                onLoad={(event) => onImageLoad(event.currentTarget)}
                onClick={onImageClick}
              />
              {sampling && (
                <span>{tr("Click the garment to sample the {color} color.", { color: tr(sampling) })}</span>
              )}
            </div>
          </div>
          <ColorStudioPane
            label={tr("Secondary color")}
            field="secondary"
            value={secondaryColor}
            palette={palette}
            sampling={sampling}
            setSampling={setSampling}
            onChange={onSecondaryChange}
            optional
            onClear={onSecondaryClear}
          />
        </div>

        <footer className="color-studio__footer">
          <p aria-live="polite">{sampleStatus || tr("Click a selected color to open the full color picker.")}</p>
          <button className="primary-button" type="button" onClick={onClose}>
            <Check size={15} weight="bold" aria-hidden="true" />
            {tr("Done")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CompactBrandPicker({ value, onChange }) {
  const pickerRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
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
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  return (
    <div className="compact-brand-picker" ref={pickerRef}>
      <button
        className={`compact-brand-trigger${value.trim() ? " has-brand" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="viewer-brand-options"
        aria-label={value.trim() ? tr("Change brand, currently {brand}", { brand: value }) : tr("Choose a brand")}
        title={value.trim() ? value : tr("Choose brand")}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        {value.trim() ? <BrandIcon brand={value} size={22} /> : <Plus size={15} aria-hidden="true" />}
        <span>{value.trim() || tr("Brand")}</span>
        <CaretDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="compact-brand-popover" id="viewer-brand-options">
          <label>
            <MagnifyingGlass size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              maxLength="80"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="viewer-brand-list"
              aria-expanded="true"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder={tr("Search brands")}
            />
          </label>
          <div className="compact-brand-list" id="viewer-brand-list" role="listbox" aria-label={tr("Brands")}>
            <button
              type="button"
              role="option"
              aria-selected={!value.trim()}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span className="compact-brand-empty"><X size={13} aria-hidden="true" /></span>
              <span>{tr("No brand")}</span>
            </button>
            {suggestions.map((brand) => (
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
                <BrandIcon brand={brand} size={19} />
                <span>{brand}</span>
              </button>
            ))}
            {query.trim() && !BRAND_OPTIONS.some((brand) => brand.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                role="option"
                aria-selected={query.trim().toLowerCase() === value.trim().toLowerCase()}
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
              >
                <BrandIcon brand={query.trim()} size={19} />
                <span>{tr("Use “{brand}”", { brand: query.trim() })}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GarmentEditorSection({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`garment-editor-section${open ? " is-open" : ""}`}>
      <button
        className="garment-editor-section__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>{title}</strong>
          {summary && <small>{summary}</small>}
        </span>
        <CaretDown size={16} aria-hidden="true" />
      </button>
      {open && <div className="garment-editor-section__body">{children}</div>}
    </section>
  );
}

function CareInstructionsEditor({ value, onChange, onOpenGuide }) {
  const normalized = normalizeCareInstructions(value);
  const count = careInstructionCount(normalized);
  return (
    <GarmentEditorSection
      title={tr("Care instructions")}
      summary={count ? tr("{count} saved", { count }) : tr("Add the instructions shown on the garment label")}
    >
      <div className="care-editor">
        <p>{tr("Choose only what appears on the physical care label. One choice can be saved in each row.")}</p>
        {CARE_GROUPS.map((group) => (
          <fieldset className="care-editor__group" key={group.id}>
            <legend>{tr(group.label)}</legend>
            <div>
              {group.options.map((option) => {
                const active = normalized[group.id] === option.id;
                return (
                  <button
                    type="button"
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    title={tr(option.description)}
                    onClick={() => onChange({
                      ...normalized,
                      [group.id]: active ? null : option.id,
                    })}
                    key={option.id}
                  >
                    <CareIcon group={group.id} option={option.id} size={39} />
                    <span>{tr(option.label)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <button className="care-editor__guide" type="button" onClick={onOpenGuide} disabled={!count}>
          <Info size={16} aria-hidden="true" />
          {tr("View care guide")}
        </button>
      </div>
    </GarmentEditorSection>
  );
}

function CareGuideDialog({ name, instructions, onClose }) {
  const selected = selectedCareInstructions(instructions);
  return (
    <div className="care-guide-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="care-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="care-guide-title">
        <header>
          <div>
            <p>{tr("Garment care guide")}</p>
            <h2 id="care-guide-title">{name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Close care guide")}><X size={21} aria-hidden="true" /></button>
        </header>
        <div className="care-guide-dialog__body">
          {selected.map((instruction) => (
            <article key={instruction.groupId}>
              <CareIcon group={instruction.groupId} option={instruction.id} size={48} />
              <div>
                <small>{tr(instruction.groupLabel)}</small>
                <h3>{tr(instruction.label)}</h3>
                <p>{tr(instruction.description)}</p>
              </div>
            </article>
          ))}
          <aside>
            <Info size={17} aria-hidden="true" />
            <p>{tr("The physical care label always takes precedence. If anything here differs from the label, follow the label or ask a professional cleaner.")}</p>
          </aside>
          <a href="https://www.ginetex.net/GB/labelling/care-symbols.asp" target="_blank" rel="noreferrer noopener">
            {tr("Open the official GINETEX care-symbol guide")}
            <ArrowSquareOut size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}

const viewerToastRenderKeys = new WeakMap();
let viewerToastRenderSequence = 0;

function viewerToastRenderKey(toast) {
  if (!viewerToastRenderKeys.has(toast)) viewerToastRenderKeys.set(toast, ++viewerToastRenderSequence);
  return toast.id || viewerToastRenderKeys.get(toast);
}

function ViewerToast({ toast, onDismiss }) {
  if (!toast) return null;
  const duration = toast.duration || 9000;

  return (
    <div
      key={viewerToastRenderKey(toast)}
      className="viewer-toast"
      role="alert"
      aria-live="assertive"
      style={{ "--toast-duration": `${duration}ms` }}
    >
      <WarningCircle size={21} weight="fill" aria-hidden="true" />
      <div>
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label={tr("Dismiss notification")}>
        <X size={16} aria-hidden="true" />
      </button>
      <span className="viewer-toast__timer" aria-hidden="true" />
    </div>
  );
}

function ItemEditor({
  draft,
  setDraft,
  onEditColors,
  onOpenCareGuide,
  currency,
  colorVersions,
}) {
  const currencyOption = CURRENCY_OPTIONS.find((option) => option.id === currency) || CURRENCY_OPTIONS[0];
  const purchaseSummary = [
    formatMonthYear(draft.purchaseMonth),
    draft.acquiredFree ? tr("Free") : draft.purchasePrice !== "" ? `${currencyOption.symbol}${draft.purchasePrice}` : "",
    draft.secondHand ? tr("Second-hand") : "",
  ].filter(Boolean).join(" · ") || tr("Date and origin");
  const detailsCount = [
    ...draft.tags,
    ...draft.sizes,
    ...draft.fits,
    ...draft.materials,
    ...draft.seasons,
  ].length;

  return (
    <div className="item-editor item-editor--sections">
      <GarmentEditorSection
        title={tr("Colors")}
        summary={(
          <span className="garment-section-swatches" aria-label={tr("Saved garment colors")}>
            <i style={{ backgroundColor: draft.color }} />
            {draft.secondaryColor && <i style={{ backgroundColor: draft.secondaryColor }} />}
            <span>{tr("Saved garment colors")}</span>
          </span>
        )}
        defaultOpen
      >
        {colorVersions}
        <fieldset className="color-field">
          <legend className="sr-only">{tr("Saved colors")}</legend>
          <CompactSavedColors
            primaryColor={draft.color}
            secondaryColor={draft.secondaryColor}
            onEdit={onEditColors}
          />
        </fieldset>
      </GarmentEditorSection>

      <GarmentEditorSection title={tr("Acquisition")} summary={purchaseSummary}>
        <div className="garment-purchase-grid">
          <label className="field">
            <span>{tr("Acquisition date")} <small>{tr("optional")}</small></span>
            <MonthYearPicker
              value={draft.purchaseMonth}
              onChange={(purchaseMonth) => setDraft((current) => ({ ...current, purchaseMonth }))}
              aria-label={tr("Acquisition year or month")}
            />
          </label>
          <fieldset className={`field purchase-price-field${draft.acquiredFree ? " is-disabled" : ""}`}>
            <legend>{tr("Purchase price")} <small>{tr("optional")}</small></legend>
            <div>
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={draft.purchasePrice}
                disabled={draft.acquiredFree}
                onChange={(event) => setDraft((current) => ({ ...current, purchasePrice: event.target.value }))}
                aria-label={tr("Purchase price")}
              />
              <span className="purchase-price-currency" title={currencyOption.label}>{currencyOption.symbol}</span>
            </div>
          </fieldset>
          <div className="garment-acquisition-options">
            <label>
              <input
                type="checkbox"
                checked={draft.secondHand}
                onChange={(event) => setDraft((current) => ({ ...current, secondHand: event.target.checked }))}
              />
              <span>{tr("Acquired second-hand")}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.acquiredFree}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  acquiredFree: event.target.checked,
                  purchasePrice: event.target.checked ? "" : current.purchasePrice,
                }))}
              />
              <span>{tr("Received for free")}</span>
            </label>
          </div>
        </div>
      </GarmentEditorSection>

      <GarmentEditorSection title={tr("Details")} summary={detailsCount ? tr("{count} saved", { count: detailsCount }) : tr("Size, fit, materials and season")}>
        <div className="garment-details-grid">
          <div className="field details-field">
            <span>{tr("Tags")}</span>
            <TagEditor
              tags={draft.tags}
              onChange={(tags) => setDraft((current) => ({ ...current, tags }))}
              emptyLabel={tr("Nothing selected yet.")}
            />
          </div>
          <div className="field item-facet-field">
            <span>{tr("Garment sizes")} <small>{tr("optional")}</small></span>
            <TagEditor
              tags={draft.sizes}
              onChange={(sizes) => setDraft((current) => ({ ...current, sizes }))}
              placeholder="M, EU 40, W32…"
              inputLabel={tr("Add garment size")}
              addLabel={tr("Add garment size")}
              emptyLabel={tr("Nothing selected yet.")}
            />
          </div>
          <div className="field item-facet-field">
            <span>{tr("Fit")} <small>{tr("optional")}</small></span>
            <TagEditor
              tags={draft.fits}
              onChange={(fits) => setDraft((current) => ({ ...current, fits }))}
              placeholder={tr("Regular, relaxed…")}
              inputLabel={tr("Add garment fit")}
              addLabel={tr("Add garment fit")}
              suggestions={GARMENT_FIT_SUGGESTIONS}
              suggestionListId="wardrobe-garment-fit-suggestions"
              emptyLabel={tr("Nothing selected yet.")}
            />
          </div>
          <div className="field item-facet-field">
            <span>{tr("Materials")} <small>{tr("optional")}</small></span>
            <TagEditor
              tags={draft.materials}
              onChange={(materials) => setDraft((current) => ({ ...current, materials }))}
              placeholder={tr("Cotton, linen…")}
              inputLabel={tr("Add garment material")}
              addLabel={tr("Add garment material")}
              suggestions={MATERIAL_SUGGESTIONS}
              suggestionListId="wardrobe-material-suggestions"
              emptyLabel={tr("Nothing selected yet.")}
            />
          </div>
          <fieldset className="field item-season-field">
            <legend>{tr("Season")} <small>{tr("optional")}</small></legend>
            {!draft.seasons.length && <p className="item-facet-field__empty">{tr("Nothing selected yet.")}</p>}
            <div>
              {SEASON_OPTIONS.map((season) => (
                <label key={season.id}>
                  <input
                    type="checkbox"
                    checked={draft.seasons.includes(season.id)}
                    onChange={() => setDraft((current) => ({
                      ...current,
                      seasons: current.seasons.includes(season.id)
                        ? current.seasons.filter((value) => value !== season.id)
                        : [...current.seasons, season.id],
                    }))}
                  />
                  <span>{tr(season.label)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </GarmentEditorSection>

      <CareInstructionsEditor
        value={draft.careInstructions}
        onChange={(careInstructions) => setDraft((current) => ({ ...current, careInstructions }))}
        onOpenGuide={onOpenCareGuide}
      />
    </div>
  );
}

function ColorVersionAction({ count, onClick, disabled }) {
  return (
    <button className="color-version-action" type="button" onClick={onClick} disabled={disabled}>
      <Palette size={17} aria-hidden="true" />
      <span>{tr(count ? "Create another color version" : "Create a color version")}</span>
      {count > 0 && <small>{tr("{count} saved", { count })}</small>}
    </button>
  );
}

function VariantColorPane({
  label,
  sourceColor,
  alternateColor,
  value,
  threshold,
  garment,
  onChange,
  onThresholdChange,
  disabled = false,
}) {
  const variations = useMemo(
    () => garmentVariationColors(sourceColor, alternateColor, 6, garment),
    [alternateColor, garment, sourceColor],
  );
  const selected = normalizeHexColor(value) || normalizeHexColor(sourceColor) || "#6b655d";
  return (
    <section className={`variant-color-pane${disabled ? " is-disabled" : ""}`}>
      <div className="variant-color-pane__heading">
        <div>
          <span>{label}</span>
          <strong>{selected.toUpperCase()}</strong>
        </div>
        <label className="variant-color-pane__picker" style={{ "--variant-color": selected }}>
          <input type="color" value={selected} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label={tr("Choose {label}", { label })} />
          <PencilSimple size={14} aria-hidden="true" />
        </label>
      </div>
      <div className="variant-color-pane__swatches">
        <button type="button" className={selected === normalizeHexColor(sourceColor) ? "active" : ""} disabled={disabled} onClick={() => onChange(sourceColor)} title={tr("Original")}>
          <i style={{ backgroundColor: sourceColor }} />
        </button>
        {variations.map((variation) => (
          <button type="button" className={selected === variation.color ? "active" : ""} disabled={disabled} onClick={() => onChange(variation.color)} title={tr(variation.label)} key={variation.color}>
            <i style={{ backgroundColor: variation.color }} />
          </button>
        ))}
      </div>
      <label className="variant-threshold">
        <span>
          <span>{tr("Color reach")}</span>
          <strong>{threshold}%</strong>
        </span>
        <input
          type="range"
          min={GARMENT_VARIANT_THRESHOLD_MIN}
          max={GARMENT_VARIANT_THRESHOLD_MAX}
          step="5"
          value={threshold}
          disabled={disabled}
          onChange={(event) => onThresholdChange(Number(event.target.value))}
        />
        <small>{tr("Lower values protect nearby colors. Higher values include more shades and textured pixels.")}</small>
      </label>
      {disabled && <p>{tr("Add a saved secondary color before creating a secondary-color version.")}</p>}
    </section>
  );
}

function GarmentVariantStudio({ item, garment, onClose, onCreate }) {
  const closeRef = useRef(null);
  const renderedCanvas = useRef(null);
  const [primaryColor, setPrimaryColor] = useState(item.color);
  const [secondaryColor, setSecondaryColor] = useState(item.secondaryColor || null);
  const [primaryThreshold, setPrimaryThreshold] = useState(GARMENT_VARIANT_THRESHOLD_DEFAULT);
  const [secondaryThreshold, setSecondaryThreshold] = useState(GARMENT_VARIANT_THRESHOLD_DEFAULT);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const save = async () => {
    if (!renderedCanvas.current || rendering || saving) return;
    setSaving(true);
    setError("");
    try {
      await onCreate({
        imageDataUrl: renderedCanvas.current.toDataURL("image/png"),
        primaryColor,
        secondaryColor,
        primaryThreshold,
        secondaryThreshold,
      });
      onClose();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="variant-studio-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="variant-studio" role="dialog" aria-modal="true" aria-labelledby="variant-studio-title">
        <header>
          <div>
            <p>{tr("Garment versions")}</p>
            <h2 id="variant-studio-title">{tr("Create a color version")}</h2>
            <span>{tr("Adjust each saved color independently, then save this as another version of the same garment.")}</span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={saving} aria-label={tr("Close color version editor")}><X size={22} /></button>
        </header>
        <div className="variant-studio__body">
          <VariantColorPane
            label={tr("Primary color")}
            sourceColor={item.color}
            alternateColor={item.secondaryColor}
            value={primaryColor}
            threshold={primaryThreshold}
            garment={garment}
            onChange={setPrimaryColor}
            onThresholdChange={setPrimaryThreshold}
          />
          <ProductStage className="variant-studio__garment" animated>
            <GarmentColorPreview
              src={item.image}
              alt={tr("New garment color version")}
              sourceColor={item.color}
              targetColor={primaryColor}
              secondarySourceColor={item.secondaryColor}
              secondaryTargetColor={secondaryColor}
              primaryThreshold={primaryThreshold}
              secondaryThreshold={secondaryThreshold}
              context={garment}
              onRenderingChange={setRendering}
              onRendered={(canvas) => { renderedCanvas.current = canvas; }}
              onError={setError}
            />
            {rendering && <span className="variant-studio__rendering"><SpinnerGap size={16} /> {tr("Rendering…")}</span>}
          </ProductStage>
          <VariantColorPane
            label={tr("Secondary color")}
            sourceColor={item.secondaryColor || "#d8d0c2"}
            alternateColor={item.color}
            value={secondaryColor}
            threshold={secondaryThreshold}
            garment={{ ...garment, channel: "secondary" }}
            onChange={setSecondaryColor}
            onThresholdChange={setSecondaryThreshold}
            disabled={!item.secondaryColor}
          />
        </div>
        {error && <p className="variant-studio__error" role="alert">{error}</p>}
        <footer>
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>{tr("Cancel")}</button>
          <button className="primary-button" type="button" onClick={save} disabled={saving || rendering}>
            {saving ? <SpinnerGap size={15} /> : <Check size={15} weight="bold" />}
            {tr(saving ? "Saving…" : "Create version")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function GarmentMergeDialog({ first, second, keepId, busy, error, onKeep, onCancel, onConfirm }) {
  const cancelButtonRef = useRef(null);
  const discarded = keepId ? (keepId === first.id ? second : first) : null;
  const discardedSourceCount = discarded ? itemSourcePhotos(discarded).length : 0;

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const keepFocus = (event) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
    if (!buttons.length) return;
    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === firstButton) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && document.activeElement === lastButton) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  return (
    <div
      className="garment-merge-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <section
        className="garment-merge-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="garment-merge-title"
        aria-describedby="garment-merge-description"
        onKeyDown={keepFocus}
      >
        <header>
          <div>
            <p>{tr("Merge garments")}</p>
            <h2 id="garment-merge-title">{tr("Which garment do you want to keep?")}</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label={tr("Cancel garment merge")}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="garment-merge-dialog__body">
          <p id="garment-merge-description">
            {tr("The garment you keep will retain its name, details, and generated images.")}
          </p>
          <div className="garment-merge-dialog__options">
            {[first, second].map((item) => {
              const selected = keepId === item.id;
              const sourceCount = itemSourcePhotos(item).length;
              return (
                <button
                  className={selected ? "is-selected" : ""}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onKeep(item.id)}
                  disabled={busy}
                  key={item.id}
                >
                  <ProductStage className="garment-merge-dialog__image" staticStage>
                    <OptimizedImage
                      src={item.imagePreview || item.image}
                      alt=""
                      sizes="(max-width: 620px) calc(50vw - 44px), 260px"
                      breakpoints={[180, 240, 320, 480]}
                      priority
                      reveal
                    />
                  </ProductStage>
                  <span className="garment-merge-dialog__item-copy">
                    <strong>{item.name || tr(TYPE_MAP[item.part]?.singular || "Wardrobe item")}</strong>
                    <small>{tr(TYPE_MAP[item.part]?.singular || "Wardrobe item")}{item.brand ? ` · ${item.brand}` : ""}</small>
                    <small>{tr(sourceCount === 1 ? "{count} original photo" : "{count} original photos", { count: sourceCount })}</small>
                  </span>
                  <span className="garment-merge-dialog__choice">
                    {selected && <Check size={14} weight="bold" aria-hidden="true" />}
                    {tr(selected ? "Keeping this garment" : "Keep this garment")}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={`garment-merge-dialog__note${discarded ? " is-ready" : ""}`} aria-live="polite">
            {discarded
              ? tr(
                  discardedSourceCount === 1
                    ? "The other garment will be removed, and its original photo will be added to the garment you keep."
                    : "The other garment will be removed, and its {count} original photos will be added to the garment you keep.",
                  { count: discardedSourceCount },
                )
              : tr("Select one garment above to continue.")}
          </p>
          {error && <p className="garment-merge-dialog__error" role="alert">{error}</p>}
        </div>
        <footer>
          <button ref={cancelButtonRef} className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{tr("Cancel")}</button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={!keepId || busy}>
            {busy ? <SpinnerGap className="modeled-request__spinner" size={15} aria-hidden="true" /> : <ArrowsLeftRight size={15} aria-hidden="true" />}
            {tr(busy ? "Merging…" : "Confirm merge")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ItemViewer({
  item,
  currency,
  backgroundReferences = [],
  onClose,
  onSave,
  onDelete,
  onGenerateModeled,
  onRegenerateGarment,
  onCenterGarmentRegeneration,
  onAcceptGarmentRegeneration,
  onDiscardGarmentRegeneration,
  onCreateVariant,
  onSelectColorVersion,
  onReorderColorVersions,
  onDeleteColorVersion,
  onDeleteModeled,
  onArchiveGarment,
  onArchiveModeled,
  onDeleteSourcePhoto,
  onReorderMedia,
  onDirtyChange,
  blockedSwitchSignal,
  canMerge,
  mergeSelecting,
  onBeginMerge,
  onCancelMerge,
}) {
  const deleteLookButtonRef = useRef(null);
  const deleteCancelButtonRef = useRef(null);
  const deleteVersionButtonRef = useRef(null);
  const deleteVersionCancelButtonRef = useRef(null);
  const sourceDeleteCancelButtonRef = useRef(null);
  const deleteGarmentButtonRef = useRef(null);
  const deleteGarmentCancelButtonRef = useRef(null);
  const sourcePhotoButtonRef = useRef(null);
  const sourcePhotoCloseButtonRef = useRef(null);
  const sourcePhotoViewportRef = useRef(null);
  const sourcePhotoImageRef = useRef(null);
  const garmentArtworkButtonRef = useRef(null);
  const modeledPhotoButtonRef = useRef(null);
  const originalHeroPhotoRef = useRef(null);
  const mediaPreviewCloseButtonRef = useRef(null);
  const colorEditorCloseButtonRef = useRef(null);
  const nameInputRef = useRef(null);
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
  const [sourcePhotoOpen, setSourcePhotoOpen] = useState(false);
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(null);
  const [modeledSettingsOpen, setModeledSettingsOpen] = useState(false);
  const [garmentRegenerationOpen, setGarmentRegenerationOpen] = useState(false);
  const [garmentRegenerationBusy, setGarmentRegenerationBusy] = useState(false);
  const [garmentRegenerationError, setGarmentRegenerationError] = useState("");
  const [garmentRegenerationForm, setGarmentRegenerationForm] = useState(() => garmentRegenerationDraft(item));
  const [sourceCropVisible, setSourceCropVisible] = useState(false);
  const [sourceImageFrame, setSourceImageFrame] = useState(null);
  const [colorEditorOpen, setColorEditorOpen] = useState(false);
  const [careGuideOpen, setCareGuideOpen] = useState(false);
  const [variantStudioOpen, setVariantStudioOpen] = useState(false);
  const [modeledVariantPickerOpen, setModeledVariantPickerOpen] = useState(false);
  const [hoveredColorVersionIndex, setHoveredColorVersionIndex] = useState(null);
  const [sourcePhotoIndex, setSourcePhotoIndex] = useState(0);
  const [generatingModeledFor, setGeneratingModeledFor] = useState(null);
  const [deletingModeled, setDeletingModeled] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteVersionCandidate, setDeleteVersionCandidate] = useState(null);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const [sourceDeleteCandidate, setSourceDeleteCandidate] = useState(null);
  const [deletingSourcePhoto, setDeletingSourcePhoto] = useState(false);
  const [garmentDeleteOpen, setGarmentDeleteOpen] = useState(false);
  const [deletingGarment, setDeletingGarment] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [viewerToast, setViewerToast] = useState(null);
  const [draggedMediaId, setDraggedMediaId] = useState(null);
  const [mediaOrderBusy, setMediaOrderBusy] = useState(false);
  const [draggedColorVersionId, setDraggedColorVersionId] = useState(null);
  const [colorVersionOrderBusy, setColorVersionOrderBusy] = useState(false);
  const [originalHeroPosition, setOriginalHeroPosition] = useState(() => originalPhotoPosition(item));
  const type = tr(TYPE_MAP[item.part]?.singular || "Wardrobe item");
  const colorVersions = useMemo(() => itemColorVersions(item), [item]);
  const [colorVersionIndex, setColorVersionIndex] = useState(() => itemSelectedColorVersionIndex(item, colorVersions));
  const activeColorVersionIndex = Math.min(colorVersionIndex, Math.max(0, colorVersions.length - 1));
  const activeColorVersion = colorVersions[activeColorVersionIndex] || colorVersions[0];
  const modeledLooks = useMemo(() => itemModeledLooks(item), [item]);
  const sourcePhotos = useMemo(() => itemSourcePhotos(item), [item]);
  const sourceDeleteAlternatives = sourceDeleteCandidate
    ? sourcePhotos.filter((photo) => photo.id !== sourceDeleteCandidate.photo.id)
    : [];
  const garmentMedia = useMemo(() => orderedGarmentMedia({
    sourcePhotos,
    modeledLooks,
    mediaOrder: item.mediaOrder,
  }), [item.mediaOrder, modeledLooks, sourcePhotos]);
  const [activeMediaId, setActiveMediaId] = useState(() => garmentMedia[0]?.id || null);
  const activeMediaIndex = Math.max(0, garmentMedia.findIndex((media) => media.id === activeMediaId));
  const activeMedia = garmentMedia[activeMediaIndex] || garmentMedia[0] || null;
  const activeModeledLook = activeMedia?.kind === GARMENT_MEDIA_GENERATED ? activeMedia.data : null;
  const isActiveMediaGenerated = activeMedia?.kind === GARMENT_MEDIA_GENERATED;
  const modeledSettingsRecorded = Boolean(activeModeledLook && Object.hasOwn(activeModeledLook, "context"));
  const activeModeledSettings = useMemo(
    () => modeledLookContextDetails(activeModeledLook?.context),
    [activeModeledLook?.context],
  );
  const generatingModeled = generatingModeledFor === item.id;
  const hasModeledImage = Boolean(activeModeledLook);
  const activeSourcePhoto = sourcePhotos[Math.min(sourcePhotoIndex, Math.max(0, sourcePhotos.length - 1))] || null;
  const activeHeroSource = activeMedia?.kind === GARMENT_MEDIA_GENERATED ? null : activeMedia?.data || null;
  const activeSourceCrop = activeSourcePhoto?.boundingBox || item.boundingBox || null;
  const hasOriginalImage = sourcePhotos.length > 0;
  const hasHeroImage = garmentMedia.length > 0;
  const versionLayout = sampling
    ? "carousel"
    : garmentVersionLayout(draft.part || item.part, colorVersions.length, hasHeroImage);
  const hasVersionFan = versionLayout === "fan";
  const hasVersionRow = versionLayout === "spread";
  const hasVersionSpread = hasVersionFan || hasVersionRow;
  const garmentRegenerationCandidate = item.garmentRegenerationCandidate || null;
  const garmentRegenerationSuggestedModel = garmentRegenerationCandidate?.suggestedModel || null;
  const regenerationPrimaryValid = Boolean(normalizeHexColor(garmentRegenerationForm.color));
  const regenerationSecondaryValid = !garmentRegenerationForm.secondaryColor
    || Boolean(normalizeHexColor(garmentRegenerationForm.secondaryColor));
  const canRegenerateGarment = Boolean(
    garmentRegenerationForm.name.trim()
    && regenerationPrimaryValid
    && regenerationSecondaryValid
    && garmentRegenerationForm.sourcePhotoIds.length,
  );
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const measureOriginalHero = useCallback(() => {
    const image = originalHeroPhotoRef.current;
    const positionedItem = activeHeroSource ? {
      ...item,
      boundingBox: activeHeroSource.boundingBox || item.boundingBox,
      originalFocusBox: activeHeroSource.focusBox || item.originalFocusBox,
    } : item;
    if (item.part !== "shoes" || !image?.naturalWidth || !image?.naturalHeight || !positionedItem.boundingBox) {
      setOriginalHeroPosition(originalPhotoPosition(positionedItem));
      return;
    }
    setOriginalHeroPosition(cropCenteredCoverPosition({
      box: positionedItem.boundingBox,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      frameWidth: image.clientWidth,
      frameHeight: image.clientHeight,
    }) || originalPhotoPosition(positionedItem));
  }, [activeHeroSource, item]);

  const measureSourcePhoto = useCallback(() => {
    const viewport = sourcePhotoViewportRef.current;
    const image = sourcePhotoImageRef.current;
    if (!viewport || !image?.naturalWidth || !image?.naturalHeight) {
      setSourceImageFrame(null);
      return;
    }
    const availableWidth = viewport.clientWidth;
    const availableHeight = viewport.clientHeight;
    const scale = Math.min(
      availableWidth / image.naturalWidth,
      availableHeight / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    setSourceImageFrame({
      left: (availableWidth - width) / 2,
      top: (availableHeight - height) / 2,
      width,
      height,
    });
  }, []);

  const sourceCropStyle = useMemo(() => {
    if (!sourceCropVisible || !sourceImageFrame || !activeSourceCrop) return null;
    const number = (key) => Number(activeSourceCrop[key]);
    if (!["x", "y", "width", "height"].every((key) => Number.isFinite(number(key)))) return null;
    return {
      left: sourceImageFrame.left + ((number("x") / 1000) * sourceImageFrame.width),
      top: sourceImageFrame.top + ((number("y") / 1000) * sourceImageFrame.height),
      width: (number("width") / 1000) * sourceImageFrame.width,
      height: (number("height") / 1000) * sourceImageFrame.height,
    };
  }, [activeSourceCrop, sourceCropVisible, sourceImageFrame]);

  const isDirty = useMemo(() => {
    const normalizedTags = (tags) => tags.map((tag) => tag.trim()).filter(Boolean);
    const draftPrice = draft.acquiredFree ? null : normalizePurchasePrice(draft.purchasePrice);
    const itemPrice = item.acquiredFree ? null : normalizePurchasePrice(item.purchasePrice);
    return JSON.stringify({
      name: draft.name.trim(),
      part: draft.part,
      color: draft.color?.toLowerCase() || null,
      secondaryColor: draft.secondaryColor?.toLowerCase() || null,
      brand: draft.brand.trim(),
      purchaseMonth: normalizePurchaseMonth(draft.purchaseMonth),
      purchasePrice: draftPrice,
      secondHand: Boolean(draft.secondHand),
      acquiredFree: Boolean(draft.acquiredFree),
      tags: normalizedTags(draft.tags),
      sizes: normalizedTags(draft.sizes),
      fits: normalizedTags(draft.fits),
      materials: normalizedTags(draft.materials),
      seasons: normalizedTags(draft.seasons),
      careInstructions: normalizeCareInstructions(draft.careInstructions),
    }) !== JSON.stringify({
      name: (item.name || "").trim(),
      part: item.part,
      color: item.color?.toLowerCase() || null,
      secondaryColor: item.secondaryColor?.toLowerCase() || null,
      brand: (item.brand || "").trim(),
      purchaseMonth: normalizePurchaseMonth(item.purchaseMonth),
      purchasePrice: itemPrice,
      secondHand: Boolean(item.secondHand),
      acquiredFree: Boolean(item.acquiredFree),
      tags: normalizedTags(item.tags || []),
      sizes: normalizedTags(item.sizes || []),
      fits: normalizedTags(item.fits || []),
      materials: normalizedTags(item.materials || []),
      seasons: normalizedTags(item.seasons || []),
      careInstructions: normalizeCareInstructions(item.careInstructions),
    });
  }, [draft, item]);

  const nudgeUnsaved = useCallback((showToast = true) => {
    setCloseBlocked(true);
    if (showToast) {
      setViewerToast({
        title: tr("Unsaved changes"),
        message: tr("Save or cancel changes before leaving this item."),
      });
    }
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
        if (careGuideOpen) {
          setCareGuideOpen(false);
        } else if (variantStudioOpen) {
          setVariantStudioOpen(false);
        } else if (modeledVariantPickerOpen) {
          if (!generatingModeled) setModeledVariantPickerOpen(false);
        } else if (colorEditorOpen) {
          setColorEditorOpen(false);
          setSampling(null);
        } else if (deleteVersionCandidate) {
          if (!deletingVersion) {
            setDeleteVersionCandidate(null);
            requestAnimationFrame(() => deleteVersionButtonRef.current?.focus({ preventScroll: true }));
          }
        } else if (garmentDeleteOpen) {
          if (!deletingGarment) {
            setGarmentDeleteOpen(false);
            requestAnimationFrame(() => deleteGarmentButtonRef.current?.focus({ preventScroll: true }));
          }
        } else if (sourceDeleteCandidate) {
          if (!deletingSourcePhoto) {
            setSourceDeleteCandidate(null);
            requestAnimationFrame(() => deleteLookButtonRef.current?.focus({ preventScroll: true }));
          }
        } else if (deleteCandidate) {
          if (!deletingModeled) {
            setDeleteCandidate(null);
            requestAnimationFrame(() => deleteLookButtonRef.current?.focus({ preventScroll: true }));
          }
        } else if (garmentRegenerationOpen) {
          setGarmentRegenerationOpen(false);
        } else if (modeledSettingsOpen) {
          setModeledSettingsOpen(false);
        } else if (mediaPreviewOpen) {
          setMediaPreviewOpen(null);
          requestAnimationFrame(() => (
            mediaPreviewOpen === "media"
              ? modeledPhotoButtonRef.current
              : garmentArtworkButtonRef.current
          )?.focus({ preventScroll: true }));
        } else if (sourcePhotoOpen) {
          setSourcePhotoOpen(false);
          requestAnimationFrame(() => sourcePhotoButtonRef.current?.focus({ preventScroll: true }));
        } else if (sampling) setSampling(null);
        else requestClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(shakeTimerRef.current);
    };
  }, [careGuideOpen, colorEditorOpen, deleteCandidate, deleteVersionCandidate, deletingGarment, deletingModeled, deletingSourcePhoto, deletingVersion, garmentDeleteOpen, garmentRegenerationOpen, generatingModeled, mediaPreviewOpen, modeledSettingsOpen, modeledVariantPickerOpen, requestClose, sampling, sourceDeleteCandidate, sourcePhotoOpen, variantStudioOpen]);

  useEffect(() => {
    if (deleteCandidate) deleteCancelButtonRef.current?.focus({ preventScroll: true });
  }, [deleteCandidate]);

  useEffect(() => {
    if (deleteVersionCandidate) deleteVersionCancelButtonRef.current?.focus({ preventScroll: true });
  }, [deleteVersionCandidate]);

  useEffect(() => {
    if (sourceDeleteCandidate) sourceDeleteCancelButtonRef.current?.focus({ preventScroll: true });
  }, [sourceDeleteCandidate]);

  useEffect(() => {
    if (garmentDeleteOpen) deleteGarmentCancelButtonRef.current?.focus({ preventScroll: true });
  }, [garmentDeleteOpen]);

  useEffect(() => {
    if (sourcePhotoOpen) sourcePhotoCloseButtonRef.current?.focus({ preventScroll: true });
  }, [sourcePhotoOpen]);

  useEffect(() => {
    if (mediaPreviewOpen) mediaPreviewCloseButtonRef.current?.focus({ preventScroll: true });
  }, [mediaPreviewOpen]);

  useEffect(() => {
    if (colorEditorOpen) colorEditorCloseButtonRef.current?.focus({ preventScroll: true });
  }, [colorEditorOpen]);

  useEffect(() => {
    if (!sourcePhotoOpen && !colorEditorOpen && !careGuideOpen && !mediaPreviewOpen && !variantStudioOpen && !modeledVariantPickerOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [careGuideOpen, colorEditorOpen, mediaPreviewOpen, modeledVariantPickerOpen, sourcePhotoOpen, variantStudioOpen]);

  useEffect(() => {
    if (!isDirty) setCloseBlocked(false);
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (blockedSwitchSignal) nudgeUnsaved(true);
  }, [blockedSwitchSignal, nudgeUnsaved]);

  useEffect(() => {
    if (!nameEditing) return;
    nameInputRef.current?.focus({ preventScroll: true });
    nameInputRef.current?.select();
  }, [nameEditing]);

  useEffect(() => {
    if (!viewerToast) return undefined;
    const timeout = setTimeout(() => setViewerToast(null), viewerToast.duration || 9000);
    return () => clearTimeout(timeout);
  }, [viewerToast]);

  useLayoutEffect(() => {
    setSampling(null);
    samplingCanvasRef.current = null;
    setSampleStatus("");
    setPalette(item.palette || []);
    setDraft(editableItem(item));
    setSourcePhotoOpen(false);
    setMediaPreviewOpen(null);
    setModeledSettingsOpen(false);
    setSourceCropVisible(false);
    setSourceImageFrame(null);
    setColorEditorOpen(false);
    setCareGuideOpen(false);
    setSourcePhotoIndex(0);
    setActiveMediaId(orderedGarmentMedia({
      sourcePhotos: itemSourcePhotos(item),
      modeledLooks: itemModeledLooks(item),
      mediaOrder: item.mediaOrder,
    })[0]?.id || null);
    setDraggedMediaId(null);
    setMediaOrderBusy(false);
    setDraggedColorVersionId(null);
    setColorVersionOrderBusy(false);
    setDeleteCandidate(null);
    setSourceDeleteCandidate(null);
    setDeletingSourcePhoto(false);
    setGarmentDeleteOpen(false);
    setDeletingGarment(false);
    setVariantStudioOpen(false);
    setModeledVariantPickerOpen(false);
    setHoveredColorVersionIndex(null);
    setCloseBlocked(false);
    setNameEditing(false);
    setViewerToast(null);
    setGarmentRegenerationOpen(false);
    setGarmentRegenerationBusy(false);
    setGarmentRegenerationError("");
    setGarmentRegenerationForm(garmentRegenerationDraft(item));
  }, [item.id]);

  useEffect(() => {
    if (activeMediaId && garmentMedia.some((media) => media.id === activeMediaId)) return;
    setActiveMediaId(garmentMedia[0]?.id || null);
  }, [activeMediaId, garmentMedia]);

  useEffect(() => {
    setModeledSettingsOpen(false);
  }, [activeMediaId]);

  useLayoutEffect(() => {
    setColorVersionIndex(itemSelectedColorVersionIndex(item));
  }, [item.id]);

  useLayoutEffect(() => {
    if (hasModeledImage) {
      setOriginalHeroPosition(originalPhotoPosition(item));
      return undefined;
    }
    if (item.part !== "shoes") {
      measureOriginalHero();
      return undefined;
    }
    const image = originalHeroPhotoRef.current;
    const frame = requestAnimationFrame(measureOriginalHero);
    const observer = typeof ResizeObserver === "function" && image
      ? new ResizeObserver(measureOriginalHero)
      : null;
    observer?.observe(image);
    window.addEventListener("resize", measureOriginalHero);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measureOriginalHero);
    };
  }, [hasModeledImage, item, measureOriginalHero]);

  useLayoutEffect(() => {
    if (!sourcePhotoOpen) return undefined;
    const viewport = sourcePhotoViewportRef.current;
    const frame = requestAnimationFrame(measureSourcePhoto);
    const observer = typeof ResizeObserver === "function" && viewport
      ? new ResizeObserver(measureSourcePhoto)
      : null;
    observer?.observe(viewport);
    window.addEventListener("resize", measureSourcePhoto);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measureSourcePhoto);
    };
  }, [activeSourcePhoto?.id, measureSourcePhoto, sourcePhotoOpen]);

  useEffect(() => {
    if (!garmentMedia.length) return;
    const radius = mediaPreviewOpen === "media" ? 2 : 1;
    garmentMediaPreloadSources(garmentMedia, activeMediaIndex, radius).forEach(preloadImage);
  }, [activeMediaIndex, garmentMedia, mediaPreviewOpen]);

  const cancelEditing = () => {
    setDraft(editableItem(item));
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = () => {
    const purchasePrice = draft.acquiredFree ? null : normalizePurchasePrice(draft.purchasePrice);
    onSave({
      ...item,
      ...draft,
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      purchaseMonth: normalizePurchaseMonth(draft.purchaseMonth),
      purchasePrice,
      secondHand: Boolean(draft.secondHand),
      acquiredFree: Boolean(draft.acquiredFree),
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      sizes: draft.sizes.map((value) => value.trim()).filter(Boolean),
      fits: draft.fits.map((value) => value.trim()).filter(Boolean),
      materials: draft.materials.map((value) => value.trim()).filter(Boolean),
      seasons: normalizeGarmentSeasons(draft.seasons),
      careInstructions: normalizeCareInstructions(draft.careInstructions),
    });
    setSampling(null);
    setSampleStatus(tr("Changes saved."));
  };

  const handleGarmentSourceReady = useCallback((source) => {
    samplingCanvasRef.current = buildSamplingCanvas(source);
    const extracted = extractPalette(source);
    setPalette([...new Set([...(item.palette || []), ...extracted])].slice(0, 5));
  }, [item.palette]);

  const handleImageClick = (event) => {
    if (!sampling || !samplingCanvasRef.current) return;
    const color = sampleImageColor(event.currentTarget, samplingCanvasRef.current, event);
    if (!color) {
      setSampleStatus(tr("That spot is transparent—try directly on the garment."));
      return;
    }
    const targetField = sampling === "secondary" ? "secondaryColor" : "color";
    setDraft((current) => ({ ...current, [targetField]: color }));
    setPalette((current) => [color, ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase())].slice(0, 5));
    setSampleStatus(tr("Sampled {color} as the {channel} color.", { color, channel: tr(sampling) }));
    setSampling(null);
  };

  const generateModeledLook = async (variantId = null, context = {}) => {
    if (deletingModeled) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before creating a new style look."),
      });
      nudgeUnsaved(false);
      return;
    }
    const targetItemId = item.id;
    setGeneratingModeledFor(targetItemId);
    setViewerToast(null);
    try {
      const updated = await onGenerateModeled(targetItemId, variantId, context);
      const generatedLook = itemModeledLooks(updated).at(-1);
      if (generatedLook) setActiveMediaId(garmentMediaId(GARMENT_MEDIA_GENERATED, generatedLook.id));
      setModeledVariantPickerOpen(false);
    } catch (requestError) {
      if (activeItemIdRef.current === targetItemId) {
        setViewerToast({
          title: tr("Could not create the style look"),
          message: readableError(requestError),
        });
      }
      throw new Error(readableError(requestError));
    } finally {
      setGeneratingModeledFor((current) => current === targetItemId ? null : current);
    }
  };

  const requestGenerateModeledLook = () => {
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before creating a new style look."),
      });
      nudgeUnsaved(false);
      return;
    }
    setModeledVariantPickerOpen(true);
  };

  const selectColorVersion = async (index, versions = colorVersions) => {
    const normalizedIndex = Math.max(0, Math.min(index, versions.length - 1));
    const previousIndex = activeColorVersionIndex;
    const selectedVersionId = versions[normalizedIndex]?.id || null;
    setColorVersionIndex(normalizedIndex);
    try {
      const updated = await onSelectColorVersion(item.id, selectedVersionId);
      const updatedVersions = itemColorVersions(updated);
      const updatedIndex = updatedVersions.findIndex((version) => (version.id || null) === selectedVersionId);
      setColorVersionIndex(updatedIndex >= 0 ? updatedIndex : 0);
    } catch (requestError) {
      setColorVersionIndex(previousIndex);
      setViewerToast({
        title: tr("Could not save the selected color version"),
        message: readableError(requestError),
      });
    }
  };

  const rotateColorVersion = (direction) => {
    if (colorVersions.length < 2) return;
    const nextIndex = (activeColorVersionIndex + direction + colorVersions.length) % colorVersions.length;
    void selectColorVersion(nextIndex);
  };

  const previewColorVersion = (direction) => {
    if (colorVersions.length < 2) return;
    setColorVersionIndex((activeColorVersionIndex + direction + colorVersions.length) % colorVersions.length);
  };

  const reorderColorVersions = async (targetId) => {
    if (!draggedColorVersionId || colorVersionOrderBusy || draggedColorVersionId === targetId) return;
    const ids = colorVersions.map((version) => version.id || GARMENT_ORIGINAL_VERSION_ID);
    const activeId = activeColorVersion?.id || GARMENT_ORIGINAL_VERSION_ID;
    const nextIds = moveGarmentVersion(ids, draggedColorVersionId, targetId);
    setDraggedColorVersionId(null);
    setColorVersionOrderBusy(true);
    setViewerToast(null);
    try {
      const updated = await onReorderColorVersions(item.id, nextIds);
      const nextVersions = itemColorVersions(updated);
      const nextIndex = nextVersions.findIndex((version) => (version.id || GARMENT_ORIGINAL_VERSION_ID) === activeId);
      setColorVersionIndex(nextIndex >= 0 ? nextIndex : 0);
    } catch (requestError) {
      setViewerToast({
        title: tr("Could not reorder garment versions"),
        message: readableError(requestError),
      });
    } finally {
      setColorVersionOrderBusy(false);
    }
  };

  const requestDeleteColorVersion = () => {
    if (!activeColorVersion?.id || deletingVersion || colorVersionOrderBusy) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before deleting a color version."),
      });
      nudgeUnsaved(false);
      return;
    }
    setViewerToast(null);
    setDeleteVersionCandidate({
      version: activeColorVersion,
    });
  };

  const closeVersionDeleteConfirmation = () => {
    if (deletingVersion) return;
    setDeleteVersionCandidate(null);
    requestAnimationFrame(() => deleteVersionButtonRef.current?.focus({ preventScroll: true }));
  };

  const deleteColorVersion = async () => {
    if (!deleteVersionCandidate || deletingVersion) return;
    setDeletingVersion(true);
    setViewerToast(null);
    try {
      const updated = await onDeleteColorVersion(item.id, deleteVersionCandidate.version.id);
      const nextVersions = itemColorVersions(updated);
      setColorVersionIndex(itemSelectedColorVersionIndex(updated, nextVersions));
      setDeleteVersionCandidate(null);
    } catch (requestError) {
      setViewerToast({
        title: tr("Could not delete the color version"),
        message: readableError(requestError),
      });
      setDeleteVersionCandidate(null);
    } finally {
      setDeletingVersion(false);
    }
  };

  const rotateGarmentMedia = (direction) => {
    if (garmentMedia.length < 2) return;
    const nextIndex = (activeMediaIndex + direction + garmentMedia.length) % garmentMedia.length;
    setActiveMediaId(garmentMedia[nextIndex].id);
  };

  const reorderGarmentMedia = async (targetId) => {
    if (!draggedMediaId || mediaOrderBusy || draggedMediaId === targetId) return;
    const ids = garmentMedia.map((media) => media.id);
    const nextIds = moveGarmentMedia(ids, draggedMediaId, targetId);
    setDraggedMediaId(null);
    setMediaOrderBusy(true);
    setViewerToast(null);
    try {
      await onReorderMedia(item.id, nextIds);
    } catch (requestError) {
      setViewerToast({
        title: tr("Could not reorder photos"),
        message: readableError(requestError),
      });
    } finally {
      setMediaOrderBusy(false);
    }
  };

  const requestDeleteModeledLook = () => {
    if (!activeModeledLook || deletingModeled || generatingModeled) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before deleting a style look."),
      });
      nudgeUnsaved(false);
      return;
    }
    setDeleteCandidate({
      look: activeModeledLook,
      index: activeMediaIndex,
      total: garmentMedia.length,
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
    setViewerToast(null);
    try {
      const updated = await onDeleteModeled(item.id, deleteCandidate.look.id);
      const nextMedia = orderedGarmentMedia({
        sourcePhotos: itemSourcePhotos(updated),
        modeledLooks: itemModeledLooks(updated),
        mediaOrder: updated.mediaOrder,
      });
      setActiveMediaId(nextMedia[Math.min(deleteCandidate.index, Math.max(0, nextMedia.length - 1))]?.id || null);
      setDeleteCandidate(null);
    } catch (requestError) {
      setViewerToast({
        title: tr("Could not delete the style look"),
        message: readableError(requestError),
      });
      setDeleteCandidate(null);
    } finally {
      setDeletingModeled(false);
    }
  };

  const archiveModeledLook = async () => {
    if (!activeModeledLook || archiving || deletingModeled || generatingModeled) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before moving a photo to the Vault."),
      });
      nudgeUnsaved(false);
      return;
    }
    setArchiving(true);
    setViewerToast(null);
    try {
      const previousIndex = activeMediaIndex;
      const updated = await onArchiveModeled(item.id, activeModeledLook.id);
      const nextMedia = orderedGarmentMedia({
        sourcePhotos: itemSourcePhotos(updated),
        modeledLooks: itemModeledLooks(updated),
        mediaOrder: updated.mediaOrder,
      });
      setActiveMediaId(nextMedia[Math.min(previousIndex, Math.max(0, nextMedia.length - 1))]?.id || null);
      setMediaPreviewOpen(null);
      setViewerToast({ title: tr("Photo moved to Vault"), message: tr("Open Vault from your profile menu to restore it.") });
    } catch (requestError) {
      setViewerToast({ title: tr("Could not move the photo"), message: readableError(requestError) });
    } finally {
      setArchiving(false);
    }
  };

  const archiveGarment = async () => {
    if (archiving || deletingGarment || isDirty) {
      if (isDirty) {
        setViewerToast({ title: tr("Save this garment first"), message: tr("Save your changes before moving the garment to the Vault.") });
        nudgeUnsaved(false);
      }
      return;
    }
    setArchiving(true);
    try {
      await onArchiveGarment(item.id);
    } catch (requestError) {
      setViewerToast({ title: tr("Could not move the garment"), message: readableError(requestError) });
      setArchiving(false);
    }
  };

  const requestDeleteSourcePhoto = () => {
    if (activeMedia?.kind !== GARMENT_MEDIA_ORIGINAL || deletingSourcePhoto || generatingModeled) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before deleting an original photo."),
      });
      nudgeUnsaved(false);
      return;
    }
    const remaining = sourcePhotos.filter((photo) => photo.id !== activeMedia.sourceId);
    setSourceDeleteCandidate({
      photo: activeMedia.data,
      index: activeMediaIndex,
      replacementSourcePhotoId: remaining[0]?.id || null,
    });
  };

  const closeSourceDeleteConfirmation = () => {
    if (deletingSourcePhoto) return;
    setSourceDeleteCandidate(null);
    requestAnimationFrame(() => deleteLookButtonRef.current?.focus({ preventScroll: true }));
  };

  const deleteSourcePhoto = async () => {
    if (!sourceDeleteCandidate || deletingSourcePhoto) return;
    setDeletingSourcePhoto(true);
    setViewerToast(null);
    try {
      const updated = await onDeleteSourcePhoto(
        item.id,
        sourceDeleteCandidate.photo.id,
        sourceDeleteCandidate.replacementSourcePhotoId,
      );
      const nextMedia = orderedGarmentMedia({
        sourcePhotos: itemSourcePhotos(updated),
        modeledLooks: itemModeledLooks(updated),
        mediaOrder: updated.mediaOrder,
      });
      if (nextMedia.length) {
        setActiveMediaId(nextMedia[Math.min(sourceDeleteCandidate.index, nextMedia.length - 1)]?.id || nextMedia[0].id);
      } else {
        setMediaPreviewOpen(null);
        setActiveMediaId(null);
      }
      setSourceDeleteCandidate(null);
    } catch (requestError) {
      setViewerToast({
        title: tr("Could not delete the original photo"),
        message: readableError(requestError),
      });
      setSourceDeleteCandidate(null);
    } finally {
      setDeletingSourcePhoto(false);
    }
  };

  const requestDeleteGarment = () => {
    if (deletingGarment || deletingModeled || generatingModeled) return;
    setGarmentDeleteOpen(true);
    setViewerToast(null);
  };

  const closeGarmentDeleteConfirmation = () => {
    if (deletingGarment) return;
    setGarmentDeleteOpen(false);
    requestAnimationFrame(() => deleteGarmentButtonRef.current?.focus({ preventScroll: true }));
  };

  const deleteGarment = async () => {
    if (!garmentDeleteOpen || deletingGarment) return;
    setDeletingGarment(true);
    setViewerToast(null);
    try {
      await onDelete(item.id);
    } catch (requestError) {
      setGarmentDeleteOpen(false);
      setViewerToast({
        title: tr("Could not delete the garment"),
        message: readableError(requestError),
      });
      setDeletingGarment(false);
    }
  };

  const requestGarmentMerge = () => {
    if (mergeSelecting) {
      onCancelMerge();
      return;
    }
    if (!canMerge || deletingGarment || deletingModeled || generatingModeled) return;
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before merging this garment."),
      });
      nudgeUnsaved(false);
      return;
    }
    onBeginMerge(item.id);
  };

  const closeSourcePhoto = () => {
    setSourcePhotoOpen(false);
    setSourceCropVisible(false);
    setSourceImageFrame(null);
    requestAnimationFrame(() => sourcePhotoButtonRef.current?.focus({ preventScroll: true }));
  };

  const moveSourcePhoto = (direction) => {
    if (sourcePhotos.length < 2) return;
    setSourcePhotoIndex((current) => (
      (current + direction + sourcePhotos.length) % sourcePhotos.length
    ));
    setSourceImageFrame(null);
  };

  const openMediaPreview = (kind) => {
    if (kind === "media" && !activeMedia) return;
    setMediaPreviewOpen(kind);
    if (kind === "garment") {
      setGarmentRegenerationOpen(Boolean(item.garmentRegenerationCandidate));
      setGarmentRegenerationError("");
      if (item.garmentRegenerationCandidate) setGarmentRegenerationForm(garmentRegenerationDraft(item));
    }
  };

  const closeMediaPreview = () => {
    const trigger = mediaPreviewOpen === "media"
      ? modeledPhotoButtonRef.current
      : garmentArtworkButtonRef.current;
    setMediaPreviewOpen(null);
    setModeledSettingsOpen(false);
    setGarmentRegenerationOpen(false);
    setGarmentRegenerationError("");
    requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  };

  const openGarmentRegeneration = () => {
    if (isDirty) {
      setViewerToast({
        title: tr("Save this garment first"),
        message: tr("Save your changes before regenerating the garment image."),
      });
      nudgeUnsaved(false);
      return;
    }
    setGarmentRegenerationForm(garmentRegenerationDraft(item));
    setGarmentRegenerationError("");
    setGarmentRegenerationOpen(true);
  };

  const toggleRegenerationSource = (sourceId) => {
    if (garmentRegenerationBusy) return;
    setGarmentRegenerationForm((current) => {
      const selected = current.sourcePhotoIds.includes(sourceId);
      if (selected) {
        if (current.sourcePhotoIds.length === 1) return current;
        return { ...current, sourcePhotoIds: current.sourcePhotoIds.filter((id) => id !== sourceId) };
      }
      if (current.sourcePhotoIds.length >= 3) return current;
      return { ...current, sourcePhotoIds: [...current.sourcePhotoIds, sourceId] };
    });
  };

  const regenerateGarment = async (useSuggestedModel = false) => {
    const primaryColor = normalizeHexColor(garmentRegenerationForm.color);
    const secondaryColor = garmentRegenerationForm.secondaryColor
      ? normalizeHexColor(garmentRegenerationForm.secondaryColor)
      : null;
    if (
      garmentRegenerationBusy
      || !garmentRegenerationForm.name.trim()
      || !primaryColor
      || (garmentRegenerationForm.secondaryColor && !secondaryColor)
      || !garmentRegenerationForm.sourcePhotoIds.length
    ) return;
    setGarmentRegenerationBusy(true);
    setGarmentRegenerationError("");
    try {
      await onRegenerateGarment(item.id, {
        metadata: {
          name: garmentRegenerationForm.name.trim(),
          part: garmentRegenerationForm.part,
          color: primaryColor,
          secondaryColor,
          tags: garmentRegenerationForm.characteristics
            .split(/[,\n]/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
        sourcePhotoIds: garmentRegenerationForm.sourcePhotoIds,
        direction: garmentRegenerationForm.direction.trim(),
        useSuggestedModel,
      });
    } catch (requestError) {
      setGarmentRegenerationError(readableError(requestError));
    } finally {
      setGarmentRegenerationBusy(false);
    }
  };

  const acceptGarmentRegeneration = async () => {
    if (garmentRegenerationBusy || !item.garmentRegenerationCandidate) return;
    setGarmentRegenerationBusy(true);
    setGarmentRegenerationError("");
    try {
      const updated = await onAcceptGarmentRegeneration(item.id);
      setDraft(editableItem(updated));
      setPalette(updated.palette || []);
      setColorVersionIndex(0);
      setGarmentRegenerationOpen(false);
    } catch (requestError) {
      setGarmentRegenerationError(readableError(requestError));
    } finally {
      setGarmentRegenerationBusy(false);
    }
  };

  const centerGarmentRegeneration = async () => {
    if (garmentRegenerationBusy || !item.garmentRegenerationCandidate) return;
    setGarmentRegenerationBusy(true);
    setGarmentRegenerationError("");
    try {
      await onCenterGarmentRegeneration(item.id);
    } catch (requestError) {
      setGarmentRegenerationError(readableError(requestError));
    } finally {
      setGarmentRegenerationBusy(false);
    }
  };

  const discardGarmentRegeneration = async () => {
    if (garmentRegenerationBusy || !item.garmentRegenerationCandidate) return;
    setGarmentRegenerationBusy(true);
    setGarmentRegenerationError("");
    try {
      await onDiscardGarmentRegeneration(item.id);
      setGarmentRegenerationForm(garmentRegenerationDraft({ ...item, garmentRegenerationCandidate: null }));
      setGarmentRegenerationOpen(false);
    } catch (requestError) {
      setGarmentRegenerationError(readableError(requestError));
    } finally {
      setGarmentRegenerationBusy(false);
    }
  };

  const keepMediaPreviewFocus = (event) => {
    if (mediaPreviewOpen === "garment" && colorVersions.length > 1 && event.key === "ArrowLeft") {
      event.preventDefault();
      previewColorVersion(-1);
      return;
    }
    if (mediaPreviewOpen === "garment" && colorVersions.length > 1 && event.key === "ArrowRight") {
      event.preventDefault();
      previewColorVersion(1);
      return;
    }
    if (mediaPreviewOpen === "media" && garmentMedia.length > 1 && event.key === "ArrowLeft") {
      event.preventDefault();
      rotateGarmentMedia(-1);
      return;
    }
    if (mediaPreviewOpen === "media" && garmentMedia.length > 1 && event.key === "ArrowRight") {
      event.preventDefault();
      rotateGarmentMedia(1);
      return;
    }
    keepDeleteDialogFocus(event);
  };

  const closeColorEditor = () => {
    setColorEditorOpen(false);
    setSampling(null);
  };

  const openColorEditor = () => {
    setSampleStatus("");
    setColorEditorOpen(true);
  };

  const keepSourcePhotoFocus = (event) => {
    if (sourcePhotoOpen && sourcePhotos.length > 1 && event.key === "ArrowLeft") {
      event.preventDefault();
      moveSourcePhoto(-1);
      return;
    }
    if (sourcePhotoOpen && sourcePhotos.length > 1 && event.key === "ArrowRight") {
      event.preventDefault();
      moveSourcePhoto(1);
      return;
    }
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

  const colorVersionPositionStyle = (index) => {
    const slot = garmentVersionFanSlot(index, colorVersions.length);
    const fanStep = colorVersions.length === 2 ? 24 : 13;
    const horizontalStep = colorVersions.length === 2 ? 20 : 10;
    const spread = garmentVersionSpreadMetrics(colorVersions.length);
    return {
      "--fan-angle": `${slot * fanStep}deg`,
      "--fan-x": `${slot * horizontalStep}px`,
      "--fan-rank": Math.abs(slot),
      "--fan-layer": 80 - Math.abs(slot),
      "--spread-x": `${slot * spread.stepPx}px`,
      "--spread-angle": `${garmentVersionSpreadAngle(index, colorVersions.length)}deg`,
      "--spread-scale": spread.scale,
    };
  };

  const activeGarmentPreview = (
    <GarmentColorPreview
      src={activeColorVersion.preview || activeColorVersion.image}
      alt={tr("Selected {type}", { type: type.toLocaleLowerCase(getLocale()) })}
      sourceColor={activeColorVersion.primaryColor || draft.color}
      alternateColor={activeColorVersion.secondaryColor || draft.secondaryColor}
      targetColor={null}
      context={{
        name: draft.name || type,
        part: draft.part || item.part,
        tags: draft.tags || item.tags,
        materials: draft.materials || item.materials,
        channel: "primary",
      }}
      onSourceReady={handleGarmentSourceReady}
      onClick={(event) => {
        if (sampling) handleImageClick(event);
        else openMediaPreview("garment");
      }}
    />
  );

  const garmentArtwork = (
    <div
      className={`viewer-art${hasHeroImage ? " viewer-art-floating" : ""}${sampling ? " sampling" : ""}${hasVersionFan ? " has-version-fan" : ""}${hasVersionRow ? " has-version-spread" : ""}`}
      style={hasHeroImage ? { "--piece-rotation": pieceRotation } : undefined}
      ref={garmentArtworkButtonRef}
      role={!sampling ? (hasVersionSpread ? "group" : "button") : undefined}
      tabIndex={!sampling && !hasVersionSpread ? 0 : -1}
      aria-label={!sampling ? tr(hasVersionSpread ? "Garment color versions" : "Open enlarged garment image") : undefined}
      onKeyDown={(event) => {
        if (!sampling && !hasVersionSpread && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openMediaPreview("garment");
        }
      }}
    >
      {hasVersionSpread ? (
        <>
          <div className={`garment-version-fan${hasVersionRow ? " is-spread" : ""}`} aria-hidden="true">
            {colorVersions.map((version, index) => {
              return (
                <div
                  key={version.id || "original"}
                  className={`garment-version-fan__visual${index === activeColorVersionIndex ? " is-selected" : ""}${index === hoveredColorVersionIndex ? " is-hovered" : ""}`}
                  style={colorVersionPositionStyle(index)}
                >
                  <GarmentColorPreview
                    src={version.preview || version.image}
                    alt={tr("Selected {type}", { type: type.toLocaleLowerCase(getLocale()) })}
                    sourceColor={version.primaryColor || draft.color}
                    alternateColor={version.secondaryColor || draft.secondaryColor}
                    targetColor={null}
                    context={{
                      name: draft.name || type,
                      part: draft.part || item.part,
                      tags: draft.tags || item.tags,
                      materials: draft.materials || item.materials,
                      channel: "primary",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            className={`garment-version-fan__targets${hasVersionRow ? " is-spread" : ""}`}
            style={{ "--fan-count": colorVersions.length }}
            onMouseLeave={() => setHoveredColorVersionIndex(null)}
          >
            {colorVersions.map((version, index) => (
              <button
                key={version.id || "original"}
                type="button"
                aria-label={`${tr("Garment color versions")}: ${tr("{current} of {total}", { current: index + 1, total: colorVersions.length })}`}
                aria-pressed={index === activeColorVersionIndex}
                onMouseEnter={() => setHoveredColorVersionIndex(index)}
                onFocus={() => setHoveredColorVersionIndex(index)}
                onBlur={() => setHoveredColorVersionIndex(null)}
                onMouseDown={(event) => event.preventDefault()}
                style={colorVersionPositionStyle(index)}
                onClick={(event) => {
                  event.stopPropagation();
                  void selectColorVersion(index);
                  openMediaPreview("garment");
                }}
              />
            ))}
          </div>
          <div className="garment-version-fan__fallback">
            {activeGarmentPreview}
          </div>
        </>
      ) : activeGarmentPreview}
      {colorVersions.length > 1 && (
        <div className={`garment-version-nav${hasVersionSpread ? " is-fan-fallback" : ""}`} aria-label={tr("Garment color versions")}>
          <button type="button" onClick={(event) => { event.stopPropagation(); rotateColorVersion(-1); }} aria-label={tr("Previous garment version")}><CaretLeft size={18} /></button>
          <span>{tr("{current} of {total}", { current: activeColorVersionIndex + 1, total: colorVersions.length })}</span>
          <button type="button" onClick={(event) => { event.stopPropagation(); rotateColorVersion(1); }} aria-label={tr("Next garment version")}><CaretRight size={18} /></button>
        </div>
      )}
      {sampling && <span className="sample-hint">{tr("Click garment to sample")}</span>}
    </div>
  );

  const garmentIdentityHeader = (
    <div className={`viewer-heading${hasHeroImage ? " modeled-heading" : ""}`}>
      <div className="viewer-identity">
        {nameEditing ? (
          <input
            ref={nameInputRef}
            className="viewer-name-input"
            value={draft.name}
            maxLength="120"
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            onBlur={() => setNameEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.stopPropagation();
                setDraft((current) => ({ ...current, name: item.name || "" }));
                setNameEditing(false);
              }
            }}
            aria-label={tr("Garment name")}
          />
        ) : (
          <button
            className="viewer-name-button"
            type="button"
            onClick={() => setNameEditing(true)}
            title={tr("Edit garment name")}
          >
            <span>{draft.name || tr(TYPE_MAP[draft.part]?.singular)}</span>
            <PencilSimple size={14} aria-hidden="true" />
          </button>
        )}
        <div className="viewer-identity__meta">
          <label className="viewer-category">
            <span className="sr-only">{tr("Category")}</span>
          <LightSelect
            value={draft.part}
            onChange={(part) => setDraft((current) => ({ ...current, part }))}
            options={TYPES.slice(1).map((category) => {
              const CategoryIcon = category.icon;
              return {
                value: category.id,
                label: tr(category.label),
                icon: <CategoryIcon size={17} weight="regular" />,
              };
            })}
            ariaLabel={tr("Garment category")}
            className="viewer-category-select"
          />
          </label>
          <CompactBrandPicker
            value={draft.brand}
            onChange={(brand) => setDraft((current) => ({ ...current, brand }))}
          />
        </div>
      </div>
    </div>
  );

  const modeledGenerationAction = item.id.startsWith("import-") ? (
    <button
      className={`modeled-generate-action${generatingModeled ? " is-busy" : ""}`}
      type="button"
      disabled={generatingModeled || deletingModeled}
      onClick={requestGenerateModeledLook}
      aria-label={tr(hasModeledImage ? "Create another style look" : "Create a style look")}
      title={tr(hasModeledImage ? "Create another style look" : "Create a style look")}
    >
      {generatingModeled ? <SpinnerGap className="modeled-generate-action__spinner" size={17} /> : <Sparkle size={17} weight="fill" />}
      <span>{tr(generatingModeled ? "Creating style look…" : hasModeledImage ? "Create another style look" : "Create a style look")}</span>
    </button>
  ) : null;

  return (
    <>
    <div className="viewer-entry" data-tutorial="garment-panel" aria-hidden={deleteCandidate || deleteVersionCandidate || sourceDeleteCandidate || garmentDeleteOpen || sourcePhotoOpen || mediaPreviewOpen || colorEditorOpen || variantStudioOpen || modeledVariantPickerOpen ? "true" : undefined}>
    <aside className={`viewer editing${hasHeroImage ? " has-hero-image" : ""}${shaking ? " shake" : ""}`} aria-label={tr("Selected wardrobe item")}>
      <button className="viewer-icon-close" type="button" onClick={requestClose} aria-label={tr("Close viewer")}>
        <X size={24} weight="light" aria-hidden="true" />
      </button>

      {hasHeroImage ? (
        <>
          {garmentIdentityHeader}
          <div className="modeled-hero">
            <OptimizedImage
              key={activeMedia.id}
              ref={(node) => {
                modeledPhotoButtonRef.current = node;
                originalHeroPhotoRef.current = isActiveMediaGenerated ? null : node;
              }}
              className="modeled-hero-photo is-enlargeable"
              src={activeMedia.preview || activeMedia.image}
              alt={tr("{name} photo {current} of {total}", { name: draft.name || type, current: activeMediaIndex + 1, total: garmentMedia.length })}
              style={!isActiveMediaGenerated ? { objectPosition: originalHeroPosition } : undefined}
              onLoad={!isActiveMediaGenerated ? measureOriginalHero : undefined}
              role="button"
              tabIndex={0}
              aria-label={tr("Open enlarged garment photos")}
              onClick={() => openMediaPreview("media")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openMediaPreview("media");
                }
              }}
              sizes="(max-width: 860px) 100vw, 520px"
              breakpoints={[320, 480, 640, 800, 1040, 1280]}
              quality={82}
              priority
              reveal
            />
            {isActiveMediaGenerated && (
              <span className="garment-media-ai-badge" role="img" tabIndex={0} aria-label={tr("AI generated")} data-tooltip={tr("AI generated")}>
                <Sparkle size={9} weight="fill" aria-hidden="true" />
              </span>
            )}
            {garmentArtwork}
            {modeledGenerationAction}
            {garmentMedia.length > 1 && (
              <div className="modeled-look-pagination" aria-label={tr("Garment photo controls")}>
                <button type="button" onClick={() => rotateGarmentMedia(-1)} aria-label={tr("Previous garment photo")}>
                  <CaretLeft size={20} aria-hidden="true" />
                </button>
                <span aria-live="polite">{tr("{current} of {total}", { current: activeMediaIndex + 1, total: garmentMedia.length })}</span>
                <button type="button" onClick={() => rotateGarmentMedia(1)} aria-label={tr("Next garment photo")}>
                  <CaretRight size={20} aria-hidden="true" />
                </button>
              </div>
            )}
            {(hasModeledImage || (activeMedia?.kind === GARMENT_MEDIA_ORIGINAL && item.id.startsWith("import-"))) && (
              <button
                ref={deleteLookButtonRef}
                className="modeled-look-delete"
                type="button"
                disabled={deletingModeled || deletingSourcePhoto || generatingModeled}
                onClick={hasModeledImage ? requestDeleteModeledLook : requestDeleteSourcePhoto}
                aria-label={tr(hasModeledImage
                  ? deletingModeled ? "Deleting…" : "Delete look"
                  : deletingSourcePhoto ? "Deleting photo…" : "Delete original photo")}
                title={tr(hasModeledImage
                  ? deletingModeled ? "Deleting…" : "Delete look"
                  : deletingSourcePhoto ? "Deleting photo…" : "Delete original photo")}
              >
                <Trash size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {garmentIdentityHeader}
          <div className="viewer-art-stage">
            {garmentArtwork}
            {modeledGenerationAction}
          </div>
        </>
      )}

      <div className="viewer-details editing">
        <ItemEditor
          key={item.id}
          draft={draft}
          setDraft={setDraft}
          onEditColors={openColorEditor}
          onOpenCareGuide={() => setCareGuideOpen(true)}
          currency={currency}
          colorVersions={(
            <ColorVersionAction
              count={colorVersions.length - 1}
              disabled={!item.id.startsWith("import-")}
              onClick={() => setVariantStudioOpen(true)}
            />
          )}
        />

        <div className={`viewer-merge-action${mergeSelecting ? " is-active" : ""}`}>
          <button
            className="secondary-button"
            type="button"
            onClick={requestGarmentMerge}
            disabled={!mergeSelecting && (!canMerge || deletingGarment || deletingModeled || generatingModeled)}
            title={!canMerge ? tr("Add another garment before merging.") : undefined}
          >
            {mergeSelecting ? <X size={15} aria-hidden="true" /> : <ArrowsLeftRight size={15} aria-hidden="true" />}
            {tr(mergeSelecting ? "Cancel garment merge" : "Merge with existing garment")}
          </button>
          {mergeSelecting && <small>{tr("Choose the second garment from the wardrobe on the left.")}</small>}
        </div>

        {closeBlocked && <p className="unsaved-notice" role="status">{tr("Save or cancel changes before leaving this item.")}</p>}

        <div className="viewer-actions">
          <button
            className="secondary-button viewer-vault-button"
            type="button"
            onClick={archiveGarment}
            disabled={archiving || deletingGarment}
          >
            {archiving ? <SpinnerGap className="spin" size={15} /> : <EyeSlash size={15} weight="regular" aria-hidden="true" />} {tr(archiving ? "Moving…" : "Move to Vault")}
          </button>
          <button
            ref={deleteGarmentButtonRef}
            className="delete-button"
            type="button"
            onClick={requestDeleteGarment}
          >
            <Trash size={15} weight="regular" aria-hidden="true" /> {tr("Delete")}
          </button>
          <span className="action-spacer" />
          <button className="secondary-button" type="button" onClick={cancelEditing}>{tr("Cancel")}</button>
          <button className="primary-button" type="button" onClick={saveEditing}>
            <Check size={15} weight="bold" aria-hidden="true" /> {tr("Save")}
          </button>
        </div>
      </div>
    </aside>
    </div>
    <ViewerToast toast={viewerToast} onDismiss={() => setViewerToast(null)} />
    {colorEditorOpen && (
      <GarmentColorStudio
        name={draft.name || type}
        image={item.imagePreview || item.image}
        primaryColor={draft.color}
        secondaryColor={draft.secondaryColor}
        palette={[...new Set([draft.color, draft.secondaryColor, ...palette].filter(Boolean))].slice(0, 5)}
        sampling={sampling}
        setSampling={setSampling}
        sampleStatus={sampleStatus}
        onPrimaryChange={(color) => {
          setDraft((current) => ({ ...current, color }));
          setSampling(null);
          setSampleStatus("");
        }}
        onSecondaryChange={(secondaryColor) => {
          setDraft((current) => ({ ...current, secondaryColor }));
          setSampling(null);
          setSampleStatus("");
        }}
        onSecondaryClear={() => {
          setDraft((current) => ({ ...current, secondaryColor: null }));
          setSampling((current) => current === "secondary" ? null : current);
          setSampleStatus("");
        }}
        onImageLoad={handleGarmentSourceReady}
        onImageClick={handleImageClick}
        onClose={closeColorEditor}
        closeButtonRef={colorEditorCloseButtonRef}
        onKeyDown={keepSourcePhotoFocus}
      />
    )}
    {variantStudioOpen && (
      <GarmentVariantStudio
        item={item}
        garment={{ name: draft.name, part: draft.part || item.part, tags: draft.tags, materials: draft.materials }}
        onClose={() => setVariantStudioOpen(false)}
        onCreate={async (input) => {
          const updated = await onCreateVariant(item.id, input);
          const updatedVersions = itemColorVersions(updated);
          await selectColorVersion(updatedVersions.length - 1, updatedVersions);
        }}
      />
    )}
    {careGuideOpen && (
      <CareGuideDialog
        name={draft.name || type}
        instructions={draft.careInstructions}
        onClose={() => setCareGuideOpen(false)}
      />
    )}
    {modeledVariantPickerOpen && (
      <ModeledLookDialog
        garmentName={draft.name || type}
        colorVersions={colorVersions}
        backgroundReferences={backgroundReferences}
        busy={generatingModeled}
        onClose={() => !generatingModeled && setModeledVariantPickerOpen(false)}
        onGenerate={generateModeledLook}
      />
    )}
    {mediaPreviewOpen && (
      <div
        className="source-photo-overlay media-preview-overlay"
        role="presentation"
        aria-hidden={deleteVersionCandidate ? "true" : undefined}
        onMouseDown={(event) => event.target === event.currentTarget && closeMediaPreview()}
      >
        <section
          className="source-photo-dialog media-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="media-preview-title"
          onKeyDown={keepMediaPreviewFocus}
        >
          <header className="source-photo-dialog__header">
            <div>
              <p>{tr(mediaPreviewOpen === "media" ? "Garment photos" : "Garment image")}</p>
              <h2 id="media-preview-title">{draft.name || type}</h2>
            </div>
            <button
              ref={mediaPreviewCloseButtonRef}
              className="source-photo-dialog__close"
              type="button"
              onClick={closeMediaPreview}
              aria-label={tr("Close enlarged image")}
            >
              <X size={23} weight="light" aria-hidden="true" />
            </button>
          </header>
          {mediaPreviewOpen === "garment" && garmentRegenerationOpen ? (
            <div className="media-preview-dialog__body garment-regeneration">
              <div className="garment-regeneration__scroll">
                <div className={`garment-regeneration__comparison${garmentRegenerationCandidate ? " has-candidate" : ""}`} aria-label={tr("Current and regenerated garment comparison")}>
                  <figure>
                    <ProductStage className="garment-regeneration__stage" animated staticStage>
                      <OptimizedImage
                        src={item.imagePreview || item.image}
                        alt={tr("Current garment image for {name}", { name: item.name || type })}
                        sizes="(max-width: 700px) 90vw, 420px"
                        priority
                        reveal
                      />
                    </ProductStage>
                    <figcaption><strong>{tr("Current garment")}</strong><span>{tr("Stays unchanged until you approve a replacement")}</span></figcaption>
                  </figure>
                  <figure>
                    <ProductStage className="garment-regeneration__stage" animated staticStage>
                      {garmentRegenerationCandidate ? (
                        <>
                          <OptimizedImage
                            key={garmentRegenerationCandidate.preview || garmentRegenerationCandidate.image}
                            src={garmentRegenerationCandidate.preview || garmentRegenerationCandidate.image}
                            alt={tr("Regenerated candidate for {name}", { name: garmentRegenerationForm.name || type })}
                            sizes="(max-width: 700px) 90vw, 420px"
                            priority
                            reveal
                          />
                          <button
                            type="button"
                            className="garment-regeneration__center"
                            disabled={garmentRegenerationBusy}
                            onClick={centerGarmentRegeneration}
                            aria-label={tr(garmentRegenerationBusy ? "Centering…" : "Center garment")}
                            title={tr("Center garment")}
                          >
                            {garmentRegenerationBusy
                              ? <SpinnerGap className="modeled-request__spinner" size={15} aria-hidden="true" />
                              : <CrosshairSimple size={15} aria-hidden="true" />}
                            <span>{tr(garmentRegenerationBusy ? "Centering…" : "Center")}</span>
                          </button>
                        </>
                      ) : garmentRegenerationBusy ? (
                        <div className="garment-regeneration__pending" role="status">
                          <SpinnerGap className="modeled-request__spinner" size={28} aria-hidden="true" />
                          <span>{tr("Creating replacement…")}</span>
                        </div>
                      ) : (
                        <div className="garment-regeneration__pending">
                          <Sparkle size={28} weight="light" aria-hidden="true" />
                          <span>{tr("Your regenerated candidate will appear here")}</span>
                        </div>
                      )}
                    </ProductStage>
                    <figcaption><strong>{tr("New candidate")}</strong><span>{tr(garmentRegenerationCandidate?.validationCode ? "Wardrobe paused so you can review this result" : garmentRegenerationCandidate ? "Review before choosing which garment to keep" : "Generated only after you confirm the settings below")}</span></figcaption>
                  </figure>
                </div>

                {garmentRegenerationCandidate?.validationCode && (
                  <p className="garment-regeneration__error" role="status">
                    <WarningCircle size={15} weight="fill" aria-hidden="true" />
                    {garmentRegenerationCandidate.validationMessage || tr("This generated result needs your review before another model is tried.")}
                  </p>
                )}

                <section className="garment-regeneration__editor" aria-labelledby="garment-regeneration-settings">
                  <div className="garment-regeneration__intro">
                    <div><p>{tr("Regeneration settings")}</p><h3 id="garment-regeneration-settings">{tr("Describe the garment as it should be reconstructed")}</h3></div>
                    <small>{tr("These edits guide the model and become the garment details only if you use the new candidate.")}</small>
                  </div>
                  <div className="garment-regeneration__fields">
                    <label className="garment-regeneration__field">
                      <span>{tr("Description")}</span>
                      <input
                        value={garmentRegenerationForm.name}
                        maxLength="120"
                        disabled={garmentRegenerationBusy}
                        onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="garment-regeneration__field">
                      <span>{tr("Category")}</span>
                      <LightSelect
                        value={garmentRegenerationForm.part}
                        onChange={(part) => setGarmentRegenerationForm((current) => ({ ...current, part }))}
                        options={TYPES.slice(1).map((category) => {
                          const CategoryIcon = category.icon;
                          return { value: category.id, label: tr(category.label), icon: <CategoryIcon size={17} /> };
                        })}
                        ariaLabel={tr("Garment category for regeneration")}
                        disabled={garmentRegenerationBusy}
                      />
                    </label>
                    <label className="garment-regeneration__field">
                      <span>{tr("Primary color")}</span>
                      <div className="garment-regeneration__color">
                        <input
                          type="color"
                          value={regenerationPrimaryValid ? normalizeHexColor(garmentRegenerationForm.color) : "#000000"}
                          disabled={garmentRegenerationBusy}
                          onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, color: event.target.value }))}
                        />
                        <input
                          value={garmentRegenerationForm.color}
                          aria-invalid={!regenerationPrimaryValid}
                          disabled={garmentRegenerationBusy}
                          onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, color: event.target.value }))}
                        />
                      </div>
                    </label>
                    <label className="garment-regeneration__field">
                      <span>{tr("Secondary color")} <small>{tr("optional")}</small></span>
                      <div className="garment-regeneration__color">
                        <input
                          type="color"
                          value={normalizeHexColor(garmentRegenerationForm.secondaryColor) || "#ffffff"}
                          aria-label={tr("Secondary color")}
                          disabled={garmentRegenerationBusy}
                          onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, secondaryColor: event.target.value }))}
                        />
                        <input
                          value={garmentRegenerationForm.secondaryColor}
                          placeholder={tr("#hex or leave blank")}
                          aria-invalid={!regenerationSecondaryValid}
                          disabled={garmentRegenerationBusy}
                          onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, secondaryColor: event.target.value }))}
                        />
                      </div>
                    </label>
                    <label className="garment-regeneration__field is-wide">
                      <span>{tr("Characteristics")}</span>
                      <textarea
                        rows="2"
                        value={garmentRegenerationForm.characteristics}
                        placeholder={tr("Example: linen, peak lapels, double-breasted, horn buttons")}
                        disabled={garmentRegenerationBusy}
                        onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, characteristics: event.target.value }))}
                      />
                    </label>
                    <label className="garment-regeneration__field is-wide">
                      <span>{tr("Regeneration direction")} <small>{tr("optional")}</small></span>
                      <textarea
                        rows="3"
                        value={garmentRegenerationForm.direction}
                        placeholder={tr("Example: preserve the original zipper and remove the retail tag")}
                        disabled={garmentRegenerationBusy}
                        onChange={(event) => setGarmentRegenerationForm((current) => ({ ...current, direction: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="garment-regeneration__sources">
                    <div><strong>{tr("Original photo references")}</strong><span>{tr("Choose one to three photos. The model receives only the garment crop from each selected original.")}</span></div>
                    <div className="garment-regeneration__source-grid">
                      {sourcePhotos.map((photo, index) => {
                        const selected = garmentRegenerationForm.sourcePhotoIds.includes(photo.id);
                        const atLimit = !selected && garmentRegenerationForm.sourcePhotoIds.length >= 3;
                        return (
                          <button
                            type="button"
                            className={selected ? "is-selected" : ""}
                            aria-pressed={selected}
                            aria-label={tr(selected ? "Remove original photo {number}" : "Use original photo {number}", { number: index + 1 })}
                            disabled={garmentRegenerationBusy || atLimit}
                            onClick={() => toggleRegenerationSource(photo.id)}
                            key={photo.id}
                          >
                            <OptimizedImage src={photo.preview || photo.image} alt="" sizes="110px" />
                            <span>{selected ? <Check size={14} weight="bold" /> : index + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!regenerationPrimaryValid && <p className="garment-regeneration__error" role="alert">{tr("Use a six-digit hex color, such as #d8d0c2.")}</p>}
                  {!regenerationSecondaryValid && <p className="garment-regeneration__error" role="alert">{tr("Use a six-digit hex color or leave this empty.")}</p>}
                  {garmentRegenerationError && <p className="garment-regeneration__error" role="alert">{garmentRegenerationError}</p>}
                  <div className="garment-regeneration__actions">
                    {garmentRegenerationCandidate ? (
                      <>
                        <button type="button" className="secondary-button" disabled={garmentRegenerationBusy} onClick={discardGarmentRegeneration}>{tr("Keep current garment")}</button>
                        <button type="button" className="secondary-button" disabled={garmentRegenerationBusy || !canRegenerateGarment} onClick={() => regenerateGarment(false)}>
                          {garmentRegenerationBusy ? <SpinnerGap className="modeled-request__spinner" size={15} /> : <ArrowCounterClockwise size={15} />}
                          {tr("Regenerate again")}
                        </button>
                        {garmentRegenerationSuggestedModel && (
                          <button type="button" className="secondary-button" disabled={garmentRegenerationBusy || !canRegenerateGarment} onClick={() => regenerateGarment(true)}>
                            <ArrowsLeftRight size={15} />
                            {tr("Try {model}", { model: aiModelLabel(garmentRegenerationSuggestedModel) })}
                          </button>
                        )}
                        <button type="button" className="primary-button" disabled={garmentRegenerationBusy} onClick={acceptGarmentRegeneration}><Check size={15} weight="bold" /> {tr("Use new garment")}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="secondary-button" disabled={garmentRegenerationBusy} onClick={() => setGarmentRegenerationOpen(false)}>{tr("Cancel")}</button>
                        <button type="button" className="primary-button" disabled={garmentRegenerationBusy || !canRegenerateGarment} onClick={() => regenerateGarment(false)}>
                          {garmentRegenerationBusy ? <SpinnerGap className="modeled-request__spinner" size={15} /> : <Sparkle size={15} weight="fill" />}
                          {tr(garmentRegenerationBusy ? "Creating replacement…" : "Generate candidate")}
                        </button>
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : (
          <div className={`media-preview-dialog__body${mediaPreviewOpen === "media" && garmentMedia.length > 1 ? " has-carousel" : ""}${mediaPreviewOpen === "garment" && colorVersions.length > 1 ? " has-version-gallery" : ""}${mediaPreviewOpen === "garment" && item.id.startsWith("import-") && sourcePhotos.length > 0 ? " has-actions" : ""}`}>
            <ProductStage className="media-preview-dialog__viewport" interactive animated>
              {mediaPreviewOpen === "media" ? (
                <OptimizedImage
                  key={activeMedia.id}
                  className="media-preview-dialog__image"
                  src={garmentMediaPreviewSource(activeMedia)}
                  alt={tr("{name} photo {current} of {total}", { name: draft.name || type, current: activeMediaIndex + 1, total: garmentMedia.length })}
                  sizes="(max-width: 700px) 100vw, 960px"
                  breakpoints={[480, 640, 800, 1040, 1280, 1600]}
                  quality={90}
                  priority
                  reveal
                />
              ) : (
                <GarmentColorPreview
                  className="media-preview-dialog__image"
                  src={activeColorVersion.image || activeColorVersion.preview}
                  alt={tr("Enlarged garment image for {name}", { name: draft.name || type })}
                  sourceColor={activeColorVersion.primaryColor || draft.color}
                  alternateColor={activeColorVersion.secondaryColor || draft.secondaryColor}
                  targetColor={null}
                  context={{
                    name: draft.name || type,
                    part: draft.part || item.part,
                    tags: draft.tags || item.tags,
                    materials: draft.materials || item.materials,
                    channel: "primary",
                  }}
                />
              )}
              {mediaPreviewOpen === "media" && isActiveMediaGenerated && (
                <span className="garment-media-ai-badge is-dialog" role="img" tabIndex={0} aria-label={tr("AI generated")} data-tooltip={tr("AI generated")}>
                  <Sparkle size={9} weight="fill" aria-hidden="true" />
                </span>
              )}
              {mediaPreviewOpen === "garment" && item.id.startsWith("import-") && activeColorVersion?.id && (
                <button
                  ref={deleteVersionButtonRef}
                  className="media-preview-dialog__vault media-preview-dialog__version-delete"
                  type="button"
                  onClick={requestDeleteColorVersion}
                  disabled={deletingVersion || colorVersionOrderBusy}
                  aria-label={tr("Delete this color version")}
                  title={tr("Delete this color version")}
                >
                  <Trash size={17} aria-hidden="true" />
                  <span>{tr("Delete version")}</span>
                </button>
              )}
              {mediaPreviewOpen === "media" && isActiveMediaGenerated && (
                <button
                  className="media-preview-dialog__vault"
                  type="button"
                  onClick={archiveModeledLook}
                  disabled={archiving}
                  aria-label={tr("Move this photo to the Vault")}
                  title={tr("Move this photo to the Vault")}
                >
                  {archiving ? <SpinnerGap className="spin" size={16} /> : <EyeSlash size={17} aria-hidden="true" />}
                  <span>{tr(archiving ? "Moving…" : "Move to Vault")}</span>
                </button>
              )}
              {mediaPreviewOpen === "media" && isActiveMediaGenerated && (
                <div className="modeled-image-settings">
                  <button
                    type="button"
                    aria-expanded={modeledSettingsOpen}
                    aria-controls="modeled-image-settings-panel"
                    onClick={() => setModeledSettingsOpen((open) => !open)}
                  >
                    <Info size={15} aria-hidden="true" />
                    <span>{tr("Image settings")}</span>
                  </button>
                  {modeledSettingsOpen && (
                    <section id="modeled-image-settings-panel" aria-label={tr("Settings used for this image")}>
                      <header>
                        <div>
                          <small>{tr("AI generated")}</small>
                          <strong>{tr("Settings used for this image")}</strong>
                        </div>
                        <button type="button" onClick={() => setModeledSettingsOpen(false)} aria-label={tr("Hide image settings")}>
                          <X size={15} aria-hidden="true" />
                        </button>
                      </header>
                      {activeModeledSettings.length ? (
                        <dl>
                          {activeModeledSettings.map((detail) => (
                            <div key={detail.id}>
                              <dt>{tr(detail.label)}</dt>
                              <dd>{detail.values.map((value) => detail.translateValues ? tr(value) : value).join(" · ")}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p>{tr(modeledSettingsRecorded
                          ? "No specific settings were selected. This image was freely composed."
                          : "Settings were not recorded for this image.")}</p>
                      )}
                    </section>
                  )}
                </div>
              )}
              {mediaPreviewOpen === "media" && garmentMedia.length > 1 && (
                <>
                  <button
                    className="source-photo-dialog__nav is-previous"
                    type="button"
                    onClick={() => rotateGarmentMedia(-1)}
                    aria-label={tr("Previous garment photo")}
                  >
                    <CaretLeft size={24} aria-hidden="true" />
                  </button>
                  <button
                    className="source-photo-dialog__nav is-next"
                    type="button"
                    onClick={() => rotateGarmentMedia(1)}
                    aria-label={tr("Next garment photo")}
                  >
                    <CaretRight size={24} aria-hidden="true" />
                  </button>
                  <span className="source-photo-dialog__counter" aria-live="polite">
                    {tr("{current} of {total}", { current: activeMediaIndex + 1, total: garmentMedia.length })}
                  </span>
                </>
              )}
              {mediaPreviewOpen === "garment" && colorVersions.length > 1 && (
                <>
                  <button
                    className="source-photo-dialog__nav is-previous"
                    type="button"
                    onClick={() => previewColorVersion(-1)}
                    aria-label={tr("Previous garment version")}
                  >
                    <CaretLeft size={24} aria-hidden="true" />
                  </button>
                  <button
                    className="source-photo-dialog__nav is-next"
                    type="button"
                    onClick={() => previewColorVersion(1)}
                    aria-label={tr("Next garment version")}
                  >
                    <CaretRight size={24} aria-hidden="true" />
                  </button>
                  <span className="source-photo-dialog__counter" aria-live="polite">
                    {tr("{current} of {total}", { current: activeColorVersionIndex + 1, total: colorVersions.length })}
                  </span>
                </>
              )}
            </ProductStage>
            {mediaPreviewOpen === "media" && garmentMedia.length > 1 && (
              <aside className="media-preview-dialog__gallery" aria-label={tr("Garment photo gallery")}>
                <p>{tr(mediaOrderBusy ? "Saving photo order…" : "Drag thumbnails to reorder. The first photo becomes the panel cover.")}</p>
                <div className="media-preview-dialog__thumbnail-row">
                {garmentMedia.map((media, index) => (
                  <button
                    type="button"
                    className={`${index === activeMediaIndex ? "active" : ""}${draggedMediaId === media.id ? " is-dragging" : ""}`}
                    onClick={() => setActiveMediaId(media.id)}
                    aria-label={tr("View garment photo {number}", { number: index + 1 })}
                    aria-pressed={index === activeMediaIndex}
                    draggable={item.id.startsWith("import-") && !mediaOrderBusy}
                    onDragStart={() => setDraggedMediaId(media.id)}
                    onDragOver={(event) => {
                      if (item.id.startsWith("import-") && !mediaOrderBusy) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void reorderGarmentMedia(media.id);
                    }}
                    onDragEnd={() => setDraggedMediaId(null)}
                    key={media.id}
                  >
                    <OptimizedImage
                      src={media.preview || media.image}
                      alt=""
                      sizes="80px"
                      breakpoints={[80, 120, 180]}
                      quality={72}
                      reveal
                    />
                    <span className="media-preview-dialog__number">{index + 1}</span>
                    {media.kind === GARMENT_MEDIA_GENERATED && (
                      <span className="garment-media-thumb-ai" aria-hidden="true"><Sparkle size={9} weight="fill" /></span>
                    )}
                  </button>
                ))}
                </div>
              </aside>
            )}
            {mediaPreviewOpen === "garment" && colorVersions.length > 1 && (
              <aside className="media-preview-dialog__gallery garment-version-gallery" aria-label={tr("Garment color versions")}>
                <p>{tr(colorVersionOrderBusy
                  ? "Saving version order…"
                  : "Drag thumbnails to reorder. The first version is the default garment.")}</p>
                <div className="media-preview-dialog__thumbnail-row">
                  {colorVersions.map((version, index) => {
                    const versionId = version.id || GARMENT_ORIGINAL_VERSION_ID;
                    return (
                      <button
                        type="button"
                        className={`${index === activeColorVersionIndex ? "active" : ""}${draggedColorVersionId === versionId ? " is-dragging" : ""}`}
                        onClick={() => setColorVersionIndex(index)}
                        aria-label={tr("View garment version {number}", { number: index + 1 })}
                        aria-pressed={index === activeColorVersionIndex}
                        draggable={item.id.startsWith("import-") && !colorVersionOrderBusy}
                        onDragStart={() => setDraggedColorVersionId(versionId)}
                        onDragOver={(event) => {
                          if (item.id.startsWith("import-") && !colorVersionOrderBusy) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void reorderColorVersions(versionId);
                        }}
                        onDragEnd={() => setDraggedColorVersionId(null)}
                        key={versionId}
                      >
                        <OptimizedImage
                          src={version.thumbnail || version.preview || version.image}
                          alt=""
                          sizes="80px"
                          breakpoints={[80, 120, 180]}
                          quality={72}
                          reveal
                        />
                        <span className="media-preview-dialog__number">{index + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
            {mediaPreviewOpen === "garment" && item.id.startsWith("import-") && sourcePhotos.length > 0 && (
              <footer className="media-preview-dialog__actions">
                <button type="button" className="primary-button" onClick={openGarmentRegeneration}>
                  <ArrowCounterClockwise size={16} aria-hidden="true" />
                  {tr(garmentRegenerationCandidate ? "Review regenerated candidate" : "Regenerate from original photos")}
                </button>
              </footer>
            )}
          </div>
          )}
        </section>
      </div>
    )}
    {sourcePhotoOpen && hasOriginalImage && (
      <div
        className="source-photo-overlay"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeSourcePhoto()}
      >
        <section
          className="source-photo-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-photo-title"
          onKeyDown={keepSourcePhotoFocus}
        >
          <header className="source-photo-dialog__header">
            <div>
              <p>{tr("Original photo")}</p>
              <h2 id="source-photo-title">{draft.name || type}</h2>
            </div>
            <div className="source-photo-dialog__header-actions">
              {activeSourceCrop && (
                <button
                  className="source-photo-dialog__crop-toggle"
                  type="button"
                  aria-pressed={sourceCropVisible}
                  onClick={() => setSourceCropVisible((visible) => !visible)}
                >
                  <Crop size={16} aria-hidden="true" />
                  <span>{tr(sourceCropVisible ? "Hide crop" : "Show crop")}</span>
                </button>
              )}
              <button
                ref={sourcePhotoCloseButtonRef}
                className="source-photo-dialog__close"
                type="button"
                onClick={closeSourcePhoto}
                aria-label={tr("Close original photo")}
              >
                <X size={23} weight="light" aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className={`source-photo-dialog__body${sourcePhotos.length > 1 ? " has-gallery" : ""}`}>
            <div className="source-photo-dialog__image">
              <div className="source-photo-dialog__viewport" ref={sourcePhotoViewportRef}>
                <OptimizedImage
                  key={activeSourcePhoto.id}
                  ref={sourcePhotoImageRef}
                  className="source-photo-dialog__full-image"
                  src={activeSourcePhoto.image}
                  alt={tr("Original photo where {name} was found", { name: draft.name || type })}
                  sizes="(max-width: 700px) 100vw, 900px"
                  breakpoints={[480, 640, 800, 1040, 1280]}
                  quality={88}
                  priority
                  reveal
                  onLoad={measureSourcePhoto}
                />
                {sourceCropStyle && (
                  <div
                    className="source-photo-dialog__crop"
                    style={sourceCropStyle}
                    aria-label={tr("Garment crop")}
                  >
                    <span><Crop size={13} aria-hidden="true" /> {tr("Garment crop")}</span>
                  </div>
                )}
                {sourcePhotos.length > 1 && (
                  <>
                    <button
                      className="source-photo-dialog__nav is-previous"
                      type="button"
                      onClick={() => moveSourcePhoto(-1)}
                      aria-label={tr("Previous source photo")}
                    >
                      <CaretLeft size={23} aria-hidden="true" />
                    </button>
                    <button
                      className="source-photo-dialog__nav is-next"
                      type="button"
                      onClick={() => moveSourcePhoto(1)}
                      aria-label={tr("Next source photo")}
                    >
                      <CaretRight size={23} aria-hidden="true" />
                    </button>
                    <span className="source-photo-dialog__counter" aria-live="polite">
                      {tr("{current} of {total}", { current: sourcePhotoIndex + 1, total: sourcePhotos.length })}
                    </span>
                  </>
                )}
              </div>
            </div>
            {sourcePhotos.length > 1 && (
              <aside className="source-photo-dialog__gallery" aria-label={tr("Photos where this garment appeared")}>
                <div>
                  {sourcePhotos.map((photo, index) => (
                    <button
                      type="button"
                      key={photo.id}
                      className={index === sourcePhotoIndex ? "active" : ""}
                      onClick={() => setSourcePhotoIndex(index)}
                      aria-label={tr("View source photo {number}", { number: index + 1 })}
                      aria-pressed={index === sourcePhotoIndex}
                    >
                      <OptimizedImage
                        src={photo.preview || photo.image}
                        alt=""
                        sizes="96px"
                        breakpoints={[96, 160, 240]}
                        quality={76}
                        reveal
                      />
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </section>
      </div>
    )}
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
            aria-label={tr("Cancel deleting this look")}
          >
            <X size={22} weight="light" aria-hidden="true" />
          </button>
          <ProductStage className="look-delete-dialog__image" animated>
            <OptimizedImage
              src={modeledLookSource(deleteCandidate.look)}
              alt={tr("{name} modeled look to delete", { name: draft.name || type })}
              sizes="(max-width: 520px) calc(100vw - 64px), 400px"
              breakpoints={[320, 480, 640, 800]}
              quality={82}
              priority
              reveal
            />
          </ProductStage>
          <div className="look-delete-dialog__body">
            <p className="look-delete-dialog__eyebrow">{tr("Delete look")}</p>
            <h2 id="look-delete-title">{tr("Are you sure you want to delete this look?")}</h2>
          </div>
          <div className="look-delete-dialog__actions">
            <button
              ref={deleteCancelButtonRef}
              className="secondary-button"
              type="button"
              onClick={closeDeleteConfirmation}
              disabled={deletingModeled}
            >
              {tr("Cancel")}
            </button>
            <button className="look-delete-dialog__confirm" type="button" onClick={deleteModeledLook} disabled={deletingModeled}>
              <Trash size={15} aria-hidden="true" />
              {tr(deletingModeled ? "Deleting…" : "Delete look")}
            </button>
          </div>
        </section>
      </div>
    )}
    {deleteVersionCandidate && (
      <div
        className="look-delete-overlay version-delete-overlay"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeVersionDeleteConfirmation()}
      >
        <section
          className="look-delete-dialog version-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="version-delete-title"
          onKeyDown={keepDeleteDialogFocus}
        >
          <button
            className="look-delete-dialog__close"
            type="button"
            onClick={closeVersionDeleteConfirmation}
            disabled={deletingVersion}
            aria-label={tr("Cancel deleting this color version")}
          >
            <X size={22} weight="light" aria-hidden="true" />
          </button>
          <ProductStage className="look-delete-dialog__image version-delete-dialog__image" animated>
            <OptimizedImage
              src={deleteVersionCandidate.version.preview || deleteVersionCandidate.version.image}
              alt={tr("{name} color version to delete", { name: draft.name || type })}
              sizes="(max-width: 520px) calc(100vw - 64px), 400px"
              breakpoints={[320, 480, 640, 800]}
              quality={82}
              priority
              reveal
            />
          </ProductStage>
          <div className="look-delete-dialog__body version-delete-dialog__body">
            <p className="look-delete-dialog__eyebrow">{tr("Delete color version")}</p>
            <h2 id="version-delete-title">{tr("Delete this color version?")}</h2>
            <p>{tr("Only this version will be removed. The original garment and generated looks will stay saved.")}</p>
          </div>
          <div className="look-delete-dialog__actions">
            <button
              ref={deleteVersionCancelButtonRef}
              className="secondary-button"
              type="button"
              onClick={closeVersionDeleteConfirmation}
              disabled={deletingVersion}
            >
              {tr("Cancel")}
            </button>
            <button className="look-delete-dialog__confirm" type="button" onClick={deleteColorVersion} disabled={deletingVersion}>
              <Trash size={15} aria-hidden="true" />
              {tr(deletingVersion ? "Deleting version…" : "Delete version")}
            </button>
          </div>
        </section>
      </div>
    )}
    {sourceDeleteCandidate && (
      <div
        className="look-delete-overlay"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeSourceDeleteConfirmation()}
      >
        <section
          className="look-delete-dialog source-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="source-delete-title"
          onKeyDown={keepDeleteDialogFocus}
        >
          <button
            className="look-delete-dialog__close"
            type="button"
            onClick={closeSourceDeleteConfirmation}
            disabled={deletingSourcePhoto}
            aria-label={tr("Cancel deleting this original photo")}
          >
            <X size={22} weight="light" aria-hidden="true" />
          </button>
          <ProductStage className="look-delete-dialog__image source-delete-dialog__image" animated>
            <OptimizedImage
              src={sourceDeleteCandidate.photo.preview || sourceDeleteCandidate.photo.image}
              alt={tr("Original photo to delete for {name}", { name: draft.name || type })}
              sizes="(max-width: 520px) calc(100vw - 64px), 540px"
              breakpoints={[320, 480, 640, 800]}
              quality={82}
              priority
              reveal
            />
          </ProductStage>
          <div className="look-delete-dialog__body source-delete-dialog__body">
            <p className="look-delete-dialog__eyebrow">{tr("Delete original photo")}</p>
            <h2 id="source-delete-title">{tr("Remove this original photo?")}</h2>
            <p>{tr(sourceDeleteAlternatives.length
              ? "Choose the original photo that should remain the garment's primary source. Your modeled looks will stay saved."
              : "This is the garment's last original photo. Its modeled looks will stay saved, but future regeneration will need a new source photo.")}</p>
            {!!sourceDeleteAlternatives.length && (
              <div className="source-delete-dialog__alternatives" role="radiogroup" aria-label={tr("Replacement original photo")}>
                {sourceDeleteAlternatives.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    role="radio"
                    aria-checked={sourceDeleteCandidate.replacementSourcePhotoId === photo.id}
                    className={sourceDeleteCandidate.replacementSourcePhotoId === photo.id ? "is-selected" : ""}
                    onClick={() => setSourceDeleteCandidate((current) => ({ ...current, replacementSourcePhotoId: photo.id }))}
                  >
                    <OptimizedImage src={photo.preview || photo.image} alt="" sizes="92px" breakpoints={[92, 160]} quality={74} reveal />
                    <span>{tr("Original {number}", { number: index + 1 })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="look-delete-dialog__actions">
            <button
              ref={sourceDeleteCancelButtonRef}
              className="secondary-button"
              type="button"
              onClick={closeSourceDeleteConfirmation}
              disabled={deletingSourcePhoto}
            >
              {tr("Cancel")}
            </button>
            <button className="look-delete-dialog__confirm" type="button" onClick={deleteSourcePhoto} disabled={deletingSourcePhoto}>
              <Trash size={15} aria-hidden="true" />
              {tr(deletingSourcePhoto
                ? "Deleting photo…"
                : sourceDeleteAlternatives.length ? "Delete photo" : "Leave without an original photo")}
            </button>
          </div>
        </section>
      </div>
    )}
    {garmentDeleteOpen && (
      <div
        className="look-delete-overlay"
        role="presentation"
        onMouseDown={(event) => event.target === event.currentTarget && closeGarmentDeleteConfirmation()}
      >
        <section
          className="look-delete-dialog garment-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="garment-delete-title"
          onKeyDown={keepDeleteDialogFocus}
        >
          <button
            className="look-delete-dialog__close"
            type="button"
            onClick={closeGarmentDeleteConfirmation}
            disabled={deletingGarment}
            aria-label={tr("Cancel deleting this garment")}
          >
            <X size={22} weight="light" aria-hidden="true" />
          </button>
          <ProductStage className="look-delete-dialog__image garment-delete-dialog__image" animated>
            <OptimizedImage
              src={item.imagePreview || item.image}
              alt={tr("{name} garment to delete", { name: draft.name || type })}
              sizes="(max-width: 520px) calc(100vw - 64px), 400px"
              breakpoints={[320, 480, 640, 800]}
              quality={82}
              priority
              reveal
            />
          </ProductStage>
          <div className="look-delete-dialog__body">
            <p className="look-delete-dialog__eyebrow">{tr("Delete garment")}</p>
            <h2 id="garment-delete-title">{tr("Are you sure you want to delete this garment?")}</h2>
          </div>
          <div className="look-delete-dialog__actions">
            <button
              ref={deleteGarmentCancelButtonRef}
              className="secondary-button"
              type="button"
              onClick={closeGarmentDeleteConfirmation}
              disabled={deletingGarment}
            >
              {tr("Cancel")}
            </button>
            <button className="look-delete-dialog__confirm" type="button" onClick={deleteGarment} disabled={deletingGarment}>
              <Trash size={15} aria-hidden="true" />
              {tr(deletingGarment ? "Deleting…" : "Delete garment")}
            </button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}

const SIGN_IN_MESSAGES = {
  "not-allowed": "That Google account is not on this wardrobe's list. Ask the owner to add your address.",
  expired: "That sign-in took too long. Try again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Google sign-in could not be completed. Try again.",
};

function SignInGate({ error: statusError, configurationError }) {
  const [error, setError] = useState(statusError || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("signin");
    if (!outcome || outcome === "ok") return;
    setError(tr(SIGN_IN_MESSAGES[outcome] || SIGN_IN_MESSAGES.failed));
    const clean = new URL(window.location.href);
    clean.searchParams.delete("signin");
    window.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
  }, []);

  return (
    <main className="password-gate">
      <section className="password-gate__panel" aria-labelledby="sign-in-title">
        <div className="password-gate__body">
          <p className="password-gate__eyebrow">{tr("Private wardrobe")}</p>
          <h1 id="sign-in-title">{tr("Sign in to your wardrobe")}</h1>
          {configurationError ? (
            <p className="password-gate__error" role="alert">{configurationError}</p>
          ) : (
            <>
              {error && <p className="password-gate__error" role="alert">{error}</p>}
              <button
                type="button"
                className="password-gate__google"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  window.location.href = "/api/auth/google/start";
                }}
              >
                <GoogleLogo size={17} weight="bold" aria-hidden="true" />
                <span>{tr(busy ? "Opening Google…" : "Continue with Google")}</span>
              </button>
              <small>{tr("Only your own clothes, photos, and details are visible to you.")}</small>
            </>
          )}
        </div>
        <div className="password-gate__footer">
          <div className="password-gate__languages" role="group" aria-label={tr("Language")}>
            {LANGUAGE_OPTIONS.map((language) => {
              const active = getLocale() === language.id;
              const code = language.id.startsWith("pt") ? "PT" : "EN";
              return (
                <button
                  key={language.id}
                  type="button"
                  className={active ? "is-active" : ""}
                  onClick={() => setLocale(language.id)}
                  aria-label={tr(language.label)}
                  aria-pressed={active}
                  title={tr(language.label)}
                >
                  <span aria-hidden="true">{code}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

function ProfileAvatar({ user, size = "medium" }) {
  const reference = user?.referenceImages?.[0];
  return (
    <span className={`profile-avatar is-${size}`}>
      {reference ? <img src={reference.avatarUrl || reference.url} alt="" /> : <UserCircle size={size === "large" ? 40 : 24} weight="light" aria-hidden="true" />}
    </span>
  );
}

function InfoTooltip({ label, children, className = "" }) {
  return (
    <span className={`info-tooltip${className ? ` ${className}` : ""}`} tabIndex={0} aria-label={label}>
      <Info size={15} aria-hidden="true" />
      <span role="tooltip">{children}</span>
    </span>
  );
}

function ProfileMenu({ users, currentUser, canCreate, connectionCount, originalPhotoCount, onConnections, onOriginalPhotos, onVault, onCreate, onSelect, onEdit, onExport, onLogout }) {
  const detailsRef = useRef(null);
  const closeMenu = () => { if (detailsRef.current) detailsRef.current.open = false; };

  useEffect(() => {
    const closeFromOutside = (event) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(event.target)) closeMenu();
    };
    const closeFromKeyboard = (event) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        closeMenu();
        detailsRef.current.querySelector("summary")?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  return (
    <details className="profile-menu" ref={detailsRef}>
      <summary aria-label={tr("Open profile menu")} title={currentUser?.name || tr("Profile")}>
        <ProfileAvatar user={currentUser} />
      </summary>
      <div className="profile-menu__popover">
        <div className="profile-menu__identity">
          <ProfileAvatar user={currentUser} />
          <span>
            <small>{currentUser?.email || tr("Current wardrobe")}</small>
            <strong>{currentUser?.name || tr("Choose user")}</strong>
          </span>
          <button
            className="profile-menu__edit"
            type="button"
            onClick={() => { onEdit(); closeMenu(); }}
            aria-label={tr("Edit profile")}
            title={tr("Edit profile")}
          >
            <PencilSimple size={15} aria-hidden="true" />
          </button>
        </div>
        {(canCreate || users.length > 1) && (
          <>
            <div className="profile-menu__people-heading">
              <span>{tr("Wardrobes")}</span>
              {canCreate && (
                <button type="button" onClick={() => { onCreate(); closeMenu(); }}>
                  <Plus size={13} aria-hidden="true" /> {tr("Prepare account")}
                </button>
              )}
            </div>
            <div className="profile-menu__users">
              {users.map((user) => (
                <button
                  className={user.id === currentUser?.id ? "is-current" : ""}
                  type="button"
                  key={user.id}
                  onClick={() => { onSelect(user.id); closeMenu(); }}
                >
                  <ProfileAvatar user={user} />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email || user.fashionStyle || ""}</small>
                    {user.accountStatus === "prepared" && <em>{tr("Waiting for first sign-in")}</em>}
                  </span>
                  {user.id === currentUser?.id && <Check size={14} weight="bold" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="profile-menu__actions">
          <button className="profile-menu__export" type="button" onClick={() => { onConnections(); closeMenu(); }}>
            <Link size={14} /> {tr("Connections")}{connectionCount > 0 && <span className="profile-menu__notification">{connectionCount}</span>}
          </button>
          <button className="profile-menu__export" type="button" onClick={() => { onOriginalPhotos(); closeMenu(); }}>
            <ImageSquare size={14} /> {tr("Images")}<span className="profile-menu__notification is-neutral">{originalPhotoCount}</span>
          </button>
          <button className="profile-menu__export" type="button" onClick={() => { onVault(); closeMenu(); }}>
            <LockKey size={14} /> {tr("Vault")}
          </button>
          <button className="profile-menu__export" type="button" onClick={() => { onExport(); closeMenu(); }} title={tr("Includes only your own wardrobe and photos")}>
            <DownloadSimple size={14} /> {tr("Download data")}
          </button>
          {onLogout && <button className="profile-menu__logout" type="button" onClick={() => { onLogout(); closeMenu(); }}><LockKey size={14} /> {tr("Log out")}</button>}
        </div>
      </div>
    </details>
  );
}

function ProfileHeightEditor({ value, onChange }) {
  const [centimetres, setCentimetres] = useState(value.heightCm === null ? "" : String(value.heightCm));
  const initialTotalInches = value.heightCm === null ? null : Math.round(value.heightCm / 2.54);
  const [feet, setFeet] = useState(initialTotalInches === null ? "" : String(Math.floor(initialTotalInches / 12)));
  const [inches, setInches] = useState(initialTotalInches === null ? "" : String(initialTotalInches % 12));

  useEffect(() => {
    setCentimetres(value.heightCm === null ? "" : String(value.heightCm));
    const totalInches = value.heightCm === null ? null : Math.round(value.heightCm / 2.54);
    setFeet(totalInches === null ? "" : String(Math.floor(totalInches / 12)));
    setInches(totalInches === null ? "" : String(totalInches % 12));
  }, [value.heightCm, value.heightUnit]);

  const resetDrafts = () => {
    setCentimetres(value.heightCm === null ? "" : String(value.heightCm));
    const totalInches = value.heightCm === null ? null : Math.round(value.heightCm / 2.54);
    setFeet(totalInches === null ? "" : String(Math.floor(totalInches / 12)));
    setInches(totalInches === null ? "" : String(totalInches % 12));
  };
  const updateCentimetres = (rawValue) => {
    setCentimetres(rawValue);
    if (rawValue === "") onChange({ ...value, heightCm: null });
    const number = Number(rawValue);
    if (Number.isFinite(number) && number >= 30 && number <= 260) {
      onChange({ ...value, heightCm: number });
    }
  };
  const updateImperial = (nextFeet, nextInches) => {
    const feetNumber = Number(nextFeet);
    const inchesNumber = Number(nextInches);
    if (nextFeet === "") {
      onChange({ ...value, heightCm: null });
      return;
    }
    if (
      Number.isInteger(feetNumber)
      && Number.isInteger(inchesNumber)
      && feetNumber >= 1
      && feetNumber <= 8
      && inchesNumber >= 0
      && inchesNumber <= 11
    ) {
      const heightCm = ((feetNumber * 12) + inchesNumber) * 2.54;
      if (heightCm >= 30 && heightCm <= 260) onChange({ ...value, heightCm });
    }
  };

  return (
    <section className="profile-height-editor">
      <div>
        <strong>{tr("Height")}</strong>
        <small>{tr("Used to preserve stature and relative height when generating modeled looks.")}</small>
      </div>
      <label>
        <span>{tr("Height unit")}</span>
        <LightSelect
          value={value.heightUnit}
          onChange={(heightUnit) => onChange({ ...value, heightUnit })}
          options={HEIGHT_UNIT_OPTIONS.map((option) => ({ value: option.id, label: tr(option.label) }))}
          ariaLabel={tr("Height unit")}
        />
      </label>
      {value.heightUnit === "imperial" ? (
        <div className="profile-height-editor__imperial">
          <label>
            <span>{tr("Feet")}</span>
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              inputMode="numeric"
              value={feet}
              placeholder="5"
              aria-label={tr("Height in feet")}
              onBlur={resetDrafts}
              onChange={(event) => {
                const nextFeet = event.target.value;
                setFeet(nextFeet);
                updateImperial(nextFeet, inches);
              }}
            />
          </label>
          <label>
            <span>{tr("Inches")}</span>
            <input
              type="number"
              min="0"
              max="11"
              step="1"
              inputMode="numeric"
              value={inches}
              placeholder="10"
              aria-label={tr("Height in inches")}
              onBlur={resetDrafts}
              onChange={(event) => {
                const nextInches = event.target.value;
                setInches(nextInches);
                updateImperial(feet, nextInches);
              }}
            />
          </label>
        </div>
      ) : (
        <label className="profile-height-editor__metric">
          <span>{tr("Centimetres")}</span>
          <input
            type="number"
            min="30"
            max="260"
            step="0.1"
            inputMode="decimal"
            value={centimetres}
            placeholder="175"
            aria-label={tr("Height in centimetres")}
            onBlur={resetDrafts}
            onChange={(event) => updateCentimetres(event.target.value)}
          />
        </label>
      )}
    </section>
  );
}

function VaultDialog({ user, onClose, onRestore, onSetUpPassword }) {
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (user.hasVaultPassword) requestAnimationFrame(() => passwordRef.current?.focus());
  }, [user.hasVaultPassword]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      if (preview) setPreview(null);
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, preview]);

  const unlock = async (event) => {
    event.preventDefault();
    setBusy("unlock");
    setError("");
    try {
      const result = await profileApi(withWardrobeUser(`/api/users/${user.id}/vault`, user.id), {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setEntries(result.entries || []);
      setPassword("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const restore = async (entry) => {
    setBusy(entry.id);
    setError("");
    try {
      await onRestore(entry);
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const groups = entries ? [
    ["garment", tr("Garments")],
    ["garment-look", tr("Garment photos")],
    ["outfit-look", tr("Outfit photos")],
  ].map(([kind, label]) => ({ kind, label, entries: entries.filter((entry) => entry.kind === kind) })).filter((group) => group.entries.length) : [];

  return (
    <div className="vault-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className={`vault-dialog${entries ? " is-open" : " is-locked"}`} role="dialog" aria-modal="true" aria-labelledby="vault-title">
        <header>
          <div><p>{tr("Private storage")}</p><h2 id="vault-title">{tr("Vault")}</h2></div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("Close Vault")}><X size={21} /></button>
        </header>
        {entries ? (
          <div className="vault-dialog__content">
            <div className="vault-dialog__intro"><LockKey size={18} /><span><strong>{tr("Vault unlocked")}</strong><small>{tr("Restore anything you want to return to your wardrobe or Outfit Studio.")}</small></span></div>
            {!entries.length && <div className="vault-empty"><EyeSlash size={34} weight="light" /><strong>{tr("Your Vault is empty")}</strong><p>{tr("Hidden garments and generated photos will appear here.")}</p></div>}
            {groups.map((group) => (
              <section className="vault-group" key={group.kind}>
                <header><h3>{group.label}</h3><span>{group.entries.length}</span></header>
                <div className="vault-grid">
                  {group.entries.map((entry) => (
                    <article key={entry.id}>
                      <button className="vault-card__image" type="button" onClick={() => setPreview(entry)} aria-label={tr("Enlarge {name}", { name: entry.name })}>
                        <OptimizedImage src={entry.preview || entry.image} alt="" sizes="240px" />
                        {entry.kind !== "garment" && <span><Sparkle size={10} weight="fill" /> {tr("Generated")}</span>}
                      </button>
                      <div><strong>{entry.name}</strong><small>{tr(entry.kind === "garment" ? "Hidden garment" : entry.kind === "outfit-look" ? "Outfit Studio photo" : "Garment photo")}</small></div>
                      <button className="vault-card__restore" type="button" disabled={Boolean(busy)} onClick={() => restore(entry)}>
                        {busy === entry.id ? <SpinnerGap className="spin" size={14} /> : <ArrowCounterClockwise size={14} />}{tr("Restore")}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {error && <p className="vault-error" role="alert">{error}</p>}
          </div>
        ) : user.hasVaultPassword ? (
          <form className="vault-unlock" onSubmit={unlock}>
            <span className="vault-unlock__icon"><LockKey size={29} weight="light" /></span>
            <h3>{tr("Enter your Vault password")}</h3>
            <p>{tr("The Vault locks again each time you close it.")}</p>
            <label><span>{tr("Password")}</span><input ref={passwordRef} type="password" value={password} autoComplete="current-password" required minLength="6" maxLength="128" onChange={(event) => { setPassword(event.target.value); setError(""); }} /></label>
            {error && <p className="vault-error" role="alert">{error}</p>}
            <button type="submit" disabled={busy === "unlock" || password.length < 6}>{busy === "unlock" ? <SpinnerGap className="spin" size={15} /> : <LockKey size={15} />}{tr(busy === "unlock" ? "Unlocking…" : "Unlock Vault")}</button>
          </form>
        ) : (
          <div className="vault-unlock vault-setup">
            <span className="vault-unlock__icon"><LockKey size={29} weight="light" /></span>
            <h3>{tr("Set up your Vault")}</h3>
            <p>{tr("Create a password in profile preferences before hiding sensitive garments or generated photos.")}</p>
            <button type="button" onClick={onSetUpPassword}><Key size={15} />{tr("Create Vault password")}</button>
          </div>
        )}
        {preview && (
          <div className="vault-preview" role="dialog" aria-modal="true" aria-label={preview.name} onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}>
            <OptimizedImage src={preview.image} alt={preview.name} sizes="90vw" priority />
            <button type="button" onClick={() => setPreview(null)} aria-label={tr("Close enlarged photo")}><X size={22} /></button>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileSizeEditor({ value, notes, onChange, onNotesChange }) {
  const normalized = normalizeSizeProfile(value);
  const system = SIZE_SYSTEMS.find((candidate) => candidate.id === normalized.system) || SIZE_SYSTEMS[0];
  const update = (field, nextValue) => onChange({ ...normalized, [field]: nextValue });

  return (
    <div className="profile-size-editor profile-field-wide">
      <ProfileHeightEditor value={normalized} onChange={onChange} />
      <div className="profile-size-controls">
        <label>
          <span>{tr("Sizing system")}</span>
          <LightSelect
            value={normalized.system}
            onChange={(systemId) => onChange({
              ...normalized,
              system: systemId,
              heightUnit: suggestedHeightUnit(systemId),
            })}
            options={SIZE_SYSTEMS.map((candidate) => ({ value: candidate.id, label: tr(candidate.label) }))}
            ariaLabel={tr("Sizing system")}
          />
        </label>
        <label>
          <span>{tr("Preferred fit")}</span>
          <LightSelect
            value={normalized.fit}
            onChange={(fit) => update("fit", fit)}
            options={FIT_OPTIONS.map((option) => ({ value: option.id, label: tr(option.label) }))}
            ariaLabel={tr("Preferred fit")}
          />
        </label>
      </div>
      <div className="profile-size-grid">
        {SIZE_FIELDS.map((field) => {
          return (
            <div className="profile-size-field" key={field.id}>
              <span>{tr(field.label)} <small>{tr("optional")}</small></span>
              <TagEditor
                tags={normalized[field.id]}
                onChange={(sizes) => update(field.id, sizes)}
                placeholder={system.examples[field.id]}
                inputLabel={tr("Add {category} size", { category: tr(field.label).toLocaleLowerCase(getLocale()) })}
                addLabel={tr("Add {category} size", { category: tr(field.label).toLocaleLowerCase(getLocale()) })}
                suggestions={system.suggestions[field.id]}
                emptyLabel={tr("No size selected yet.")}
              />
            </div>
          );
        })}
      </div>
      <label className="profile-size-notes">
        <span>{tr("Additional sizing notes")} <small>{tr("optional")}</small></span>
        <input
          maxLength="240"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder={tr("This brand runs small; prefer extra room at the shoulders")}
        />
      </label>
    </div>
  );
}

function ProfilePreferenceList({ label, help, values, onChange, placeholder, suggestions = [] }) {
  return (
    <fieldset className="profile-preference-list profile-field-wide">
      <legend>{label} <small>{tr("optional")}</small></legend>
      <p>{help}</p>
      <TagEditor
        tags={values}
        onChange={(nextValues) => onChange(normalizePreferenceList(nextValues))}
        placeholder={placeholder}
        inputLabel={tr("Add {label}", { label: label.toLocaleLowerCase(getLocale()) })}
        addLabel={tr("Add {label}", { label: label.toLocaleLowerCase(getLocale()) })}
        emptyLabel={tr("No {label} selected yet.", { label: label.toLocaleLowerCase(getLocale()) })}
        suggestions={suggestions}
      />
    </fieldset>
  );
}

function ProfileWardrobeDisplayEditor({ value, onChange }) {
  const display = normalizeWardrobeDisplayPreferences(value);
  const update = (next) => onChange(normalizeWardrobeDisplayPreferences({ ...display, ...next }));
  const toggleField = (field) => update({
    detailFields: display.detailFields.includes(field)
      ? display.detailFields.filter((existing) => existing !== field)
      : [...display.detailFields, field],
  });

  return (
    <>
      <div className="profile-display-section">
        <div className="profile-display-section__heading">
          <strong>{tr("Default wardrobe view")}</strong>
          <small>{tr("Choose a clean garment grid or show your selected product details.")}</small>
        </div>
        <div className="profile-display-modes" role="group" aria-label={tr("Default wardrobe view")}>
          {WARDROBE_SHOWCASE_MODES.map((mode) => (
            <button
              type="button"
              className={display.mode === mode.id ? "active" : ""}
              aria-pressed={display.mode === mode.id}
              onClick={() => update({ mode: mode.id })}
              key={mode.id}
            >
              {tr(mode.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="profile-display-section">
        <div className="profile-display-section__heading">
          <strong>{tr("Image style background")}</strong>
          <small>{tr("Choose no tile or a quiet color behind each garment.")}</small>
        </div>
        <div className="profile-background-options" role="radiogroup" aria-label={tr("Image style background")}>
          {WARDROBE_BACKGROUND_STYLES.map((style) => (
            <button
              className={`${display.backgroundStyle === style.id ? "active" : ""}${style.id === "none" ? " is-none" : ""}`}
              type="button"
              role="radio"
              aria-checked={display.backgroundStyle === style.id}
              aria-label={tr(style.label)}
              title={tr(style.label)}
              onClick={() => update({ backgroundStyle: style.id })}
              key={style.id}
            >
              <span style={style.color ? { backgroundColor: style.color } : undefined} />
            </button>
          ))}
        </div>
      </div>
      <div className="profile-display-section">
        <div className="profile-display-section__heading">
          <strong>{tr("Garment size")}</strong>
          <small>{tr("Choose how large garments appear in your wardrobe grid.")}</small>
        </div>
        <div className="profile-display-modes" role="group" aria-label={tr("Garment size")}>
          {GRID_DENSITIES.map((density) => (
            <button
              type="button"
              className={display.density === density.id ? "active" : ""}
              aria-pressed={display.density === density.id}
              onClick={() => update({ density: density.id })}
              key={density.id}
            >
              {tr(density.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="profile-display-section profile-display-fields">
        <div className="profile-display-section__heading">
          <strong>{tr("Details to show")}</strong>
          <small>{tr("Used only when the Details view is selected.")}</small>
        </div>
        <div>
          {WARDROBE_DETAIL_FIELDS.map((field) => (
            <label key={field.id}>
              <input
                type="checkbox"
                checked={display.detailFields.includes(field.id)}
                onChange={() => toggleField(field.id)}
              />
              <span>{tr(field.label)}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

const PROFILE_TABS = [
  { id: "basics", label: "Personal" },
  { id: "references", label: "References" },
  { id: "sizes", label: "Sizes & fit" },
  { id: "style", label: "Style" },
  { id: "display", label: "Wardrobe" },
  { id: "vault", label: "Vault" },
  { id: "ai", label: "AI & costs" },
];

function ProfileAiUsage({ user }) {
  const [usage, setUsage] = useState(null);
  const [status, setStatus] = useState(user ? "loading" : "new");
  const [reloadKey, setReloadKey] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setStatus("loading");
    profileApi(withWardrobeUser(`/api/users/${user.id}/ai-usage`, user.id))
      .then((result) => {
        if (!active) return;
        setUsage(result);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setUsage({ error: readableError(requestError) });
        setStatus("error");
      });
    return () => { active = false; };
  }, [user?.id, reloadKey]);

  if (!user) {
    return (
      <section className="profile-ai-usage profile-ai-usage--empty">
        <h3>{tr("AI spending")}</h3>
        <p>{tr("Save this person first. Their AI calls and costs will then be tracked separately.")}</p>
      </section>
    );
  }

  return (
    <section className="profile-ai-usage" aria-busy={status === "loading"}>
      <header>
        <div>
          <h3>{tr("AI spending")}</h3>
          <p>{tr("Exact OpenRouter cost returned with each call, stored privately with this wardrobe.")}</p>
        </div>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={status === "loading"}>
          {tr(status === "loading" ? "Loading…" : "Refresh")}
        </button>
      </header>
      {status === "error" ? (
        <p className="profile-ai-usage__error" role="alert">{usage?.error || tr("The spending summary could not be loaded.")}</p>
      ) : status === "ready" ? (
        <>
          <div className="profile-ai-metrics">
            <article><span>{tr("Recorded spend")}</span><strong>{formatAiCost(usage.totalCost)}</strong><small>USD</small></article>
            <article><span>{tr("AI requests")}</span><strong>{usage.requestCount}</strong><small>{tr("for this person")}</small></article>
            <article><span>{tr("Without a price")}</span><strong>{usage.unpricedRequestCount}</strong><small>{tr("failed or direct-provider calls")}</small></article>
          </div>
          <div className="profile-ai-averages">
            <article>
              <span>{tr("Average per uploaded image")}</span>
              <strong>{formatAiCost(usage.averageCostPerUpload)}</strong>
              <small>{tr("{count} linked uploads", { count: usage.uploadCount || 0 })}</small>
            </article>
            <article>
              <span>{tr("Average per accepted garment")}</span>
              <strong>{formatAiCost(usage.averageCostPerGarment)}</strong>
              <small>{tr("{count} garments added or merged", { count: usage.acceptedGarmentCount || 0 })}</small>
            </article>
          </div>
          {!usage.requestCount ? (
            <p className="profile-ai-usage__empty">{tr("No AI calls have been recorded for this person yet. Tracking begins after this update.")}</p>
          ) : (
            <>
              <div className="profile-ai-breakdown">
                <div>
                  <h4>{tr("By task")}</h4>
                  {usage.byOperation.map((group) => (
                    <p key={group.id}>
                      <span>{tr(group.label)}<small>{tr(group.requests === 1 ? "{count} call" : "{count} calls", { count: group.requests })}</small></span>
                      <strong>{formatAiCost(group.cost)}</strong>
                    </p>
                  ))}
                </div>
                {usage.byWardrobe?.length > 1 && (
                  <div>
                    <h4>{tr("By wardrobe")}</h4>
                    {usage.byWardrobe.map((group) => (
                      <p key={group.id}>
                        <span>
                          {group.isOwn ? tr("Your wardrobe") : group.label}
                          <small>{tr(group.requests === 1 ? "{count} call" : "{count} calls", { count: group.requests })}</small>
                        </span>
                        <strong>{formatAiCost(group.cost)}</strong>
                      </p>
                    ))}
                  </div>
                )}
                <div>
                  <h4>{tr("By model")}</h4>
                  {usage.byModel.slice(0, 6).map((group) => (
                    <p key={group.id}>
                      <span title={group.label}>{group.label.split("/").at(-1)}<small>{tr(group.requests === 1 ? "{count} call" : "{count} calls", { count: group.requests })}</small></span>
                      <strong>{formatAiCost(group.cost)}</strong>
                    </p>
                  ))}
                </div>
              </div>
              <button
                className="profile-ai-details-toggle"
                type="button"
                onClick={() => setDetailsOpen(true)}
              >
                <span>
                  <strong>{tr("Open the AI activity log")}</strong>
                  <small>{tr("Every imported photo, modeled look, and trip plan with its own AI calls and costs.")}</small>
                </span>
                <ListBullets size={17} />
              </button>
              {detailsOpen && (
                <AiActivityLogDialog
                  user={user}
                  summary={usage}
                  onClose={() => setDetailsOpen(false)}
                />
              )}
            </>
          )}
        </>
      ) : (
        <div className="profile-ai-usage__skeleton" aria-hidden="true" />
      )}
    </section>
  );
}

const AI_ACTIVITY_ICONS = {
  import: ImageSquare,
  modeled: UserCircle,
  outfit: CoatHanger,
  planner: SuitcaseRolling,
  other: Sparkle,
};

const AI_OUTCOME_LABELS = {
  added: "Added",
  merged: "Merged",
  unselected: "Not selected",
  deleted: "Removed from import",
  failed: "Needs attention",
  generating: "Generating",
  modeling: "Creating modeled look",
  "duplicate-review": "Possible duplicate",
  identified: "Identified",
};

function AiActivityThumbnail({ image, title }) {
  if (!image) return null;
  return (
    <OptimizedImage
      className="ai-activity__thumbnail"
      src={image}
      alt={title}
      loading="lazy"
      decoding="async"
    />
  );
}

function AiActivityRequest({ request, fallbackName }) {
  return (
    <article>
      <span className={`profile-ai-request-status${request.completed ? " is-complete" : " is-failed"}`} aria-hidden="true" />
      <span>
        <strong>{tr(request.label)}</strong>
        <small>{request.itemName || fallbackName}</small>
      </span>
      <span title={request.model}>{request.model?.split("/").at(-1) || tr("Unknown model")}</span>
      <time dateTime={request.createdAt}>
        {formatDate(request.createdAt, { dateStyle: "short", timeStyle: "short" })}
      </time>
      <strong>{formatAiCost(request.cost)}</strong>
    </article>
  );
}

function AiActivityDetails({ activity }) {
  if (activity.type === "import") {
    return (
      <div className="ai-activity__metrics">
        <span><strong>{activity.requestCount}</strong>{tr("AI calls")}</span>
        <span><strong>{activity.createdGarmentCount}</strong>{tr("New garments")}</span>
        <span><strong>{activity.duplicateCount}</strong>{tr("Possible duplicates")}</span>
        <span><strong>{activity.mergedCount}</strong>{tr("Merged")}</span>
        <span><strong>{activity.unselectedCount}</strong>{tr("Not selected")}</span>
      </div>
    );
  }
  if (activity.type === "planner") {
    return (
      <div className="ai-activity__metrics">
        <span><strong>{activity.requestCount}</strong>{tr("AI calls")}</span>
        <span><strong>{activity.outfitCount}</strong>{tr("Outfit ideas")}</span>
        <span><strong>{activity.outfitLookCount}</strong>{tr("Generated outfit images")}</span>
      </div>
    );
  }
  if (activity.type === "modeled" || activity.type === "outfit") {
    return (
      <div className="ai-activity__metrics">
        <span><strong>{activity.requestCount}</strong>{tr("AI calls")}</span>
        <span><strong>{activity.lookCount}</strong>{tr("Looks created")}</span>
      </div>
    );
  }
  return null;
}

function AiActivityCard({ activity, defaultOpen }) {
  const Icon = AI_ACTIVITY_ICONS[activity.type] || Sparkle;
  const subtitle = activity.type === "planner" && activity.location
    ? [activity.location, activity.startDate && activity.endDate
      ? `${formatDate(activity.startDate, { dateStyle: "medium" })} – ${formatDate(activity.endDate, { dateStyle: "medium" })}`
      : null].filter(Boolean).join(" · ")
    : formatDate(activity.createdAt, { dateStyle: "medium", timeStyle: "short" });

  return (
    <details className="ai-activity" open={defaultOpen}>
      <summary>
        <span className="ai-activity__identity">
          <span className={`ai-activity__mark is-${activity.type}`}>
            {activity.image
              ? <AiActivityThumbnail image={activity.image} title={activity.title} />
              : <Icon size={19} weight="light" aria-hidden="true" />}
          </span>
          <span className="ai-activity__naming">
            <small>{tr(activity.label)}</small>
            <strong>{activity.title}</strong>
            <small>{subtitle}</small>
          </span>
        </span>
        <span className="ai-activity__totals">
          <small>{tr(activity.requestCount === 1 ? "{count} call" : "{count} calls", { count: activity.requestCount })}</small>
          <strong>{formatAiCost(activity.totalCost)}</strong>
          <CaretDown size={15} aria-hidden="true" />
        </span>
      </summary>
      <div className="ai-activity__body">
        <AiActivityDetails activity={activity} />
        {!!activity.previews?.length && (
          <div className="ai-activity__previews">
            {activity.previews.map((preview) => (
              <figure key={`${preview.kind}-${preview.id}`} className={`ai-activity__preview is-${preview.kind}`}>
                <OptimizedImage
                  className="ai-activity__preview-image"
                  src={preview.image}
                  alt={preview.label}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>
                  <small>{tr(preview.kind === "source" ? "Source" : "Generated")}</small>
                  <span title={preview.label}>{tr(preview.label)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {!!activity.items?.length && (
          <div className="profile-ai-outcomes">
            <h5>{tr("Garment outcomes")}</h5>
            {activity.items.map((item) => (
              <p key={item.jobId || item.garmentId || item.name}>
                <span className="ai-activity__outcome-name">
                  {item.image && <AiActivityThumbnail image={item.image} title={item.name} />}
                  <span>{item.name}</span>
                </span>
                <strong>{tr(AI_OUTCOME_LABELS[item.outcome] || "In progress")}</strong>
              </p>
            ))}
          </div>
        )}
        <div className="profile-ai-requests">
          <h5>{tr("AI calls")}</h5>
          {activity.requests?.length ? activity.requests.map((request) => (
            <AiActivityRequest key={request.id} request={request} fallbackName={activity.title} />
          )) : (
            <p className="profile-ai-drilldown__note">{tr("No AI request is linked to this activity yet.")}</p>
          )}
        </div>
      </div>
    </details>
  );
}

function AiActivityLogDialog({ user, summary, onClose }) {
  const [activities, setActivities] = useState(summary.activities || []);
  const [nextOffset, setNextOffset] = useState(summary.nextOffset ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const closeButtonRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => { closeButtonRef.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loading) return;
    setLoading(true);
    try {
      const page = await profileApi(withWardrobeUser(
        `/api/users/${user.id}/ai-usage/activities?offset=${nextOffset}&limit=20`,
        user.id,
      ));
      setActivities((current) => {
        const seen = new Set(current.map((activity) => activity.id));
        return [...current, ...(page.activities || []).filter((activity) => !seen.has(activity.id))];
      });
      setNextOffset(page.nextOffset ?? null);
      setError(null);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setLoading(false);
    }
  }, [nextOffset, loading, user.id]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || nextOffset === null) return undefined;
    // Fetch the next page slightly before the list runs out. This also covers the
    // case where the first page is shorter than the dialog and never scrolls.
    const nearEnd = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 260;
    const check = () => { if (nearEnd()) void loadMore(); };
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
  }, [loadMore, nextOffset]);

  const total = summary.activityCount ?? activities.length;

  return (
    <div
      className="source-photo-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="ai-activity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-activity-title"
      >
        <header className="ai-activity-dialog__header">
          <div>
            <p>{tr("AI activity")}</p>
            <h2 id="ai-activity-title">{tr("Every AI request for {name}", { name: user.name })}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="source-photo-dialog__close"
            type="button"
            onClick={onClose}
            aria-label={tr("Close the AI activity log")}
          >
            <X size={23} weight="light" aria-hidden="true" />
          </button>
        </header>
        <div className="ai-activity-dialog__summary">
          <article><span>{tr("Recorded spend")}</span><strong>{formatAiCost(summary.totalCost)}</strong><small>USD</small></article>
          <article><span>{tr("AI requests")}</span><strong>{summary.requestCount}</strong><small>{tr("for this person")}</small></article>
          <article><span>{tr("Activities")}</span><strong>{total}</strong><small>{tr("imports, looks, and plans")}</small></article>
          <article><span>{tr("Average per accepted garment")}</span><strong>{formatAiCost(summary.averageCostPerGarment)}</strong><small>{tr("{count} garments added or merged", { count: summary.acceptedGarmentCount || 0 })}</small></article>
        </div>
        <div className="ai-activity-dialog__body" ref={scrollRef}>
          {!activities.length ? (
            <p className="profile-ai-drilldown__note">
              {tr("No AI activity has been recorded for this person yet.")}
            </p>
          ) : (
            activities.map((activity, index) => (
              <AiActivityCard key={activity.id} activity={activity} defaultOpen={index === 0} />
            ))
          )}
          {error && <p className="profile-ai-usage__error" role="alert">{error}</p>}
          {nextOffset !== null && (
            <div className="ai-activity-dialog__more">
              {loading ? (
                <span className="ai-activity-dialog__loading">
                  <SpinnerGap size={17} aria-hidden="true" />
                  {tr("Loading more activity…")}
                </span>
              ) : (
                <button type="button" onClick={() => void loadMore()}>{tr("Load more")}</button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileApiKeyEditor({ user, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const stored = Boolean(user?.hasOpenRouterKey);
  const pending = typeof value === "string";

  return (
    <section className="profile-api-key">
      <div className="profile-tab-intro">
        <div>
          <h3>{tr("Your OpenRouter key")}</h3>
          <p>{tr("OpenRouter is an external service that gives Wardrobe access to the AI models that identify garments in uploaded photos and create garment and modeled images. Your API key connects those requests to your OpenRouter account and credit.")}</p>
        </div>
        <span className={stored && !pending ? "is-set" : ""}>
          {stored && !pending
            ? <><Check size={14} weight="bold" /> {user.openRouterKeyHint}</>
            : <><WarningCircle size={14} /> {tr("Not set")}</>}
        </span>
      </div>
      <ol className="profile-api-key__steps">
        <li>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer noopener">
            {tr("Open openrouter.ai/keys")}
          </a>
          <small>{tr("Opens in a new tab.")}</small>
        </li>
        <li>{tr("Sign in with your own OpenRouter account.")}</li>
        <li>{tr("Create a new API key and copy it.")}</li>
        <li>
          <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer noopener">
            {tr("Add credits to your OpenRouter account.")}
          </a>
          <small>{tr("Garment identification and image generation require available credit.")}</small>
        </li>
      </ol>
      {stored && !editing && !pending ? (
        <div className="profile-api-key__stored">
          <span>{tr("A key is saved for this wardrobe.")}</span>
          <button type="button" onClick={() => { setEditing(true); onChange(""); }}>{tr("Replace key")}</button>
        </div>
      ) : (
        <label className="profile-api-key__field">
          <span>{tr("API key")}</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck="false"
            placeholder="sk-or-v1-…"
            value={pending ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
          <small>{tr("Stored on the server only and never shown again after saving.")}</small>
        </label>
      )}
      {(editing || pending) && stored && (
        <button
          className="profile-api-key__cancel"
          type="button"
          onClick={() => { setEditing(false); onChange(undefined); }}
        >
          {tr("Keep the saved key")}
        </button>
      )}
      <p className="profile-api-key__note">
        {tr("Until you add a key, requests use the server's shared key.")}
      </p>
    </section>
  );
}

function OpenRouterKeyDialog({ busy, error, saved, onClose, onSave }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);
  const doneButtonRef = useRef(null);

  useEffect(() => {
    (saved ? doneButtonRef : inputRef).current?.focus({ preventScroll: true });
  }, [saved]);

  const keepFocus = (event) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled)")];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="openrouter-key-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <form
        className="openrouter-key-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="openrouter-key-title"
        aria-describedby="openrouter-key-description"
        onKeyDown={keepFocus}
        onSubmit={(event) => {
          event.preventDefault();
          if (isValidOpenRouterKey(value) && !busy) onSave(value.trim());
        }}
      >
        <header>
          <div>
            <p>{tr("AI model setup")}</p>
            <h2 id="openrouter-key-title">{tr(saved ? "Your key is ready" : "Add your OpenRouter key")}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={tr("Close OpenRouter setup")}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {saved ? (
          <div className="openrouter-key-dialog__success">
            <span><Check size={23} weight="bold" aria-hidden="true" /></span>
            <h3>{tr("OpenRouter key saved")}</h3>
            <p>{tr("Close this window and try your image generation again.")}</p>
          </div>
        ) : (
          <div className="openrouter-key-dialog__body">
            <div className="openrouter-key-dialog__intro">
              <span><Key size={21} weight="light" aria-hidden="true" /></span>
              <p id="openrouter-key-description">
                {tr("OpenRouter is an external service that gives Wardrobe access to the AI models that identify garments in uploaded photos and create garment and modeled images. Add your API key to connect those requests to your OpenRouter account and credit.")}
              </p>
            </div>

            <ol className="openrouter-key-dialog__steps">
              <li>
                <span>{tr("Open your OpenRouter API keys page.")}</span>
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer noopener">
                  {tr("Open openrouter.ai/keys")}
                  <ArrowSquareOut size={13} aria-hidden="true" />
                </a>
              </li>
              <li>{tr("Sign in or create an OpenRouter account.")}</li>
              <li>{tr("Choose Create key, give it a name such as Wardrobe, and copy the complete key.")}</li>
              <li>
                <span>{tr("Add credits before using Wardrobe's AI features.")}</span>
                <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer noopener">
                  {tr("Open credits")}
                  <ArrowSquareOut size={13} aria-hidden="true" />
                </a>
              </li>
            </ol>

            <div className="openrouter-key-dialog__field">
              <label htmlFor="openrouter-key-input">{tr("Paste your API key")}</label>
              <span className="openrouter-key-dialog__input">
                <input
                  id="openrouter-key-input"
                  ref={inputRef}
                  type={visible ? "text" : "password"}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="sk-or-v1-…"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  aria-describedby="openrouter-key-format"
                />
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  aria-label={tr(visible ? "Hide API key" : "Show API key")}
                >
                  {visible ? <EyeSlash size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </span>
              <small id="openrouter-key-format">{tr("The complete key begins with sk-or-. Paste it exactly as OpenRouter shows it.")}</small>
            </div>

            <p className="openrouter-key-dialog__privacy">
              <LockKey size={14} aria-hidden="true" />
              {tr("Saved only on the Wardrobe server. It is never included in your photos, prompts, or browser storage.")}
            </p>
            {error && <p className="openrouter-key-dialog__error" role="alert">{error}</p>}
          </div>
        )}

        <footer>
          {saved ? (
            <button ref={doneButtonRef} className="primary-button" type="button" onClick={onClose}>{tr("Done")}</button>
          ) : (
            <>
              <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>{tr("Not now")}</button>
              <button className="primary-button" type="submit" disabled={!isValidOpenRouterKey(value) || busy}>
                {busy ? <SpinnerGap className="openrouter-key-dialog__spinner" size={15} aria-hidden="true" /> : <Check size={15} weight="bold" aria-hidden="true" />}
                {tr(busy ? "Saving key…" : "Save API key")}
              </button>
            </>
          )}
        </footer>
      </form>
    </div>
  );
}

function ProfileAiEditor({ value, user, onChange, apiKey, onApiKeyChange }) {
  const preferences = normalizeAiPreferences(value);
  const update = (taskId, model) => onChange(normalizeAiPreferences({ ...preferences, [taskId]: model }));

  return (
    <div className="profile-ai-editor">
      <ProfileApiKeyEditor user={user} value={apiKey} onChange={onApiKeyChange} />
      <div className="profile-tab-intro">
        <div>
          <h3>{tr("Choose a model for each job")}</h3>
          <p>{tr("Choose the balance of quality, privacy, and price you prefer. Leave a task on Recommended to use the app’s current choice.")}</p>
        </div>
        <span><Sparkle size={15} weight="fill" /> {tr("{count} AI tasks", { count: AI_TASKS.length })}</span>
      </div>
      <div className="profile-ai-task-list">
        {AI_TASKS.map((task) => {
          const selectedOption = task.options.find((option) => option.id === preferences[task.id]);
          return (
            <article className="profile-ai-task" key={task.id}>
              <div>
                <h3>{tr(task.label)}</h3>
                <p>{tr(task.description)}</p>
              </div>
              <div className="profile-ai-model-field">
                <span>{tr("Preferred model")}</span>
                <LightSelect
                  value={preferences[task.id]}
                  onChange={(model) => update(task.id, model)}
                  options={[
                    { value: "", label: tr("Recommended") },
                    ...task.options.map((option) => ({
                      value: option.id,
                      label: `${option.label} · ${tr(option.badge)}`,
                      meta: option.pricing,
                      keywords: `${option.id} ${option.badge} ${option.pricing}`,
                    })),
                  ]}
                  ariaLabel={`${tr(task.label)} · ${tr("Preferred model")}`}
                  className="profile-ai-model-select"
                />
              </div>
              <aside className={selectedOption ? "" : "is-default"}>
                <strong>{tr(selectedOption?.badge || "Recommended")}</strong>
                <span>
                  {selectedOption?.pricing && <small className="profile-ai-selected-price">{selectedOption.pricing}</small>}
                  {tr(selectedOption?.note || "Uses the app’s current recommended choice for this task.")}
                </span>
                {selectedOption?.zeroDataRetention === false && (
                  <InfoTooltip className="profile-zdr-help" label={tr("What zero data retention means")}>
                    {tr("Zero data retention means the AI provider processes your request without storing the prompt or images after it is completed. Without this protection, the provider may keep your images or request data according to its own policy.")}
                  </InfoTooltip>
                )}
              </aside>
            </article>
          );
        })}
      </div>
      <p className="profile-ai-local-note">
        {tr("Sorting, filters, color previews, thumbnails, and image compression happen locally and do not call an AI model. Most AI choices are set not to retain your data; the cheapest clean-garment option is clearly marked because it does not offer that protection.")}
      </p>
      <ProfileAiUsage user={user} />
    </div>
  );
}

function ProfileEditor({ user, busy, error, canManageAccount, initialTab = "basics", onClose, onSave, onStartTutorial }) {
  const isNew = !user;
  const accountEditable = canManageAccount && (isNew || user?.accountStatus === "prepared");
  const originalLanguageRef = useRef(user?.language || getLocale());
  const [activeTab, setActiveTab] = useState(initialTab);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState("");
  const [vaultPasswordError, setVaultPasswordError] = useState("");
  const [draft, setDraft] = useState({
    name: user?.name || "",
    accountEmail: user?.email || "",
    age: user?.age || "",
    city: user?.city || "",
    language: user?.language || getLocale(),
    fashionStyle: user?.fashionStyle || "",
    sizeProfile: normalizeSizeProfile(user?.sizeProfile),
    sizes: user?.sizes || "",
    preferredCurrency: normalizePurchaseCurrency(user?.preferredCurrency),
    preferredMaterials: normalizePreferenceList(user?.preferredMaterials),
    favoriteColors: normalizePreferenceList(user?.favoriteColors),
    preferredStores: Array.isArray(user?.preferredStores) ? user.preferredStores : [],
    preferences: user?.preferences || "",
    wardrobeDisplay: normalizeWardrobeDisplayPreferences(user?.wardrobeDisplay),
    aiPreferences: normalizeAiPreferences(user?.aiPreferences),
  });
  // undefined means "leave the stored key alone"; a string is a pending change.
  const [apiKeyDraft, setApiKeyDraft] = useState(undefined);
  const [files, setFiles] = useState([]);
  const [retainedReferenceIds, setRetainedReferenceIds] = useState(
    () => (user?.referenceImages || []).map((reference) => reference.id),
  );
  const [fileError, setFileError] = useState("");
  const [referencePreview, setReferencePreview] = useState(null);
  const referenceInputRef = useRef(null);
  const referencePreviewCloseRef = useRef(null);
  const referencePreviewTriggerRef = useRef(null);
  const previews = useMemo(() => files.map((file, index) => ({
    id: `new-${file.name}-${file.lastModified}-${file.size}-${index}`,
    name: file.name,
    url: URL.createObjectURL(file),
    file,
    isNew: true,
  })), [files]);
  const existingReferences = (user?.referenceImages || []).filter(
    (reference) => retainedReferenceIds.includes(reference.id),
  );
  const visibleReferences = [...existingReferences, ...previews];
  const remainingReferenceSlots = Math.max(0, 3 - visibleReferences.length);
  const referenceSlots = [
    ...visibleReferences,
    ...Array.from({ length: remainingReferenceSlots }, () => null),
  ];
  const referencesChanged = files.length > 0
    || retainedReferenceIds.length !== (user?.referenceImages || []).length;
  const [backgroundFiles, setBackgroundFiles] = useState([]);
  const [backgroundNames, setBackgroundNames] = useState({});
  const [retainedBackgroundIds, setRetainedBackgroundIds] = useState(
    () => (user?.backgroundReferences || []).map((reference) => reference.id),
  );
  const [backgroundError, setBackgroundError] = useState("");
  const [pendingBackgroundRemovalId, setPendingBackgroundRemovalId] = useState(null);
  const backgroundInputRef = useRef(null);
  const backgroundPreviews = useMemo(() => backgroundFiles.map((entry) => ({
    id: entry.id,
    url: URL.createObjectURL(entry.file),
    file: entry.file,
    isNew: true,
  })), [backgroundFiles]);
  const visibleBackgrounds = [
    ...(user?.backgroundReferences || []).filter((reference) => retainedBackgroundIds.includes(reference.id)),
    ...backgroundPreviews.map((reference) => ({
      ...reference,
      name: backgroundNames[reference.id] || "",
    })),
  ];
  const remainingBackgroundSlots = Math.max(0, 8 - visibleBackgrounds.length);
  const backgroundsChanged = backgroundFiles.length > 0
    || retainedBackgroundIds.length !== (user?.backgroundReferences || []).length;

  const closeEditor = () => {
    setLocale(originalLanguageRef.current);
    onClose();
  };

  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);
  useEffect(() => () => backgroundPreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [backgroundPreviews]);

  useEffect(() => {
    if (!referencePreview) return undefined;
    const frame = requestAnimationFrame(() => referencePreviewCloseRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [referencePreview]);

  const openReferencePreview = (reference, index, trigger) => {
    referencePreviewTriggerRef.current = trigger;
    setReferencePreview({
      url: reference.url,
      number: index + 1,
    });
  };

  const closeReferencePreview = () => {
    setReferencePreview(null);
    requestAnimationFrame(() => referencePreviewTriggerRef.current?.focus());
  };

  const chooseReferences = (event) => {
    const selected = [...event.target.files].filter((file) => file.type.startsWith("image/"));
    if (selected.length > remainingReferenceSlots) {
      setFileError(tr(remainingReferenceSlots === 1 ? "Only {count} more photo fits in this profile." : "Only {count} more photos fit in this profile.", { count: remainingReferenceSlots }));
      setFiles((current) => [...current, ...selected.slice(0, remainingReferenceSlots)]);
    } else {
      setFileError("");
      setFiles((current) => [...current, ...selected]);
    }
    event.target.value = "";
  };

  const removeReference = (reference) => {
    if (reference.isNew) {
      setFiles((current) => current.filter((file) => file !== reference.file));
    } else {
      setRetainedReferenceIds((current) => current.filter((id) => id !== reference.id));
    }
    setFileError("");
  };

  const chooseBackgrounds = (event) => {
    const selected = [...event.target.files].filter((file) => file.type.startsWith("image/"));
    const accepted = selected.slice(0, remainingBackgroundSlots);
    const entries = accepted.map((file) => ({
      id: `new-background-${globalThis.crypto?.randomUUID?.() || `${file.name}-${file.lastModified}-${Math.random()}`}`,
      file,
    }));
    setBackgroundFiles((current) => [...current, ...entries]);
    setBackgroundNames((current) => ({
      ...current,
      ...Object.fromEntries(entries.map((entry) => [entry.id, ""])),
    }));
    setBackgroundError(selected.length > accepted.length
      ? tr("Only {count} more background photos fit in this profile.", { count: remainingBackgroundSlots })
      : "");
    event.target.value = "";
  };

  const removeBackground = (reference) => {
    if (pendingBackgroundRemovalId !== reference.id) {
      setPendingBackgroundRemovalId(reference.id);
      return;
    }
    if (reference.isNew) {
      setBackgroundFiles((current) => current.filter((entry) => entry.id !== reference.id));
      setBackgroundNames((current) => {
        const next = { ...current };
        delete next[reference.id];
        return next;
      });
    } else {
      setRetainedBackgroundIds((current) => current.filter((id) => id !== reference.id));
    }
    setPendingBackgroundRemovalId(null);
    setBackgroundError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (vaultPassword && vaultPassword.length < 6) {
      setActiveTab("vault");
      setVaultPasswordError(tr("Use at least 6 characters for the Vault password."));
      return;
    }
    if (vaultPassword && vaultPassword !== vaultPasswordConfirm) {
      setActiveTab("vault");
      setVaultPasswordError(tr("The Vault passwords do not match."));
      return;
    }
    if (!isNew && referencesChanged && !visibleReferences.length) {
      setActiveTab("basics");
      setFileError(tr("Add at least one reference photo."));
      return;
    }
    if (backgroundFiles.some((entry) => !backgroundNames[entry.id]?.trim())) {
      setActiveTab("references");
      setBackgroundError(tr("Give each background a name before saving."));
      return;
    }
    const referenceImages = files.length
      ? await Promise.all(files.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })))
      : undefined;
    const referenceUpdate = isNew || referencesChanged
      ? { referenceImageIds: retainedReferenceIds, referenceImages: referenceImages || [] }
      : {};
    const backgroundReferenceImages = backgroundFiles.length
      ? await Promise.all(backgroundFiles.map(async (entry) => ({
          name: backgroundNames[entry.id].trim(),
          dataUrl: await fileToDataUrl(entry.file),
        })))
      : undefined;
    const backgroundUpdate = backgroundsChanged
      ? {
          backgroundReferenceImageIds: retainedBackgroundIds,
          backgroundReferenceImages: backgroundReferenceImages || [],
        }
      : {};
    await onSave({
      ...draft,
      age: draft.age === "" ? null : Number(draft.age),
      ...(!accountEditable ? { accountEmail: undefined } : {}),
      ...referenceUpdate,
      ...backgroundUpdate,
      // Omitted entirely unless the person actually typed a new key, so saving
      // any other tab never disturbs the stored one.
      ...(typeof apiKeyDraft === "string" ? { openRouterApiKey: apiKeyDraft.trim() } : {}),
      ...(vaultPassword ? { vaultPassword } : {}),
    });
  };

  return (
    <div className="profile-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && closeEditor()}>
      <form className="profile-editor" onSubmit={submit}>
        <header>
          <div>
            <p>{tr(isNew ? "New wardrobe" : "Personal profile")}</p>
            <h2>{isNew ? tr("Add a person") : tr("Edit {name}", { name: user.name })}</h2>
          </div>
          <button type="button" onClick={closeEditor} disabled={busy} aria-label={tr("Close profile editor")}><X size={20} /></button>
        </header>

        <nav className="profile-editor__tabs" role="tablist" aria-label={tr("Profile sections")}>
          {PROFILE_TABS.map((tab) => (
            <button
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              aria-controls={`profile-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
              key={tab.id}
            >
              {tr(tab.label)}
            </button>
          ))}
        </nav>

        <div className="profile-editor__body">
          {error && <p className="profile-save-error" role="alert">{error}</p>}
          {activeTab === "basics" && (
            <section className="profile-tab-panel profile-basics-grid" role="tabpanel" id="profile-panel-basics" aria-labelledby="profile-tab-basics">
              {canManageAccount && (
                <div className="profile-account-card">
                  <div className="profile-account-card__icon" aria-hidden="true"><GoogleLogo size={19} /></div>
                  <label>
                    <span>{tr("Google account email")}</span>
                    <input
                      type="email"
                      required={isNew}
                      readOnly={!accountEditable}
                      maxLength="254"
                      value={draft.accountEmail}
                      onChange={(event) => setDraft({ ...draft, accountEmail: event.target.value })}
                      placeholder="name@gmail.com"
                      autoComplete="off"
                    />
                  </label>
                  <div className="profile-account-card__copy">
                    <strong>{tr(user?.accountStatus === "connected" ? "Connected to Google" : "Prepared for first sign-in")}</strong>
                    <small>{tr(isNew
                      ? "Enter the exact Google email this wardrobe will belong to. You can add clothes and photos now; the matching person will receive this wardrobe when they first sign in."
                      : user?.accountStatus === "prepared"
                        ? "This wardrobe is ready to use now. You may correct the email until its owner signs in for the first time."
                        : "This wardrobe has already been claimed. Its Google email cannot be reassigned here.")}</small>
                  </div>
                </div>
              )}
              <div className="profile-reference-field">
                <div className="profile-reference-field__heading">
                  <div className="profile-reference-field__title">
                    <span>{tr("Reference photos")}</span>
                    <InfoTooltip className="profile-reference-help" label={tr("About reference photos")}>
                      {tr("Reference photos work best as clean identity portraits. Add one to three photos of only you: ideally a front view, a three-quarter left view, and a three-quarter right view, each at least 1024×1024 with even lighting and your face filling roughly 30–50% of the frame. Avoid sunglasses, hands or hair covering the face, strong expressions, and busy lifestyle shots. Your reference clothes and backgrounds are ignored, and your hairstyle may change in generated looks. Changes apply to future modeled looks only.")}
                    </InfoTooltip>
                  </div>
                  <small>{tr("{count}/3 added", { count: visibleReferences.length })}</small>
                </div>
                <div className="profile-reference-grid">
                  {referenceSlots.map((reference, index) => (
                    reference ? (
                      <div className="profile-reference-photo" key={reference.id || reference.url}>
                        <button
                          className="profile-reference-photo__preview"
                          type="button"
                          onClick={(event) => openReferencePreview(reference, index, event.currentTarget)}
                          aria-label={tr("Open reference photo {number}", { number: index + 1 })}
                          title={tr("Open reference photo")}
                        >
                          <img src={reference.url} alt={tr("Reference {number}", { number: index + 1 })} />
                        </button>
                        <button
                          className="profile-reference-photo__remove"
                          type="button"
                          onClick={() => removeReference(reference)}
                          aria-label={tr("Remove reference photo {number}", { number: index + 1 })}
                          title={tr("Remove photo")}
                        >
                          <X size={12} weight="bold" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="profile-reference-placeholder"
                        type="button"
                        onClick={() => referenceInputRef.current?.click()}
                        disabled={busy}
                        aria-label={tr("Add reference photo {number} of 3", { number: index + 1 })}
                        title={tr("Add reference photo")}
                        key={`empty-reference-${index}`}
                      >
                        <span><Plus size={18} weight="regular" aria-hidden="true" /></span>
                      </button>
                    )
                  ))}
                </div>
                <input
                  className="profile-reference-input"
                  ref={referenceInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={busy || remainingReferenceSlots === 0}
                  onChange={chooseReferences}
                />
                {fileError && <small className="profile-field-error">{fileError}</small>}
              </div>

              <div className="profile-fields profile-basics-fields">
                <label data-tutorial="profile-name"><span>{tr("Name")}</span><input required maxLength="80" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Rafael" /></label>
                <label><span>{tr("Age")} <small>{tr("optional")}</small></span><input type="number" min="1" max="120" value={draft.age} onChange={(event) => setDraft({ ...draft, age: event.target.value })} placeholder="32" /></label>
                <label className="profile-field-wide profile-city-field">
                  <span>{tr("City")} <small>{tr("optional")}</small></span>
                  <LightTypeahead
                    maxLength="120"
                    value={draft.city}
                    onChange={(city) => setDraft({ ...draft, city })}
                    options={CITY_SUGGESTIONS}
                    onSelect={(city) => setDraft({ ...draft, city })}
                    ariaLabel={tr("City")}
                    placeholder={tr("Lisbon, Portugal")}
                  />
                  <small className="profile-field-help">{tr("Choose a suggestion or keep any city name you type.")}</small>
                </label>
                <label className="profile-field-wide profile-currency-field">
                  <span>{tr("Preferred currency")}</span>
                  <LightSelect
                    value={draft.preferredCurrency}
                    onChange={(preferredCurrency) => setDraft({ ...draft, preferredCurrency })}
                    options={CURRENCY_OPTIONS.map((currency) => ({ value: currency.id, label: currency.label }))}
                    ariaLabel={tr("Preferred currency")}
                  />
                </label>
                <label className="profile-field-wide profile-language-field">
                  <span>{tr("Language")}</span>
                  <LightSelect
                    value={draft.language}
                    onChange={(language) => {
                      setDraft({ ...draft, language });
                      setLocale(language);
                    }}
                    options={LANGUAGE_OPTIONS.map((language) => ({ value: language.id, label: tr(language.label) }))}
                    ariaLabel={tr("Language")}
                  />
                </label>
              </div>
              {!isNew && onStartTutorial && (
                <div className="profile-tutorial-card">
                  <span><Sparkle size={17} weight="regular" /></span>
                  <div>
                    <strong>{tr("Wardrobe walkthrough")}</strong>
                    <small>{tr("Replay the guided introduction to importing clothes, garment details, plans, and Outfit Studio.")}</small>
                  </div>
                  <button type="button" onClick={onStartTutorial}>{tr("Start walkthrough")}</button>
                </div>
              )}
            </section>
          )}
          {activeTab === "references" && (
            <section className="profile-tab-panel profile-reference-library" role="tabpanel" id="profile-panel-references" aria-labelledby="profile-tab-references">
              <div className="profile-tab-intro">
                <div>
                  <h3>{tr("Reference image library")}</h3>
                  <p>{tr("Keep reusable visual references here. Backgrounds can be chosen from the modeled-look composer for garments, outfits, and plans.")}</p>
                </div>
                <span><ImageSquare size={16} /> {tr("{count}/8 backgrounds", { count: visibleBackgrounds.length })}</span>
              </div>
              <section className="profile-reference-overview">
                <div>
                  <span>{tr("Model identity")}</span>
                  <h4>{tr("Photos used to preserve your identity")}</h4>
                  <p>{tr("These portraits identify the person in generated looks. They stay separate from scene and background references.")}</p>
                </div>
                <div className="profile-reference-overview__photos">
                  {visibleReferences.map((reference) => <img key={reference.id || reference.url} src={reference.avatarUrl || reference.url} alt="" />)}
                </div>
                <button type="button" onClick={() => setActiveTab("basics")}>{tr("Edit identity photos")}</button>
              </section>
              <section className="profile-background-library">
                <header>
                  <div>
                    <span>{tr("Backgrounds")}</span>
                    <h4>{tr("Your places and environments")}</h4>
                    <p>{tr("Add rooms, gardens, streets, venues, or other places you want to reuse. Wardrobe treats these as scene references, never as identity photos.")}</p>
                  </div>
                  <button type="button" onClick={() => backgroundInputRef.current?.click()} disabled={busy || remainingBackgroundSlots === 0}>
                    <Plus size={14} />{tr("Add backgrounds")}
                  </button>
                </header>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={busy || remainingBackgroundSlots === 0}
                  onChange={chooseBackgrounds}
                />
                {!!visibleBackgrounds.length ? (
                  <div className="profile-background-grid">
                    {visibleBackgrounds.map((reference) => {
                      const pendingRemoval = pendingBackgroundRemovalId === reference.id;
                      return (
                        <article key={reference.id}>
                          <img src={reference.previewUrl || reference.url} alt={reference.name || tr("New background")} />
                          <div>
                            {reference.isNew ? (
                              <label>
                                <span>{tr("Background name")}</span>
                                <input
                                  type="text"
                                  value={reference.name}
                                  maxLength="120"
                                  placeholder={tr("For example, back garden")}
                                  aria-label={tr("Background name")}
                                  onChange={(event) => {
                                    setBackgroundNames((current) => ({ ...current, [reference.id]: event.target.value }));
                                    if (event.target.value.trim()) setBackgroundError("");
                                  }}
                                />
                              </label>
                            ) : <strong>{reference.name}</strong>}
                            <small>{tr(reference.isNew ? "Added when you save" : "Available in every modeled-look composer")}</small>
                          </div>
                          <button
                            type="button"
                            className={pendingRemoval ? "is-confirming" : ""}
                            onClick={() => removeBackground(reference)}
                            aria-label={pendingRemoval
                              ? tr("Confirm removing {name}", { name: reference.name || tr("New background") })
                              : tr("Remove {name}", { name: reference.name || tr("New background") })}
                          >
                            {pendingRemoval ? <Check size={13} weight="bold" /> : <Trash size={13} />}
                            {pendingRemoval && <span>{tr("Confirm")}</span>}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <button className="profile-background-empty" type="button" onClick={() => backgroundInputRef.current?.click()} disabled={busy}>
                    <ImageSquare size={26} weight="light" />
                    <strong>{tr("Add your first background")}</strong>
                    <span>{tr("For example, your living room, garden, a church square, or a favorite street.")}</span>
                  </button>
                )}
                {backgroundError && <small className="profile-field-error">{backgroundError}</small>}
              </section>
            </section>
          )}
          {activeTab === "sizes" && (
            <section className="profile-tab-panel" role="tabpanel" id="profile-panel-sizes" aria-labelledby="profile-tab-sizes">
              <ProfileSizeEditor
                value={draft.sizeProfile}
                notes={draft.sizes}
                onChange={(sizeProfile) => setDraft({ ...draft, sizeProfile })}
                onNotesChange={(sizes) => setDraft({ ...draft, sizes })}
              />
            </section>
          )}
          {activeTab === "style" && (
            <section className="profile-tab-panel profile-fields profile-style-fields" role="tabpanel" id="profile-panel-style" aria-labelledby="profile-tab-style">
              <label className="profile-field-wide"><span>{tr("Fashion style")}</span><input maxLength="240" value={draft.fashionStyle} onChange={(event) => setDraft({ ...draft, fashionStyle: event.target.value })} placeholder={tr("Minimal, relaxed tailoring, quiet colors")} /></label>
              <ProfilePreferenceList
                label={tr("Preferred materials")}
                help={tr("Materials you enjoy wearing or want prioritized in styling.")}
                values={draft.preferredMaterials}
                onChange={(preferredMaterials) => setDraft({ ...draft, preferredMaterials })}
                placeholder={tr("Linen, cotton, wool…")}
              />
              <ProfilePreferenceList
                label={tr("Favorite colors")}
                help={tr("Color names or families to favor in supporting pieces and suggestions.")}
                values={draft.favoriteColors}
                onChange={(favoriteColors) => setDraft({ ...draft, favoriteColors })}
                placeholder={tr("Olive, navy, cream…")}
              />
              <ProfilePreferenceList
                label={tr("Preferred stores")}
                help={tr("These stores appear first when you search for garments suggested by a wardrobe plan.")}
                values={draft.preferredStores}
                onChange={(preferredStores) => setDraft({ ...draft, preferredStores })}
                placeholder={tr("Zara, H&M, Mango…")}
                suggestions={STORE_OPTIONS.map((store) => store.label)}
              />
              <label className="profile-field-wide profile-other-preferences">
                <span>{tr("Other preferences")} <small>{tr("optional")}</small></span>
                <small className="profile-field-help">{tr("Used when generating modeled looks and trip or event plans. It does not affect photo analysis or clean garment cutouts.")}</small>
                <textarea rows="5" maxLength="1200" value={draft.preferences} onChange={(event) => setDraft({ ...draft, preferences: event.target.value })} placeholder={tr("Occasions, styling goals, modesty or sensory needs, preferred silhouettes, and anything to avoid.")} />
              </label>
            </section>
          )}
          {activeTab === "display" && (
            <section className="profile-tab-panel profile-display-panel" role="tabpanel" id="profile-panel-display" aria-labelledby="profile-tab-display">
              <ProfileWardrobeDisplayEditor
                value={draft.wardrobeDisplay}
                onChange={(wardrobeDisplay) => setDraft({ ...draft, wardrobeDisplay })}
              />
            </section>
          )}
          {activeTab === "vault" && (
            <section className="profile-tab-panel profile-vault-settings" role="tabpanel" id="profile-panel-vault" aria-labelledby="profile-tab-vault">
              <div className="profile-tab-intro">
                <div>
                  <h3>{tr("Protect your Vault")}</h3>
                  <p>{tr("Garments and generated photos moved to the Vault disappear from the wardrobe and Outfit Studio. This password is required every time the Vault is opened.")}</p>
                </div>
                <span><LockKey size={16} /> {tr(user?.hasVaultPassword ? "Password protected" : "Password not set")}</span>
              </div>
              <div className="profile-vault-card">
                <span className="profile-vault-card__icon"><LockKey size={22} weight="light" /></span>
                <div>
                  <strong>{tr(user?.hasVaultPassword ? "Change Vault password" : "Create a Vault password")}</strong>
                  <small>{tr(user?.hasVaultPassword
                    ? "Leave these fields empty to keep your current password."
                    : "Use at least 6 characters. The password is stored as a secure salted hash and cannot be recovered.")}</small>
                </div>
                <label>
                  <span>{tr(user?.hasVaultPassword ? "New password" : "Password")}</span>
                  <input
                    type="password"
                    value={vaultPassword}
                    minLength="6"
                    maxLength="128"
                    autoComplete="new-password"
                    placeholder={user?.hasVaultPassword ? "••••••••" : tr("At least 6 characters")}
                    onChange={(event) => { setVaultPassword(event.target.value); setVaultPasswordError(""); }}
                  />
                </label>
                <label>
                  <span>{tr("Confirm password")}</span>
                  <input
                    type="password"
                    value={vaultPasswordConfirm}
                    minLength="6"
                    maxLength="128"
                    autoComplete="new-password"
                    placeholder={user?.hasVaultPassword ? "••••••••" : tr("Repeat the password")}
                    onChange={(event) => { setVaultPasswordConfirm(event.target.value); setVaultPasswordError(""); }}
                  />
                </label>
                {vaultPasswordError && <p role="alert">{vaultPasswordError}</p>}
              </div>
            </section>
          )}
          {activeTab === "ai" && (
            <section className="profile-tab-panel" role="tabpanel" id="profile-panel-ai" aria-labelledby="profile-tab-ai">
              <ProfileAiEditor
                value={draft.aiPreferences}
                user={user}
                onChange={(aiPreferences) => setDraft({ ...draft, aiPreferences })}
                apiKey={apiKeyDraft}
                onApiKeyChange={setApiKeyDraft}
              />
            </section>
          )}
        </div>

        <footer>
          <button type="button" onClick={closeEditor} disabled={busy}>{tr("Cancel")}</button>
          <button className="profile-save" type="submit" disabled={busy || !draft.name.trim() || (isNew && !draft.accountEmail.trim())}><Check size={14} weight="bold" /> {tr(busy ? "Saving…" : isNew ? "Prepare wardrobe" : "Save profile")}</button>
        </footer>
      </form>
      {referencePreview && (
        <div
          className="profile-reference-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={tr("Reference photo {number}", { number: referencePreview.number })}
          onMouseDown={(event) => event.target === event.currentTarget && closeReferencePreview()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeReferencePreview();
            } else if (event.key === "Tab") {
              event.preventDefault();
              referencePreviewCloseRef.current?.focus();
            }
          }}
        >
          <img
            className="profile-reference-lightbox__image"
            src={referencePreview.url}
            alt={tr("Enlarged reference photo {number}", { number: referencePreview.number })}
          />
          <button
            className="profile-reference-lightbox__close"
            ref={referencePreviewCloseRef}
            type="button"
            onClick={closeReferencePreview}
            aria-label={tr("Close reference photo")}
          >
            <X size={22} weight="regular" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function FacetSection({ label, facetKey, options, selected, onToggle, colorGroups }) {
  if (!options.length) return null;
  return (
    <details className="filter-facet" open>
      <summary>
        <span>{label}</span>
        {!!selected.length && <small>{selected.length}</small>}
        <CaretDown size={13} weight="regular" aria-hidden="true" />
      </summary>
      <div className="filter-facet__options">
        {options.map((option) => {
          const value = facetKey === "colors" ? option.id : option.label;
          const color = colorGroups?.find((group) => group.id === option.id)?.tones?.[1];
          return (
            <label key={option.id}>
              <input
                type="checkbox"
                checked={selected.some((entry) => entry.toLocaleLowerCase() === value.toLocaleLowerCase())}
                onChange={() => onToggle(facetKey, value)}
              />
              {color && <i className="filter-color-swatch" style={{ backgroundColor: color }} aria-hidden="true" />}
              {facetKey === "brands" && <BrandIcon brand={option.label} size={14} />}
              <span>{facetKey === "colors" || facetKey === "seasons"
                ? tr(colorGroups?.find((group) => group.id === option.id)?.label || option.label)
                : option.label}</span>
              <small>{option.count}</small>
            </label>
          );
        })}
      </div>
    </details>
  );
}

function FilterRail({ open, filters, facets, typeCounts, onChange, onClear, onClose, onSaveView }) {
  const toggleFacet = (key, value) => {
    const selected = filters[key] || [];
    const exists = selected.some((entry) => entry.toLocaleLowerCase() === value.toLocaleLowerCase());
    onChange({
      ...filters,
      [key]: exists
        ? selected.filter((entry) => entry.toLocaleLowerCase() !== value.toLocaleLowerCase())
        : [...selected, value],
    });
  };
  const selectedCount = activeFilterCount(filters);
  return (
    <aside className={`filter-rail${open ? " is-open" : ""}`} aria-label={tr("Wardrobe filters")} aria-hidden={!open}>
      <div className="filter-rail__heading">
        <div>
          <span>{tr("Filters")}</span>
          <small>{selectedCount ? tr("{count} selected", { count: selectedCount }) : tr("Refine wardrobe")}</small>
        </div>
        <button type="button" onClick={onClose} aria-label={tr("Collapse filters")}>
          <CaretLeft size={18} weight="regular" aria-hidden="true" />
        </button>
      </div>
      <label className="wardrobe-search">
        <MagnifyingGlass size={17} weight="regular" aria-hidden="true" />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder={tr("Name, brand, or tag")}
          aria-label={tr("Search wardrobe")}
        />
      </label>
      <div className="filter-rail__actions">
        <button className="filter-save-view" type="button" onClick={onSaveView} disabled={!selectedCount}>
          <BookmarkSimple size={14} weight="regular" aria-hidden="true" />
          {tr("Save view")}
        </button>
        <button className="filter-clear" type="button" onClick={onClear} disabled={!selectedCount}>{tr("Clear filters")}</button>
      </div>
      <details className="filter-facet" open>
        <summary>
          <span>{tr("Category")}</span>
          {filters.type !== "all" && <small>1</small>}
          <CaretDown size={13} weight="regular" aria-hidden="true" />
        </summary>
        <div className="filter-facet__options">
          {TYPES.map((type) => (
            <label key={type.id}>
              <input
                type="radio"
                name="wardrobe-category"
                checked={filters.type === type.id}
                onChange={() => onChange({ ...filters, type: type.id })}
              />
              <span>{tr(type.label)}</span>
              <small>{typeCounts[type.id] || 0}</small>
            </label>
          ))}
        </div>
      </details>
      <FacetSection label={tr("Color")} facetKey="colors" options={facets.colors} selected={filters.colors} onToggle={toggleFacet} colorGroups={COLOR_GROUPS} />
      <FacetSection label={tr("Brand")} facetKey="brands" options={facets.brands} selected={filters.brands} onToggle={toggleFacet} />
      <FacetSection label={tr("Tags")} facetKey="tags" options={facets.tags} selected={filters.tags} onToggle={toggleFacet} />
      <FacetSection label={tr("Size")} facetKey="sizes" options={facets.sizes} selected={filters.sizes} onToggle={toggleFacet} />
      <FacetSection label={tr("Fit")} facetKey="fits" options={facets.fits} selected={filters.fits} onToggle={toggleFacet} />
      <FacetSection label={tr("Material")} facetKey="materials" options={facets.materials} selected={filters.materials} onToggle={toggleFacet} />
      <FacetSection label={tr("Season")} facetKey="seasons" options={facets.seasons} selected={filters.seasons} onToggle={toggleFacet} />
    </aside>
  );
}

function SavedViewDialog({ onClose, onSave }) {
  const [name, setName] = useState("");
  return (
    <div className="compact-dialog-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="compact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-view-dialog-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <header>
          <div>
            <p>{tr("Saved view")}</p>
            <h2 id="saved-view-dialog-title">{tr("Name this wardrobe view")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Close saved view dialog")}><X size={20} aria-hidden="true" /></button>
        </header>
        <label>
          <span>{tr("View name")}</span>
          <input autoFocus maxLength="48" value={name} onChange={(event) => setName(event.target.value)} placeholder={tr("Summer workwear")} />
        </label>
        <footer>
          <button type="button" onClick={onClose}>{tr("Cancel")}</button>
          <button className="primary" type="submit" disabled={!name.trim()}>
            <BookmarkSimple size={15} weight="regular" aria-hidden="true" />
            {tr("Save view")}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SavedViewDeleteDialog({ view, busy, onClose, onConfirm }) {
  const filters = normalizeWardrobeFilters(view.filters);
  const hasFilters = Boolean(filters.query || filters.type !== "all" || activeFilterCount(filters));
  const summary = [];
  if (filters.type !== "all") {
    summary.push([tr("Category"), tr(TYPE_MAP[filters.type]?.label || "All")]);
  }
  if (filters.query) summary.push([tr("Search"), filters.query]);
  [
    ["colors", "Color"],
    ["brands", "Brand"],
    ["tags", "Tags"],
    ["sizes", "Size"],
    ["fits", "Fit"],
    ["materials", "Material"],
    ["seasons", "Season"],
  ].forEach(([key, label]) => {
    if (!filters[key].length) return;
    const values = filters[key].map((value) => {
      if (key === "colors") return tr(COLOR_GROUPS.find((group) => group.id === value)?.label || value);
      if (key === "seasons") return tr(SEASON_OPTIONS.find((season) => season.id === value)?.label || value);
      return value;
    });
    summary.push([tr(label), values.join(", ")]);
  });
  summary.push([
    tr("Sort"),
    tr(SORT_MODES.find((mode) => mode.id === view.sortMode)?.label || "My order"),
  ]);
  summary.push([
    tr("Group by"),
    tr(GROUP_MODES.find((mode) => mode.id === view.groupMode)?.label || "No grouping"),
  ]);

  return (
    <div className="compact-dialog-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section
        className="compact-dialog saved-view-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-view-delete-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <div>
            <p>{tr("Saved view")}</p>
            <h2 id="saved-view-delete-title">{tr("Delete {name}?", { name: view.name })}</h2>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label={tr("Close saved view dialog")}><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="saved-view-delete-dialog__body">
          <p>{tr("This saved view will be removed. Your garments will not be affected.")}</p>
          <strong>{tr("Included filters")}</strong>
          {!hasFilters && <p className="saved-view-delete-dialog__empty">{tr("No filters — this view shows the entire wardrobe.")}</p>}
          <dl>
            {summary.map(([label, value]) => (
              <div key={`${label}-${value}`}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
          <button className="primary" type="button" onClick={onConfirm} disabled={busy}>
            <Trash size={15} aria-hidden="true" />
            {tr(busy ? "Deleting…" : "Delete saved view")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function PlannerGarmentButton({
  item,
  reason = "",
  onClick,
  compact = false,
  versions = [],
  versionIndex = 0,
  onVersionChange,
}) {
  if (!item) return null;
  const activeVersion = versions[versionIndex] || versions[0] || item;
  const preview = activeVersion.thumbnail || activeVersion.preview || activeVersion.image || item.thumbnail || item.imagePreview || item.image;
  return (
    <div
      className={`planner-garment-link${compact ? " is-compact" : ""}`}
    >
      {!compact && !!preview && (
        <div className="planner-garment-link__media">
          <button type="button" onClick={onClick} aria-label={item.name}>
            <OptimizedImage src={preview} alt="" sizes="96px" />
          </button>
          {versions.length > 1 && (
            <div className="planner-garment-link__version-nav" role="group" aria-label={tr("Garment color versions")}>
              <button type="button" onClick={() => onVersionChange?.(-1)} aria-label={tr("Previous garment version")}><CaretLeft size={16} aria-hidden="true" /></button>
              <span>{tr("{current} of {total}", { current: versionIndex + 1, total: versions.length })}</span>
              <button type="button" onClick={() => onVersionChange?.(1)} aria-label={tr("Next garment version")}><CaretRight size={16} aria-hidden="true" /></button>
            </div>
          )}
        </div>
      )}
      <button className="planner-garment-link__details" type="button" onClick={onClick}>
        {!compact && <span className="planner-pack-list__swatch" style={{ backgroundColor: activeVersion.primaryColor || item.color }} aria-hidden="true" />}
        <span className="planner-garment-link__copy">
          <strong>{item.name}</strong>
          {!!reason && <small>{reason}</small>}
        </span>
      </button>
      {compact && !!preview && (
        <span className="planner-garment-tooltip" role="tooltip">
          <OptimizedImage src={preview} alt="" sizes="180px" />
          <b>{item.name}</b>
        </span>
      )}
    </div>
  );
}

function PlannerStoreSearch({ item, user, plan }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const preferred = preferredStoreOptions(user.preferredStores);
  const stores = expanded ? STORE_OPTIONS : preferred;
  const query = item.name;
  return (
    <div className={`planner-store-search${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="planner-store-search__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={tr("Search stores for {item}", { item: item.name })}
        title={tr("Search stores")}
      >
        <MagnifyingGlass size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="planner-store-search__stores">
          {stores.map((store) => {
            const url = storeSearchUrl(store.id, query, {
              language: user.language,
              city: user.city,
              location: plan.input.location,
              englishQuery: item.searchQuery,
            });
            return (
              <a
                key={store.id}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                title={tr("Search {store} for {item}", { store: store.label, item: item.name })}
              >
                <BrandIcon brand={store.label} size={17} />
                <span>{store.label}</span>
              </a>
            );
          })}
          {!expanded && stores.length < STORE_OPTIONS.length && (
            <button
              type="button"
              className="planner-store-search__more"
              onClick={() => setExpanded(true)}
              aria-label={tr("Show more stores")}
              title={tr("Show more stores")}
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function plannerModeledLooks(outfit = {}) {
  if (Array.isArray(outfit.modeledLooks) && outfit.modeledLooks.length) return outfit.modeledLooks;
  return outfit.modeledLook ? [outfit.modeledLook] : [];
}

function WardrobePlanner({
  user,
  items,
  busy,
  error,
  viewerItemId,
  onClose,
  onGenerate,
  onGenerateOutfit,
  onAddOutfitIdeas,
  onSelectVariant,
  onDelete,
  onOpenItem,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState({
    kind: "trip",
    title: "",
    location: "",
    startDate: today,
    endDate: today,
    notes: "",
  });
  const [selectedPlanId, setSelectedPlanId] = useState(user.wardrobePlans?.[0]?.id || null);
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState(null);
  const [deletingPlanId, setDeletingPlanId] = useState(null);
  const [generatingOutfitKey, setGeneratingOutfitKey] = useState("");
  const [outfitErrors, setOutfitErrors] = useState({});
  const [outfitImageIndices, setOutfitImageIndices] = useState({});
  const [outfitLightbox, setOutfitLightbox] = useState(null);
  const [modeledDialogOutfitIndex, setModeledDialogOutfitIndex] = useState(null);
  const [addingIdeas, setAddingIdeas] = useState(false);
  const [ideasError, setIdeasError] = useState("");
  const [pendingVariantIds, setPendingVariantIds] = useState({});
  const plans = user.wardrobePlans || [];
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0] || null;
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const plannerVersion = (item) => {
    const versions = itemColorVersions(item);
    const pendingKey = `${selectedPlan?.id || ""}:${item.id}`;
    const savedVariants = selectedPlan?.result.garmentVariants || {};
    const hasPending = Object.hasOwn(pendingVariantIds, pendingKey);
    const hasSaved = Object.hasOwn(savedVariants, item.id);
    const selectedId = hasPending
      ? pendingVariantIds[pendingKey]
      : hasSaved ? savedVariants[item.id] : (versions[itemSelectedColorVersionIndex(item, versions)]?.id || null);
    const index = versions.findIndex((version) => (version.id || null) === selectedId);
    return { versions, index: index >= 0 ? index : 0 };
  };
  const movePlannerVersion = async (item, direction) => {
    if (!selectedPlan) return;
    const { versions, index } = plannerVersion(item);
    if (versions.length < 2) return;
    const next = versions[(index + direction + versions.length) % versions.length];
    const pendingKey = `${selectedPlan.id}:${item.id}`;
    const variantId = next.id || null;
    setPendingVariantIds((current) => ({ ...current, [pendingKey]: variantId }));
    try {
      await onSelectVariant(selectedPlan.id, item.id, variantId);
    } catch {
      // The parent surfaces the request error in the planner.
    } finally {
      setPendingVariantIds((current) => {
        if (!Object.hasOwn(current, pendingKey) || current[pendingKey] !== variantId) return current;
        const nextPending = { ...current };
        delete nextPending[pendingKey];
        return nextPending;
      });
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.startDate || !draft.endDate) return;
    const plan = await onGenerate(draft);
    if (plan) setSelectedPlanId(plan.id);
  };
  const deletePlan = async (planId) => {
    if (pendingDeletePlanId !== planId) {
      setPendingDeletePlanId(planId);
      return;
    }
    setDeletingPlanId(planId);
    const deleted = await onDelete(planId);
    if (deleted !== false) {
      const remaining = plans.filter((plan) => plan.id !== planId);
      setSelectedPlanId(remaining[0]?.id || null);
      setPendingDeletePlanId(null);
    }
    setDeletingPlanId(null);
  };
  const generateOutfit = async (_variantId, context) => {
    if (!selectedPlan) return;
    const outfitIndex = modeledDialogOutfitIndex;
    if (!Number.isInteger(outfitIndex)) return;
    const key = `${selectedPlan.id}:${outfitIndex}`;
    setGeneratingOutfitKey(key);
    setOutfitErrors((current) => ({ ...current, [key]: "" }));
    try {
      const result = await onGenerateOutfit(selectedPlan.id, outfitIndex, context);
      const nextIndex = Math.max(0, (result?.modeledLooks?.length || 1) - 1);
      setOutfitImageIndices((current) => ({ ...current, [key]: nextIndex }));
      setModeledDialogOutfitIndex(null);
    } catch (requestError) {
      setOutfitErrors((current) => ({ ...current, [key]: readableError(requestError) }));
      throw requestError;
    } finally {
      setGeneratingOutfitKey("");
    }
  };
  const addOutfitIdeas = async () => {
    if (!selectedPlan || addingIdeas) return;
    setAddingIdeas(true);
    setIdeasError("");
    try {
      await onAddOutfitIdeas(selectedPlan.id);
    } catch (requestError) {
      setIdeasError(readableError(requestError));
    } finally {
      setAddingIdeas(false);
    }
  };
  const moveOutfitImage = (key, total, direction) => {
    setOutfitImageIndices((current) => ({
      ...current,
      [key]: ((current[key] || 0) + direction + total) % total,
    }));
  };
  const moveLightbox = (direction) => {
    setOutfitLightbox((current) => current ? {
      ...current,
      index: (current.index + direction + current.looks.length) % current.looks.length,
    } : current);
  };
  return (
    <div
      className={`planner-overlay${viewerItemId ? " has-viewer" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="planner-dialog"
        data-tutorial="planner-dialog"
        role="dialog"
        aria-modal={viewerItemId ? "false" : "true"}
        aria-labelledby="planner-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="planner-dialog__header">
          <div>
            <p>{tr("Wardrobe planner")}</p>
            <h2 id="planner-title">{tr("Plan for a trip or event")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Close wardrobe planner")}><X size={23} weight="light" aria-hidden="true" /></button>
        </header>
        <div className="planner-dialog__body">
          <form className="planner-form" onSubmit={submit}>
            <div className="planner-kind" role="group" aria-label={tr("Plan type")}>
              {[
                { id: "trip", label: "Trip", icon: SuitcaseRolling },
                { id: "event", label: "Event", icon: CalendarDots },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button key={option.id} type="button" className={draft.kind === option.id ? "active" : ""} onClick={() => setDraft({ ...draft, kind: option.id })} aria-pressed={draft.kind === option.id}>
                    <Icon size={17} weight="regular" aria-hidden="true" />
                    {tr(option.label)}
                  </button>
                );
              })}
            </div>
            <label><span>{tr("Name")} <small>{tr("optional")}</small></span><input value={draft.title} maxLength="100" onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={tr(draft.kind === "trip" ? "Lisbon weekend" : "Summer wedding")} /></label>
            <label><span>{tr("Location")}</span><div className="planner-input-with-icon"><MapPin size={16} aria-hidden="true" /><input required value={draft.location} maxLength="120" onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder={tr("City and country")} /></div></label>
            <div className="planner-date-row">
              <label>
                <span>{tr("Starts")}</span>
                <DayDatePicker
                  required
                  value={draft.startDate}
                  onChange={(startDate) => setDraft({
                    ...draft,
                    startDate,
                    endDate: !startDate || draft.endDate < startDate ? startDate : draft.endDate,
                  })}
                  ariaLabel={tr("Choose start date")}
                />
              </label>
              <label>
                <span>{tr("Ends")}</span>
                <DayDatePicker
                  required
                  align="end"
                  min={draft.startDate}
                  value={draft.endDate}
                  onChange={(endDate) => setDraft({ ...draft, endDate })}
                  ariaLabel={tr("Choose end date")}
                />
              </label>
            </div>
            <label><span>{tr("Plans and dress code")} <small>{tr("optional")}</small></span><textarea rows="5" maxLength="500" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={tr("Outdoor dinners, business meetings, lots of walking…")} /></label>
            {error && <p className="planner-error">{error}</p>}
            <button className="planner-generate" type="submit" disabled={busy}>
              {busy ? <SpinnerGap className="modeled-request__spinner" size={17} aria-hidden="true" /> : <Sparkle size={17} weight="fill" aria-hidden="true" />}
              {tr(busy ? "Planning wardrobe…" : "Create wardrobe plan")}
            </button>
            {!!plans.length && (
              <div className="planner-history">
                <span>{tr("Saved plans")}</span>
                <div>
                  {plans.map((plan) => (
                    <span className={`${selectedPlan?.id === plan.id ? "active" : ""}${pendingDeletePlanId === plan.id ? " pending-delete" : ""}`} key={plan.id}>
                      <button type="button" onClick={() => { setPendingDeletePlanId(null); setSelectedPlanId(plan.id); }}>{plan.input.title || plan.input.location}</button>
                      <button
                        type="button"
                        onClick={() => deletePlan(plan.id)}
                        disabled={deletingPlanId === plan.id}
                        aria-label={tr(
                          pendingDeletePlanId === plan.id ? "Confirm deleting {name} plan" : "Delete {name} plan",
                          { name: plan.input.title || plan.input.location },
                        )}
                      >
                        {deletingPlanId === plan.id
                          ? <SpinnerGap className="modeled-request__spinner" size={12} aria-hidden="true" />
                          : pendingDeletePlanId === plan.id
                            ? <Check size={12} weight="bold" aria-hidden="true" />
                            : <X size={11} aria-hidden="true" />}
                        {pendingDeletePlanId === plan.id && <span>{tr("Confirm")}</span>}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </form>
          <div className="planner-result">
            {!selectedPlan ? (
              <div className="planner-empty">
                <SuitcaseRolling size={34} weight="light" aria-hidden="true" />
                <h3>{tr("Build a plan for your trip or event")}</h3>
                <p>{tr("Choose a place, dates, and plans to create outfit ideas from your wardrobe and see what may be missing.")}</p>
              </div>
            ) : (
              <>
                <div className="planner-result__intro">
                  <span>{tr(selectedPlan.input.kind === "trip" ? "Trip" : "Event")}</span>
                  <h3>{selectedPlan.input.title || selectedPlan.input.location}</h3>
                  <p>{selectedPlan.result.summary}</p>
                </div>
                <section className="planner-weather">
                  <CloudSun size={24} weight="light" aria-hidden="true" />
                  <div><span>{tr("Expected conditions")}</span><strong>{selectedPlan.result.expectedWeather.temperatureRange}</strong><p>{selectedPlan.result.expectedWeather.summary}</p></div>
                  <div className="planner-condition-chips">{selectedPlan.result.expectedWeather.conditions.map((condition) => <i key={condition}>{condition}</i>)}</div>
                </section>
                {!!selectedPlan.result.recommendedItems.length && (
                  <section className="planner-section">
                    <h4>{tr("Pack from your wardrobe")}</h4>
                    <div className="planner-pack-list">
                      {selectedPlan.result.recommendedItems.map((recommendation) => {
                        const item = itemMap.get(recommendation.itemId);
                        if (!item) return null;
                        const { versions, index } = plannerVersion(item);
                        return (
                          <PlannerGarmentButton
                            item={item}
                            reason={recommendation.reason}
                            onClick={() => onOpenItem(item.id)}
                            versions={versions}
                            versionIndex={index}
                            onVersionChange={(direction) => void movePlannerVersion(item, direction)}
                            key={recommendation.itemId}
                          />
                        );
                      })}
                    </div>
                  </section>
                )}
                {!!selectedPlan.result.outfitIdeas.length && (
                  <section className="planner-section">
                    <div className="planner-section__heading">
                      <h4>{tr("Outfit ideas")}</h4>
                      {selectedPlan.input.kind === "trip" && (
                        <button type="button" onClick={addOutfitIdeas} disabled={addingIdeas}>
                          {addingIdeas
                            ? <SpinnerGap className="modeled-request__spinner" size={14} aria-hidden="true" />
                            : <Plus size={14} aria-hidden="true" />}
                          {tr(addingIdeas ? "Finding more ideas…" : "Add more outfit ideas")}
                        </button>
                      )}
                    </div>
                    {!!ideasError && <p className="planner-ideas-error">{ideasError}</p>}
                    <div className="planner-outfits">
                      {selectedPlan.result.outfitIdeas.map((outfit, outfitIndex) => {
                        const generationKey = `${selectedPlan.id}:${outfitIndex}`;
                        const generating = generatingOutfitKey === generationKey;
                        const looks = plannerModeledLooks(outfit);
                        const imageIndex = Math.min(outfitImageIndices[generationKey] || 0, Math.max(0, looks.length - 1));
                        const activeLook = looks[imageIndex];
                        return (
                        <article className={activeLook ? "has-modeled-look" : ""} key={`${selectedPlan.id}-${outfit.name}`}>
                          {activeLook && (
                            <div className="planner-outfit-media">
                              <button
                                type="button"
                                className="planner-outfit-image-button"
                                onClick={() => setOutfitLightbox({ name: outfit.name, looks, index: imageIndex })}
                                aria-label={tr("Open enlarged modeled outfit: {name}", { name: outfit.name })}
                              >
                                <OptimizedImage
                                  className="planner-outfit-image"
                                  src={activeLook.preview || activeLook.image}
                                  alt={tr("Modeled outfit: {name}", { name: outfit.name })}
                                  sizes="(max-width: 860px) 80vw, 360px"
                                />
                              </button>
                              {looks.length > 1 && (
                                <>
                                  <button type="button" className="planner-outfit-media__arrow previous" onClick={() => moveOutfitImage(generationKey, looks.length, -1)} aria-label={tr("Previous image")}><CaretLeft size={17} aria-hidden="true" /></button>
                                  <button type="button" className="planner-outfit-media__arrow next" onClick={() => moveOutfitImage(generationKey, looks.length, 1)} aria-label={tr("Next image")}><CaretRight size={17} aria-hidden="true" /></button>
                                  <span className="planner-outfit-media__count">{imageIndex + 1} / {looks.length}</span>
                                </>
                              )}
                            </div>
                          )}
                          <div className="planner-outfit-copy">
                            <strong>{outfit.name}</strong>
                            <p>{outfit.note}</p>
                          </div>
                          <div className="planner-outfit-garments">
                            {outfit.itemIds.map((id) => {
                              const item = itemMap.get(id);
                              if (!item) return null;
                              const { versions, index } = plannerVersion(item);
                              return (
                                <PlannerGarmentButton
                                  compact
                                  item={item}
                                  onClick={() => onOpenItem(id)}
                                  versions={versions}
                                  versionIndex={index}
                                  key={id}
                                />
                              );
                            })}
                          </div>
                          <button
                            className="planner-outfit-generate"
                            type="button"
                            onClick={() => setModeledDialogOutfitIndex(outfitIndex)}
                            disabled={generating}
                          >
                            {generating
                              ? <SpinnerGap className="modeled-request__spinner" size={15} aria-hidden="true" />
                              : <Sparkle size={15} weight="fill" aria-hidden="true" />}
                            {tr(generating ? "Creating outfit…" : activeLook ? "Create another image" : "Create modeled look")}
                          </button>
                          {!!outfitErrors[generationKey] && <p className="planner-outfit-error">{outfitErrors[generationKey]}</p>}
                        </article>
                        );
                      })}
                    </div>
                  </section>
                )}
                {!!selectedPlan.result.missingItems.length && (
                  <section className="planner-section planner-missing">
                    <h4>{tr("Worth adding")}</h4>
                    {selectedPlan.result.missingItems.map((missing) => (
                      <article key={`${missing.name}-${missing.reason}`}>
                        <span>{tr(missing.priority)}</span>
                        <div><strong>{missing.name}</strong><p>{missing.reason}</p></div>
                        <PlannerStoreSearch item={missing} user={user} plan={selectedPlan} />
                      </article>
                    ))}
                  </section>
                )}
                {!!selectedPlan.result.packingNotes.length && (
                  <section className="planner-section">
                    <h4>{tr("Packing notes")}</h4>
                    <ul>{selectedPlan.result.packingNotes.map((note) => <li key={note}>{note}</li>)}</ul>
                  </section>
                )}
                <p className="planner-disclaimer">{selectedPlan.result.disclaimer}</p>
              </>
            )}
          </div>
        </div>
      </section>
      {Number.isInteger(modeledDialogOutfitIndex) && selectedPlan?.result.outfitIdeas[modeledDialogOutfitIndex] && (
        <ModeledLookDialog
          itemName={selectedPlan.result.outfitIdeas[modeledDialogOutfitIndex].name}
          backgroundReferences={user.backgroundReferences || []}
          eyebrow="Planned outfit"
          busy={generatingOutfitKey === `${selectedPlan.id}:${modeledDialogOutfitIndex}`}
          onClose={() => !generatingOutfitKey && setModeledDialogOutfitIndex(null)}
          onGenerate={generateOutfit}
        />
      )}
      {outfitLightbox && (
        <div
          className="planner-look-lightbox"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOutfitLightbox(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-label={tr("Modeled outfit gallery: {name}", { name: outfitLightbox.name })}>
            <header>
              <div><p>{tr("Modeled outfit")}</p><h3>{outfitLightbox.name}</h3></div>
              <button type="button" onClick={() => setOutfitLightbox(null)} aria-label={tr("Close enlarged image")}><X size={22} aria-hidden="true" /></button>
            </header>
            <ProductStage className="planner-look-lightbox__stage" staticStage>
              <OptimizedImage
                src={outfitLightbox.looks[outfitLightbox.index].image}
                alt={tr("Modeled outfit: {name}", { name: outfitLightbox.name })}
                sizes="90vw"
              />
              {outfitLightbox.looks.length > 1 && (
                <>
                  <button type="button" className="previous" onClick={() => moveLightbox(-1)} aria-label={tr("Previous image")}><CaretLeft size={24} aria-hidden="true" /></button>
                  <button type="button" className="next" onClick={() => moveLightbox(1)} aria-label={tr("Next image")}><CaretRight size={24} aria-hidden="true" /></button>
                </>
              )}
            </ProductStage>
            {outfitLightbox.looks.length > 1 && (
              <div className="planner-look-lightbox__thumbs">
                {outfitLightbox.looks.map((look, index) => (
                  <button type="button" className={index === outfitLightbox.index ? "active" : ""} onClick={() => setOutfitLightbox({ ...outfitLightbox, index })} key={look.id}>
                    <OptimizedImage src={look.preview || look.image} alt={tr("View image {number}", { number: index + 1 })} sizes="72px" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function App() {
  const locale = useLocale();
  const [auth, setAuth] = useState(null);
  const [authError, setAuthError] = useState("");
  const [users, setUsers] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [profileEditor, setProfileEditor] = useState(null);
  const [profileInitialTab, setProfileInitialTab] = useState("basics");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsData, setConnectionsData] = useState(EMPTY_CONNECTION_DATA);
  const [connectionsBusy, setConnectionsBusy] = useState("");
  const [connectionsError, setConnectionsError] = useState("");
  const [appToast, setAppToast] = useState(null);
  const [studioConnections, setStudioConnections] = useState([]);
  const [openRouterKeyDialogOpen, setOpenRouterKeyDialogOpen] = useState(false);
  const [openRouterKeyBusy, setOpenRouterKeyBusy] = useState(false);
  const [openRouterKeyError, setOpenRouterKeyError] = useState("");
  const [openRouterKeySaved, setOpenRouterKeySaved] = useState(false);
  const [items, setItems] = useState([]);
  const [activeType, setActiveType] = useState("all");
  const [filters, setFilters] = useState(() => normalizeWardrobeFilters(DEFAULT_WARDROBE_FILTERS));
  const [filterRailOpen, setFilterRailOpen] = useState(false);
  const [activeSavedViewId, setActiveSavedViewId] = useState(null);
  const [savedViewDialogOpen, setSavedViewDialogOpen] = useState(false);
  const [savedViewDeleteCandidate, setSavedViewDeleteCandidate] = useState(null);
  const [savedViewDeleteBusy, setSavedViewDeleteBusy] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerBusy, setPlannerBusy] = useState(false);
  const [plannerError, setPlannerError] = useState("");
  const [outfitStudioOpen, setOutfitStudioOpen] = useState(false);
  const [originalPhotosOpen, setOriginalPhotosOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [selectedOriginalPhotoId, setSelectedOriginalPhotoId] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState("profile");
  const [sortMode, setSortMode] = useState("custom");
  const [groupMode, setGroupMode] = useState("none");
  const [organizationStatus, setOrganizationStatus] = useState("");
  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [viewerDirty, setViewerDirty] = useState(false);
  const [blockedSwitchSignal, setBlockedSwitchSignal] = useState(0);
  const [mergeSourceId, setMergeSourceId] = useState(null);
  const [mergeCandidateId, setMergeCandidateId] = useState(null);
  const [mergeKeepId, setMergeKeepId] = useState(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const suppressOpenAfterDrag = useRef(false);
  const autoTutorialUserRef = useRef(null);

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
      setIsOwner(false);
      setCurrentUserId(null);
      setItems([]);
      setSelectedId(null);
      setPlannerOpen(false);
      setOutfitStudioOpen(false);
      setOriginalPhotosOpen(false);
      setVaultOpen(false);
      setSelectedOriginalPhotoId(null);
      setConnectionsOpen(false);
      setConnectionsData(EMPTY_CONNECTION_DATA);
      setConnectionsBusy("");
      setConnectionsError("");
      setAppToast(null);
      setStudioConnections([]);
      setViewerDirty(false);
      setBlockedSwitchSignal(0);
      setMergeSourceId(null);
      setMergeCandidateId(null);
      setMergeKeepId(null);
      setMergeBusy(false);
      setMergeError("");
      setOpenRouterKeyDialogOpen(false);
      setOpenRouterKeyBusy(false);
      setOpenRouterKeyError("");
      setOpenRouterKeySaved(false);
    };
    window.addEventListener("wardrobe:unauthorized", onUnauthorized);
    return () => window.removeEventListener("wardrobe:unauthorized", onUnauthorized);
  }, []);

  useEffect(() => {
    const openKeySetup = () => {
      setOpenRouterKeyError("");
      setOpenRouterKeySaved(false);
      setOpenRouterKeyDialogOpen(true);
    };
    window.addEventListener(OPENROUTER_KEY_REQUIRED_EVENT, openKeySetup);
    return () => window.removeEventListener(OPENROUTER_KEY_REQUIRED_EVENT, openKeySetup);
  }, []);

  useEffect(() => {
    if (!appToast) return undefined;
    const timeout = setTimeout(() => setAppToast(null), appToast.duration || 9000);
    return () => clearTimeout(timeout);
  }, [appToast]);

  useEffect(() => {
    if (!auth?.authenticated) return;
    profileApi("/api/users")
      .then((result) => {
        setUsers(result.users || []);
        setIsOwner(Boolean(result.isOwner));
        setCurrentUserId(result.currentUserId);
      })
      .catch((requestError) => {
        setError(requestError.message);
        setLoading(false);
      });
  }, [auth?.authenticated]);

  useEffect(() => {
    if (!auth?.authenticated || !currentUserId) return;
    setConnectionsData(EMPTY_CONNECTION_DATA);
    setConnectionsError("");
    profileApi(connectionsPath(currentUserId))
      .then((result) => {
        setConnectionsData(result);
        if (result.incomingInvites?.length) setConnectionsOpen(true);
      })
      .catch((requestError) => setConnectionsError(requestError.message));
  }, [auth?.authenticated, currentUserId]);

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
          throw new Error(tr("Could not load the wardrobe."));
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
                  secondHand: item.secondHand,
                  acquiredFree: item.acquiredFree,
                  tags: item.tags,
                  sizes: item.sizes,
                  fits: item.fits,
                  materials: item.materials,
                  seasons: item.seasons,
                  careInstructions: item.careInstructions,
                }),
              });
              removePersistedEdit(item.id, currentUserId);
            }),
          ...[...deleted]
            .filter((id) => id.startsWith("import-"))
            .map(async (id) => {
              const response = await fetch(`/api/import/wardrobe/${id}?user=${encodeURIComponent(currentUserId)}`, { method: "DELETE" });
              if (!response.ok && response.status !== 404) throw new Error(tr("Could not migrate a locally deleted item."));
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

  const persistTutorial = useCallback(async (status, step) => {
    const result = await profileApi("/api/users/tutorial", {
      method: "PATCH",
      body: JSON.stringify({ status, step }),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result.user;
  }, []);

  useEffect(() => {
    const ownWardrobe = currentUser?.id && currentUser.id === auth?.user?.id;
    const state = currentUser?.tutorial;
    if (!ownWardrobe) {
      setTutorialOpen(false);
      return;
    }
    if (!["pending", "active"].includes(state?.status)) return;
    if (autoTutorialUserRef.current === currentUser.id) return;
    autoTutorialUserRef.current = currentUser.id;
    const step = state.step || "profile";
    setTutorialStep(step);
    setTutorialOpen(true);
    if (step === "profile") {
      setProfileInitialTab("basics");
      setProfileError("");
      setProfileEditor(currentUser.id);
    }
    if (state.status === "pending") void persistTutorial("active", step).catch((requestError) => setError(requestError.message));
  }, [auth?.user?.id, currentUser, persistTutorial]);

  useEffect(() => {
    if (!profileEditor && currentUser?.language && currentUser.language !== locale) setLocale(currentUser.language);
  }, [currentUser?.language, locale, profileEditor]);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const mergeSourceItem = items.find((item) => item.id === mergeSourceId) || null;
  const mergeCandidateItem = items.find((item) => item.id === mergeCandidateId) || null;
  const wardrobeDisplay = normalizeWardrobeDisplayPreferences(currentUser?.wardrobeDisplay);
  const gridDensity = wardrobeDisplay.density;
  const originalPhotoLibrary = useMemo(() => collectOriginalPhotoLibrary(items), [items]);
  const generatedPhotoLibrary = useMemo(
    () => collectGeneratedPhotoLibrary(items, currentUser || {}),
    [currentUser, items],
  );

  useEffect(() => {
    const legacyColorGrouping = currentUser?.wardrobeSortMode === "color";
    const nextSortMode = SORT_MODE_IDS.has(currentUser?.wardrobeSortMode)
      ? currentUser.wardrobeSortMode
      : "custom";
    const nextGroupMode = GROUP_MODE_IDS.has(currentUser?.wardrobeGroupMode)
      ? currentUser.wardrobeGroupMode
      : legacyColorGrouping ? "color" : "none";
    setSortMode(nextSortMode);
    setGroupMode(nextGroupMode);
    setOrganizationStatus("");
    setDraggedId(null);
    setDropTargetId(null);
  }, [currentUserId, currentUser?.wardrobeGroupMode, currentUser?.wardrobeSortMode]);

  useEffect(() => {
    setFilters(normalizeWardrobeFilters(DEFAULT_WARDROBE_FILTERS));
    setActiveType("all");
    setFilterRailOpen(false);
    setActiveSavedViewId(null);
    setSavedViewDeleteCandidate(null);
    setSavedViewDeleteBusy(false);
    setPlannerOpen(false);
    setOutfitStudioOpen(false);
    setOriginalPhotosOpen(false);
    setVaultOpen(false);
    setSelectedOriginalPhotoId(null);
    setPlannerError("");
    setMergeSourceId(null);
    setMergeCandidateId(null);
    setMergeKeepId(null);
    setMergeBusy(false);
    setMergeError("");
    setOpenRouterKeyDialogOpen(false);
    setOpenRouterKeyBusy(false);
    setOpenRouterKeyError("");
    setOpenRouterKeySaved(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!plannerOpen && !outfitStudioOpen && !originalPhotosOpen && !vaultOpen && !connectionsOpen && !savedViewDialogOpen && !savedViewDeleteCandidate && !mergeCandidateItem && !openRouterKeyDialogOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [connectionsOpen, mergeCandidateItem, openRouterKeyDialogOpen, originalPhotosOpen, outfitStudioOpen, plannerOpen, savedViewDeleteCandidate, savedViewDialogOpen, vaultOpen]);

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
    const filtered = customOrderedItems.filter((item) => wardrobeItemMatches(item, {
      ...filters,
      type: activeType,
    }));
    if (sortMode === "custom") return filtered;
    if (sortMode === "updated") {
      return [...filtered].sort((first, second) => (
        timestampValue(second) - timestampValue(first)
        || first.name.localeCompare(second.name)
      ));
    }
    if (sortMode === "purchase-oldest") {
      return [...filtered].sort((first, second) => (
        purchaseMonthValue(first) - purchaseMonthValue(second)
        || timestampValue(first) - timestampValue(second)
        || first.name.localeCompare(second.name)
      ));
    }
    return filtered;
  }, [activeType, customOrderedItems, filters, sortMode]);
  const galleryItems = mergeSourceId ? customOrderedItems : visibleItems;

  const facets = useMemo(() => collectFacetOptions(items), [items]);
  const typeCounts = useMemo(() => Object.fromEntries(TYPES.map((type) => [
    type.id,
    type.id === "all" ? items.length : items.filter((item) => item.part === type.id).length,
  ])), [items]);
  const selectedFilterCount = activeFilterCount({ ...filters, type: activeType });
  const savedViews = normalizeSavedViews(currentUser?.savedViews);

  const wardrobeSections = useMemo(() => groupWardrobeItems(visibleItems, groupMode, {
    colorGroups: COLOR_GROUPS,
    typeGroups: TYPES,
  }), [groupMode, visibleItems]);

  const visibleItemIndex = useMemo(
    () => new Map(galleryItems.map((item, index) => [item.id, index])),
    [galleryItems],
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

  const changeFilters = (nextFilters) => {
    const normalized = normalizeWardrobeFilters(nextFilters);
    setFilters(normalized);
    if (normalized.type !== activeType) setActiveType(normalized.type);
    setActiveSavedViewId(null);
  };

  const clearFilters = () => {
    setFilters(normalizeWardrobeFilters(DEFAULT_WARDROBE_FILTERS));
    setActiveType("all");
    setActiveSavedViewId(null);
  };

  const saveWardrobeArrangement = async (nextSortMode, nextGroupMode) => {
    if (
      !SORT_MODE_IDS.has(nextSortMode)
      || !GROUP_MODE_IDS.has(nextGroupMode)
      || !currentUserId
      || (nextSortMode === sortMode && nextGroupMode === groupMode)
    ) return;
    setActiveSavedViewId(null);
    const previousSortMode = sortMode;
    const previousGroupMode = groupMode;
    setSortMode(nextSortMode);
    setGroupMode(nextGroupMode);
    setDraggedId(null);
    setDropTargetId(null);
    setOrganizationStatus("saving");
    setUsers((current) => current.map((user) => (
      user.id === currentUserId
        ? { ...user, wardrobeSortMode: nextSortMode, wardrobeGroupMode: nextGroupMode }
        : user
    )));
    try {
      const result = await profileApi(withWardrobeUser(`/api/users/${currentUserId}`, currentUserId), {
        method: "PATCH",
        body: JSON.stringify({
          wardrobeSortMode: nextSortMode,
          wardrobeGroupMode: nextGroupMode,
        }),
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      setOrganizationStatus("saved");
      window.setTimeout(() => setOrganizationStatus((status) => status === "saved" ? "" : status), 1600);
    } catch (requestError) {
      setSortMode(previousSortMode);
      setGroupMode(previousGroupMode);
      setUsers((current) => current.map((user) => (
        user.id === currentUserId
          ? { ...user, wardrobeSortMode: previousSortMode, wardrobeGroupMode: previousGroupMode }
          : user
      )));
      setOrganizationStatus("");
      setError(tr("Could not save this wardrobe arrangement. {error}", { error: readableError(requestError) }));
    }
  };

  const saveSortMode = (mode) => {
    void saveWardrobeArrangement(mode, groupMode);
  };

  const saveGroupMode = (mode) => {
    void saveWardrobeArrangement(sortMode, mode);
  };

  const persistSavedViews = async (nextViews) => {
    if (!currentUserId) return null;
    const result = await profileApi(withWardrobeUser(`/api/users/${currentUserId}`, currentUserId), {
      method: "PATCH",
      body: JSON.stringify({ savedViews: nextViews }),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result.user;
  };

  const updateWardrobeDisplay = async (nextDisplay) => {
    if (!currentUserId) return;
    const previous = normalizeWardrobeDisplayPreferences(currentUser?.wardrobeDisplay);
    const normalized = normalizeWardrobeDisplayPreferences({ ...previous, ...nextDisplay });
    setUsers((current) => current.map((user) => (
      user.id === currentUserId ? { ...user, wardrobeDisplay: normalized } : user
    )));
    try {
      const result = await profileApi(withWardrobeUser(`/api/users/${currentUserId}`, currentUserId), {
        method: "PATCH",
        body: JSON.stringify({ wardrobeDisplay: normalized }),
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    } catch (requestError) {
      setUsers((current) => current.map((user) => (
        user.id === currentUserId ? { ...user, wardrobeDisplay: previous } : user
      )));
      setError(tr("Could not save the wardrobe display. {error}", { error: readableError(requestError) }));
    }
  };

  const saveCurrentView = async (name) => {
    const view = {
      id: crypto.randomUUID(),
      name,
      filters: normalizeWardrobeFilters({ ...filters, type: activeType }),
      sortMode,
      groupMode,
      density: gridDensity,
      createdAt: new Date().toISOString(),
    };
    try {
      const nextViews = normalizeSavedViews([view, ...savedViews]);
      await persistSavedViews(nextViews);
      setActiveSavedViewId(view.id);
      setSavedViewDialogOpen(false);
    } catch (requestError) {
      setError(tr("Could not save this view. {error}", { error: readableError(requestError) }));
    }
  };

  const applySavedView = (view) => {
    const nextFilters = normalizeWardrobeFilters(view.filters);
    setFilters(nextFilters);
    setActiveType(nextFilters.type);
    setSortMode(view.sortMode);
    setGroupMode(view.groupMode);
    setActiveSavedViewId(view.id);
    setDraggedId(null);
    setDropTargetId(null);
  };

  const deleteSavedView = async (viewId) => {
    setSavedViewDeleteBusy(true);
    try {
      await persistSavedViews(savedViews.filter((view) => view.id !== viewId));
      if (activeSavedViewId === viewId) setActiveSavedViewId(null);
      setSavedViewDeleteCandidate(null);
    } catch (requestError) {
      setError(tr("Could not delete this saved view. {error}", { error: readableError(requestError) }));
    } finally {
      setSavedViewDeleteBusy(false);
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
      setError(tr("Could not save your wardrobe order. {error}", { error: readableError(requestError) }));
    }
  };

  const beginItemDrag = (event, id) => {
    if (sortMode !== "custom" || groupMode !== "none" || organizationStatus === "saving") {
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

  const beginGarmentMerge = (id) => {
    if (items.length < 2 || !items.some((item) => item.id === id)) return;
    setMergeSourceId(id);
    setMergeCandidateId(null);
    setMergeKeepId(null);
    setMergeError("");
    setFilterRailOpen(false);
  };

  const cancelGarmentMerge = useCallback(() => {
    if (mergeBusy) return;
    setMergeSourceId(null);
    setMergeCandidateId(null);
    setMergeKeepId(null);
    setMergeError("");
  }, [mergeBusy]);

  const confirmGarmentMerge = async () => {
    if (!mergeSourceItem || !mergeCandidateItem || !mergeKeepId || mergeBusy) return;
    const discardId = mergeKeepId === mergeSourceItem.id ? mergeCandidateItem.id : mergeSourceItem.id;
    setMergeBusy(true);
    setMergeError("");
    try {
      const result = await profileApi(withWardrobeUser("/api/import/wardrobe/merge", currentUserId), {
        method: "POST",
        body: JSON.stringify({ keepId: mergeKeepId, discardId }),
      });
      setItems((current) => current
        .filter((item) => item.id !== result.removedId)
        .map((item) => item.id === result.item.id ? { ...item, ...result.item } : item));
      if (result.user) {
        setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      }
      removePersistedEdit(result.removedId, currentUserId);
      removePersistedDeletedItem(result.removedId, currentUserId);
      removePersistedEdit(result.item.id, currentUserId);
      removePersistedDeletedItem(result.item.id, currentUserId);
      setSelectedId(result.item.id);
      setViewerDirty(false);
      setBlockedSwitchSignal(0);
      setMergeSourceId(null);
      setMergeCandidateId(null);
      setMergeKeepId(null);
      setMergeError("");
    } catch (requestError) {
      setMergeError(readableError(requestError));
    } finally {
      setMergeBusy(false);
    }
  };

  const openItem = (id) => {
    if (suppressOpenAfterDrag.current) return;
    if (mergeSourceId) {
      if (viewerDirty) {
        setBlockedSwitchSignal((current) => current + 1);
        return;
      }
      if (id === mergeSourceId) return;
      setMergeCandidateId(id);
      setMergeKeepId(null);
      setMergeError("");
      return;
    }
    if (viewerDirty && selectedId && id !== selectedId) {
      setBlockedSwitchSignal((current) => current + 1);
      return;
    }
    setBlockedSwitchSignal(0);
    setSelectedId(id);
    if (window.matchMedia("(max-width: 860px)").matches) setFilterRailOpen(false);
  };

  const closeViewer = useCallback(() => {
    setViewerDirty(false);
    setBlockedSwitchSignal(0);
    setSelectedId(null);
    setMergeSourceId(null);
    setMergeCandidateId(null);
    setMergeKeepId(null);
    setMergeError("");
  }, []);

  const closeOriginalPhotos = useCallback(() => {
    setOriginalPhotosOpen(false);
    setSelectedOriginalPhotoId(null);
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
          secondHand: updatedItem.secondHand,
          acquiredFree: updatedItem.acquiredFree,
          tags: updatedItem.tags,
          sizes: updatedItem.sizes,
          fits: updatedItem.fits,
          materials: updatedItem.materials,
          seasons: updatedItem.seasons,
          careInstructions: updatedItem.careInstructions,
        }),
      });
      removePersistedEdit(updatedItem.id, currentUserId);
      setItems((current) => current.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
    } catch (requestError) {
      setError(tr("{error} Your change is still saved in this browser.", { error: readableError(requestError) }));
    }
  };

  const deleteItem = async (id) => {
    if (id.startsWith("import-")) {
      try {
        const response = await fetch(`/api/import/wardrobe/${id}?user=${encodeURIComponent(currentUserId)}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error(tr("Could not delete the imported item."));
      } catch (requestError) {
        setError(requestError.message);
        throw requestError;
      }
    }
    setItems((current) => current.filter((item) => item.id !== id));
    removePersistedEdit(id, currentUserId);
    if (id.startsWith("import-")) removePersistedDeletedItem(id, currentUserId);
    else persistDeletedItem(id, currentUserId);
    closeViewer();
  };

  // Only an owner is ever offered more than one wardrobe; the server refuses the
  // switch for anyone else, so this is a convenience rather than the guard.
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
            if (!response.ok && response.status !== 404) throw new Error(tr("Could not prepare {name}'s deleted items for export.", { name: user.name }));
            removePersistedDeletedItem(id, user.id);
          }),
      ];
    });
    const results = await Promise.allSettled(migrations);
    if (results.some((result) => result.status === "rejected")) {
      setError(tr("The backup could not include every browser-only change. Check your connection and try the download again."));
      return;
    }
    window.location.assign(withWardrobeUser("/api/export", currentUserId));
  };

  const advanceTutorial = (step) => {
    if (step === "upload") setProfileEditor(null);
    if (step === "garment") window.dispatchEvent(new Event("wardrobe:close-import"));
    if (step === "explore") closeViewer();
    setTutorialStep(step);
    void persistTutorial("active", step).catch((requestError) => setError(requestError.message));
  };

  const startTutorial = () => {
    if (!currentUser || currentUser.id !== auth?.user?.id) return;
    setPlannerOpen(false);
    setOutfitStudioOpen(false);
    closeViewer();
    setTutorialStep("profile");
    setTutorialOpen(true);
    setProfileInitialTab("basics");
    setProfileError("");
    setProfileEditor(currentUser.id);
    void persistTutorial("active", "profile").catch((requestError) => setError(requestError.message));
  };

  const cancelTutorial = () => {
    setTutorialOpen(false);
    void persistTutorial("dismissed", tutorialStep).catch((requestError) => setError(requestError.message));
  };

  const finishTutorial = () => {
    setTutorialOpen(false);
    void persistTutorial("completed", "finish").catch((requestError) => setError(requestError.message));
  };

  const openTutorialImporter = () => window.dispatchEvent(new Event("wardrobe:open-import"));

  const openTutorialPlanner = () => {
    closeViewer();
    setPlannerError("");
    setPlannerOpen(true);
    advanceTutorial("finish");
  };

  const saveProfile = async (input) => {
    setProfileBusy(true);
    setProfileError("");
    try {
      const editingUser = profileEditor === "new" ? null : users.find((user) => user.id === profileEditor);
      const result = await profileApi(editingUser
        ? withWardrobeUser(`/api/users/${editingUser.id}`, editingUser.id)
        : "/api/users", {
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
      if (tutorialOpen && tutorialStep === "profile" && editingUser?.id === auth?.user?.id) {
        setTutorialStep("upload");
        void persistTutorial("active", "upload").catch((requestError) => setError(requestError.message));
      }
      setProfileEditor(null);
    } catch (requestError) {
      setProfileError(requestError.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const refreshConnections = async (includeOutfit = false) => {
    if (!currentUserId) return EMPTY_CONNECTION_DATA;
    const result = await profileApi(connectionsPath(currentUserId, includeOutfit));
    setConnectionsData(result);
    if (includeOutfit) setStudioConnections(result.companions || []);
    return result;
  };

  const inviteConnection = async (input) => {
    setConnectionsBusy("invite");
    setConnectionsError("");
    try {
      await profileApi(connectionInvitationsPath(currentUserId), { method: "POST", body: JSON.stringify(input) });
      await refreshConnections();
      return true;
    } catch (requestError) {
      const message = readableError(requestError);
      setConnectionsError(message);
      setAppToast({ title: tr("Connection action failed"), message });
      return false;
    } finally {
      setConnectionsBusy("");
    }
  };

  const respondToConnection = async (inviteId, decision, permissions) => {
    setConnectionsBusy(inviteId);
    setConnectionsError("");
    try {
      await profileApi(connectionInvitationResponsePath(inviteId, currentUserId), {
        method: "POST",
        body: JSON.stringify({ decision, permissions }),
      });
      await refreshConnections();
    } catch (requestError) {
      const message = readableError(requestError);
      setConnectionsError(message);
      setAppToast({ title: tr("Connection action failed"), message });
    } finally {
      setConnectionsBusy("");
    }
  };

  const cancelConnectionInvite = async (inviteId) => {
    setConnectionsBusy(inviteId);
    setConnectionsError("");
    try {
      await profileApi(connectionInvitationPath(inviteId, currentUserId), { method: "DELETE" });
      await refreshConnections();
    } catch (requestError) {
      const message = readableError(requestError);
      setConnectionsError(message);
      setAppToast({ title: tr("Connection action failed"), message });
    } finally {
      setConnectionsBusy("");
    }
  };

  const updateConnection = async (connectionId, permissions) => {
    setConnectionsBusy(connectionId);
    setConnectionsError("");
    try {
      await profileApi(connectionPath(connectionId, currentUserId), {
        method: "PATCH",
        body: JSON.stringify({ permissions }),
      });
      await refreshConnections();
    } catch (requestError) {
      const message = readableError(requestError);
      setConnectionsError(message);
      setAppToast({ title: tr("Connection action failed"), message });
    } finally {
      setConnectionsBusy("");
    }
  };

  const disconnectConnection = async (connectionId) => {
    setConnectionsBusy(connectionId);
    setConnectionsError("");
    try {
      const result = await profileApi(connectionPath(connectionId, currentUserId), { method: "DELETE" });
      if (result.user) setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      await refreshConnections();
    } catch (requestError) {
      const message = readableError(requestError);
      setConnectionsError(message);
      setAppToast({ title: tr("Connection action failed"), message });
    } finally {
      setConnectionsBusy("");
    }
  };

  const openOutfitStudio = async () => {
    setStudioConnections([]);
    try {
      await refreshConnections(true);
    } catch (requestError) {
      setError(requestError.message);
    }
    setOutfitStudioOpen(true);
  };

  const openTutorialOutfitStudio = () => {
    closeViewer();
    advanceTutorial("finish");
    void openOutfitStudio();
  };

  const closeOpenRouterKeyDialog = () => {
    if (openRouterKeyBusy) return;
    setOpenRouterKeyDialogOpen(false);
    setOpenRouterKeyError("");
    setOpenRouterKeySaved(false);
  };

  const saveOpenRouterKey = async (openRouterApiKey) => {
    setOpenRouterKeyBusy(true);
    setOpenRouterKeyError("");
    try {
      const result = await profileApi("/api/users/openrouter-key", {
        method: "PATCH",
        body: JSON.stringify({ openRouterApiKey }),
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      setOpenRouterKeySaved(true);
    } catch (requestError) {
      setOpenRouterKeyError(requestError.message);
    } finally {
      setOpenRouterKeyBusy(false);
    }
  };

  const addImportedItem = useCallback((newItem) => {
    setItems((current) => current.some((item) => item.id === newItem.id)
      ? current.map((item) => item.id === newItem.id ? { ...item, ...newItem } : item)
      : [...current, newItem]);
  }, []);

  const createColorVariant = async (id, input) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/variants?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const selectColorVersion = async (id, variantId) => {
    if (!id.startsWith("import-")) return null;
    const updated = await profileApi(`/api/import/wardrobe/${id}/variants/selection?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ variantId }),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const reorderColorVersions = async (id, ids) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/variants/order?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const deleteColorVersion = async (id, variantId) => {
    const result = await profileApi(`/api/import/wardrobe/${id}/variants/${encodeURIComponent(variantId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    const updated = result.item || result;
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    if (result.user) {
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    }
    return updated;
  };

  const showCompletedImageFallback = (notice) => {
    const nextToast = imageFallbackToast(notice, { completed: true });
    if (nextToast) setAppToast(nextToast);
  };

  const generateModeledLook = async (id, variantId = null, context = {}) => {
    const generated = await profileApi(`/api/import/wardrobe/${id}/modeled?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
      body: JSON.stringify({ variantId, context }),
    });
    showCompletedImageFallback(generated.fallbackNotice);
    const record = withoutFallbackNotice(generated);
    setItems((current) => current.map((item) => item.id === record.id ? { ...item, ...record } : item));
    return record;
  };

  const regenerateGarment = async (id, input) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/regeneration?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    showCompletedImageFallback(updated.fallbackNotice);
    const record = withoutFallbackNotice(updated);
    setItems((current) => current.map((item) => item.id === record.id ? { ...item, ...record } : item));
    return record;
  };

  const centerGarmentRegeneration = async (id) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/regeneration/center?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const acceptGarmentRegeneration = async (id) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/regeneration/accept?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
    });
    removePersistedEdit(id, currentUserId);
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const discardGarmentRegeneration = async (id) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/regeneration?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const deleteModeledLook = async (id, lookId) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/modeled/${encodeURIComponent(lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const archiveGarment = async (id) => {
    const result = await profileApi(`/api/import/wardrobe/${id}/vault?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ vaulted: true }),
    });
    setItems((current) => current.filter((item) => item.id !== id));
    closeViewer();
    setAppToast({ title: tr("Garment moved to Vault"), message: tr("It is now hidden from your wardrobe and Outfit Studio.") });
    return result.item;
  };

  const archiveModeledLook = async (id, lookId) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/modeled/${encodeURIComponent(lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ vaulted: true }),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const restoreVaultEntry = async (entry) => {
    if (entry.kind === "garment") {
      const result = await profileApi(`/api/import/wardrobe/${entry.itemId}/vault?user=${encodeURIComponent(currentUserId)}`, {
        method: "PATCH",
        body: JSON.stringify({ vaulted: false }),
      });
      setItems((current) => current.some((item) => item.id === result.item.id)
        ? current.map((item) => item.id === result.item.id ? { ...item, ...result.item } : item)
        : [...current, result.item]);
      return result;
    }
    if (entry.kind === "garment-look") {
      const updated = await profileApi(`/api/import/wardrobe/${entry.itemId}/modeled/${encodeURIComponent(entry.lookId)}?user=${encodeURIComponent(currentUserId)}`, {
        method: "PATCH",
        body: JSON.stringify({ vaulted: false }),
      });
      if (!updated.vaultedAt) {
        setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      }
      return updated;
    }
    const result = await profileApi(`/api/import/outfits/${encodeURIComponent(entry.outfitId)}/modeled/${encodeURIComponent(entry.lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ vaulted: false }),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result;
  };

  const deleteSourcePhoto = async (id, sourcePhotoId, replacementSourcePhotoId = null) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/sources/${encodeURIComponent(sourcePhotoId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
      body: JSON.stringify({ replacementSourcePhotoId }),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const reorderGarmentMedia = async (id, ids) => {
    const updated = await profileApi(`/api/import/wardrobe/${id}/media-order?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    });
    setItems((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const generateWardrobePlan = async (input) => {
    setPlannerBusy(true);
    setPlannerError("");
    try {
      const result = await profileApi(`/api/import/planner?user=${encodeURIComponent(currentUserId)}`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      return result.plan;
    } catch (requestError) {
      setPlannerError(readableError(requestError));
      return null;
    } finally {
      setPlannerBusy(false);
    }
  };

  const deleteWardrobePlan = async (planId) => {
    setPlannerError("");
    try {
      const result = await profileApi(`/api/import/planner/${encodeURIComponent(planId)}?user=${encodeURIComponent(currentUserId)}`, {
        method: "DELETE",
      });
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      return true;
    } catch (requestError) {
      setPlannerError(readableError(requestError));
      return false;
    }
  };

  const generatePlannedOutfitLook = async (planId, outfitIndex, context = {}) => {
    setPlannerError("");
    try {
      const result = await profileApi(
        `/api/import/planner/${encodeURIComponent(planId)}/outfits/${outfitIndex}/modeled?user=${encodeURIComponent(currentUserId)}`,
        { method: "POST", body: JSON.stringify({ context }) },
      );
      showCompletedImageFallback(result.fallbackNotice);
      const response = withoutFallbackNotice(result);
      setUsers((current) => current.map((user) => user.id === response.user.id ? response.user : user));
      return response;
    } catch (requestError) {
      setPlannerError(readableError(requestError));
      throw requestError;
    }
  };

  const selectPlannedGarmentVersion = async (planId, itemId, variantId) => {
    setPlannerError("");
    try {
      const result = await profileApi(
        `/api/import/planner/${encodeURIComponent(planId)}/variants?user=${encodeURIComponent(currentUserId)}`,
        { method: "PATCH", body: JSON.stringify({ itemId, variantId }) },
      );
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      return result.plan;
    } catch (requestError) {
      setPlannerError(readableError(requestError));
      throw requestError;
    }
  };

  const addPlannedOutfitIdeas = async (planId) => {
    setPlannerError("");
    try {
      const result = await profileApi(
        `/api/import/planner/${encodeURIComponent(planId)}/ideas?user=${encodeURIComponent(currentUserId)}`,
        { method: "POST" },
      );
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
      return result.plan;
    } catch (requestError) {
      setPlannerError(readableError(requestError));
      throw requestError;
    }
  };

  const saveWardrobeOutfit = async (input) => {
    const endpoint = input.id
      ? `/api/import/outfits/${encodeURIComponent(input.id)}?user=${encodeURIComponent(currentUserId)}`
      : `/api/import/outfits?user=${encodeURIComponent(currentUserId)}`;
    const result = await profileApi(endpoint, {
      method: input.id ? "PATCH" : "POST",
      body: JSON.stringify(input),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result.outfit;
  };

  const deleteWardrobeOutfit = async (outfitId) => {
    const result = await profileApi(`/api/import/outfits/${encodeURIComponent(outfitId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result;
  };

  const refineWardrobeOutfit = async (input) => profileApi(
    `/api/import/outfits/refine?user=${encodeURIComponent(currentUserId)}`,
    { method: "POST", body: JSON.stringify(input) },
  );

  const nameWardrobeOutfit = async (input) => profileApi(
    `/api/import/outfits/name?user=${encodeURIComponent(currentUserId)}`,
    { method: "POST", body: JSON.stringify(input) },
  );

  const reorderWardrobeOutfits = async (ids) => {
    const result = await profileApi(`/api/import/outfits/order?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result.user.wardrobeOutfits;
  };

  const generateWardrobeOutfitLook = async (outfitId, context = {}) => {
    const result = await profileApi(`/api/import/outfits/${encodeURIComponent(outfitId)}/modeled?user=${encodeURIComponent(currentUserId)}`, {
      method: "POST",
      body: JSON.stringify({ context }),
    });
    showCompletedImageFallback(result.fallbackNotice);
    const response = withoutFallbackNotice(result);
    setUsers((current) => current.map((user) => user.id === response.user.id ? response.user : user));
    return response;
  };

  const deleteWardrobeOutfitLook = async (outfitId, lookId) => {
    const result = await profileApi(`/api/import/outfits/${encodeURIComponent(outfitId)}/modeled/${encodeURIComponent(lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "DELETE",
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result;
  };

  const archiveWardrobeOutfitLook = async (outfitId, lookId) => {
    const result = await profileApi(`/api/import/outfits/${encodeURIComponent(outfitId)}/modeled/${encodeURIComponent(lookId)}?user=${encodeURIComponent(currentUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ vaulted: true }),
    });
    setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user));
    return result;
  };

  // Cmd/Ctrl + . opens the profile editor, matching the settings shortcut most
  // desktop apps use. Ignored while typing so it cannot interrupt an edit.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "." || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || !currentUser?.id) return;
      event.preventDefault();
      setProfileInitialTab("basics");
      setProfileError("");
      setProfileEditor((current) => (current ? null : currentUser.id));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentUser?.id]);

  const logout = async () => {
    try {
      await profileApi("/api/auth/logout", { method: "POST" });
    } finally {
      setAuth((current) => ({ enabled: current?.enabled !== false, authenticated: false }));
      setUsers([]);
      setIsOwner(false);
      setConnectionsOpen(false);
      setConnectionsData(EMPTY_CONNECTION_DATA);
      setConnectionsBusy("");
      setConnectionsError("");
      setAppToast(null);
      setStudioConnections([]);
      setCurrentUserId(null);
      setItems([]);
      setPlannerOpen(false);
      setOutfitStudioOpen(false);
      setOriginalPhotosOpen(false);
      setSelectedOriginalPhotoId(null);
      setOpenRouterKeyDialogOpen(false);
      setOpenRouterKeyBusy(false);
      setOpenRouterKeyError("");
      setOpenRouterKeySaved(false);
      closeViewer();
    }
  };

  if (auth === null) return <main className="password-gate"><p className="status">{tr("Checking access")}</p></main>;
  if (!auth.authenticated) {
    return <SignInGate error={authError} configurationError={auth.configurationError} />;
  }

  return (
    <div className={`app-shell${selectedItem ? " has-selection" : ""}${mergeSourceItem ? " is-merging" : ""}`}>
      <ViewerToast toast={appToast} onDismiss={() => setAppToast(null)} />
      <main className="gallery-pane">
        <header className="gallery-header">
          <div className="gallery-meta-row">
            <p className="wardrobe-owner">
              {currentUser?.name || tr("Wardrobe")}
              <span>{tr(items.length === 1 ? "{count} garment" : "{count} garments", { count: items.length })}</span>
            </p>
          </div>
          <div className="discovery-toolbar" data-tutorial="wardrobe-tools">
            <button
              className={filterRailOpen ? "active" : ""}
              type="button"
              disabled={Boolean(mergeSourceItem)}
              onClick={() => setFilterRailOpen((current) => !current)}
              aria-expanded={filterRailOpen}
              aria-controls="wardrobe-filter-rail"
            >
              <FunnelSimple size={16} weight="regular" aria-hidden="true" />
              {tr("Filters")}
              {!!selectedFilterCount && <span className="toolbar-count">{selectedFilterCount}</span>}
            </button>
            <button type="button" onClick={() => { setPlannerError(""); setPlannerOpen(true); }}>
              <CalendarDots size={16} weight="regular" aria-hidden="true" />
              {tr("Plan")}
            </button>
            <button type="button" onClick={openOutfitStudio}>
              <Sparkle size={16} weight="regular" aria-hidden="true" />
              {tr("Outfit Studio")}
            </button>
            <div className="wardrobe-arrangement-control sort-control">
              <span><ArrowsDownUp size={14} weight="regular" aria-hidden="true" />{tr("Sort")}</span>
              <LightSelect
                value={sortMode}
                onChange={saveSortMode}
                options={SORT_MODES.map((mode) => {
                  const ModeIcon = mode.icon;
                  return {
                    value: mode.id,
                    label: tr(mode.label),
                    icon: <ModeIcon size={17} weight="regular" />,
                  };
                })}
                disabled={organizationStatus === "saving"}
                ariaLabel={tr("Sort wardrobe")}
              />
            </div>
            <div className="wardrobe-arrangement-control group-control">
              <span><SquaresFour size={14} weight="regular" aria-hidden="true" />{tr("Group by")}</span>
              <LightSelect
                value={groupMode}
                onChange={saveGroupMode}
                options={GROUP_MODES.map((mode) => {
                  const ModeIcon = mode.icon;
                  return {
                    value: mode.id,
                    label: tr(mode.label),
                    icon: <ModeIcon size={17} weight="regular" />,
                  };
                })}
                disabled={organizationStatus === "saving"}
                ariaLabel={tr("Group wardrobe")}
              />
            </div>
            <button
              className={`details-visibility-toggle${wardrobeDisplay.mode === "details" ? " active" : ""}`}
              type="button"
              aria-pressed={wardrobeDisplay.mode === "details"}
              onClick={() => updateWardrobeDisplay({
                mode: wardrobeDisplay.mode === "details" ? "pieces" : "details",
              })}
            >
              <span className={`details-visibility-toggle__icon${wardrobeDisplay.mode === "details" ? "" : " is-off"}`} aria-hidden="true">
                <ListBullets size={16} weight="regular" />
              </span>
              {tr("Details")}
            </button>
            {!!organizationStatus && (
              <small className="toolbar-status" aria-live="polite">
                {tr(organizationStatus === "saving" ? "Saving…" : "Saved")}
              </small>
            )}
          </div>
        </header>

        {error && <p className="status error">{error}</p>}
        {!error && loading && <p className="status">{tr("Loading wardrobe")}</p>}
        {!error && !loading && !items.length && <p className="status empty">{tr("Drop, paste, or add a photo to import your first garment.")}</p>}

        {!!items.length && (
          <div className={`wardrobe-browser${filterRailOpen ? " has-filter-rail" : ""}`}>
            <div id="wardrobe-filter-rail">
              <FilterRail
                open={filterRailOpen}
                filters={{ ...filters, type: activeType }}
                facets={facets}
                typeCounts={typeCounts}
                onChange={changeFilters}
                onClear={clearFilters}
                onClose={() => setFilterRailOpen(false)}
                onSaveView={() => setSavedViewDialogOpen(true)}
              />
            </div>
            <div className="wardrobe-results">
              {mergeSourceItem && (
                <div className="merge-selection-banner" role="status">
                  <ArrowsLeftRight size={20} weight="light" aria-hidden="true" />
                  <span>
                    <strong>{tr("Select a garment to merge")}</strong>
                    <small>{tr("Choose the second garment for {name} from the wardrobe below.", { name: mergeSourceItem.name })}</small>
                  </span>
                  <button type="button" onClick={cancelGarmentMerge}>{tr("Cancel")}</button>
                </div>
              )}
              {!mergeSourceItem && !!savedViews.length && (
                <div className="saved-view-bar">
                  <div className="saved-view-chips">
                    <button type="button" className={!activeSavedViewId ? "active" : ""} onClick={clearFilters}>{tr("All wardrobe")}</button>
                    {savedViews.map((view) => (
                      <span className={activeSavedViewId === view.id ? "active" : ""} key={view.id}>
                        <button type="button" onClick={() => applySavedView(view)}>{view.name}</button>
                        <button type="button" onClick={() => setSavedViewDeleteCandidate(view)} aria-label={tr("Delete {name} saved view", { name: view.name })}><X size={11} aria-hidden="true" /></button>
                      </span>
                    ))}
                  </div>
                  <small className="saved-view-count">{tr("{visible} of {total} garments", { visible: visibleItems.length, total: items.length })}</small>
                </div>
              )}
              {!galleryItems.length ? (
                <div className="filtered-empty">
                  <MagnifyingGlass size={28} weight="light" aria-hidden="true" />
                  <h2>{tr("No garments match this view")}</h2>
                  <p>{tr("Try removing a facet or clearing the search.")}</p>
                  <button type="button" onClick={clearFilters}>{tr("Clear filters")}</button>
                </div>
              ) : (
                <section className={`gallery-grid density-${gridDensity}${groupMode !== "none" && !mergeSourceItem ? " is-grouped" : ""}${mergeSourceItem ? " is-merge-selecting" : ""}`} aria-label={mergeSourceItem ? tr("Choose a garment to merge") : tr("{category} wardrobe items", { category: tr(TYPE_MAP[activeType]?.label || "All") })}>
                  {groupMode !== "none" && !mergeSourceItem
                    ? wardrobeSections.flatMap((section) => [
                        <header className="wardrobe-section-heading" key={`heading-${section.id}`}>
                          {!!section.tones?.length && (
                            <span className="wardrobe-section-swatches" aria-hidden="true">
                              {section.tones.map((tone) => <i key={tone} style={{ background: tone }} />)}
                            </span>
                          )}
                          {groupMode === "type" && TYPE_MAP[section.id]?.icon && (() => {
                            const SectionIcon = TYPE_MAP[section.id].icon;
                            return <SectionIcon className="wardrobe-section-type-icon" size={20} weight="regular" aria-hidden="true" />;
                          })()}
                          {groupMode === "brand" && !section.missing && <BrandIcon brand={section.label} size={18} />}
                          <h2>{tr(section.label)}</h2>
                          <span>{tr(section.items.length === 1 ? "{count} garment" : "{count} garments", { count: section.items.length })}</span>
                        </header>,
                        ...section.items.map((item) => (
                          <GalleryItem
                            key={item.id}
                            item={item}
                            display={wardrobeDisplay}
                            selected={selectedId === item.id}
                            onOpen={openItem}
                            priority={(visibleItemIndex.get(item.id) ?? Infinity) < 8}
                          />
                        )),
                      ])
                    : galleryItems.map((item) => (
                        <GalleryItem
                          key={item.id}
                          item={item}
                          display={wardrobeDisplay}
                          selected={selectedId === item.id}
                          mergeMode={Boolean(mergeSourceItem)}
                          mergeSource={mergeSourceItem?.id === item.id}
                          onOpen={openItem}
                          priority={(visibleItemIndex.get(item.id) ?? Infinity) < 8}
                          draggable={!mergeSourceItem && sortMode === "custom" && groupMode === "none" && organizationStatus !== "saving" && !selectedFilterCount}
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
            </div>
          </div>
        )}
      </main>

      {originalPhotosOpen && (
        <OriginalPhotoGallery
          photos={originalPhotoLibrary}
          generatedPhotos={generatedPhotoLibrary}
          selectedId={selectedOriginalPhotoId}
          onSelect={setSelectedOriginalPhotoId}
          onClose={closeOriginalPhotos}
          onOpenGarment={(id) => {
            closeOriginalPhotos();
            openItem(id);
          }}
        />
      )}
      {selectedItem && (
        <ItemViewer
          item={selectedItem}
          currency={normalizePurchaseCurrency(currentUser?.preferredCurrency)}
          backgroundReferences={currentUser?.backgroundReferences || []}
          onClose={closeViewer}
          onSave={saveItem}
          onDelete={deleteItem}
          onGenerateModeled={generateModeledLook}
          onRegenerateGarment={regenerateGarment}
          onCenterGarmentRegeneration={centerGarmentRegeneration}
          onAcceptGarmentRegeneration={acceptGarmentRegeneration}
          onDiscardGarmentRegeneration={discardGarmentRegeneration}
          onCreateVariant={createColorVariant}
          onSelectColorVersion={selectColorVersion}
          onReorderColorVersions={reorderColorVersions}
          onDeleteColorVersion={deleteColorVersion}
          onDeleteModeled={deleteModeledLook}
          onArchiveGarment={archiveGarment}
          onArchiveModeled={archiveModeledLook}
          onDeleteSourcePhoto={deleteSourcePhoto}
          onReorderMedia={reorderGarmentMedia}
          onDirtyChange={setViewerDirty}
          blockedSwitchSignal={blockedSwitchSignal}
          canMerge={items.length > 1}
          mergeSelecting={mergeSourceItem?.id === selectedItem.id}
          onBeginMerge={beginGarmentMerge}
          onCancelMerge={cancelGarmentMerge}
        />
      )}
      {mergeSourceItem && mergeCandidateItem && (
        <GarmentMergeDialog
          first={mergeSourceItem}
          second={mergeCandidateItem}
          keepId={mergeKeepId}
          busy={mergeBusy}
          error={mergeError}
          onKeep={setMergeKeepId}
          onCancel={cancelGarmentMerge}
          onConfirm={confirmGarmentMerge}
        />
      )}
      {!!currentUser && (
        <ProfileMenu
          users={users}
          currentUser={currentUser}
          canCreate={isOwner}
          connectionCount={connectionsData.notificationCount || 0}
          originalPhotoCount={originalPhotoLibrary.length + generatedPhotoLibrary.length}
          onConnections={() => { setConnectionsError(""); setConnectionsOpen(true); }}
          onOriginalPhotos={() => {
            setSelectedOriginalPhotoId(null);
            setOriginalPhotosOpen(true);
          }}
          onVault={() => setVaultOpen(true)}
          onCreate={() => { setProfileInitialTab("basics"); setProfileError(""); setProfileEditor("new"); }}
          onSelect={selectUser}
          onEdit={() => { setProfileInitialTab("basics"); setProfileError(""); setProfileEditor(currentUser.id); }}
          onExport={downloadPersonalData}
          onLogout={auth.enabled ? logout : null}
        />
      )}
      {currentUser && (
        <WardrobeImportFlow
          key={`${currentUser.id}:${currentUser.updatedAt}`}
          userId={currentUser.id}
          onGarmentApproved={addImportedItem}
        />
      )}
      {openRouterKeyDialogOpen && (
        <OpenRouterKeyDialog
          busy={openRouterKeyBusy}
          error={openRouterKeyError}
          saved={openRouterKeySaved}
          onClose={closeOpenRouterKeyDialog}
          onSave={saveOpenRouterKey}
        />
      )}
      {connectionsOpen && (
        <ConnectionsDialog
          data={connectionsData}
          busy={connectionsBusy}
          error={connectionsError}
          onClose={() => !connectionsBusy && setConnectionsOpen(false)}
          onInvite={inviteConnection}
          onRespond={respondToConnection}
          onCancelInvite={cancelConnectionInvite}
          onUpdate={updateConnection}
          onDisconnect={disconnectConnection}
        />
      )}
      {vaultOpen && currentUser && (
        <VaultDialog
          user={currentUser}
          onClose={() => setVaultOpen(false)}
          onRestore={restoreVaultEntry}
          onSetUpPassword={() => {
            setVaultOpen(false);
            setProfileInitialTab("vault");
            setProfileError("");
            setProfileEditor(currentUser.id);
          }}
        />
      )}
      {profileEditor && (
        <ProfileEditor
          user={profileEditor === "new" ? null : users.find((user) => user.id === profileEditor)}
          busy={profileBusy}
          error={profileError}
          canManageAccount={isOwner}
          initialTab={profileInitialTab}
          onClose={() => !profileBusy && setProfileEditor(null)}
          onSave={saveProfile}
          onStartTutorial={users.find((user) => user.id === profileEditor)?.id === auth?.user?.id ? startTutorial : null}
        />
      )}
      {savedViewDialogOpen && (
        <SavedViewDialog
          onClose={() => setSavedViewDialogOpen(false)}
          onSave={saveCurrentView}
        />
      )}
      {savedViewDeleteCandidate && (
        <SavedViewDeleteDialog
          view={savedViewDeleteCandidate}
          busy={savedViewDeleteBusy}
          onClose={() => !savedViewDeleteBusy && setSavedViewDeleteCandidate(null)}
          onConfirm={() => deleteSavedView(savedViewDeleteCandidate.id)}
        />
      )}
      {plannerOpen && currentUser && (
        <WardrobePlanner
          user={currentUser}
          items={items}
          busy={plannerBusy}
          error={plannerError}
          viewerItemId={selectedId}
          onClose={() => !plannerBusy && setPlannerOpen(false)}
          onGenerate={generateWardrobePlan}
          onGenerateOutfit={generatePlannedOutfitLook}
          onAddOutfitIdeas={addPlannedOutfitIdeas}
          onSelectVariant={selectPlannedGarmentVersion}
          onDelete={deleteWardrobePlan}
          onOpenItem={(id) => {
            if (selectedId === id) closeViewer();
            else openItem(id);
          }}
        />
      )}
      {outfitStudioOpen && currentUser && (
        <OutfitStudio
          user={currentUser}
          items={items}
          connections={studioConnections}
          onClose={() => setOutfitStudioOpen(false)}
          onSave={saveWardrobeOutfit}
          onDelete={deleteWardrobeOutfit}
          onRefine={refineWardrobeOutfit}
          onGenerateName={nameWardrobeOutfit}
          onReorder={reorderWardrobeOutfits}
          onGenerate={generateWardrobeOutfitLook}
          onDeleteLook={deleteWardrobeOutfitLook}
          onArchiveLook={archiveWardrobeOutfitLook}
        />
      )}
      {tutorialOpen && currentUser?.id === auth?.user?.id && (
        <TutorialWalkthrough
          step={tutorialStep}
          userName={currentUser.name}
          garmentCount={items.length}
          hasSelectedGarment={Boolean(selectedItem)}
          onAdvance={advanceTutorial}
          onCancel={cancelTutorial}
          onOpenProfile={() => { setProfileInitialTab("basics"); setProfileError(""); setProfileEditor(currentUser.id); }}
          onOpenImporter={openTutorialImporter}
          onOpenPlanner={openTutorialPlanner}
          onOpenOutfitStudio={openTutorialOutfitStudio}
          onFinish={finishTutorial}
        />
      )}
    </div>
  );
}
