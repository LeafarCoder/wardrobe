export const STORE_OPTIONS = Object.freeze([
  {
    id: "Zara",
    label: "Zara",
    portugal: "https://www.zara.com/pt/pt/search?searchTerm={query}",
    international: "https://www.zara.com/us/en/search?searchTerm={query}",
  },
  {
    id: "H&M",
    label: "H&M",
    portugal: "https://www2.hm.com/pt_pt/search-results.html?q={query}",
    international: "https://www2.hm.com/en_us/search-results.html?q={query}",
  },
  {
    id: "Mango",
    label: "Mango",
    portugal: "https://shop.mango.com/pt/pt/search?q={query}",
    international: "https://shop.mango.com/us/en/search?q={query}",
  },
  {
    id: "Massimo Dutti",
    label: "Massimo Dutti",
    portugal: "https://www.massimodutti.com/pt/search?searchTerm={query}",
    international: "https://www.massimodutti.com/us/search?searchTerm={query}",
  },
  {
    id: "Pull&Bear",
    label: "Pull&Bear",
    portugal: "https://www.pullandbear.com/pt/search?searchTerm={query}",
    international: "https://www.pullandbear.com/us/search?searchTerm={query}",
  },
  {
    id: "Bershka",
    label: "Bershka",
    portugal: "https://www.bershka.com/pt/q/{query}",
    international: "https://www.bershka.com/us/q/{query}",
  },
  {
    id: "Stradivarius",
    label: "Stradivarius",
    portugal: "https://www.stradivarius.com/pt/search?searchTerm={query}",
    international: "https://www.stradivarius.com/us/search?searchTerm={query}",
  },
  {
    id: "COS",
    label: "COS",
    portugal: "https://www.cos.com/en-eu/search?search={query}",
    international: "https://www.cos.com/en-eu/search?search={query}",
    searchLanguage: "en",
  },
  {
    id: "Uniqlo",
    label: "Uniqlo",
    portugal: "https://www.uniqlo.com/eu-pt/en/search?q={query}",
    international: "https://www.uniqlo.com/us/en/search?q={query}",
  },
  {
    id: "Decathlon",
    label: "Decathlon",
    portugal: "https://www.decathlon.pt/search?Ntt={query}",
    international: "https://www.decathlon.com/search?q={query}",
  },
]);

export const DEFAULT_PREFERRED_STORES = Object.freeze(["Zara", "H&M", "Mango"]);

export function normalizePreferredStores(value = []) {
  const known = new Map(STORE_OPTIONS.map((store) => [store.id.toLocaleLowerCase(), store.id]));
  const seen = new Set();
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const id = known.get(String(entry || "").trim().toLocaleLowerCase());
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [id];
  }).slice(0, 8);
}

export function preferredStoreOptions(value = []) {
  const preferred = normalizePreferredStores(value);
  const ids = preferred.length ? preferred : DEFAULT_PREFERRED_STORES;
  return ids.map((id) => STORE_OPTIONS.find((store) => store.id === id)).filter(Boolean);
}

export function compactStoreSearchQuery(value) {
  const terms = String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+(?:\/|\||—|–|-)\s+.*/u, " ")
    .replace(/[,:;]+/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (
    terms.length >= 3
    && /^(?:accessories|accessory|bottoms|footwear|jackets?|outerwear|shoes|tops|underwear)$/i.test(terms.at(-1))
  ) terms.pop();
  return terms.slice(0, 4).join(" ");
}

const PORTUGUESE_PRODUCT_SEARCHES = Object.freeze([
  [/óculos\s+de\s+sol/giu, "sunglasses"],
  [/roupa\s+interior\s+térmica/giu, "thermal underwear"],
  [/sobretudo/giu, "overcoat"],
  [/casaco/giu, "jacket"],
  [/calças/giu, "trousers"],
  [/camisola\s+de\s+malha/giu, "knit sweater"],
  [/camisola/giu, "sweater"],
  [/camisa/giu, "shirt"],
  [/vestido/giu, "dress"],
  [/sapatos/giu, "shoes"],
  [/botas/giu, "boots"],
  [/luvas/giu, "gloves"],
  [/cachecol/giu, "scarf"],
  [/gorro/giu, "beanie"],
]);

export function englishStoreSearchQuery(value) {
  let query = compactStoreSearchQuery(value);
  for (const [pattern, replacement] of PORTUGUESE_PRODUCT_SEARCHES) {
    query = query.replace(pattern, replacement);
  }
  return compactStoreSearchQuery(query);
}

export function storeSearchUrl(storeId, query, context = {}) {
  const store = STORE_OPTIONS.find((candidate) => candidate.id === storeId);
  const queryValue = store?.searchLanguage === "en"
    ? context.englishQuery || englishStoreSearchQuery(query)
    : query;
  const normalizedQuery = compactStoreSearchQuery(queryValue).slice(0, 100);
  if (!store || !normalizedQuery) return "";
  const inPortugal = context.language === "pt-PT"
    || /\bportugal\b/i.test(String(context.city || ""))
    || /\bportugal\b/i.test(String(context.location || ""));
  const template = inPortugal ? store.portugal : store.international;
  return template.replace("{query}", encodeURIComponent(normalizedQuery));
}
