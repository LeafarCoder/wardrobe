const option = (id, label, prompt = label) => Object.freeze({ id, label, prompt });
const group = (id, label, options, settings = {}) => Object.freeze({
  id,
  label,
  options: Object.freeze(options),
  multiple: Boolean(settings.multiple),
  maxSelections: settings.multiple ? Math.max(1, Math.round(settings.maxSelections || 3)) : 1,
});

const NECKLINES = Object.freeze([
  option("v-neck", "V-neck", "a V-neckline with two diagonal edges meeting at a visible point"),
  option("crew", "Crew neck", "a close round crew or jewel neckline"),
  option("scoop", "Scoop neck", "a broad, visibly deep U-shaped scoop neckline"),
  option("square", "Square neck", "a square neckline with a straight lower edge"),
  option("boat", "Boat neck", "a wide, shallow boat or Sabrina neckline"),
  option("high-neck", "High neck", "a close high-neck, mock-neck, or roll-neck construction"),
  option("off-shoulder", "Off-shoulder", "an off-shoulder edge below both shoulders"),
  option("one-shoulder", "One-shoulder", "an asymmetric one-shoulder construction"),
  option("strapless", "Strapless", "a strapless straight-across upper edge"),
  option("halter", "Halter", "a halter construction fastening or wrapping around the neck"),
  option("spaghetti-strap", "Thin straps", "two very thin spaghetti shoulder straps"),
]);

const SLEEVES = Object.freeze([
  option("sleeveless", "Sleeveless", "no sleeves at all"),
  option("short", "Short sleeves", "short or cap sleeves"),
  option("three-quarter", "3/4 sleeves", "three-quarter-length sleeves"),
  option("long", "Long sleeves", "full-length sleeves with cuffs preserved"),
]);

const CLOSURES = Object.freeze([
  option("pullover", "Pullover", "a pullover construction with no invented front opening"),
  option("buttons", "Front buttons", "a visible front-button closure"),
  option("zipper", "Front zipper", "a visible front zipper"),
  option("wrap", "Wrap or tie", "a wrap-front or tie-front closure"),
]);

const HEM_LENGTHS = Object.freeze([
  option("mini", "Mini", "an above-knee mini length"),
  option("midi", "Midi", "a below-knee, mid-calf midi length"),
  option("maxi", "Maxi", "an ankle- or floor-length maxi silhouette"),
]);

const GROUPS = Object.freeze({
  upperbody: Object.freeze([
    group("neckline", "Neckline", NECKLINES),
    group("sleeves", "Sleeves", SLEEVES),
    group("closure", "Closure", CLOSURES),
  ]),
  wholebody_up: Object.freeze([
    group("collar", "Collar or hood", [
      option("notched-lapels", "Notched lapels"),
      option("peak-lapels", "Peak lapels"),
      option("shawl-collar", "Shawl collar"),
      option("point-collar", "Point collar"),
      option("stand-collar", "Stand collar"),
      option("hooded", "Hooded"),
      option("collarless", "Collarless"),
    ]),
    group("closure", "Closure", [
      option("single-breasted", "Single-breasted"),
      option("double-breasted", "Double-breasted"),
      option("buttons", "Front buttons"),
      option("zipper", "Front zipper"),
      option("open-front", "Open front"),
    ]),
    group("outerwearLength", "Length", [
      option("cropped", "Cropped"),
      option("hip", "Hip length"),
      option("thigh", "Thigh length"),
      option("long", "Knee length or longer"),
    ]),
  ]),
  wholebody: Object.freeze([
    group("neckline", "Neckline", NECKLINES),
    group("sleeves", "Sleeves", SLEEVES),
    group("hemLength", "Hem length", HEM_LENGTHS),
    group("waist", "Waist construction", [
      option("natural", "Natural waist"),
      option("empire", "Empire waist"),
      option("dropped", "Dropped waist"),
      option("wrap-belted", "Wrap or belted waist"),
    ]),
  ]),
  shoes: Object.freeze([
    group("shoeType", "Shoe type", [
      option("sneaker", "Sneaker"),
      option("loafer", "Loafer"),
      option("boot", "Boot"),
      option("pump", "Pump or high heel", "women's pump or high-heeled footwear"),
      option("sandal", "Sandal"),
      option("flat", "Flat"),
    ]),
    group("toe", "Toe shape", [
      option("pointed", "Pointed toe"),
      option("round", "Round toe"),
      option("square", "Square toe"),
      option("open", "Open toe"),
    ]),
    group("heel", "Heel", [
      option("flat", "Flat"),
      option("low", "Low heel"),
      option("block", "Block heel"),
      option("stiletto", "Stiletto heel"),
      option("platform", "Platform"),
    ]),
    group("fastening", "Fastening", [
      option("lace-up", "Lace-up"),
      option("slip-on", "Slip-on"),
      option("buckle", "Buckle or strap"),
      option("zipper", "Zipper"),
    ]),
  ]),
});

const LOWER_TYPE = group("lowerType", "Bottom type", [
  option("trousers", "Trousers"),
  option("skirt", "Skirt"),
  option("shorts", "Shorts"),
]);

const LOWER_DYNAMIC = Object.freeze({
  trousers: Object.freeze([
    group("trouserShape", "Leg shape", [
      option("slim", "Slim"),
      option("straight", "Straight"),
      option("wide", "Wide leg"),
      option("flared", "Flared"),
    ]),
    group("rise", "Rise", [
      option("low", "Low rise"),
      option("mid", "Mid rise"),
      option("high", "High rise"),
    ]),
  ]),
  skirt: Object.freeze([
    group("skirtShape", "Skirt shape", [
      option("pencil", "Pencil"),
      option("a-line", "A-line"),
      option("pleated", "Pleated"),
      option("full", "Full or circle"),
    ]),
    group("hemLength", "Hem length", HEM_LENGTHS),
  ]),
  shorts: Object.freeze([
    group("shortShape", "Shorts shape", [
      option("fitted", "Fitted"),
      option("tailored", "Tailored"),
      option("relaxed", "Relaxed"),
    ]),
    group("rise", "Rise", [
      option("low", "Low rise"),
      option("mid", "Mid rise"),
      option("high", "High rise"),
    ]),
  ]),
});

const ACCESSORY_TYPE = group("accessoryType", "Accessory type", [
  option("belt", "Belt"),
  option("watch", "Watch"),
  option("bracelet", "Bracelet"),
  option("necklace", "Necklace"),
  option("bag", "Bag"),
  option("scarf", "Scarf"),
  option("sunglasses", "Sunglasses"),
]);

const METAL_TONES = [
  option("silver", "Silver-tone"),
  option("gold", "Gold-tone"),
  option("rose-gold", "Rose gold-tone"),
  option("colored", "Colored finish"),
];

const ACCESSORY_DYNAMIC = Object.freeze({
  belt: Object.freeze([
    group("beltWidth", "Belt width", [
      option("thin", "Thin"),
      option("medium", "Medium"),
      option("wide", "Wide"),
    ]),
    group("beltSurface", "Surface", [
      option("smooth", "Smooth"),
      option("textured", "Textured"),
      option("braided", "Braided"),
      option("studded", "Studded"),
    ]),
  ]),
  watch: Object.freeze([
    group("watchStyle", "Watch style", [
      option("sport", "Sport"),
      option("casual", "Casual"),
      option("dress", "Dress"),
      option("luxury", "Luxury"),
    ]),
    group("watchTone", "Case and hardware", METAL_TONES),
    group("watchStrap", "Watch strap", [
      option("leather", "Leather strap"),
      option("metal", "Metal bracelet"),
      option("rubber", "Rubber strap"),
      option("fabric", "Fabric strap"),
    ]),
  ]),
  bracelet: Object.freeze([
    group("jewelryForm", "Construction", [
      option("chain", "Chain"),
      option("bangle", "Bangle"),
      option("beaded", "Beaded"),
      option("cuff", "Cuff"),
    ]),
    group("jewelryTone", "Metal or finish", METAL_TONES),
  ]),
  necklace: Object.freeze([
    group("jewelryForm", "Construction", [
      option("chain", "Chain"),
      option("pendant", "Pendant"),
      option("beaded", "Beaded"),
      option("choker", "Choker"),
    ]),
    group("jewelryTone", "Metal or finish", METAL_TONES),
  ]),
  bag: Object.freeze([
    group("bagType", "Bag shape", [
      option("tote", "Tote"),
      option("crossbody", "Crossbody"),
      option("shoulder", "Shoulder bag"),
      option("clutch", "Clutch"),
      option("backpack", "Backpack"),
    ]),
    group("bagStructure", "Structure", [
      option("soft", "Soft"),
      option("structured", "Structured"),
      option("quilted", "Quilted"),
    ]),
  ]),
  scarf: Object.freeze([
    group("scarfShape", "Scarf shape", [
      option("square", "Square"),
      option("long", "Long"),
      option("shawl", "Shawl"),
    ]),
    group("scarfSurface", "Surface", [
      option("smooth", "Smooth"),
      option("textured", "Textured"),
      option("fringed", "Fringed"),
    ]),
  ]),
  sunglasses: Object.freeze([
    group("frameShape", "Frame shape", [
      option("round", "Round"),
      option("square", "Square"),
      option("cat-eye", "Cat-eye"),
      option("aviator", "Aviator"),
    ]),
    group("frameTone", "Frame finish", METAL_TONES),
  ]),
});

const CLOTHING_MATERIALS = Object.freeze([
  option("linen", "Linen", "linen fabric"),
  option("cotton", "Cotton", "cotton fabric"),
  option("wool", "Wool", "wool fabric"),
  option("silk", "Silk", "silk fabric"),
  option("denim", "Denim", "denim"),
  option("leather", "Leather", "leather"),
  option("suede", "Suede", "suede"),
  option("knit", "Knit", "knitted fabric"),
  option("lace", "Lace", "lace"),
  option("sequins", "Sequins", "sequins"),
  option("feathers", "Feathers", "realistic feather trim or feather construction"),
]);

const MATERIALS_BY_PART = Object.freeze({
  upperbody: group("materials", "Materials", CLOTHING_MATERIALS, { multiple: true, maxSelections: 3 }),
  wholebody_up: group("materials", "Materials", CLOTHING_MATERIALS, { multiple: true, maxSelections: 3 }),
  lowerbody: group("materials", "Materials", CLOTHING_MATERIALS, { multiple: true, maxSelections: 3 }),
  wholebody: group("materials", "Materials", CLOTHING_MATERIALS, { multiple: true, maxSelections: 3 }),
  shoes: group("materials", "Materials", [
    option("leather", "Leather", "leather"),
    option("patent-leather", "Patent leather", "glossy patent leather"),
    option("suede", "Suede", "suede"),
    option("canvas", "Canvas", "canvas textile"),
    option("mesh", "Mesh", "breathable mesh textile"),
    option("rubber", "Rubber", "rubber"),
  ], { multiple: true, maxSelections: 3 }),
  accessories_up: group("materials", "Materials", [
    option("leather", "Leather", "leather"),
    option("suede", "Suede", "suede"),
    option("canvas", "Canvas", "canvas textile"),
    option("gold", "Gold", "gold or gold-tone metal"),
    option("silver", "Silver", "silver or silver-tone metal"),
    option("beads-pearls", "Beads or pearls", "beads or pearls"),
    option("feathers", "Feathers", "realistic feathers"),
    option("acetate", "Acetate", "acetate"),
  ], { multiple: true, maxSelections: 3 }),
});

export function garmentClarificationGroups(part = "upperbody", selections = {}) {
  let groups;
  if (part === "lowerbody") {
    groups = [LOWER_TYPE, ...(LOWER_DYNAMIC[selections?.lowerType] || [])];
  } else if (part === "accessories_up") {
    groups = [ACCESSORY_TYPE, ...(ACCESSORY_DYNAMIC[selections?.accessoryType] || [])];
  } else {
    groups = GROUPS[part] || GROUPS.upperbody;
  }
  return [...groups, MATERIALS_BY_PART[part] || MATERIALS_BY_PART.upperbody];
}

export function normalizeGarmentClarifications(part = "upperbody", value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const seed = {};
  if (part === "lowerbody" && LOWER_TYPE.options.some((candidate) => candidate.id === input.lowerType)) {
    seed.lowerType = input.lowerType;
  }
  if (part === "accessories_up" && ACCESSORY_TYPE.options.some((candidate) => candidate.id === input.accessoryType)) {
    seed.accessoryType = input.accessoryType;
  }
  const normalized = { ...seed };
  for (const currentGroup of garmentClarificationGroups(part, seed)) {
    const selected = input[currentGroup.id];
    if (currentGroup.multiple) {
      const allowed = new Set(currentGroup.options.map((candidate) => candidate.id));
      const selections = [...new Set(Array.isArray(selected) ? selected : [])]
        .filter((candidate) => allowed.has(candidate))
        .slice(0, currentGroup.maxSelections);
      if (selections.length) normalized[currentGroup.id] = selections;
    } else if (currentGroup.options.some((candidate) => candidate.id === selected)) {
      normalized[currentGroup.id] = selected;
    }
  }
  return normalized;
}

export function garmentClarificationDetails(part = "upperbody", value = {}) {
  const normalized = normalizeGarmentClarifications(part, value);
  return garmentClarificationGroups(part, normalized).flatMap((currentGroup) => {
    const selectedIds = currentGroup.multiple
      ? normalized[currentGroup.id] || []
      : normalized[currentGroup.id] ? [normalized[currentGroup.id]] : [];
    return selectedIds.flatMap((selectedId) => {
      const selected = currentGroup.options.find((candidate) => candidate.id === selectedId);
      return selected ? [{
      groupId: currentGroup.id,
      groupLabel: currentGroup.label,
      optionId: selected.id,
      label: selected.label,
      prompt: selected.prompt,
      }] : [];
    });
  });
}

export function garmentClarificationTags(part = "upperbody", value = {}) {
  return garmentClarificationDetails(part, value).map((detail) => detail.label);
}

export function garmentClarificationPrompt(part = "upperbody", value = {}) {
  const details = garmentClarificationDetails(part, value);
  if (!details.length) return "";
  const grouped = new Map();
  for (const detail of details) {
    if (!grouped.has(detail.groupId)) grouped.set(detail.groupId, { label: detail.groupLabel, prompts: [] });
    grouped.get(detail.groupId).prompts.push(detail.prompt);
  }
  return `HUMAN-SELECTED PRODUCT DETAILS — AUTHORITATIVE:
- ${[...grouped.values()].map((entry) => `${entry.label}: ${entry.prompts.join(", ")}`).join("\n- ")}
These are factual properties of the target product that the wearer, overlap, crop, or image quality may conceal. Preserve each selected property exactly and do not substitute a conflicting construction. A later free-text USER CORRECTION may explicitly override one of these selections.`;
}

export const GARMENT_CLARIFICATION_TRANSLATION_KEYS = Object.freeze([
  ...new Set([
    ...Object.values(GROUPS).flatMap((groups) => groups.flatMap((currentGroup) => [
      currentGroup.label,
      ...currentGroup.options.map((candidate) => candidate.label),
    ])),
    LOWER_TYPE.label,
    ...LOWER_TYPE.options.map((candidate) => candidate.label),
    ...Object.values(LOWER_DYNAMIC).flatMap((groups) => groups.flatMap((currentGroup) => [
      currentGroup.label,
      ...currentGroup.options.map((candidate) => candidate.label),
    ])),
    ACCESSORY_TYPE.label,
    ...ACCESSORY_TYPE.options.map((candidate) => candidate.label),
    ...Object.values(ACCESSORY_DYNAMIC).flatMap((groups) => groups.flatMap((currentGroup) => [
      currentGroup.label,
      ...currentGroup.options.map((candidate) => candidate.label),
    ])),
    ...Object.values(MATERIALS_BY_PART).flatMap((currentGroup) => [
      currentGroup.label,
      ...currentGroup.options.map((candidate) => candidate.label),
    ]),
  ]),
]);
