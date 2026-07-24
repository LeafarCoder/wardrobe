export const BRAND_OPTIONS = [
  "Zara",
  "Bershka",
  "Stradivarius",
  "Pull&Bear",
  "Mango",
  "H&M",
  "Lefties",
  "Primark",
  "Massimo Dutti",
  "Uniqlo",
  "COS",
  "Arket",
  "& Other Stories",
  "C&A",
  "Levi's",
  "Nike",
  "Adidas",
  "Decathlon",
  "Vintage / second-hand",
];

export const CURRENCY_OPTIONS = [
  { id: "EUR", label: "EUR €" },
  { id: "USD", label: "USD $" },
  { id: "GBP", label: "GBP £" },
  { id: "CHF", label: "CHF" },
  { id: "CAD", label: "CAD $" },
  { id: "AUD", label: "AUD $" },
  { id: "BRL", label: "BRL R$" },
  { id: "JPY", label: "JPY ¥" },
];

export const CURRENCY_IDS = new Set(CURRENCY_OPTIONS.map((currency) => currency.id));

export const SIZE_FIELDS = [
  { id: "tops", label: "Tops" },
  { id: "bottoms", label: "Trousers & bottoms" },
  { id: "outerwear", label: "Outerwear" },
  { id: "shoes", label: "Shoes" },
  { id: "rings", label: "Rings" },
];

export const FIT_OPTIONS = [
  { id: "", label: "Not specified" },
  { id: "close", label: "Close / fitted" },
  { id: "regular", label: "Regular" },
  { id: "relaxed", label: "Relaxed" },
  { id: "oversized", label: "Oversized" },
];

export const SIZE_SYSTEMS = [
  {
    id: "",
    label: "Choose a sizing system",
    examples: { tops: "Your usual size", bottoms: "Size or waist", outerwear: "Your usual size", shoes: "Size + system", rings: "Size + system" },
    suggestions: { tops: [], bottoms: [], outerwear: [], shoes: [], rings: [] },
  },
  {
    id: "eu",
    label: "EU / International",
    examples: { tops: "M or EU 40", bottoms: "EU 40 or W32", outerwear: "EU 50", shoes: "EU 42", rings: "EU 58" },
    suggestions: {
      tops: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "EU 36", "EU 38", "EU 40", "EU 42", "EU 44", "EU 46"],
      bottoms: ["EU 34", "EU 36", "EU 38", "EU 40", "EU 42", "EU 44", "EU 46", "W28", "W30", "W32", "W34", "W36"],
      outerwear: ["EU 44", "EU 46", "EU 48", "EU 50", "EU 52", "EU 54", "EU 56"],
      shoes: ["EU 35", "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "EU 46"],
      rings: ["EU 48", "EU 50", "EU 52", "EU 54", "EU 56", "EU 58", "EU 60", "EU 62", "EU 64", "EU 66"],
    },
  },
  {
    id: "us",
    label: "United States",
    examples: { tops: "M or US 8", bottoms: "US 8 or W30", outerwear: "US 40", shoes: "US 9", rings: "US 8½" },
    suggestions: {
      tops: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "US 0", "US 2", "US 4", "US 6", "US 8", "US 10", "US 12", "US 14"],
      bottoms: ["US 0", "US 2", "US 4", "US 6", "US 8", "US 10", "US 12", "US 14", "W28", "W30", "W32", "W34", "W36"],
      outerwear: ["US 34", "US 36", "US 38", "US 40", "US 42", "US 44", "US 46"],
      shoes: ["US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12", "US 13"],
      rings: ["US 4", "US 5", "US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
    },
  },
  {
    id: "uk",
    label: "United Kingdom",
    examples: { tops: "M or UK 12", bottoms: "UK 12 or W30", outerwear: "UK 40", shoes: "UK 8", rings: "UK Q" },
    suggestions: {
      tops: ["XS", "S", "M", "L", "XL", "UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16", "UK 18"],
      bottoms: ["UK 6", "UK 8", "UK 10", "UK 12", "UK 14", "UK 16", "UK 18", "W28", "W30", "W32", "W34", "W36"],
      outerwear: ["UK 34", "UK 36", "UK 38", "UK 40", "UK 42", "UK 44", "UK 46"],
      shoes: ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"],
      rings: ["UK J", "UK K", "UK L", "UK M", "UK N", "UK O", "UK P", "UK Q", "UK R", "UK S", "UK T"],
    },
  },
  {
    id: "fr",
    label: "France",
    examples: { tops: "FR 40", bottoms: "FR 40", outerwear: "FR 50", shoes: "EU 42", rings: "FR 58" },
    suggestions: {
      tops: ["FR 34", "FR 36", "FR 38", "FR 40", "FR 42", "FR 44", "FR 46", "FR 48"],
      bottoms: ["FR 34", "FR 36", "FR 38", "FR 40", "FR 42", "FR 44", "FR 46", "FR 48"],
      outerwear: ["FR 44", "FR 46", "FR 48", "FR 50", "FR 52", "FR 54", "FR 56"],
      shoes: ["EU 35", "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45"],
      rings: ["FR 48", "FR 50", "FR 52", "FR 54", "FR 56", "FR 58", "FR 60", "FR 62", "FR 64"],
    },
  },
  {
    id: "it",
    label: "Italy",
    examples: { tops: "IT 44", bottoms: "IT 44", outerwear: "IT 50", shoes: "EU 42", rings: "IT 18" },
    suggestions: {
      tops: ["IT 38", "IT 40", "IT 42", "IT 44", "IT 46", "IT 48", "IT 50", "IT 52"],
      bottoms: ["IT 38", "IT 40", "IT 42", "IT 44", "IT 46", "IT 48", "IT 50", "IT 52"],
      outerwear: ["IT 44", "IT 46", "IT 48", "IT 50", "IT 52", "IT 54", "IT 56"],
      shoes: ["EU 35", "EU 36", "EU 37", "EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45"],
      rings: ["IT 8", "IT 10", "IT 12", "IT 14", "IT 16", "IT 18", "IT 20", "IT 22", "IT 24"],
    },
  },
  {
    id: "au",
    label: "Australia / New Zealand",
    examples: { tops: "M or AU 12", bottoms: "AU 12", outerwear: "AU 40", shoes: "AU 8", rings: "AU Q" },
    suggestions: {
      tops: ["XS", "S", "M", "L", "XL", "AU 6", "AU 8", "AU 10", "AU 12", "AU 14", "AU 16", "AU 18"],
      bottoms: ["AU 6", "AU 8", "AU 10", "AU 12", "AU 14", "AU 16", "AU 18", "W28", "W30", "W32", "W34"],
      outerwear: ["AU 34", "AU 36", "AU 38", "AU 40", "AU 42", "AU 44", "AU 46"],
      shoes: ["AU 4", "AU 5", "AU 6", "AU 7", "AU 8", "AU 9", "AU 10", "AU 11", "AU 12"],
      rings: ["AU J", "AU K", "AU L", "AU M", "AU N", "AU O", "AU P", "AU Q", "AU R", "AU S", "AU T"],
    },
  },
  {
    id: "jp",
    label: "Japan",
    examples: { tops: "JP M", bottoms: "JP 11", outerwear: "JP L", shoes: "27 cm", rings: "JP 16" },
    suggestions: {
      tops: ["JP XS", "JP S", "JP M", "JP L", "JP XL", "JP XXL"],
      bottoms: ["JP 5", "JP 7", "JP 9", "JP 11", "JP 13", "JP 15", "JP 17"],
      outerwear: ["JP S", "JP M", "JP L", "JP XL", "JP XXL"],
      shoes: ["22 cm", "23 cm", "24 cm", "25 cm", "26 cm", "27 cm", "28 cm", "29 cm", "30 cm"],
      rings: ["JP 7", "JP 9", "JP 11", "JP 13", "JP 15", "JP 17", "JP 19", "JP 21", "JP 23"],
    },
  },
  {
    id: "other",
    label: "Other / mixed systems",
    examples: { tops: "Your usual size", bottoms: "Size or waist", outerwear: "Your usual size", shoes: "Size + system", rings: "Size + system" },
    suggestions: { tops: [], bottoms: [], outerwear: [], shoes: [], rings: [] },
  },
];

export const SIZE_SYSTEM_IDS = new Set(SIZE_SYSTEMS.map((system) => system.id));
export const FIT_OPTION_IDS = new Set(FIT_OPTIONS.map((option) => option.id));

const cleanText = (value, maxLength) => (
  typeof value === "string" ? value.trim().slice(0, maxLength) : ""
);

export function normalizeBrand(value) {
  return cleanText(value, 80);
}

export function normalizePurchaseMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= new Date().getUTCFullYear() + 1 ? value : null;
}

export function normalizePurchasePrice(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return null;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function normalizePurchaseCurrency(value, fallback = "EUR") {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (CURRENCY_IDS.has(currency)) return currency;
  return CURRENCY_IDS.has(fallback) ? fallback : "EUR";
}

export function purchaseMonthValue(item) {
  const normalized = normalizePurchaseMonth(item?.purchaseMonth);
  if (!normalized) return Number.POSITIVE_INFINITY;
  const [year, month] = normalized.split("-").map(Number);
  return Date.UTC(year, month - 1, 1);
}

export function normalizePreferenceList(value, maxItems = 12) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string" ? value.split(",") : [];
  const normalized = values
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 40))
    .filter(Boolean);
  const unique = new Map();
  for (const entry of normalized) {
    const key = entry.toLowerCase();
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()].slice(0, maxItems);
}

export function normalizeSizeProfile(value = {}, existing = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const previous = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  const requestedSystem = input.system ?? previous.system;
  const requestedFit = input.fit ?? previous.fit;
  const normalized = {
    system: SIZE_SYSTEM_IDS.has(requestedSystem) ? requestedSystem : "",
    fit: FIT_OPTION_IDS.has(requestedFit) ? requestedFit : "",
  };
  for (const field of SIZE_FIELDS) {
    normalized[field.id] = cleanText(input[field.id] ?? previous[field.id], 40);
  }
  return normalized;
}

export function sizeProfileSummary(value = {}) {
  const profile = normalizeSizeProfile(value);
  const system = SIZE_SYSTEMS.find((candidate) => candidate.id === profile.system);
  const sizes = SIZE_FIELDS
    .filter((field) => profile[field.id])
    .map((field) => `${field.label.toLowerCase()}: ${profile[field.id]}`);
  const fit = FIT_OPTIONS.find((option) => option.id === profile.fit)?.label;
  return [
    profile.system && system ? `sizing system: ${system.label}` : null,
    ...sizes,
    profile.fit ? `preferred fit: ${fit}` : null,
  ].filter(Boolean).join("; ");
}
