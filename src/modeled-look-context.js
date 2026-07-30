export const MODELED_LOOK_CONTEXT_OPTIONS = Object.freeze({
  pose: Object.freeze([
    { id: "standing", label: "Standing", prompt: "standing naturally" },
    { id: "walking", label: "Walking", prompt: "walking with a natural mid-step stride" },
    { id: "running", label: "Running", prompt: "running with believable athletic motion" },
    { id: "jumping", label: "Jumping", prompt: "captured in a natural mid-air jump" },
    { id: "sitting", label: "Sitting", prompt: "sitting in a relaxed, natural pose" },
    { id: "lying", label: "Lying down", prompt: "lying down in a natural editorial pose" },
    { id: "crouching", label: "Crouching", prompt: "crouching in a balanced, natural pose" },
  ]),
  hairstyle: Object.freeze([
    { id: "long-loose", label: "Long hair, loose", prompt: "long loose hair with its natural texture" },
    { id: "shoulder-length", label: "Shoulder-length hair", prompt: "shoulder-length hair with its natural texture" },
    { id: "short", label: "Short hair", prompt: "short hair with its natural texture" },
    { id: "ponytail", label: "Ponytail", prompt: "hair gathered into a natural ponytail" },
    { id: "bun", label: "Bun", prompt: "hair gathered into a neat natural bun" },
    { id: "braid", label: "Braid", prompt: "hair styled in a natural braid" },
    { id: "updo", label: "Formal updo", prompt: "hair styled in a polished formal updo" },
  ]),
  bodyOrientation: Object.freeze([
    { id: "front", label: "Straight forward", prompt: "body facing straight toward the camera" },
    { id: "three-quarter", label: "Three-quarters", prompt: "body at a three-quarter angle" },
    { id: "side", label: "Side profile", prompt: "body shown from the side" },
    { id: "back", label: "Back view", prompt: "body shown primarily from the back" },
  ]),
  headOrientation: Object.freeze([
    { id: "camera", label: "Looking at camera", prompt: "looking directly into the camera" },
    { id: "forward", label: "Looking forward", prompt: "head aligned naturally and looking forward" },
    { id: "right", label: "Looking right", prompt: "head turned and looking to their right" },
    { id: "left", label: "Looking left", prompt: "head turned and looking to their left" },
    { id: "down", label: "Looking down", prompt: "looking downward" },
    { id: "up", label: "Looking up", prompt: "looking upward" },
    { id: "over-shoulder", label: "Over the shoulder", prompt: "looking naturally back over one shoulder" },
  ]),
  environmentType: Object.freeze([
    { id: "inside", label: "Inside", prompt: "inside" },
    { id: "outside", label: "Open air", prompt: "outside in the open air" },
  ]),
  insideSetting: Object.freeze([
    { id: "living-room", label: "Living room", prompt: "a refined, lived-in living room" },
    { id: "fireplace", label: "By a fireplace", prompt: "a warm interior beside a fireplace" },
    { id: "bedroom", label: "Bedroom", prompt: "a calm, tasteful bedroom" },
    { id: "kitchen", label: "Kitchen", prompt: "a bright contemporary kitchen" },
    { id: "office", label: "Office", prompt: "a polished office" },
    { id: "restaurant", label: "Restaurant", prompt: "an elegant restaurant" },
    { id: "movie-theater", label: "Movie theater", prompt: "a cinematic movie theater interior" },
    { id: "cafe", label: "Café", prompt: "a characterful café" },
    { id: "gallery", label: "Art gallery", prompt: "a quiet contemporary art gallery" },
    { id: "hotel-lobby", label: "Hotel lobby", prompt: "an elegant hotel lobby" },
    { id: "library", label: "Library", prompt: "a warm, atmospheric library" },
  ]),
  outsideSetting: Object.freeze([
    { id: "park", label: "Park", prompt: "a leafy city park" },
    { id: "grass-park", label: "Expansive grass park", prompt: "a vast open park with sweeping grass" },
    { id: "forest", label: "Forest", prompt: "a natural forest" },
    { id: "city", label: "City", prompt: "a lively, architecturally interesting city street" },
    { id: "mountain", label: "Mountain", prompt: "a dramatic mountain landscape" },
    { id: "beach", label: "Beach", prompt: "a natural beach and shoreline" },
    { id: "garden", label: "Garden", prompt: "a lush landscaped garden" },
    { id: "lakeside", label: "Lakeside", prompt: "a tranquil lakeside" },
    { id: "countryside", label: "Countryside", prompt: "open countryside" },
    { id: "rooftop", label: "Rooftop", prompt: "an urban rooftop with open sky" },
    { id: "old-town", label: "Old town", prompt: "a historic old-town street" },
    { id: "promenade", label: "Promenade", prompt: "an open waterfront promenade" },
  ]),
  weather: Object.freeze([
    { id: "sunny", label: "Sunny", prompt: "sunny weather" },
    { id: "partly-cloudy", label: "Partly cloudy", prompt: "partly cloudy weather" },
    { id: "cloudy", label: "Cloudy", prompt: "soft overcast weather" },
    { id: "light-rain", label: "Light rain", prompt: "a believable light rain" },
    { id: "heavy-rain", label: "Heavy rain", prompt: "dramatic heavy rain" },
    { id: "thunderstorm", label: "Thunderstorm", prompt: "a dramatic thunderstorm in the distance" },
    { id: "snowing", label: "Snowing", prompt: "natural falling snow" },
    { id: "foggy", label: "Foggy", prompt: "soft atmospheric fog" },
    { id: "windy", label: "Windy", prompt: "windy conditions with believable movement in hair and fabric" },
  ]),
  expression: Object.freeze([
    { id: "neutral", label: "Neutral", prompt: "a neutral, relaxed expression" },
    { id: "smiling", label: "Smiling", prompt: "a natural smile" },
    { id: "smirking", label: "Smirking", prompt: "a subtle smirk" },
    { id: "flirty", label: "Flirty", prompt: "a playful, flirtatious expression" },
    { id: "sad", label: "Sad", prompt: "a quietly sad expression" },
    { id: "rejoicing", label: "Rejoicing", prompt: "a joyful, celebratory expression" },
    { id: "yawning", label: "Yawning", prompt: "a natural yawn" },
    { id: "surprised", label: "Surprised", prompt: "a believable surprised expression" },
    { id: "thoughtful", label: "Thoughtful", prompt: "a thoughtful expression" },
    { id: "serious", label: "Serious", prompt: "a composed, serious expression" },
  ]),
});

export const EMPTY_MODELED_LOOK_CONTEXT = Object.freeze({
  pose: "",
  hairstyle: "",
  bodyOrientation: "",
  headOrientation: "",
  environmentType: "",
  setting: "",
  weather: "",
  expression: "",
  additionalDirection: "",
});

function validOption(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].some((option) => option.id === value) ? value : "";
}

function optionPrompt(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].find((option) => option.id === value)?.prompt || "";
}

function optionLabel(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].find((option) => option.id === value)?.label || "";
}

export function normalizeModeledLookContext(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const environmentType = validOption("environmentType", source.environmentType);
  const settingGroup = environmentType === "inside" ? "insideSetting" : "outsideSetting";
  return {
    pose: validOption("pose", source.pose),
    hairstyle: validOption("hairstyle", source.hairstyle),
    bodyOrientation: validOption("bodyOrientation", source.bodyOrientation),
    headOrientation: validOption("headOrientation", source.headOrientation),
    environmentType,
    setting: environmentType ? validOption(settingGroup, source.setting) : "",
    weather: validOption("weather", source.weather),
    expression: validOption("expression", source.expression),
    additionalDirection: typeof source.additionalDirection === "string"
      ? source.additionalDirection.trim().slice(0, 800)
      : "",
  };
}

export function modeledLookContextPrompt(input = {}) {
  const context = normalizeModeledLookContext(input);
  const details = [
    context.pose ? `Pose and action: ${optionPrompt("pose", context.pose)}.` : null,
    context.hairstyle ? `Hairstyle: ${optionPrompt("hairstyle", context.hairstyle)}. Preserve the person's real hair color, hairline, and texture.` : null,
    context.bodyOrientation ? `Body orientation: ${optionPrompt("bodyOrientation", context.bodyOrientation)}.` : null,
    context.headOrientation ? `Head orientation: ${optionPrompt("headOrientation", context.headOrientation)}.` : null,
    context.environmentType
      ? `Environment: ${context.setting
          ? optionPrompt(context.environmentType === "inside" ? "insideSetting" : "outsideSetting", context.setting)
          : optionPrompt("environmentType", context.environmentType)}.`
      : null,
    context.weather ? `Weather and atmosphere: ${optionPrompt("weather", context.weather)}.` : null,
    context.expression ? `Expression: ${optionPrompt("expression", context.expression)}.` : null,
    context.additionalDirection
      ? `Additional user direction: ${context.additionalDirection}`
      : null,
  ].filter(Boolean);
  if (!details.length) return "";
  return `\n\nCreative direction for this image — apply every selected detail consistently:\n- ${details.join("\n- ")}\nResolve combinations with realistic anatomy and physical plausibility. Keep identity preservation and the featured garment's complete visibility as higher priorities.`;
}

export function modeledLookContextDetails(input = {}) {
  const context = normalizeModeledLookContext(input);
  const translated = (id, label, values) => values.filter(Boolean).length
    ? { id, label, values: values.filter(Boolean), translateValues: true }
    : null;
  return [
    translated("pose", "Pose", [optionLabel("pose", context.pose)]),
    translated("hairstyle", "Hairstyle", [optionLabel("hairstyle", context.hairstyle)]),
    translated("bodyOrientation", "Body orientation", [optionLabel("bodyOrientation", context.bodyOrientation)]),
    translated("headOrientation", "Head orientation", [optionLabel("headOrientation", context.headOrientation)]),
    translated("environment", "Environment", [
      optionLabel("environmentType", context.environmentType),
      context.environmentType
        ? optionLabel(context.environmentType === "inside" ? "insideSetting" : "outsideSetting", context.setting)
        : "",
    ]),
    translated("weather", "Weather", [optionLabel("weather", context.weather)]),
    translated("expression", "Expression", [optionLabel("expression", context.expression)]),
    context.additionalDirection
      ? {
          id: "additionalDirection",
          label: "More direction",
          values: [context.additionalDirection],
          translateValues: false,
        }
      : null,
  ].filter(Boolean);
}
