import { colorGroup } from "./color-organization.js";

export const WARDROBE_ITEM_TYPES = new Set([
  "all",
  "upperbody",
  "wholebody_up",
  "lowerbody",
  "wholebody",
  "accessories_up",
  "shoes",
]);

export const SEASON_OPTIONS = [
  { id: "spring", label: "Spring" },
  { id: "summer", label: "Summer" },
  { id: "autumn", label: "Autumn" },
  { id: "winter", label: "Winter" },
];
const SEASON_IDS = new Set(SEASON_OPTIONS.map((season) => season.id));
const LEGACY_ALL_SEASON_IDS = new Set(["all-season", "all season", "all seasons"]);

export const MATERIAL_SUGGESTIONS = [
  "Cotton",
  "Linen",
  "Wool",
  "Cashmere",
  "Silk",
  "Denim",
  "Leather",
  "Suede",
  "Viscose",
  "Polyester",
  "Nylon",
  "Knit",
];

export const GARMENT_FIT_SUGGESTIONS = [
  "Slim",
  "Regular",
  "Relaxed",
  "Oversized",
  "Cropped",
  "Tailored",
  "Straight",
  "Wide-leg",
];

export const GRID_DENSITIES = [
  { id: "airy", label: "Airy" },
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

export const WARDROBE_SHOWCASE_MODES = [
  { id: "pieces", label: "Garments" },
  { id: "details", label: "Details" },
];

export const WARDROBE_BACKGROUND_STYLES = [
  { id: "none", label: "No background", color: null },
  { id: "white", label: "White", color: "#ffffff" },
  { id: "beige", label: "Beige", color: "#efe3cf" },
  { id: "light-blue", label: "Light blue", color: "#dceaf1" },
  { id: "soft-gray", label: "Soft gray", color: "#e3e3e1" },
  { id: "blush", label: "Soft blush", color: "#f2dfdc" },
];

export const WARDROBE_DETAIL_FIELDS = [
  { id: "name", label: "Name" },
  { id: "brand", label: "Brand" },
  { id: "tags", label: "Tags" },
  { id: "materials", label: "Materials" },
  { id: "sizes", label: "Size" },
  { id: "fits", label: "Fit" },
  { id: "seasons", label: "Season" },
];

const DEFAULT_WARDROBE_DETAIL_FIELDS = ["name", "brand", "tags"];
const WARDROBE_DETAIL_FIELD_IDS = new Set(WARDROBE_DETAIL_FIELDS.map((field) => field.id));

export const DEFAULT_WARDROBE_DISPLAY = Object.freeze({
  mode: "pieces",
  density: "comfortable",
  detailFields: DEFAULT_WARDROBE_DETAIL_FIELDS,
  backgroundStyle: "none",
});

export const DEFAULT_WARDROBE_FILTERS = Object.freeze({
  query: "",
  type: "all",
  colors: [],
  brands: [],
  tags: [],
  sizes: [],
  fits: [],
  materials: [],
  seasons: [],
});

const FACET_KEYS = ["colors", "brands", "tags", "sizes", "fits", "materials", "seasons"];
const WARDROBE_SORT_MODE_IDS = new Set(["custom", "updated", "purchase-oldest"]);
const WARDROBE_GROUP_MODE_IDS = new Set(["none", "color", "type", "brand", "purchase-year"]);
const VIEW_ID = /^[a-z0-9-]{1,80}$/i;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

const cleanText = (value, maxLength) => (
  typeof value === "string" ? value.trim().slice(0, maxLength) : ""
);

export function normalizeGarmentFacetList(value, maxItems = 12) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const unique = new Map();
  for (const entry of source) {
    const cleaned = cleanText(entry, 40);
    if (!cleaned) continue;
    const key = cleaned.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, cleaned);
  }
  return [...unique.values()].slice(0, maxItems);
}

export function normalizeGarmentSeasons(value) {
  const seasons = normalizeGarmentFacetList(value, 8).map((season) => season.toLocaleLowerCase());
  if (seasons.some((season) => LEGACY_ALL_SEASON_IDS.has(season))) {
    return SEASON_OPTIONS.map((season) => season.id);
  }
  return seasons.filter((season) => SEASON_IDS.has(season));
}

export function normalizeWardrobeFilters(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const filters = {
    query: cleanText(input.query, 100),
    type: WARDROBE_ITEM_TYPES.has(input.type) ? input.type : "all",
  };
  for (const key of FACET_KEYS) {
    filters[key] = key === "seasons"
      ? normalizeGarmentSeasons(input[key])
      : normalizeGarmentFacetList(input[key], 24);
  }
  return filters;
}

export function normalizeWardrobeDisplayPreferences(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const detailSource = Array.isArray(input.detailFields)
    ? input.detailFields
    : DEFAULT_WARDROBE_DETAIL_FIELDS;
  const detailFields = [...new Set(detailSource)]
    .filter((field) => WARDROBE_DETAIL_FIELD_IDS.has(field));
  const backgroundStyle = WARDROBE_BACKGROUND_STYLES.some((style) => style.id === input.backgroundStyle)
    ? input.backgroundStyle
    : input.tileBackground === true ? "soft-gray" : "none";
  return {
    mode: WARDROBE_SHOWCASE_MODES.some((mode) => mode.id === input.mode) ? input.mode : "pieces",
    density: GRID_DENSITIES.some((density) => density.id === input.density) ? input.density : "comfortable",
    detailFields,
    backgroundStyle,
  };
}

export function normalizeSavedViews(value = {}) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((view, index) => {
    if (!view || typeof view !== "object" || Array.isArray(view)) return [];
    const candidateId = cleanText(view.id, 80);
    const id = VIEW_ID.test(candidateId) ? candidateId : `view-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const name = cleanText(view.name, 48);
    if (!name) return [];
    const legacyMode = cleanText(view.organizationMode, 40);
    return [{
      id,
      name,
      filters: normalizeWardrobeFilters(view.filters),
      sortMode: WARDROBE_SORT_MODE_IDS.has(view.sortMode)
        ? view.sortMode
        : WARDROBE_SORT_MODE_IDS.has(legacyMode) ? legacyMode : "custom",
      groupMode: WARDROBE_GROUP_MODE_IDS.has(view.groupMode)
        ? view.groupMode
        : legacyMode === "color" ? "color" : "none",
      density: GRID_DENSITIES.some((density) => density.id === view.density)
        ? view.density
        : "comfortable",
      createdAt: cleanText(view.createdAt, 40) || null,
    }];
  }).slice(0, 20);
}

export function groupWardrobeItems(items = [], mode = "none", options = {}) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length || mode === "none") return [];

  if (mode === "color") {
    const groups = Array.isArray(options.colorGroups) ? options.colorGroups : [];
    return groups.map((group) => ({
      ...group,
      items: source.filter((item) => colorGroup(item).id === group.id),
    })).filter((group) => group.items.length);
  }

  if (mode === "type") {
    const groups = (Array.isArray(options.typeGroups) ? options.typeGroups : [])
      .filter((group) => group.id !== "all");
    const knownIds = new Set(groups.map((group) => group.id));
    const sections = groups.map((group) => ({
      id: group.id,
      label: group.label,
      items: source.filter((item) => item.part === group.id),
    })).filter((group) => group.items.length);
    const otherItems = source.filter((item) => !knownIds.has(item.part));
    if (otherItems.length) sections.push({ id: "other", label: "Other garments", items: otherItems });
    return sections;
  }

  if (mode === "brand") {
    const groups = new Map();
    for (const item of source) {
      const label = cleanText(item.brand, 80);
      const key = label ? label.toLocaleLowerCase() : "__unbranded";
      if (!groups.has(key)) {
        groups.set(key, {
          id: `brand-${key}`,
          label: label || "Unbranded",
          items: [],
          missing: !label,
        });
      }
      groups.get(key).items.push(item);
    }
    return [...groups.values()].sort((first, second) => (
      Number(first.missing) - Number(second.missing)
      || first.label.localeCompare(second.label)
    ));
  }

  if (mode === "purchase-year") {
    const groups = new Map();
    for (const item of source) {
      const match = typeof item.purchaseMonth === "string"
        ? item.purchaseMonth.trim().match(/^(\d{4})(?:-\d{2})?$/)
        : null;
      const year = match?.[1] || "";
      const key = year || "__unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          id: `purchase-year-${key}`,
          label: year || "Unknown acquisition year",
          year: year ? Number(year) : null,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }
    return [...groups.values()].sort((first, second) => (
      Number(first.year === null) - Number(second.year === null)
      || (second.year || 0) - (first.year || 0)
    ));
  }

  return [];
}

export function normalizeWardrobePlans(value = {}) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((plan, index) => {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
    const candidateId = cleanText(plan.id, 80);
    const id = VIEW_ID.test(candidateId) ? candidateId : `plan-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const input = plan.input && typeof plan.input === "object" && !Array.isArray(plan.input) ? plan.input : {};
    const result = plan.result && typeof plan.result === "object" && !Array.isArray(plan.result) ? plan.result : {};
    const normalizeItemIds = (values) => {
      const unique = new Set();
      for (const value of Array.isArray(values) ? values : []) {
        const idValue = cleanText(value, 100);
        if (idValue) unique.add(idValue);
      }
      return [...unique].slice(0, 12);
    };
    const normalizeTextList = (values, maxItems, maxLength) => {
      const unique = new Map();
      for (const value of Array.isArray(values) ? values : []) {
        const text = cleanText(value, maxLength);
        const key = text.toLocaleLowerCase();
        if (text && !unique.has(key)) unique.set(key, text);
      }
      return [...unique.values()].slice(0, maxItems);
    };
    const normalizeItems = (items, mapper, maxItems) => (
      (Array.isArray(items) ? items : []).flatMap((item) => (
        item && typeof item === "object" && !Array.isArray(item) ? [mapper(item)] : []
      )).slice(0, maxItems)
    );
    const normalizeModeledLooks = (outfit) => {
      const candidates = Array.isArray(outfit.modeledLooks) && outfit.modeledLooks.length
        ? outfit.modeledLooks
        : outfit.modeledLook ? [outfit.modeledLook] : [];
      const looks = normalizeItems(candidates, (look) => ({
        id: cleanText(look.id, 80),
        image: cleanText(look.image, 500),
        preview: cleanText(look.preview, 500) || null,
        model: cleanText(look.model, 180) || null,
        fallbackUsed: Boolean(look.fallbackUsed),
        generatedAt: cleanText(look.generatedAt, 40) || null,
      }), 12).filter((look) => look.id && look.image);
      return looks;
    };
    return [{
      id,
      createdAt: cleanText(plan.createdAt, 40) || null,
      input: {
        kind: input.kind === "event" ? "event" : "trip",
        title: cleanText(input.title, 100),
        location: cleanText(input.location, 120),
        startDate: DATE_VALUE.test(input.startDate) ? input.startDate : "",
        endDate: DATE_VALUE.test(input.endDate) ? input.endDate : "",
        notes: cleanText(input.notes, 500),
      },
      result: {
        summary: cleanText(result.summary, 600),
        expectedWeather: {
          summary: cleanText(result.expectedWeather?.summary, 500),
          temperatureRange: cleanText(result.expectedWeather?.temperatureRange, 120),
          conditions: normalizeTextList(result.expectedWeather?.conditions, 8, 80),
        },
        recommendedItems: normalizeItems(result.recommendedItems, (item) => ({
          itemId: cleanText(item.itemId, 100),
          reason: cleanText(item.reason, 240),
        }), 30),
        outfitIdeas: normalizeItems(result.outfitIdeas, (item) => {
          const modeledLooks = normalizeModeledLooks(item);
          return {
            name: cleanText(item.name, 100),
            itemIds: normalizeItemIds(item.itemIds),
            note: cleanText(item.note, 300),
            ...(modeledLooks.length ? {
              modeledLooks,
              modeledLook: modeledLooks.at(-1),
            } : {}),
          };
        }, 12),
        missingItems: normalizeItems(result.missingItems, (item) => ({
          name: cleanText(item.name, 100),
          searchQuery: cleanText(item.searchQuery, 100),
          category: cleanText(item.category, 60),
          reason: cleanText(item.reason, 260),
          priority: ["essential", "useful", "optional"].includes(item.priority) ? item.priority : "useful",
        }), 20),
        packingNotes: normalizeTextList(result.packingNotes, 12, 300),
        disclaimer: cleanText(result.disclaimer, 240),
      },
    }];
  }).slice(0, 12);
}

export function itemFacetValues(item = {}, key) {
  const values = key === "seasons"
    ? normalizeGarmentSeasons(item[key])
    : normalizeGarmentFacetList(item[key]);
  if (values.length || !["materials", "fits"].includes(key)) return values;
  const tags = normalizeGarmentFacetList(item.tags);
  const suggestions = key === "materials" ? MATERIAL_SUGGESTIONS : GARMENT_FIT_SUGGESTIONS;
  const suggestionKeys = new Set(suggestions.map((entry) => entry.toLocaleLowerCase()));
  return tags.filter((tag) => suggestionKeys.has(tag.toLocaleLowerCase()));
}

function includesAny(itemValues, selectedValues) {
  if (!selectedValues.length) return true;
  const available = new Set(itemValues.map((value) => value.toLocaleLowerCase()));
  return selectedValues.some((value) => available.has(value.toLocaleLowerCase()));
}

export function wardrobeItemMatches(item, value = {}) {
  const filters = normalizeWardrobeFilters(value);
  if (filters.type !== "all" && item.part !== filters.type) return false;
  if (filters.colors.length && !filters.colors.includes(colorGroup(item).id)) return false;
  if (!includesAny(normalizeGarmentFacetList([item.brand]), filters.brands)) return false;
  for (const key of ["tags", "sizes", "fits", "materials", "seasons"]) {
    if (!includesAny(itemFacetValues(item, key), filters[key])) return false;
  }
  if (!filters.query) return true;
  const haystack = [
    item.name,
    item.brand,
    ...(item.tags || []),
    ...itemFacetValues(item, "sizes"),
    ...itemFacetValues(item, "fits"),
    ...itemFacetValues(item, "materials"),
    ...itemFacetValues(item, "seasons"),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
  return filters.query.toLocaleLowerCase().split(/\s+/).every((term) => haystack.includes(term));
}

export function activeFilterCount(value = {}) {
  const filters = normalizeWardrobeFilters(value);
  return Number(Boolean(filters.query))
    + Number(filters.type !== "all")
    + FACET_KEYS.reduce((total, key) => total + filters[key].length, 0);
}

export function collectFacetOptions(items = []) {
  const collect = (key, getter = (item) => itemFacetValues(item, key)) => {
    const values = new Map();
    for (const item of items) {
      for (const value of getter(item)) {
        const id = value.toLocaleLowerCase();
        const existing = values.get(id);
        values.set(id, existing ? { ...existing, count: existing.count + 1 } : { id, label: value, count: 1 });
      }
    }
    return [...values.values()].sort((first, second) => (
      second.count - first.count || first.label.localeCompare(second.label)
    ));
  };
  return {
    colors: collect("colors", (item) => [colorGroup(item).id]),
    brands: collect("brands", (item) => normalizeGarmentFacetList([item.brand])),
    tags: collect("tags"),
    sizes: collect("sizes"),
    fits: collect("fits"),
    materials: collect("materials"),
    seasons: collect("seasons"),
  };
}
