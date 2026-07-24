import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Image } from "@unpic/react";

const IPX_OPTIONS = { ipx: { baseURL: "/_ipx" } };
const DEFAULT_BREAKPOINTS = [160, 240, 320, 480, 640, 800, 960, 1280];

function sourcePath(src) {
  if (!src || typeof src !== "string") return src;
  return src.split(/[?#]/, 1)[0];
}

function updateRef(ref, value) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export const OptimizedImage = forwardRef(function OptimizedImage({
  src,
  alt = "",
  sizes = "100vw",
  breakpoints = DEFAULT_BREAKPOINTS,
  quality = 80,
  priority = false,
  loading,
  decoding,
  reveal = false,
  className = "",
  onLoad,
  ...props
}, ref) {
  const normalizedSource = sourcePath(src);
  const imageRef = useRef(null);
  const [loadedSource, setLoadedSource] = useState(null);
  const loaded = loadedSource === src;
  const imageClassName = [
    className,
    reveal ? "optimized-image-reveal" : "",
    reveal && loaded ? "is-loaded" : "",
  ].filter(Boolean).join(" ");
  const setImageRef = useCallback((node) => {
    imageRef.current = node;
    updateRef(ref, node);
  }, [ref]);
  const handleLoad = (event) => {
    setLoadedSource(src);
    onLoad?.(event);
  };

  useLayoutEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setLoadedSource(src);
    }
  }, [src]);

  if (!normalizedSource || normalizedSource.startsWith("data:") || normalizedSource.startsWith("blob:") || normalizedSource.startsWith("/api/")) {
    return (
      <img
        ref={setImageRef}
        src={src}
        alt={alt}
        className={imageClassName}
        sizes={sizes}
        loading={loading || (priority ? "eager" : "lazy")}
        decoding={decoding || "async"}
        onLoad={handleLoad}
        {...props}
      />
    );
  }

  return (
    <Image
      ref={setImageRef}
      src={normalizedSource}
      alt={alt}
      className={imageClassName}
      fallback="ipx"
      options={IPX_OPTIONS}
      operations={{ ipx: { quality } }}
      layout="fullWidth"
      unstyled
      sizes={sizes}
      breakpoints={breakpoints}
      priority={priority}
      loading={loading}
      decoding={decoding}
      onLoad={handleLoad}
      {...props}
    />
  );
});
