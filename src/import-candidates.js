function cleanCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const id = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 80) : "";
  const assetUrl = typeof candidate.assetUrl === "string" ? candidate.assetUrl.trim() : "";
  if (!id || !assetUrl) return null;
  return {
    id,
    assetUrl,
    model: typeof candidate.model === "string" && candidate.model ? candidate.model : null,
    fallbackUsed: Boolean(candidate.fallbackUsed),
    attempt: Math.max(1, Math.round(Number(candidate.attempt) || 1)),
    generatedAt: typeof candidate.generatedAt === "string" ? candidate.generatedAt : null,
  };
}

export function importGenerationCandidates(stage = {}) {
  const candidates = [];
  const seenIds = new Set();
  const seenAssets = new Set();
  for (const value of Array.isArray(stage.candidates) ? stage.candidates : []) {
    const candidate = cleanCandidate(value);
    if (!candidate || seenIds.has(candidate.id) || seenAssets.has(candidate.assetUrl.split("?")[0])) continue;
    seenIds.add(candidate.id);
    seenAssets.add(candidate.assetUrl.split("?")[0]);
    candidates.push(candidate);
  }
  const currentAsset = typeof stage.assetUrl === "string" ? stage.assetUrl : "";
  if (currentAsset && !seenAssets.has(currentAsset.split("?")[0])) {
    candidates.push({
      id: "legacy-current",
      assetUrl: currentAsset,
      model: typeof stage.model === "string" && stage.model ? stage.model : null,
      fallbackUsed: Boolean(stage.fallbackUsed),
      attempt: Math.max(1, Math.round(Number(stage.attempts) || 1)),
      generatedAt: typeof stage.updatedAt === "string" ? stage.updatedAt : null,
    });
  }
  return candidates;
}

export function selectedImportGenerationCandidate(stage = {}) {
  const candidates = importGenerationCandidates(stage);
  return candidates.find((candidate) => candidate.id === stage.selectedCandidateId)
    || candidates.find((candidate) => candidate.assetUrl.split("?")[0] === String(stage.assetUrl || "").split("?")[0])
    || candidates.at(-1)
    || null;
}

export function appendImportGenerationCandidate(stage = {}, value = {}) {
  const candidate = cleanCandidate(value);
  if (!candidate) return { ...stage };
  const candidates = importGenerationCandidates(stage)
    .filter((existing) => existing.id !== candidate.id && existing.assetUrl.split("?")[0] !== candidate.assetUrl.split("?")[0]);
  candidates.push(candidate);
  return {
    ...stage,
    candidates,
    selectedCandidateId: candidate.id,
    assetUrl: candidate.assetUrl,
    model: candidate.model,
    fallbackUsed: candidate.fallbackUsed,
  };
}

export function selectImportGenerationCandidate(stage = {}, candidateId = "") {
  const candidates = importGenerationCandidates(stage);
  const selected = candidates.find((candidate) => candidate.id === candidateId);
  if (!selected) return null;
  return {
    ...stage,
    candidates,
    selectedCandidateId: selected.id,
    assetUrl: selected.assetUrl,
    model: selected.model,
    fallbackUsed: selected.fallbackUsed,
  };
}
