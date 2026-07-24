const COLORS = {
  black: { color: "#242321", label: "Black" },
  charcoal: { color: "#45484a", label: "Charcoal" },
  offWhite: { color: "#eeeae0", label: "Off-white" },
  cream: { color: "#dfd2b6", label: "Cream" },
  stone: { color: "#aaa18f", label: "Stone" },
  khaki: { color: "#8c8062", label: "Khaki" },
  tan: { color: "#b07b50", label: "Tan" },
  camel: { color: "#a87349", label: "Camel" },
  cognac: { color: "#91532f", label: "Cognac" },
  brown: { color: "#684331", label: "Brown" },
  darkBrown: { color: "#493027", label: "Dark brown" },
  espresso: { color: "#30231f", label: "Espresso" },
  oxblood: { color: "#5d292d", label: "Oxblood" },
  navy: { color: "#304b65", label: "Navy blue" },
  skyBlue: { color: "#74a5c6", label: "Sky blue" },
  indigo: { color: "#334b72", label: "Indigo" },
  midBlue: { color: "#587da2", label: "Mid blue" },
  slateBlue: { color: "#5d7183", label: "Slate blue" },
  forest: { color: "#4f6847", label: "Forest green" },
  olive: { color: "#697052", label: "Olive" },
  burgundy: { color: "#7a3d49", label: "Burgundy" },
  plum: { color: "#70536f", label: "Plum" },
  terracotta: { color: "#a95748", label: "Terracotta" },
};

const PALETTES = {
  leatherBelt: ["black", "espresso", "darkBrown", "brown", "cognac", "tan"],
  leatherFootwear: ["black", "espresso", "darkBrown", "cognac", "tan", "oxblood"],
  casualFootwear: ["offWhite", "black", "navy", "charcoal", "stone", "brown"],
  denim: ["indigo", "midBlue", "black", "charcoal", "offWhite", "slateBlue"],
  trousers: ["navy", "charcoal", "olive", "khaki", "stone", "darkBrown"],
  shirt: ["offWhite", "skyBlue", "navy", "forest", "burgundy", "charcoal"],
  dress: ["black", "navy", "burgundy", "forest", "plum", "terracotta"],
  leatherAccessory: ["black", "espresso", "darkBrown", "cognac", "tan", "oxblood"],
  accessory: ["black", "brown", "camel", "navy", "burgundy", "stone"],
  universal: ["navy", "forest", "burgundy", "camel", "plum", "terracotta", "charcoal", "offWhite"],
};

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const smoothstep = (minimum, maximum, value) => {
  if (minimum === maximum) return value < minimum ? 0 : 1;
  const normalized = clamp((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - (2 * normalized));
};

export function normalizeHexColor(value) {
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase();
  const short = input.match(/^#([a-f0-9])([a-f0-9])([a-f0-9])$/i);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[a-f0-9]{6}$/i.test(input) ? input : null;
}

function hexToRgb(value) {
  const color = normalizeHexColor(value);
  if (!color) return null;
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
}

const srgbToLinear = (value) => {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value) => {
  const normalized = value <= 0.0031308
    ? value * 12.92
    : (1.055 * (Math.max(0, value) ** (1 / 2.4))) - 0.055;
  return Math.round(clamp(normalized) * 255);
};

function rgbToOklab(red, green, blue) {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = (0.4122214708 * r) + (0.5363325363 * g) + (0.0514459929 * b);
  const m = (0.2119034982 * r) + (0.6806995451 * g) + (0.1073969566 * b);
  const s = (0.0883024619 * r) + (0.2817188376 * g) + (0.6299787005 * b);
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    lightness: (0.2104542553 * lRoot) + (0.793617785 * mRoot) - (0.0040720468 * sRoot),
    a: (1.9779984951 * lRoot) - (2.428592205 * mRoot) + (0.4505937099 * sRoot),
    b: (0.0259040371 * lRoot) + (0.7827717662 * mRoot) - (0.808675766 * sRoot),
  };
}

function oklabToRgb({ lightness, a, b }) {
  const lRoot = lightness + (0.3963377774 * a) + (0.2158037573 * b);
  const mRoot = lightness - (0.1055613458 * a) - (0.0638541728 * b);
  const sRoot = lightness - (0.0894841775 * a) - (1.291485548 * b);
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return {
    red: linearToSrgb((4.0767416621 * l) - (3.3077115913 * m) + (0.2309699292 * s)),
    green: linearToSrgb((-1.2684380046 * l) + (2.6097574011 * m) - (0.3413193965 * s)),
    blue: linearToSrgb((-0.0041960863 * l) - (0.7034186147 * m) + (1.707614701 * s)),
  };
}

function labToLch(lab) {
  const chroma = Math.hypot(lab.a, lab.b);
  const hue = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
  return { ...lab, chroma, hue };
}

function lchToLab({ lightness, chroma, hue }) {
  const radians = hue * Math.PI / 180;
  return {
    lightness,
    a: chroma * Math.cos(radians),
    b: chroma * Math.sin(radians),
  };
}

function colorToLch(value) {
  const rgb = hexToRgb(value);
  return rgb ? labToLch(rgbToOklab(rgb.red, rgb.green, rgb.blue)) : null;
}

function garmentPalette(context = {}) {
  const description = [
    context.name,
    context.part,
    ...(Array.isArray(context.tags) ? context.tags : []),
    ...(Array.isArray(context.materials) ? context.materials : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const leather = /\b(leather|suede|couro|pele|camurça)\b/.test(description);

  if (/\bbelt\b/.test(description) && leather) return PALETTES.leatherBelt;
  if (/\b(shoe|shoes|loafer|loafers|boot|boots|oxford|sneaker|sneakers|footwear)\b/.test(description)) {
    return leather || /\b(loafer|loafers|boot|boots|oxford)\b/.test(description)
      ? PALETTES.leatherFootwear
      : PALETTES.casualFootwear;
  }
  if (/\b(denim|jean|jeans)\b/.test(description)) return PALETTES.denim;
  if (/\b(lowerbody|trouser|trousers|pants|chino|chinos|shorts|skirt)\b/.test(description)) return PALETTES.trousers;
  if (/\b(dress|gown|jumpsuit)\b/.test(description)) return PALETTES.dress;
  if (/\b(upperbody|shirt|t-shirt|tee|top|blouse|polo|sweater|jumper)\b/.test(description)) return PALETTES.shirt;
  if (leather && /\b(accessor|bag|purse|wallet)\b/.test(description)) return PALETTES.leatherAccessory;
  if (/\b(accessor|belt|bag|purse|wallet|scarf|hat|cap)\b/.test(description)) return PALETTES.accessory;
  return PALETTES.universal;
}

function hueDistance(first, second) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

function contextDescription(context = {}) {
  return [
    context.name,
    context.part,
    ...(Array.isArray(context.tags) ? context.tags : []),
    ...(Array.isArray(context.materials) ? context.materials : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function isFootwearContext(context = {}) {
  return context.part === "shoes"
    || /\b(shoe|shoes|loafer|loafers|boot|boots|oxford|sneaker|sneakers|footwear|sapato|sapatos|mocassim|mocassins|bota|botas|ténis)\b/.test(contextDescription(context));
}

function chromaticSimilarity(pixel, source) {
  const hueWeight = 0.02 + (0.98 * (1 - smoothstep(24, 92, hueDistance(pixel.hue, source.hue))));
  const chromaPresence = 0.42 + (0.58 * smoothstep(0.003, Math.max(0.022, source.chroma * 0.58), pixel.chroma));
  const ratio = pixel.chroma / Math.max(0.008, source.chroma);
  const chromaFit = 1 - (0.14 * smoothstep(0.85, 3.1, Math.abs(Math.log(Math.max(0.05, ratio)))));
  const lightnessReach = 1 - (0.12 * smoothstep(0.38, 0.78, Math.abs(pixel.lightness - source.lightness)));
  return clamp(hueWeight * chromaPresence * chromaFit * lightnessReach);
}

function materialShadeSimilarity(pixel, source, context = {}) {
  if (source.chroma < 0.055) return 0;

  // Fabric and leather do not keep a single sampled color. Highlights lose
  // saturation, shadows become nearly neutral, and texture can locally shift
  // hue. Treat those tonal variants as one material instead of leaving spots.
  const hueFamily = 1 - smoothstep(28, 104, hueDistance(pixel.hue, source.hue));
  const chromaticSurface = hueFamily * (0.56 + (0.44 * smoothstep(0.004, 0.055, pixel.chroma)));
  const tonalDistance = 1 - smoothstep(0.24, 0.62, Math.abs(pixel.lightness - source.lightness));
  const isShadow = 1 - smoothstep(source.lightness + 0.04, source.lightness + 0.24, pixel.lightness);
  const neutralShadow = isShadow
    * tonalDistance
    * (1 - smoothstep(0.035, 0.14, pixel.chroma));
  const texturedLeather = /\b(leather|suede|couro|pele|camurça)\b/.test(contextDescription(context))
    ? tonalDistance * (1 - smoothstep(0.075, 0.18, pixel.chroma))
    : 0;
  const strength = context.channel === "secondary" ? 0.84 : 0.98;
  return clamp(Math.max(chromaticSurface * tonalDistance, neutralShadow * 0.94, texturedLeather * 0.86) * strength);
}

function neutralSimilarity(pixel, source) {
  if (source.lightness < 0.16) {
    const leatherAndShadowReach = 1 - smoothstep(0.5, 0.76, pixel.lightness);
    const hardwareProtection = 1 - smoothstep(0.075, 0.19, pixel.chroma);
    return clamp(leatherAndShadowReach * hardwareProtection);
  }
  const lightnessDistance = Math.abs(pixel.lightness - source.lightness);
  const lightnessWeight = 1 - smoothstep(0.28, 0.68, lightnessDistance);
  const neutralWeight = 1 - smoothstep(0.065, 0.19, pixel.chroma);
  return clamp(lightnessWeight * neutralWeight);
}

function footwearMaterialProtection(pixel, source, context = {}) {
  if (!isFootwearContext(context)) return 0;

  // When the selected material is itself white rubber or pale canvas, it must
  // remain editable. Otherwise, protect bright low-chroma soles, welt,
  // stitching, and metal from a leather-color replacement.
  const sourceIsLightNeutral = source.lightness > 0.72 && source.chroma < 0.075;
  if (sourceIsLightNeutral) return 0;
  // Start protection only once a surface is genuinely pale. A tan or beige
  // leather upper can sit around mid-lightness and must remain recolorable.
  const lightSurface = smoothstep(0.64, 0.82, pixel.lightness);
  const neutralMaterial = 1 - smoothstep(0.07, 0.16, pixel.chroma);
  return clamp(lightSurface * neutralMaterial);
}

function isShadeOfSameMaterial(source, alternate, context = {}) {
  if (!source || !alternate) return false;
  const lightnessDifference = Math.abs(source.lightness - alternate.lightness);
  const chromaDifference = Math.abs(source.chroma - alternate.chroma);
  if (source.chroma < 0.035 && alternate.chroma < 0.035) {
    return lightnessDifference < 0.28;
  }
  const sameHueFamily = source.chroma >= 0.025
    && alternate.chroma >= 0.025
    && hueDistance(source.hue, alternate.hue) < 20;
  if (!sameHueFamily) return false;

  // A pale sole next to a leather upper is a real second material even when
  // both colors happen to be warm. Other same-hue dark/light variants are
  // normally lighting, folds, or an interior lining rather than a color block.
  if (isFootwearContext(context) && Math.max(source.lightness, alternate.lightness) > 0.76) return false;
  return chromaDifference < 0.095 && lightnessDifference < 0.34;
}

function combinedSimilarity(pixel, source, context) {
  const direct = source.chroma < 0.055
    ? neutralSimilarity(pixel, source)
    : chromaticSimilarity(pixel, source);
  return Math.max(direct, materialShadeSimilarity(pixel, source, context));
}

function selectionWeight(pixel, source, alternate, context) {
  const selectedSimilarity = combinedSimilarity(pixel, source, context);
  const materialProtection = footwearMaterialProtection(pixel, source, context);
  const protectedSimilarity = selectedSimilarity * (1 - materialProtection);
  if (
    !alternate
    || protectedSimilarity <= 0
    || isShadeOfSameMaterial(source, alternate, context)
  ) return protectedSimilarity;
  const alternateSimilarity = combinedSimilarity(pixel, alternate, {
    ...context,
    channel: context.channel === "secondary" ? "primary" : "secondary",
  });
  const ownership = smoothstep(-0.055, 0.16, protectedSimilarity - alternateSimilarity);
  return protectedSimilarity * ownership;
}

function recoloredPixel(pixel, source, target) {
  const sourceIsNeutral = source.chroma < 0.055;
  const sourceIsVeryDark = sourceIsNeutral && source.lightness < 0.16;
  const targetLightnessShift = (target.lightness - source.lightness) * (sourceIsVeryDark ? 0.68 : 0.5);
  const lightness = clamp(pixel.lightness + targetLightnessShift, 0.025, 0.985);
  const relativeChroma = sourceIsNeutral
    ? (sourceIsVeryDark ? 1.08 : 0.92)
    : clamp(pixel.chroma / Math.max(0.008, source.chroma), 0.32, 1.35);
  const chroma = clamp(target.chroma * relativeChroma, 0, 0.32);
  return lchToLab({ lightness, chroma, hue: target.hue });
}

export function recolorGarmentPixels(pixels, sourceColor, targetColor, alternateColor = null, context = {}) {
  if (!(pixels instanceof Uint8ClampedArray)) {
    throw new TypeError("Garment pixels must be a Uint8ClampedArray.");
  }
  const source = colorToLch(sourceColor);
  const target = colorToLch(targetColor);
  const alternate = colorToLch(alternateColor);
  if (!source || !target) return pixels;

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 8) continue;
    const original = rgbToOklab(pixels[index], pixels[index + 1], pixels[index + 2]);
    const pixel = labToLch(original);
    const weight = selectionWeight(pixel, source, alternate, context);
    if (weight < 0.015) continue;
    const replacement = recoloredPixel(pixel, source, target);
    const blended = {
      lightness: original.lightness + ((replacement.lightness - original.lightness) * weight),
      a: original.a + ((replacement.a - original.a) * weight),
      b: original.b + ((replacement.b - original.b) * weight),
    };
    const output = oklabToRgb(blended);
    pixels[index] = output.red;
    pixels[index + 1] = output.green;
    pixels[index + 2] = output.blue;
  }
  return pixels;
}

export function garmentVariationColors(sourceColor, alternateColor = null, count = 5, context = {}) {
  const source = colorToLch(sourceColor);
  const alternate = colorToLch(alternateColor);
  return garmentPalette(context)
    .map((id) => COLORS[id])
    .filter((preset) => {
      const candidate = colorToLch(preset.color);
      if (!candidate) return false;
      if (source?.lightness < 0.18 && preset.label === "Black") return false;
      if (source?.lightness > 0.88 && preset.label === "Off-white") return false;
      const sourceDifference = source
        ? Math.hypot(candidate.lightness - source.lightness, candidate.a - source.a, candidate.b - source.b)
        : 1;
      const alternateDifference = alternate
        ? Math.hypot(candidate.lightness - alternate.lightness, candidate.a - alternate.a, candidate.b - alternate.b)
        : 1;
      return sourceDifference > 0.08 && alternateDifference > 0.055;
    })
    .slice(0, Math.max(1, Math.min(7, count)));
}
