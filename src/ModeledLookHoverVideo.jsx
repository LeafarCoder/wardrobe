import { useEffect, useRef, useState } from "react";
import { reverseModeledVideoTime } from "./video-generation.js";

export function ModeledLookHoverVideo({ src, active, className = "" }) {
  const videoRef = useRef(null);
  const reverseFrameRef = useRef(null);
  const activeRef = useRef(Boolean(active));
  const [visible, setVisible] = useState(false);

  activeRef.current = Boolean(active);

  const cancelReverse = () => {
    if (reverseFrameRef.current !== null) {
      cancelAnimationFrame(reverseFrameRef.current);
      reverseFrameRef.current = null;
    }
  };

  const playForward = async () => {
    const video = videoRef.current;
    if (!video || !activeRef.current) return;
    cancelReverse();
    try {
      await video.play();
      if (activeRef.current) setVisible(true);
    } catch {
      setVisible(false);
    }
  };

  const playBackward = () => {
    const video = videoRef.current;
    if (!video || !activeRef.current) return;
    video.pause();
    cancelReverse();
    let previous = performance.now();
    const step = (now) => {
      if (!activeRef.current || !videoRef.current) return;
      const elapsed = (now - previous) / 1000;
      previous = now;
      video.currentTime = reverseModeledVideoTime(video.currentTime, elapsed);
      if (video.currentTime <= 0.025) {
        video.currentTime = 0;
        void playForward();
        return;
      }
      reverseFrameRef.current = requestAnimationFrame(step);
    };
    reverseFrameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const video = videoRef.current;
    cancelReverse();
    setVisible(false);
    if (!video || !src) return undefined;
    video.pause();
    video.currentTime = 0;
    video.load();
    return cancelReverse;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;
    cancelReverse();
    if (!active) {
      setVisible(false);
      video.pause();
      video.currentTime = 0;
      return undefined;
    }
    video.currentTime = 0;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      void playForward();
      return cancelReverse;
    }
    const start = () => void playForward();
    video.addEventListener("canplay", start, { once: true });
    return () => {
      video.removeEventListener("canplay", start);
      cancelReverse();
    };
  }, [active, src]);

  return (
    <video
      ref={videoRef}
      className={`modeled-hover-video${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      src={src}
      muted
      playsInline
      preload="auto"
      tabIndex={-1}
      aria-hidden="true"
      onEnded={playBackward}
      onPlaying={() => activeRef.current && setVisible(true)}
    />
  );
}
