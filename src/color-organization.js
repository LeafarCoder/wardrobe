const MUTED_CHROMATIC_SATURATION = 0.1;

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
