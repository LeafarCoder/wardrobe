import { forwardRef, useEffect, useState } from "react";
import { Image } from "@unpic/react";

const IPX_OPTIONS = { ipx: { baseURL: "/_ipx" } };
const DEFAULT_BREAKPOINTS = [160, 240, 320, 480, 640, 800, 960, 1280];

function sourcePath(src) {
  if (!src || typeof src !== "string") return src;
  return src.split(/[?#]/, 1)[0];
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
  const [loaded, setLoaded] = useState(false);
  const imageClassName = [
    className,
    reveal ? "optimized-image-reveal" : "",
    reveal && loaded ? "is-loaded" : "",
  ].filter(Boolean).join(" ");
  const handleLoad = (event) => {
    setLoaded(true);
    onLoad?.(event);
  };

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  if (!normalizedSource || normalizedSource.startsWith("data:") || normalizedSource.startsWith("blob:") || normalizedSource.startsWith("/api/")) {
    return (
      <img
        ref={ref}
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
      ref={ref}
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
