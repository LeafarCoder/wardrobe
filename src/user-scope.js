export function withWardrobeUser(path, userId) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}user=${encodeURIComponent(normalizedUserId)}`;
}
