import { useEffect, useRef } from "react";
import { tr } from "./i18n.js";
import { normalizeHexColor, recolorGarmentPixels } from "./garment-recolor.js";

const BITMAP_CACHE = new Map();
const RECOLOR_CACHE = new Map();
const MAX_RECOLOR_CACHE_ENTRIES = 24;

async function loadBitmap(src) {
  if (!BITMAP_CACHE.has(src)) {
    BITMAP_CACHE.set(src, (async () => {
      const response = await fetch(src, { cache: "force-cache", credentials: "same-origin" });
      if (!response.ok) throw new Error(tr("The garment preview could not be loaded."));
      return createImageBitmap(await response.blob());
    })());
  }
  return BITMAP_CACHE.get(src);
}

function rememberRecolor(key, imageData) {
  if (RECOLOR_CACHE.size >= MAX_RECOLOR_CACHE_ENTRIES) {
    RECOLOR_CACHE.delete(RECOLOR_CACHE.keys().next().value);
  }
  RECOLOR_CACHE.set(key, imageData);
}

export function GarmentColorPreview({
  src,
  alt,
  sourceColor,
  alternateColor,
  targetColor,
  context = {},
  className = "",
  onClick,
  onSourceReady,
  onRenderingChange,
  onError,
}) {
  const canvasRef = useRef(null);
  const callbackRef = useRef({ onSourceReady, onRenderingChange, onError });
  callbackRef.current = { onSourceReady, onRenderingChange, onError };
  const contextKey = JSON.stringify({
    name: context.name || "",
    part: context.part || "",
    tags: Array.isArray(context.tags) ? context.tags : [],
    materials: Array.isArray(context.materials) ? context.materials : [],
    channel: context.channel === "secondary" ? "secondary" : "primary",
  });

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      callbackRef.current.onRenderingChange?.(Boolean(targetColor));
      try {
        const bitmap = await loadBitmap(src);
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        callbackRef.current.onSourceReady?.(bitmap);

        const normalizedSource = normalizeHexColor(sourceColor);
        const normalizedTarget = normalizeHexColor(targetColor);
        const normalizedAlternate = normalizeHexColor(alternateColor);
        if (normalizedSource && normalizedTarget && normalizedSource !== normalizedTarget) {
          const key = [src, normalizedSource, normalizedAlternate || "", normalizedTarget, contextKey].join("|");
          let recolored = RECOLOR_CACHE.get(key);
          if (!recolored) {
            recolored = context.getImageData(0, 0, canvas.width, canvas.height);
            recolorGarmentPixels(recolored.data, normalizedSource, normalizedTarget, normalizedAlternate, JSON.parse(contextKey));
            rememberRecolor(key, recolored);
          }
          if (cancelled) return;
          context.putImageData(recolored, 0, 0);
        }
        callbackRef.current.onError?.("");
      } catch (error) {
        if (!cancelled) callbackRef.current.onError?.(error.message || tr("The color preview could not be rendered."));
      } finally {
        if (!cancelled) callbackRef.current.onRenderingChange?.(false);
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [alternateColor, contextKey, sourceColor, src, targetColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`garment-color-canvas${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={alt}
      onClick={onClick}
    />
  );
}
