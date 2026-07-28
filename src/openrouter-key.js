export const OPENROUTER_KEY_REQUIRED_EVENT = "wardrobe:openrouter-key-required";

export function isOpenRouterKeyMissing(error) {
  const code = typeof error === "object" && error ? error.code : "";
  const message = typeof error === "string" ? error : error?.message || "";
  return code === "openrouter_key_missing"
    || /no openrouter key is available/i.test(message);
}

export function notifyOpenRouterKeyRequired(error, target = globalThis.window) {
  if (!isOpenRouterKeyMissing(error) || !target?.dispatchEvent) return false;
  target.dispatchEvent(new Event(OPENROUTER_KEY_REQUIRED_EVENT));
  return true;
}

export function isValidOpenRouterKey(value) {
  return /^sk-or-[A-Za-z0-9._-]{8,200}$/.test(String(value ?? "").trim());
}
