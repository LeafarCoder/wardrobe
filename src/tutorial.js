export const TUTORIAL_STEPS = ["profile", "upload", "garment", "panel", "explore", "finish"];

const TUTORIAL_STATUSES = new Set(["pending", "active", "completed", "dismissed"]);
const TUTORIAL_STEP_IDS = new Set(TUTORIAL_STEPS);

export function normalizeTutorialState(value, { defaultStatus = "completed" } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const status = TUTORIAL_STATUSES.has(source.status) ? source.status : defaultStatus;
  const step = TUTORIAL_STEP_IDS.has(source.step) ? source.step : "profile";
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt.slice(0, 40) : null;
  const completedAt = typeof source.completedAt === "string" ? source.completedAt.slice(0, 40) : null;
  const dismissedAt = typeof source.dismissedAt === "string" ? source.dismissedAt.slice(0, 40) : null;
  return {
    status,
    step,
    updatedAt,
    completedAt: status === "completed" ? completedAt : null,
    dismissedAt: status === "dismissed" ? dismissedAt : null,
  };
}

export function updateTutorialState(current, input = {}, now = new Date().toISOString()) {
  const previous = normalizeTutorialState(current);
  const requestedStatus = TUTORIAL_STATUSES.has(input.status) ? input.status : previous.status;
  const requestedStep = TUTORIAL_STEP_IDS.has(input.step) ? input.step : previous.step;
  return normalizeTutorialState({
    status: requestedStatus,
    step: requestedStep,
    updatedAt: now,
    completedAt: requestedStatus === "completed" ? now : null,
    dismissedAt: requestedStatus === "dismissed" ? now : null,
  });
}
