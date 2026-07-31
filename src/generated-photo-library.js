import { garmentColorVariants, garmentVersionOrder } from "./garment-variants.js";

const SOURCES = new Set(["garment", "outfit-studio", "planner"]);
const OPTION_LABELS = Object.freeze({
  everyday: "Everyday", work: "Work", lunch: "Lunch", dinner: "Dinner",
  "romantic-dinner": "Romantic dinner", "night-out": "Night out", wedding: "Wedding",
  picnic: "Picnic", walk: "Walk", hot: "Hot", mild: "Mild", cold: "Cold", rain: "Rain", wind: "Wind",
  automatic: "Automatic", studio: "Studio", "city-street": "City street", restaurant: "Restaurant",
  park: "Park or nature", home: "Home interior", "event-venue": "Event venue", editorial: "Editorial",
  candid: "Candid", "street-style": "Street style", cinematic: "Cinematic", minimal: "Minimal",
  standing: "Standing", walking: "Walking", running: "Running", jumping: "Jumping", sitting: "Sitting",
  lying: "Lying down", crouching: "Crouching", "stairs-up": "Going upstairs", "stairs-down": "Going downstairs",
});

function cleanText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanList(value, maxItems = 20) {
  return (Array.isArray(value) ? value : []).map((entry) => cleanText(entry, 160)).filter(Boolean).slice(0, maxItems);
}

function cleanGarmentSnapshot(value = {}) {
  const source = cleanObject(value);
  const itemId = cleanText(source.itemId, 100);
  if (!itemId) return null;
  return {
    itemId,
    name: cleanText(source.name, 120),
    variantId: cleanText(source.variantId, 100) || null,
    version: cleanText(source.version, 120),
    primaryColor: cleanText(source.primaryColor, 20) || null,
    secondaryColor: cleanText(source.secondaryColor, 20) || null,
    wearerId: cleanText(source.wearerId, 80) || null,
    wearerName: cleanText(source.wearerName, 120),
  };
}

export function normalizeGeneratedPhotoProvenance(value = {}) {
  const source = cleanObject(value);
  if (!SOURCES.has(source.source)) return null;
  const outfit = cleanObject(source.outfit);
  const plan = cleanObject(source.plan);
  const input = cleanObject(plan.input);
  const weather = cleanObject(plan.expectedWeather);
  return {
    source: source.source,
    garments: (Array.isArray(source.garments) ? source.garments : [])
      .map(cleanGarmentSnapshot)
      .filter(Boolean)
      .slice(0, 20),
    ...(source.source === "outfit-studio" ? {
      outfit: {
        id: cleanText(outfit.id, 80),
        name: cleanText(outfit.name, 120),
        context: cleanObject(outfit.context),
        presentation: cleanObject(outfit.presentation),
      },
    } : {}),
    ...(source.source === "planner" ? {
      plan: {
        id: cleanText(plan.id, 80),
        input: {
          kind: input.kind === "event" ? "event" : "trip",
          title: cleanText(input.title, 120),
          location: cleanText(input.location, 120),
          startDate: cleanText(input.startDate, 40),
          endDate: cleanText(input.endDate, 40),
          notes: cleanText(input.notes, 500),
        },
        expectedWeather: {
          summary: cleanText(weather.summary, 500),
          temperatureRange: cleanText(weather.temperatureRange, 120),
          conditions: cleanList(weather.conditions, 8),
        },
        outfitName: cleanText(plan.outfitName, 120),
        outfitNote: cleanText(plan.outfitNote, 300),
      },
    } : {}),
  };
}

function versionDetails(item, variantId) {
  const variants = garmentColorVariants(item);
  const order = garmentVersionOrder(item);
  const versionId = variantId || "original";
  const versionIndex = Math.max(0, order.indexOf(versionId));
  const variant = variantId ? variants.find((candidate) => candidate.id === variantId) : null;
  return {
    version: variantId
      ? `Color version ${versionIndex + 1} of ${order.length}`
      : `Original version · 1 of ${order.length}`,
    primaryColor: variant?.primaryColor || item?.color || null,
    secondaryColor: variant?.secondaryColor || item?.secondaryColor || null,
  };
}

export function generatedPhotoGarmentSnapshots(selections = [], items = [], people = []) {
  const itemMap = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  const peopleMap = new Map((Array.isArray(people) ? people : []).map((person) => [person.id, person]));
  return (Array.isArray(selections) ? selections : []).flatMap((entry) => {
    const selection = typeof entry === "string" ? { itemId: entry } : cleanObject(entry);
    const itemId = cleanText(selection.itemId, 100);
    if (!itemId) return [];
    const item = itemMap.get(itemId);
    const variantId = cleanText(selection.variantId, 100) || null;
    const version = item ? versionDetails(item, variantId) : { version: variantId ? "Saved color version" : "Original version" };
    return [{
      itemId,
      name: item?.name || cleanText(selection.name, 120) || "Wardrobe item",
      variantId,
      ...version,
      wearerId: cleanText(selection.wearerId, 80) || null,
      wearerName: peopleMap.get(selection.wearerId)?.name || cleanText(selection.wearerName, 120),
    }];
  }).slice(0, 20);
}

function optionLabel(id) {
  return OPTION_LABELS[id] || cleanText(id, 120);
}

function detail(label, value) {
  const cleaned = Array.isArray(value) ? value.filter(Boolean).join(", ") : cleanText(value, 600);
  return cleaned ? { label, value: cleaned } : null;
}

function commonPhoto(look, source, title, garments, details, extra = {}) {
  return {
    id: `generated:${source}:${extra.parentId || "item"}:${look.id}`,
    type: "generated",
    source,
    image: look.image,
    preview: look.preview || null,
    title,
    garments,
    details: details.filter(Boolean),
    context: look.context || {},
    model: look.model || null,
    fallbackUsed: Boolean(look.fallbackUsed),
    generatedAt: look.generatedAt || null,
    ...extra,
  };
}

function outfitDetails(outfit = {}) {
  const context = cleanObject(outfit.context);
  const presentation = cleanObject(outfit.presentation);
  return [
    detail("Occasion", optionLabel(context.occasion)),
    detail("Weather", (context.weather || []).map(optionLabel)),
    detail("Season", context.season),
    detail("Background", optionLabel(presentation.background)),
    detail("Photo style", optionLabel(presentation.style)),
    detail("Pose", optionLabel(presentation.pose)),
    detail("Direction", presentation.direction),
  ];
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function collectGeneratedPhotoLibrary(items = [], user = {}) {
  const photos = [];
  const people = [user];
  const itemMap = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));

  for (const item of Array.isArray(items) ? items : []) {
    for (const look of Array.isArray(item?.modeledLooks) ? item.modeledLooks : []) {
      if (!look?.id || !look.image) continue;
      const provenance = normalizeGeneratedPhotoProvenance(look.provenance);
      const garments = provenance?.garments?.length
        ? provenance.garments
        : generatedPhotoGarmentSnapshots([{ itemId: item.id, variantId: look.variantId }], items, people);
      photos.push(commonPhoto(
        look,
        "garment",
        `${item.name || "Garment"} modeled look`,
        garments,
        [detail("Garment version", garments[0]?.version)],
        { parentId: item.id },
      ));
    }
  }

  for (const outfit of Array.isArray(user?.wardrobeOutfits) ? user.wardrobeOutfits : []) {
    for (const look of Array.isArray(outfit?.modeledLooks) ? outfit.modeledLooks : []) {
      if (!look?.id || !look.image) continue;
      const provenance = normalizeGeneratedPhotoProvenance(look.provenance);
      const snapshotOutfit = provenance?.outfit || outfit;
      const garments = provenance?.garments?.length
        ? provenance.garments
        : generatedPhotoGarmentSnapshots(outfit.garments, items, people);
      photos.push(commonPhoto(
        look,
        "outfit-studio",
        snapshotOutfit.name || outfit.name || "Outfit Studio look",
        garments,
        outfitDetails(snapshotOutfit),
        { parentId: outfit.id },
      ));
    }
  }

  for (const plan of Array.isArray(user?.wardrobePlans) ? user.wardrobePlans : []) {
    const outfits = plan?.result?.outfitIdeas || [];
    outfits.forEach((outfit, outfitIndex) => {
      const looks = Array.isArray(outfit?.modeledLooks) ? outfit.modeledLooks : outfit?.modeledLook ? [outfit.modeledLook] : [];
      for (const look of looks) {
        if (!look?.id || !look.image) continue;
        const provenance = normalizeGeneratedPhotoProvenance(look.provenance);
        const snapshotPlan = provenance?.plan || {
          id: plan.id,
          input: plan.input,
          expectedWeather: plan.result?.expectedWeather,
          outfitName: outfit.name,
          outfitNote: outfit.note,
        };
        const garments = provenance?.garments?.length
          ? provenance.garments
          : generatedPhotoGarmentSnapshots(outfit.itemIds, items, people);
        const input = snapshotPlan.input || {};
        const weather = snapshotPlan.expectedWeather || {};
        photos.push(commonPhoto(
          look,
          "planner",
          snapshotPlan.outfitName || outfit.name || "Planned outfit",
          garments,
          [
            detail("Plan", input.title || input.location),
            detail("Plan type", input.kind),
            detail("Location", input.location),
            detail("Dates", [input.startDate, input.endDate].filter(Boolean).join(" – ")),
            detail("Plans and dress code", input.notes),
            detail("Temperature", weather.temperatureRange),
            detail("Expected weather", weather.summary),
            detail("Conditions", weather.conditions),
            detail("Outfit note", snapshotPlan.outfitNote),
          ],
          { parentId: `${plan.id}:${outfitIndex}` },
        ));
      }
    });
  }

  return photos
    .map((photo) => ({
      ...photo,
      garments: photo.garments.map((garment) => {
        const item = itemMap.get(garment.itemId);
        return {
          ...garment,
          name: garment.name || item?.name || "Wardrobe item",
          thumbnail: item?.thumbnail || item?.imagePreview || item?.image || null,
        };
      }),
    }))
    .sort((first, second) => timestamp(second.generatedAt) - timestamp(first.generatedAt));
}
