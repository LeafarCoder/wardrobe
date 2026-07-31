const MUTED_CHROMATIC_SATURATION = 0.1;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const NEUTRAL_GROUP_IDS = new Set(["light-neutrals", "dark-neutrals"]);
// Starting just before red keeps hues on either side of 0° next to each other.
const SPECTRUM_START_HUE = 345;

export function hexToHsl(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return { hue: 0, saturation: 0, lightness: 0.5 };
  const [red, green, blue] = match[1].match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const difference = maximum - minimum;
  if (!difference) return { hue: 0, saturation: 0, lightness };
  const saturation = difference / (1 - Math.abs((2 * lightness) - 1));
  let hue = maximum === red
    ? 60 * (((green - blue) / difference) % 6)
    : maximum === green
      ? 60 * (((blue - red) / difference) + 2)
      : 60 * (((red - green) / difference) + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation, lightness };
}

export function colorGroup(item) {
  const color = hexToHsl(item.color);
  const { hue, saturation, lightness } = color;
  let id = "other";

  if (
    lightness >= 0.86
    || (saturation <= MUTED_CHROMATIC_SATURATION && lightness >= 0.46)
    || (hue >= 25 && hue <= 65 && saturation <= 0.58 && lightness >= 0.5)
  ) id = "light-neutrals";
  else if (lightness <= 0.06) id = "dark-neutrals";
  else if (saturation > MUTED_CHROMATIC_SATURATION) {
    if (hue >= 18 && hue <= 55 && lightness < 0.5) id = "browns";
    else if (hue >= 58 && hue < 192) id = "greens";
    else if (hue >= 192 && hue < 260) id = "blues";
    else if (hue >= 260 && hue < 325) id = "purples";
    else if (hue >= 325 || hue < 18) id = "reds";
    else if (hue >= 18 && hue < 70) id = "warm";
  } else {
    id = "dark-neutrals";
  }

  return { id, ...color };
}

function colorSortKey(item = {}) {
  if (!HEX_COLOR.test(item.color || "")) {
    return { category: 2, hue: 0, saturation: 0, lightness: 0 };
  }
  const color = colorGroup(item);
  if (NEUTRAL_GROUP_IDS.has(color.id)) {
    return { category: 1, hue: 0, saturation: color.saturation, lightness: color.lightness };
  }
  return {
    category: 0,
    hue: (color.hue - SPECTRUM_START_HUE + 360) % 360,
    saturation: color.saturation,
    lightness: color.lightness,
  };
}

export function compareWardrobeColors(first, second) {
  const firstColor = colorSortKey(first);
  const secondColor = colorSortKey(second);
  return firstColor.category - secondColor.category
    || (firstColor.category === 0 ? firstColor.hue - secondColor.hue : 0)
    || secondColor.saturation - firstColor.saturation
    || secondColor.lightness - firstColor.lightness
    || String(first?.name || "").localeCompare(String(second?.name || ""));
}
