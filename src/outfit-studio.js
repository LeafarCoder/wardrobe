import { garmentColorVariants } from "./garment-variants.js";
import { MODELED_LOOK_CONTEXT_OPTIONS, normalizeModeledLookContext } from "./modeled-look-context.js";

export const OUTFIT_OCCASIONS = [
  { id: "everyday", label: "Everyday" },
  { id: "work", label: "Work" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "romantic-dinner", label: "Romantic dinner" },
  { id: "night-out", label: "Night out" },
  { id: "wedding", label: "Wedding" },
  { id: "picnic", label: "Picnic" },
  { id: "walk", label: "Walk" },
];

export const OUTFIT_WEATHER = [
  { id: "hot", label: "Hot" },
  { id: "mild", label: "Mild" },
  { id: "cold", label: "Cold" },
  { id: "rain", label: "Rain" },
  { id: "wind", label: "Wind" },
];

export const OUTFIT_BACKGROUNDS = [
  { id: "automatic", label: "Automatic" },
  { id: "studio", label: "Studio" },
  { id: "city-street", label: "City street" },
  { id: "restaurant", label: "Restaurant" },
  { id: "park", label: "Park or nature" },
  { id: "home", label: "Home interior" },
  { id: "event-venue", label: "Event venue" },
];

export const OUTFIT_STYLES = [
  { id: "automatic", label: "Automatic" },
  { id: "editorial", label: "Editorial" },
  { id: "candid", label: "Candid" },
  { id: "street-style", label: "Street style" },
  { id: "cinematic", label: "Cinematic" },
  { id: "minimal", label: "Minimal" },
];

export const OUTFIT_POSES = [
  { id: "automatic", label: "Automatic" },
  ...MODELED_LOOK_CONTEXT_OPTIONS.pose,
  { id: "picnic-seated", label: "Seated on a picnic blanket", prompt: "seated naturally on a picnic blanket" },
  { id: "picnic-lying", label: "Lying on a picnic blanket", prompt: "lying naturally on a picnic blanket" },
];

export const OUTFIT_HAIRSTYLES = [
  { id: "automatic", label: "Automatic", prompt: "" },
  ...MODELED_LOOK_CONTEXT_OPTIONS.hairstyle,
];

export const OUTFIT_SEASONS = ["spring", "summer", "autumn", "winter"];
export const OUTFIT_MAX_GARMENTS = 10;
export const OUTFIT_MAX_PEOPLE = 4;

const OCCASION_IDS = new Set(OUTFIT_OCCASIONS.map((option) => option.id));
const WEATHER_IDS = new Set(OUTFIT_WEATHER.map((option) => option.id));
const BACKGROUND_IDS = new Set(OUTFIT_BACKGROUNDS.map((option) => option.id));
const STYLE_IDS = new Set(OUTFIT_STYLES.map((option) => option.id));
const POSE_IDS = new Set(OUTFIT_POSES.map((option) => option.id));
const HAIRSTYLE_IDS = new Set(OUTFIT_HAIRSTYLES.map((option) => option.id));
const SEASON_IDS = new Set(OUTFIT_SEASONS);
const SOURCE_IDS = new Set(["manual", "local", "ai"]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uniqueText(values, allowed, maxItems = 8) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, 80);
    if (!allowed.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

export function currentNorthernSeason(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const month = Number.isFinite(date.getTime()) ? date.getMonth() : new Date().getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

export function normalizeOutfitContext(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    occasion: OCCASION_IDS.has(source.occasion) ? source.occasion : "",
    weather: uniqueText(source.weather, WEATHER_IDS, OUTFIT_WEATHER.length),
    season: SEASON_IDS.has(source.season) ? source.season : "",
  };
}

export function normalizeOutfitPresentation(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const seenPeople = new Set();
  const people = (Array.isArray(source.people) ? source.people : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const personId = cleanText(entry.personId, 80);
    if (!personId || seenPeople.has(personId)) return [];
    seenPeople.add(personId);
    return [{
      personId,
      pose: POSE_IDS.has(entry.pose) ? entry.pose : "automatic",
      hairstyle: HAIRSTYLE_IDS.has(entry.hairstyle) ? entry.hairstyle : "automatic",
      direction: cleanText(entry.direction, 300),
    }];
  }).slice(0, OUTFIT_MAX_PEOPLE);
  return {
    background: BACKGROUND_IDS.has(source.background) ? source.background : "automatic",
    style: STYLE_IDS.has(source.style) ? source.style : "automatic",
    pose: POSE_IDS.has(source.pose) ? source.pose : "automatic",
    direction: cleanText(source.direction, 300),
    people,
  };
}

export function outfitPresentationForPeople(value = {}, personIds = []) {
  const presentation = normalizeOutfitPresentation(value);
  const existing = new Map(presentation.people.map((entry) => [entry.personId, entry]));
  const seen = new Set();
  const normalizedIds = (Array.isArray(personIds) ? personIds : []).flatMap((personId) => {
    const id = cleanText(personId, 80);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [id];
  }).slice(0, OUTFIT_MAX_PEOPLE);
  return {
    ...presentation,
    people: normalizedIds.map((personId, index) => existing.get(personId) || {
      personId,
      pose: normalizedIds.length === 1 && index === 0 ? presentation.pose : "automatic",
      hairstyle: "automatic",
      direction: "",
    }),
  };
}

export function outfitPosePrompt(value) {
  return OUTFIT_POSES.find((option) => option.id === value)?.prompt || "";
}

export function outfitHairstylePrompt(value) {
  return OUTFIT_HAIRSTYLES.find((option) => option.id === value)?.prompt || "";
}

export function normalizeOutfitGarments(value = {}) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.garments)
      ? value.garments
      : Array.isArray(value?.itemIds)
        ? value.itemIds.map((itemId) => ({ itemId }))
        : [];
  const seen = new Set();
  return source.flatMap((entry) => {
    const item = typeof entry === "string" ? { itemId: entry } : entry;
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const itemId = cleanText(item.itemId, 100);
    if (!itemId || seen.has(itemId)) return [];
    seen.add(itemId);
    const variantId = cleanText(item.variantId, 100) || null;
    const ownerId = cleanText(item.ownerId, 80) || null;
    const wearerId = cleanText(item.wearerId, 80) || ownerId;
    return [{ itemId, variantId, ownerId, wearerId }];
  }).slice(0, OUTFIT_MAX_GARMENTS);
}

export function normalizeOutfitCompanions(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const userId = cleanText(typeof entry === "string" ? entry : entry?.userId, 80);
    if (!userId || seen.has(userId)) return [];
    seen.add(userId);
    return [userId];
  }).slice(0, 3);
}

function normalizeModeledLooks(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((look) => {
    if (!look || typeof look !== "object" || Array.isArray(look)) return [];
    const id = cleanText(look.id, 80);
    const image = cleanText(look.image, 500);
    if (!id || !image || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      image,
      preview: cleanText(look.preview, 500) || null,
      model: cleanText(look.model, 180) || null,
      fallbackUsed: Boolean(look.fallbackUsed),
      generatedAt: cleanText(look.generatedAt, 40) || null,
      presentation: normalizeOutfitPresentation(look.presentation),
      context: normalizeModeledLookContext(look.context),
    }];
  }).slice(0, 12);
}

export function normalizeWardrobeOutfits(value = []) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source.flatMap((outfit, index) => {
    if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) return [];
    const candidateId = cleanText(outfit.id, 80);
    const id = candidateId || `outfit-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: cleanText(outfit.name, 100) || `Outfit ${index + 1}`,
      garments: normalizeOutfitGarments(outfit),
      companions: normalizeOutfitCompanions(outfit.companions),
      context: normalizeOutfitContext(outfit.context),
      presentation: normalizeOutfitPresentation(outfit.presentation),
      source: SOURCE_IDS.has(outfit.source) ? outfit.source : "manual",
      explanation: cleanText(outfit.explanation, 500),
      modeledLooks: normalizeModeledLooks(outfit.modeledLooks),
      createdAt: cleanText(outfit.createdAt, 40) || null,
      updatedAt: cleanText(outfit.updatedAt, 40) || null,
    }];
  }).slice(0, 100);
}

export function wardrobeOutfitsAfterGarmentMerge(value, keeperId, discardedId) {
  return normalizeWardrobeOutfits(value).map((outfit) => {
    const alreadyUsesKeeper = outfit.garments.some((garment) => garment.itemId === keeperId);
    const seen = new Set();
    const garments = outfit.garments.flatMap((garment) => {
      if (alreadyUsesKeeper && garment.itemId === discardedId) return [];
      const itemId = garment.itemId === discardedId ? keeperId : garment.itemId;
      if (seen.has(itemId)) return [];
      seen.add(itemId);
      return [{
        ...garment,
        itemId,
        ...(garment.itemId === discardedId ? { variantId: null } : {}),
      }];
    });
    return { ...outfit, garments };
  });
}

export function wardrobeOutfitAssets(value = []) {
  return normalizeWardrobeOutfits(value).flatMap((outfit) => (
    outfit.modeledLooks.flatMap((look) => [look.image, look.preview].filter(Boolean))
  ));
}

function itemWords(item) {
  return [item.name, item.brand, ...(item.tags || []), ...(item.materials || []), ...(item.fits || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

const OCCASION_TERMS = {
  work: ["work", "office", "business", "formal", "tailored", "shirt", "blazer"],
  lunch: ["casual", "smart", "light", "shirt", "dress"],
  dinner: ["smart", "elegant", "evening", "formal", "dark"],
  "romantic-dinner": ["romantic", "elegant", "evening", "dress", "silk", "satin"],
  "night-out": ["party", "evening", "bold", "dress", "leather", "sparkle"],
  wedding: ["wedding", "formal", "elegant", "tailored", "dress", "suit"],
  picnic: ["casual", "cotton", "linen", "comfortable", "light"],
  walk: ["casual", "comfortable", "walking", "sneaker", "light"],
  everyday: ["casual", "comfortable", "everyday"],
};

const WEATHER_TERMS = {
  hot: ["linen", "cotton", "light", "breathable", "short", "sandal"],
  mild: ["cotton", "light", "layer"],
  cold: ["wool", "knit", "warm", "coat", "jacket", "boot"],
  rain: ["waterproof", "rain", "coat", "boot", "jacket"],
  wind: ["wind", "coat", "jacket", "layer"],
};

function scoreItem(item, context) {
  const words = itemWords(item);
  const seasonScore = !context.season || !(item.seasons || []).length || item.seasons.includes(context.season) ? 5 : -8;
  const occasionScore = (OCCASION_TERMS[context.occasion] || []).reduce((score, term) => score + (words.includes(term) ? 2 : 0), 0);
  const weatherScore = context.weather.flatMap((weather) => WEATHER_TERMS[weather] || [])
    .reduce((score, term) => score + (words.includes(term) ? 1.5 : 0), 0);
  const outerwearWeather = item.part === "wholebody_up" && context.weather.some((weather) => ["cold", "rain", "wind"].includes(weather)) ? 5 : 0;
  return seasonScore + occasionScore + weatherScore + outerwearWeather;
}

function ranked(items, context, random) {
  return [...items]
    .map((item) => ({ item, score: scoreItem(item, context), tie: random() }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .map((entry) => entry.item);
}

export function generateLocalOutfitCandidates(items = [], inputContext = {}, options = {}) {
  const context = normalizeOutfitContext(inputContext);
  const random = typeof options.random === "function" ? options.random : Math.random;
  const count = Math.max(1, Math.min(3, Number(options.count) || 3));
  const usable = (Array.isArray(items) ? items : []).filter((item) => item?.id && item?.part);
  const groups = Object.fromEntries(["upperbody", "wholebody_up", "lowerbody", "wholebody", "shoes", "accessories_up"]
    .map((part) => [part, usable.filter((item) => item.part === part)]));
  const candidates = [];
  const signatures = new Set();
  for (let attempt = 0; attempt < 30 && candidates.length < count; attempt += 1) {
    const choice = (part, offset = 0) => {
      const values = ranked(groups[part], context, random);
      return values.length ? values[(attempt + offset) % values.length] : null;
    };
    const preferDress = groups.wholebody.length && (attempt % 2 === 1 || !groups.upperbody.length || !groups.lowerbody.length);
    const selected = preferDress
      ? [choice("wholebody")]
      : [choice("upperbody"), choice("lowerbody", 1)];
    selected.push(choice("shoes", 2));
    const needsOuterwear = context.weather.some((weather) => ["cold", "rain", "wind"].includes(weather));
    if (needsOuterwear || attempt % 3 === 0) selected.push(choice("wholebody_up", 3));
    if (attempt % 2 === 0 || selected.filter(Boolean).length < 3) selected.push(choice("accessories_up", 4));
    const itemIds = [...new Set(selected.filter(Boolean).map((item) => item.id))].slice(0, OUTFIT_MAX_GARMENTS);
    if (!itemIds.length) break;
    const signature = [...itemIds].sort().join("|");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    candidates.push({ garments: itemIds.map((itemId) => ({ itemId, variantId: null })) });
  }
  if (candidates.length < count) {
    const addCandidate = (values) => {
      const itemIds = [...new Set(values.filter(Boolean).map((item) => item.id))].slice(0, OUTFIT_MAX_GARMENTS);
      const signature = [...itemIds].sort().join("|");
      if (!itemIds.length || signatures.has(signature)) return;
      signatures.add(signature);
      candidates.push({ garments: itemIds.map((itemId) => ({ itemId, variantId: null })) });
    };
    const tops = ranked(groups.upperbody, context, random);
    const bottoms = ranked(groups.lowerbody, context, random);
    const dresses = ranked(groups.wholebody, context, random);
    const shoes = ranked(groups.shoes, context, random);
    const outerwear = ranked(groups.wholebody_up, context, random);
    const accessories = ranked(groups.accessories_up, context, random);
    for (const dress of dresses) {
      for (const shoe of shoes.length ? shoes : [null]) {
        addCandidate([dress, shoe, accessories[0], outerwear[0]]);
        if (candidates.length >= count) break;
      }
      if (candidates.length >= count) break;
    }
    for (const top of tops) {
      for (const bottom of bottoms) {
        for (const shoe of shoes.length ? shoes : [null]) {
          addCandidate([top, bottom, shoe, accessories[0], outerwear[0]]);
          if (candidates.length >= count) break;
        }
        if (candidates.length >= count) break;
      }
      if (candidates.length >= count) break;
    }
  }
  return candidates.slice(0, count);
}

export function outfitGarmentSource(item, variantId = null) {
  const variant = variantId ? garmentColorVariants(item).find((candidate) => candidate.id === variantId) : null;
  return variant?.thumbnail || variant?.preview || variant?.image || item?.thumbnail || item?.imagePreview || item?.image || null;
}

export const OUTFIT_TRANSLATION_KEYS = [
  ...OUTFIT_OCCASIONS.map((option) => option.label),
  ...OUTFIT_WEATHER.map((option) => option.label),
  ...OUTFIT_BACKGROUNDS.map((option) => option.label),
  ...OUTFIT_STYLES.map((option) => option.label),
  ...OUTFIT_POSES.map((option) => option.label),
  ...OUTFIT_HAIRSTYLES.map((option) => option.label),
];
