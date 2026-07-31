export const MODELED_LOOK_CONTEXT_OPTIONS = Object.freeze({
  photographicStyle: Object.freeze([
    { id: "editorial", label: "Editorial", description: "Polished fashion story", prompt: "polished editorial fashion photography" },
    { id: "candid", label: "Candid", description: "Unposed everyday moment", prompt: "a natural candid lifestyle photograph" },
    { id: "freestyle", label: "Freestyle", description: "Expressive and creatively composed", prompt: "expressive freestyle fashion photography with playful, creative composition" },
    { id: "cinematic", label: "Cinematic", description: "Dramatic light and atmosphere", prompt: "cinematic photography with natural depth and atmosphere" },
    { id: "minimal", label: "Minimal", description: "Quiet, clean, restrained frame", prompt: "restrained minimal fashion photography" },
  ]),
  pose: Object.freeze([
    { id: "standing", label: "Standing", prompt: "standing naturally" },
    { id: "walking", label: "Walking", prompt: "walking with a natural mid-step stride" },
    { id: "running", label: "Running", prompt: "running with believable athletic motion" },
    { id: "jumping", label: "Jumping", prompt: "captured in a natural mid-air jump" },
    { id: "sitting", label: "Sitting", prompt: "sitting in a relaxed, natural pose" },
    { id: "lying", label: "Lying down", prompt: "lying down in a natural editorial pose" },
    { id: "crouching", label: "Crouching", prompt: "crouching in a balanced, natural pose" },
    { id: "stairs-up", label: "Going upstairs", prompt: "walking naturally up a staircase with a believable step and balanced posture" },
    { id: "stairs-down", label: "Going downstairs", prompt: "walking naturally down a staircase with a believable step and balanced posture" },
  ]),
  gesture: Object.freeze([
    { id: "arms-crossed", label: "Arms crossed", prompt: "arms crossed in a relaxed, natural way without hiding the outfit's defining details" },
    { id: "tuck-hair", label: "Tucking hair behind ear", prompt: "one hand naturally tucking hair behind one ear" },
    { id: "hand-through-hair", label: "Hand through hair", prompt: "one hand moving gently through their hair" },
    { id: "one-hand-hip", label: "One hand on hip", prompt: "one hand resting naturally on one hip" },
    { id: "hands-on-hips", label: "Hands on hips", prompt: "both hands resting naturally on the hips" },
    { id: "hands-pockets", label: "Hands in pockets", prompt: "hands resting casually in available pockets" },
    { id: "arms-overhead", label: "Arms overhead", prompt: "both arms raised naturally overhead with believable shoulder and elbow anatomy" },
    { id: "hands-clasped", label: "Hands clasped", prompt: "hands gently clasped together in front" },
    { id: "hands-behind-back", label: "Hands behind back", prompt: "hands held naturally behind the back" },
    { id: "hand-chin", label: "Hand at chin", prompt: "one hand resting thoughtfully near the chin" },
    { id: "adjusting-cuff", label: "Adjusting a cuff", prompt: "one hand naturally adjusting the opposite sleeve or cuff" },
    { id: "hands-one-knee", label: "Hands on one knee", prompt: "both hands together resting naturally over one raised or crossed knee" },
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
  season: Object.freeze([
    { id: "spring", label: "Spring", prompt: "spring, with seasonally appropriate light, vegetation, and atmosphere" },
    { id: "summer", label: "Summer", prompt: "summer, with seasonally appropriate light, vegetation, and atmosphere" },
    { id: "autumn", label: "Autumn", prompt: "autumn, with seasonally appropriate light, vegetation, and atmosphere" },
    { id: "winter", label: "Winter", prompt: "winter, with seasonally appropriate light, vegetation, and atmosphere" },
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
  timeOfDay: Object.freeze([
    { id: "sunrise", label: "Sunrise", prompt: "at sunrise with low, gentle first light" },
    { id: "morning", label: "Morning", prompt: "in clear natural morning light" },
    { id: "afternoon", label: "Afternoon", prompt: "in natural afternoon light" },
    { id: "sunset", label: "Sunset", prompt: "at sunset with warm low-angle light" },
    { id: "night", label: "Night", prompt: "at night with believable ambient and practical lighting" },
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

export const MODELED_LOOK_IMAGE_RATIO_OPTIONS = Object.freeze([
  { id: "square", label: "Square", description: "1:1", prompt: "square 1:1" },
  { id: "instagram-portrait", label: "Social portrait", description: "4:5 Instagram feed", prompt: "social portrait 4:5" },
  { id: "portrait", label: "Story portrait", description: "9:16 Stories & Reels", prompt: "vertical story portrait 9:16" },
  { id: "photo-portrait", label: "Photo portrait", description: "3:4 classic", prompt: "classic photo portrait 3:4" },
  { id: "landscape", label: "Widescreen", description: "16:9 horizontal", prompt: "horizontal widescreen 16:9" },
  { id: "photo-landscape", label: "Photo landscape", description: "3:2 classic", prompt: "classic photo landscape 3:2" },
]);

export const MODELED_LOOK_CONTEXT_TRANSLATION_KEYS = Object.freeze(
  [
    ...Object.values(MODELED_LOOK_CONTEXT_OPTIONS),
    MODELED_LOOK_IMAGE_RATIO_OPTIONS,
  ].flatMap((options) => options.flatMap((option) => [option.label, option.description].filter(Boolean))),
);

export const EMPTY_MODELED_LOOK_CONTEXT = Object.freeze({
  imageRatio: "portrait",
  photographicStyle: "",
  pose: "",
  gesture: "",
  hairstyle: "",
  bodyOrientation: "",
  headOrientation: "",
  environmentType: "",
  setting: "",
  season: "",
  weather: "",
  timeOfDay: "",
  expression: "",
  backgroundReferenceId: "",
  backgroundReferenceName: "",
  additionalDirection: "",
  people: [],
});

const PERSON_DIRECTION_FIELDS = Object.freeze([
  "pose",
  "gesture",
  "hairstyle",
  "bodyOrientation",
  "headOrientation",
  "expression",
]);

function validOption(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].some((option) => option.id === value) ? value : "";
}

export function normalizeModeledLookImageRatio(value) {
  return MODELED_LOOK_IMAGE_RATIO_OPTIONS.some((option) => option.id === value) ? value : "";
}

export function modeledLookImageRatioPrompt(value) {
  const ratio = normalizeModeledLookImageRatio(value) || "portrait";
  return MODELED_LOOK_IMAGE_RATIO_OPTIONS.find((option) => option.id === ratio)?.prompt || "vertical portrait 9:16";
}

function optionPrompt(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].find((option) => option.id === value)?.prompt || "";
}

export function modeledLookOptionPrompt(group, value) {
  return Object.hasOwn(MODELED_LOOK_CONTEXT_OPTIONS, group) ? optionPrompt(group, value) : "";
}

function optionLabel(group, value) {
  return MODELED_LOOK_CONTEXT_OPTIONS[group].find((option) => option.id === value)?.label || "";
}

export function normalizeModeledLookContext(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const environmentType = validOption("environmentType", source.environmentType);
  const settingGroup = environmentType === "inside" ? "insideSetting" : "outsideSetting";
  const seenPeople = new Set();
  const people = (Array.isArray(source.people) ? source.people : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const personId = typeof entry.personId === "string" ? entry.personId.trim().slice(0, 80) : "";
    if (!personId || seenPeople.has(personId)) return [];
    seenPeople.add(personId);
    return [{
      personId,
      ...Object.fromEntries(PERSON_DIRECTION_FIELDS.map((field) => [field, validOption(field, entry[field])])),
      additionalDirection: typeof entry.additionalDirection === "string"
        ? entry.additionalDirection.trim().slice(0, 400)
        : "",
    }];
  }).slice(0, 4);
  return {
    imageRatio: normalizeModeledLookImageRatio(source.imageRatio),
    photographicStyle: validOption("photographicStyle", source.photographicStyle === "street-style" ? "freestyle" : source.photographicStyle),
    pose: validOption("pose", source.pose),
    gesture: validOption("gesture", source.gesture),
    hairstyle: validOption("hairstyle", source.hairstyle),
    bodyOrientation: validOption("bodyOrientation", source.bodyOrientation),
    headOrientation: validOption("headOrientation", source.headOrientation),
    environmentType,
    setting: environmentType ? validOption(settingGroup, source.setting) : "",
    season: validOption("season", source.season),
    weather: validOption("weather", source.weather),
    timeOfDay: validOption("timeOfDay", source.timeOfDay),
    expression: validOption("expression", source.expression),
    backgroundReferenceId: typeof source.backgroundReferenceId === "string"
      ? source.backgroundReferenceId.trim().slice(0, 80)
      : "",
    backgroundReferenceName: typeof source.backgroundReferenceName === "string"
      ? source.backgroundReferenceName.trim().slice(0, 120)
      : "",
    additionalDirection: typeof source.additionalDirection === "string"
      ? source.additionalDirection.trim().slice(0, 800)
      : "",
    people,
  };
}

export function modeledLookContextPrompt(input = {}) {
  const context = normalizeModeledLookContext(input);
  const details = [
    context.photographicStyle ? `Photographic style: ${optionPrompt("photographicStyle", context.photographicStyle)}.` : null,
    context.pose ? `Body pose and action: ${optionPrompt("pose", context.pose)}.` : null,
    context.gesture ? `Arm and hand gesture: ${optionPrompt("gesture", context.gesture)}.` : null,
    context.hairstyle ? `Hairstyle: ${optionPrompt("hairstyle", context.hairstyle)}. Preserve the person's real hair color, hairline, and texture.` : null,
    context.bodyOrientation ? `Body orientation: ${optionPrompt("bodyOrientation", context.bodyOrientation)}.` : null,
    context.headOrientation ? `Head orientation: ${optionPrompt("headOrientation", context.headOrientation)}.` : null,
    context.environmentType
      ? `Environment: ${context.setting
          ? optionPrompt(context.environmentType === "inside" ? "insideSetting" : "outsideSetting", context.setting)
          : optionPrompt("environmentType", context.environmentType)}.`
      : null,
    context.season ? `Season: ${optionPrompt("season", context.season)}.` : null,
    context.weather ? `Weather and atmosphere: ${optionPrompt("weather", context.weather)}.${context.season ? " Treat this as a plausible weather moment within the selected season." : ""}` : null,
    context.timeOfDay ? `Day period and light: ${optionPrompt("timeOfDay", context.timeOfDay)}.` : null,
    context.expression ? `Expression: ${optionPrompt("expression", context.expression)}.` : null,
    ...context.people.map((person) => {
      const directions = PERSON_DIRECTION_FIELDS.flatMap((field) => (
        person[field] ? [`${field}: ${optionPrompt(field, person[field])}`] : []
      ));
      if (person.additionalDirection) directions.push(`additional direction: ${person.additionalDirection}`);
      return directions.length ? `Person ${person.personId}: ${directions.join("; ")}.` : null;
    }),
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
    translated("imageRatio", "Image ratio", [MODELED_LOOK_IMAGE_RATIO_OPTIONS.find((option) => option.id === context.imageRatio)?.label]),
    translated("photographicStyle", "Style", [optionLabel("photographicStyle", context.photographicStyle)]),
    translated("pose", "Body pose", [optionLabel("pose", context.pose)]),
    translated("gesture", "Gesture", [optionLabel("gesture", context.gesture)]),
    translated("hairstyle", "Hairstyle", [optionLabel("hairstyle", context.hairstyle)]),
    translated("bodyOrientation", "Body orientation", [optionLabel("bodyOrientation", context.bodyOrientation)]),
    translated("headOrientation", "Head orientation", [optionLabel("headOrientation", context.headOrientation)]),
    translated("environment", "Environment", [
      optionLabel("environmentType", context.environmentType),
      context.environmentType
        ? optionLabel(context.environmentType === "inside" ? "insideSetting" : "outsideSetting", context.setting)
        : "",
    ]),
    translated("season", "Season", [optionLabel("season", context.season)]),
    translated("weather", "Weather", [optionLabel("weather", context.weather)]),
    translated("timeOfDay", "Day period", [optionLabel("timeOfDay", context.timeOfDay)]),
    translated("expression", "Expression", [optionLabel("expression", context.expression)]),
    context.backgroundReferenceId
      ? {
          id: "backgroundReference",
          label: "Saved background",
          values: [context.backgroundReferenceName || context.backgroundReferenceId],
          translateValues: false,
        }
      : null,
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
