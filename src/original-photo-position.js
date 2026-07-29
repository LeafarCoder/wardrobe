const LEGACY_ORIGINAL_FOCUS = {
  upperbody: [50, 44],
  wholebody_up: [50, 52],
  lowerbody: [50, 68],
  wholebody: [50, 58],
  accessories_up: [50, 54],
  shoes: [50, 78],
};

function boxCenter(box) {
  if (!box || !["x", "y", "width", "height"].every((key) => Number.isFinite(Number(box[key])))) {
    return null;
  }
  return {
    x: (Number(box.x) + (Number(box.width) / 2)) / 10,
    y: (Number(box.y) + (Number(box.height) / 2)) / 10,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function originalPhotoPosition(item = {}) {
  const outfitCenter = boxCenter(item.originalFocusBox);
  const itemCenter = boxCenter(item.boundingBox);
  if (item.part === "shoes" && itemCenter) {
    return `${clamp(itemCenter.x, 5, 95).toFixed(1)}% 100%`;
  }
  if (outfitCenter || itemCenter) {
    const horizontal = clamp(outfitCenter && itemCenter
      ? (outfitCenter.x * 0.4) + (itemCenter.x * 0.6)
      : (outfitCenter || itemCenter).x, 5, 95);
    const vertical = clamp(outfitCenter && itemCenter
      ? (outfitCenter.y * 0.35) + (itemCenter.y * 0.65)
      : (outfitCenter || itemCenter).y, 8, 92);
    return `${horizontal.toFixed(1)}% ${vertical.toFixed(1)}%`;
  }
  const [horizontal, vertical] = LEGACY_ORIGINAL_FOCUS[item.part] || [50, 52];
  return `${horizontal}% ${vertical}%`;
}

export function cropCenteredCoverPosition({
  box,
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
}) {
  const center = boxCenter(box);
  const dimensions = [imageWidth, imageHeight, frameWidth, frameHeight].map(Number);
  if (!center || dimensions.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const [naturalWidth, naturalHeight, width, height] = dimensions;
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;

  const position = (focusPercent, frameSize, renderedSize) => {
    const overflow = renderedSize - frameSize;
    if (overflow <= 0.01) return 50;
    const focusPixel = (focusPercent / 100) * renderedSize;
    const desiredOffset = (frameSize / 2) - focusPixel;
    const offset = clamp(desiredOffset, -overflow, 0);
    return (-offset / overflow) * 100;
  };

  const x = position(center.x, width, renderedWidth);
  const y = position(center.y, height, renderedHeight);
  return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
}
