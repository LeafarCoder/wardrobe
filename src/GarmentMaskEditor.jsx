import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Check, Eraser, PencilSimple, X } from "@phosphor-icons/react";
import { tr } from "./i18n.js";

const loadBitmap = async (url) => {
  const requestUrl = new URL(url, window.location.origin);
  // Hosted wardrobe assets normally redirect to a short-lived object-storage
  // URL. Ask the API to proxy editor inputs so fetch/createImageBitmap can read
  // their pixels without depending on the bucket's CORS configuration.
  if (requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/")) {
    requestUrl.searchParams.set("inline", "1");
  }
  const response = await fetch(requestUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error(tr("The mask image could not be loaded."));
  return createImageBitmap(await response.blob());
};

export function GarmentMaskEditor({ sourceUrl, maskUrl, model, busy, onCancel, onApply }) {
  const previewRef = useRef(null);
  const maskRef = useRef(null);
  const processingMaskRef = useRef(null);
  const sourcePixelsRef = useRef(null);
  const undoRef = useRef([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const frameRef = useRef(null);
  const [tool, setTool] = useState("remove");
  const [brushSize, setBrushSize] = useState(48);
  const [threshold, setThreshold] = useState(128);
  const [edge, setEdge] = useState(-1);
  const [feather, setFeather] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [undoCount, setUndoCount] = useState(0);

  const render = useCallback(() => {
    const canvas = previewRef.current;
    const sourcePixels = sourcePixelsRef.current;
    const maskCanvas = maskRef.current;
    if (!canvas || !sourcePixels || !maskCanvas.width) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const processingMask = processingMaskRef.current;
      if (!processingMask) return;
      processingMask.width = maskCanvas.width;
      processingMask.height = maskCanvas.height;
      const processingContext = processingMask.getContext("2d", { willReadFrequently: true });
      processingContext.clearRect(0, 0, processingMask.width, processingMask.height);
      processingContext.filter = feather > 0 ? `blur(${feather}px)` : "none";
      processingContext.drawImage(maskCanvas, 0, 0);
      processingContext.filter = "none";
      const mask = processingContext.getImageData(0, 0, processingMask.width, processingMask.height).data;
      const output = new ImageData(new Uint8ClampedArray(sourcePixels.data), sourcePixels.width, sourcePixels.height);
      // The server performs true morphology. This threshold offset gives an
      // immediate close approximation while the user adjusts the edge control.
      const previewThreshold = Math.max(1, Math.min(254, threshold - (edge * 12)));
      const transition = 4;
      for (let pixel = 0, index = 0; pixel < mask.length / 4; pixel += 1, index += 4) {
        const value = mask[index];
        const alpha = Math.max(0, Math.min(1, (value - (previewThreshold - transition)) / (transition * 2)));
        output.data[index + 3] = Math.round(output.data[index + 3] * alpha);
        if (output.data[index + 3] <= 4) output.data[index] = output.data[index + 1] = output.data[index + 2] = output.data[index + 3] = 0;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(output, 0, 0);
    });
  }, [edge, feather, threshold]);

  useEffect(() => {
    let cancelled = false;
    maskRef.current ||= document.createElement("canvas");
    processingMaskRef.current ||= document.createElement("canvas");
    Promise.all([loadBitmap(sourceUrl), loadBitmap(maskUrl)]).then(([source, mask]) => {
      if (cancelled) return;
      const canvas = previewRef.current;
      const maskCanvas = maskRef.current;
      canvas.width = source.width;
      canvas.height = source.height;
      maskCanvas.width = source.width;
      maskCanvas.height = source.height;
      const sourceContext = canvas.getContext("2d", { willReadFrequently: true });
      sourceContext.drawImage(source, 0, 0);
      sourcePixelsRef.current = sourceContext.getImageData(0, 0, source.width, source.height);
      const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
      maskContext.fillStyle = "black";
      maskContext.fillRect(0, 0, source.width, source.height);
      maskContext.drawImage(mask, 0, 0, source.width, source.height);
      setReady(true);
      source.close();
      mask.close();
    }).catch((loadError) => setError(loadError.message));
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
    };
  }, [maskUrl, sourceUrl]);

  useEffect(() => {
    if (ready) render();
  }, [ready, render]);

  const pointForEvent = (event) => {
    const canvas = previewRef.current;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const drawTo = (point) => {
    const context = maskRef.current.getContext("2d");
    const previous = lastPointRef.current || point;
    context.save();
    context.strokeStyle = tool === "keep" ? "white" : "black";
    context.lineWidth = brushSize * (maskRef.current.width / Math.max(1, previewRef.current.getBoundingClientRect().width));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
    lastPointRef.current = point;
    render();
  };

  const startDrawing = (event) => {
    if (!ready || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = maskRef.current.getContext("2d", { willReadFrequently: true });
    undoRef.current = [...undoRef.current.slice(-19), context.getImageData(0, 0, maskRef.current.width, maskRef.current.height)];
    setUndoCount(undoRef.current.length);
    drawingRef.current = true;
    lastPointRef.current = null;
    drawTo(pointForEvent(event));
  };

  const continueDrawing = (event) => {
    if (!drawingRef.current) return;
    drawTo(pointForEvent(event));
  };

  const stopDrawing = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    maskRef.current.getContext("2d").putImageData(previous, 0, 0);
    setUndoCount(undoRef.current.length);
    render();
  };

  const apply = () => onApply({
    maskDataUrl: maskRef.current.toDataURL("image/png"),
    threshold,
    edge,
    feather,
  });

  return (
    <div className="garment-mask-editor">
      <header>
        <div><p>{tr("Background mask")}</p><h2>{tr("Refine the garment selection")}</h2></div>
        <button type="button" className="icon-button" onClick={onCancel} disabled={busy} aria-label={tr("Close mask editor")}><X size={20} /></button>
      </header>
      <p className="import-card__detail">{tr("The automatic selection runs locally and uses no AI credits. Paint over mistakes, then inspect the softened edge before applying it.")}</p>
      <div className="garment-mask-editor__workspace">
        <div className="garment-mask-editor__stage">
          {!ready && !error && <span>{tr("Loading selection…")}</span>}
          {error && <span className="import-field-error">{tr(error)}</span>}
          <canvas
            ref={previewRef}
            onPointerDown={startDrawing}
            onPointerMove={continueDrawing}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            aria-label={tr("Editable transparent garment preview")}
          />
        </div>
        <aside>
          <div className="garment-mask-editor__tools" role="group" aria-label={tr("Mask painting tool")}>
            <button type="button" className={tool === "keep" ? "is-selected" : ""} onClick={() => setTool("keep")}><PencilSimple size={16} />{tr("Keep")}</button>
            <button type="button" className={tool === "remove" ? "is-selected" : ""} onClick={() => setTool("remove")}><Eraser size={16} />{tr("Remove")}</button>
            <button type="button" disabled={!undoCount} onClick={undo}><ArrowCounterClockwise size={16} />{tr("Undo")}</button>
          </div>
          <label>{tr("Brush size")} <strong>{brushSize}px</strong><input type="range" min="6" max="140" step="2" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
          <label>{tr("Mask threshold")} <strong>{threshold}</strong><input type="range" min="32" max="224" step="4" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
          <label>{tr("Edge adjustment")} <strong>{edge > 0 ? `+${edge}` : edge}px</strong><input type="range" min="-8" max="8" step="1" value={edge} onChange={(event) => setEdge(Number(event.target.value))} /><small>{tr("Negative removes white fringe; positive restores fine edges.")}</small></label>
          <label>{tr("Edge softness")} <strong>{feather}px</strong><input type="range" min="0" max="8" step="1" value={feather} onChange={(event) => setFeather(Number(event.target.value))} /></label>
          {model && <small>{tr("Initial mask: {model}", { model })}</small>}
        </aside>
      </div>
      <div className="import-actions">
        <button type="button" className="import-button" onClick={onCancel} disabled={busy}>{tr("Cancel")}</button>
        <button type="button" className="import-button import-button--primary" onClick={apply} disabled={busy || !ready}><Check size={14} weight="bold" />{tr("Apply mask")}</button>
      </div>
    </div>
  );
}
