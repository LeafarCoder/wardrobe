export const VIDEO_DURATION_OPTIONS = Object.freeze([4, 6, 8, 10]);

export const VIDEO_RESOLUTION_OPTIONS = Object.freeze([
  { id: "480p", label: "480p", width: 480, height: 854 },
  { id: "720p", label: "720p", width: 720, height: 1280 },
  { id: "1080p", label: "1080p", width: 1080, height: 1920 },
]);

export const VIDEO_ASPECT_RATIO_OPTIONS = Object.freeze([
  { id: "original", label: "Same as modeled photo", description: "Preserve the source composition" },
  { id: "1:1", label: "Square", description: "1:1" },
  { id: "4:5", label: "Social portrait", description: "4:5" },
  { id: "9:16", label: "Story portrait", description: "9:16" },
  { id: "3:4", label: "Photo portrait", description: "3:4" },
  { id: "16:9", label: "Widescreen", description: "16:9" },
  { id: "3:2", label: "Photo landscape", description: "3:2" },
]);

const MODELED_IMAGE_VIDEO_RATIOS = Object.freeze({
  square: "1:1",
  "instagram-portrait": "4:5",
  portrait: "9:16",
  "photo-portrait": "3:4",
  landscape: "16:9",
  "photo-landscape": "3:2",
});

export const VIDEO_FRAME_OPTIONS = Object.freeze([
  { id: "first_frame", label: "Start from this image", description: "Use the modeled look as the opening frame." },
  { id: "last_frame", label: "End on this image", description: "Build the motion so it resolves into the modeled look." },
]);

export const VIDEO_MOVEMENT_OPTIONS = Object.freeze([
  {
    id: "turn-to-camera",
    label: "Turns around and looks into the camera",
    prompt: "The subject turns around naturally, settles into the pose, and looks directly into the camera.",
  },
  {
    id: "turn-and-walk-away",
    label: "Turns around and walks away from the camera",
    prompt: "The subject turns around naturally and walks away from the camera with realistic fashion-editorial movement.",
  },
  {
    id: "walk-and-grab",
    label: "Walks and grabs an object",
    prompt: "The subject walks naturally and reaches for the described object while preserving the outfit and identity.",
    objectDescription: true,
  },
  {
    id: "look-to-sky",
    label: "Looks from below to the sky",
    prompt: "Seen from a subtly lower camera angle, the subject slowly lifts their gaze toward the sky.",
  },
  {
    id: "custom",
    label: "Describe another movement",
    prompt: "Follow the custom movement direction precisely with natural, physically plausible motion.",
  },
]);

export const VIDEO_AUDIO_OPTIONS = Object.freeze([
  { id: "automatic", label: "Match the scene automatically", prompt: "Create subtle synchronized ambient sound that naturally matches the visible setting and action." },
  { id: "birds", label: "Birds chirping", prompt: "Add natural birds chirping softly in the environment." },
  { id: "traffic", label: "City traffic", prompt: "Add realistic nearby city traffic synchronized with the scene." },
  { id: "city-ambience", label: "City background noise", prompt: "Add a balanced urban ambience with distant movement and street noise." },
  { id: "chatting", label: "People chatting in the background", prompt: "Add indistinct people chatting naturally in the background, with no intelligible dialogue." },
  { id: "cheering", label: "Celebrative cheering", prompt: "Add celebratory cheering that rises naturally with the movement." },
  { id: "custom", label: "Describe another sound", prompt: "Follow the custom sound direction and synchronize it naturally with the movement." },
]);

const VIDEO_MODELS = [
  {
    id: "bytedance/seedance-1-5-pro",
    label: "Seedance 1.5 Pro",
    badge: "Recommended",
    note: "Lowest-cost flexible choice. Supports every offered duration and resolution, plus first- or last-frame control.",
    pricing: "Estimated from video tokens · audio disabled",
    durations: VIDEO_DURATION_OPTIONS,
    resolutions: ["480p", "720p", "1080p"],
    frames: ["first_frame", "last_frame"],
    videoTokenPrice: 0.0000012,
    videoTokenPriceWithAudio: 0.0000024,
    audio: true,
  },
  {
    id: "google/veo-3.1-lite",
    label: "Veo 3.1 Lite",
    badge: "Low cost",
    note: "Very economical at 720p and 1080p with strong image-to-video support. It does not support 10-second clips.",
    pricing: "720p $0.03/s · 1080p $0.05/s · audio disabled",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    frames: ["first_frame", "last_frame"],
    perSecond: { "720p": 0.03, "1080p": 0.05 },
    perSecondWithAudio: { "720p": 0.05, "1080p": 0.08 },
    audio: true,
  },
  {
    id: "x-ai/grok-imagine-video",
    label: "Grok Imagine Video",
    badge: "Low cost",
    note: "Supports every duration at 480p or 720p, but the modeled look can only be used as the first frame.",
    pricing: "480p $0.05/s · 720p $0.07/s · $0.002 image input",
    durations: VIDEO_DURATION_OPTIONS,
    resolutions: ["480p", "720p"],
    frames: ["first_frame"],
    perSecond: { "480p": 0.05, "720p": 0.07 },
    perImage: 0.002,
    audio: false,
  },
  {
    id: "bytedance/seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    badge: "Fast",
    note: "Faster Seedance 2.0 route with reference-friendly motion and first- or last-frame control, up to 720p.",
    pricing: "Estimated from video tokens · audio disabled",
    durations: VIDEO_DURATION_OPTIONS,
    resolutions: ["480p", "720p"],
    frames: ["first_frame", "last_frame"],
    videoTokenPrice: 0.0000056,
    videoTokenPriceWithAudio: 0.0000056,
    audio: true,
  },
  {
    id: "google/veo-3.1-fast",
    label: "Veo 3.1 Fast",
    badge: "Better quality",
    note: "A faster high-quality Veo route at 720p or 1080p. It does not support 10-second clips.",
    pricing: "720p $0.08/s · 1080p $0.10/s · audio disabled",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    frames: ["first_frame", "last_frame"],
    perSecond: { "720p": 0.08, "1080p": 0.10 },
    perSecondWithAudio: { "720p": 0.10, "1080p": 0.12 },
    audio: true,
  },
  {
    id: "bytedance/seedance-2.0",
    label: "Seedance 2.0",
    badge: "Best consistency",
    note: "Strong character and garment consistency with first- or last-frame control across 480p–1080p.",
    pricing: "Estimated from video tokens · audio disabled",
    durations: VIDEO_DURATION_OPTIONS,
    resolutions: ["480p", "720p", "1080p"],
    frames: ["first_frame", "last_frame"],
    videoTokenPrice: 0.000007,
    videoTokenPriceWithAudio: 0.000007,
    audio: true,
  },
];

export const VIDEO_GENERATION_MODELS = Object.freeze(VIDEO_MODELS.map((model) => Object.freeze({
  ...model,
  durations: Object.freeze([...model.durations]),
  resolutions: Object.freeze([...model.resolutions]),
  frames: Object.freeze([...model.frames]),
  ...(model.perSecond ? { perSecond: Object.freeze({ ...model.perSecond }) } : {}),
  ...(model.perSecondWithAudio ? { perSecondWithAudio: Object.freeze({ ...model.perSecondWithAudio }) } : {}),
})));

export const RECOMMENDED_VIDEO_MODEL = VIDEO_GENERATION_MODELS[0].id;

export const VIDEO_GENERATION_TRANSLATION_KEYS = Object.freeze([
  ...VIDEO_ASPECT_RATIO_OPTIONS.flatMap((option) => [option.label, option.description]),
  ...VIDEO_FRAME_OPTIONS.flatMap((option) => [option.label, option.description]),
  ...VIDEO_MOVEMENT_OPTIONS.map((option) => option.label),
  ...VIDEO_AUDIO_OPTIONS.map((option) => option.label),
  ...VIDEO_GENERATION_MODELS.flatMap((model) => [model.badge, model.note]),
]);

function ratioNumber(value) {
  const match = /^(\d+):(\d+)$/.exec(String(value || ""));
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

export function sourceModeledVideoAspectRatio({ imageRatio, width, height } = {}) {
  if (MODELED_IMAGE_VIDEO_RATIOS[imageRatio]) return MODELED_IMAGE_VIDEO_RATIOS[imageRatio];
  const measured = Number(width) > 0 && Number(height) > 0 ? Number(width) / Number(height) : null;
  if (!measured) return "9:16";
  return VIDEO_ASPECT_RATIO_OPTIONS
    .filter((option) => option.id !== "original")
    .map((option) => ({ id: option.id, difference: Math.abs(Math.log(measured / ratioNumber(option.id))) }))
    .sort((first, second) => first.difference - second.difference)[0]?.id || "9:16";
}

export function resolveModeledVideoAspectRatio(value, source = {}) {
  const selected = VIDEO_ASPECT_RATIO_OPTIONS.some((option) => option.id === value) ? value : "original";
  return selected === "original" ? sourceModeledVideoAspectRatio(source) : selected;
}

export function videoModel(modelId) {
  return VIDEO_GENERATION_MODELS.find((model) => model.id === modelId) || VIDEO_GENERATION_MODELS[0];
}

export function estimateVideoCost({ model = RECOMMENDED_VIDEO_MODEL, duration = 4, resolution = "480p", aspectRatio = "original", sourceAspectRatio = "9:16", audio = false } = {}) {
  const selected = videoModel(model);
  if (!selected.durations.includes(Number(duration)) || !selected.resolutions.includes(resolution)) return null;
  const withAudio = audio === true && selected.audio;
  const fixedRate = (withAudio ? selected.perSecondWithAudio : selected.perSecond)?.[resolution];
  if (Number.isFinite(fixedRate)) return (fixedRate * Number(duration)) + (selected.perImage || 0);
  const dimensions = VIDEO_RESOLUTION_OPTIONS.find((option) => option.id === resolution);
  if (!dimensions || !Number.isFinite(selected.videoTokenPrice)) return null;
  const resolvedRatio = ratioNumber(aspectRatio === "original" ? sourceAspectRatio : aspectRatio) || (9 / 16);
  const shortSide = dimensions.width;
  const longSide = Math.ceil((shortSide * Math.max(resolvedRatio, 1 / resolvedRatio)) / 2) * 2;
  const pixelCount = shortSide * longSide;
  const videoTokens = (pixelCount * Number(duration) * 24) / 1024;
  const tokenPrice = withAudio ? selected.videoTokenPriceWithAudio : selected.videoTokenPrice;
  return (videoTokens * tokenPrice) + (selected.perImage || 0);
}

export function normalizeModeledVideoSettings(value = {}, preferredModel = RECOMMENDED_VIDEO_MODEL) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const selected = videoModel(preferredModel);
  const duration = Number(input.duration);
  const resolution = typeof input.resolution === "string" ? input.resolution : "";
  const aspectRatio = typeof input.aspectRatio === "string" ? input.aspectRatio : "";
  const frameType = typeof input.frameType === "string" ? input.frameType : "";
  const movement = typeof input.movement === "string" ? input.movement : "";
  return {
    model: selected.id,
    duration: selected.durations.includes(duration) ? duration : selected.durations[0],
    resolution: selected.resolutions.includes(resolution) ? resolution : selected.resolutions[0],
    aspectRatio: VIDEO_ASPECT_RATIO_OPTIONS.some((option) => option.id === aspectRatio) ? aspectRatio : "original",
    frameType: selected.frames.includes(frameType) ? frameType : selected.frames[0],
    movement: VIDEO_MOVEMENT_OPTIONS.some((option) => option.id === movement) ? movement : VIDEO_MOVEMENT_OPTIONS[0].id,
    objectDescription: typeof input.objectDescription === "string" ? input.objectDescription.trim().slice(0, 200) : "",
    direction: typeof input.direction === "string" ? input.direction.trim().slice(0, 600) : "",
    audio: Boolean(input.audio && selected.audio),
    audioPreset: VIDEO_AUDIO_OPTIONS.some((option) => option.id === input.audioPreset) ? input.audioPreset : VIDEO_AUDIO_OPTIONS[0].id,
    audioDirection: typeof input.audioDirection === "string" ? input.audioDirection.trim().slice(0, 400) : "",
  };
}

export function modeledVideoPrompt(settings = {}, { garmentReference = false } = {}) {
  const normalized = normalizeModeledVideoSettings(settings, settings.model);
  const movement = VIDEO_MOVEMENT_OPTIONS.find((option) => option.id === normalized.movement);
  const objectDirection = movement?.objectDescription && normalized.objectDescription
    ? ` The object is: ${normalized.objectDescription}.`
    : "";
  const customDirection = normalized.direction ? ` Additional direction: ${normalized.direction}.` : "";
  const sound = VIDEO_AUDIO_OPTIONS.find((option) => option.id === normalized.audioPreset);
  const audioDirection = normalized.audio
    ? ` Generate synchronized audio. ${sound?.prompt || ""}${normalized.audioDirection ? ` Additional sound direction: ${normalized.audioDirection}.` : ""} Keep the audio consistent with the setting, pace, and visible movement.`
    : " Generate no audio.";
  const frameDirection = normalized.frameType === "last_frame"
    ? "The supplied modeled look is the exact final frame; make the preceding motion resolve smoothly into it."
    : "The supplied modeled look is the exact opening frame; animate forward smoothly from it.";
  return [
    frameDirection,
    garmentReference
      ? "The separate reference image shows the exact clean garment, including details that may be hidden in the modeled frame. Use it only to preserve the garment's construction, front, back, fabric, colors, and trim as the person moves; do not turn the product cutout into a scene or an additional frame."
      : null,
    movement?.prompt,
    objectDirection,
    customDirection,
    audioDirection,
    "Preserve the subject's identity, face, body proportions, outfit, garment details, colors, setting, and lighting exactly. Use one continuous realistic shot with natural fabric movement, stable anatomy, and no cuts, text, logos, or added people.",
  ].filter(Boolean).join(" ");
}

export function latestCompletedModeledVideo(look = {}) {
  return (Array.isArray(look?.videoClips) ? look.videoClips : [])
    .filter((clip) => clip?.status === "completed" && typeof clip.video === "string" && clip.video)
    .at(-1) || null;
}

export function isPortraitModeledMedia(width, height) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  return Number.isFinite(normalizedWidth)
    && Number.isFinite(normalizedHeight)
    && normalizedWidth > 0
    && normalizedHeight > normalizedWidth;
}

export function reverseModeledVideoTime(currentTime, elapsedSeconds) {
  const current = Number.isFinite(Number(currentTime)) ? Math.max(0, Number(currentTime)) : 0;
  const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Math.min(Number(elapsedSeconds), 0.08)) : 0;
  return Math.max(0, current - elapsed);
}

export function normalizeModeledVideoClip(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = typeof value.id === "string" && /^[a-z0-9-]{1,80}$/i.test(value.id) ? value.id : "";
  if (!id) return null;
  const status = ["pending", "in_progress", "completed", "failed"].includes(value.status)
    ? value.status
    : "pending";
  const settings = normalizeModeledVideoSettings(value.settings, value.model || value.settings?.model);
  return {
    id,
    status,
    model: settings.model,
    settings,
    prompt: typeof value.prompt === "string" ? value.prompt.slice(0, 1600) : "",
    upstreamJobId: typeof value.upstreamJobId === "string" ? value.upstreamJobId.slice(0, 200) : null,
    video: typeof value.video === "string" && value.video ? value.video : null,
    hoverVideo: typeof value.hoverVideo === "string" && value.hoverVideo ? value.hoverVideo : null,
    cost: Number.isFinite(value.cost) && value.cost >= 0 ? value.cost : null,
    error: typeof value.error === "string" ? value.error.slice(0, 500) : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
  };
}
