export function garmentReviewImages(job = {}) {
  return {
    source: job.stages?.crop?.assetUrl || job.originalAssetUrl || null,
    generated: job.stages?.garment?.assetUrl || null,
  };
}
