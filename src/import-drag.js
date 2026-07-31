export function hasFileDrag(dataTransfer) {
  if (!dataTransfer) return false;
  if ([...(dataTransfer.types || [])].includes("Files")) return true;
  return Boolean(dataTransfer.files?.length);
}
