import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateVideoCost,
  isPortraitModeledMedia,
  latestCompletedModeledVideo,
  modeledVideoPrompt,
  normalizeModeledVideoClip,
  normalizeModeledVideoSettings,
  RECOMMENDED_VIDEO_MODEL,
  reverseModeledVideoTime,
  videoModel,
} from "../src/video-generation.js";

test("recognizes portrait modeled media from its intrinsic dimensions", () => {
  assert.equal(isPortraitModeledMedia(900, 1600), true);
  assert.equal(isPortraitModeledMedia(1200, 1200), false);
  assert.equal(isPortraitModeledMedia(1600, 900), false);
  assert.equal(isPortraitModeledMedia(0, 1600), false);
});

test("recommends the least expensive flexible video model", () => {
  const model = videoModel(RECOMMENDED_VIDEO_MODEL);
  assert.equal(model.id, "bytedance/seedance-1-5-pro");
  assert.deepEqual(model.durations, [4, 6, 8, 10]);
  assert.deepEqual(model.resolutions, ["480p", "720p", "1080p"]);
  assert.deepEqual(model.frames, ["first_frame", "last_frame"]);
});

test("selects the newest completed clip for silent hover playback", () => {
  assert.equal(latestCompletedModeledVideo({
    videoClips: [
      { id: "one", status: "completed", video: "/one.mp4" },
      { id: "two", status: "failed", video: null },
      { id: "three", status: "completed", video: "/three.mp4" },
      { id: "four", status: "pending", video: null },
    ],
  })?.id, "three");
  assert.equal(latestCompletedModeledVideo({ videoClips: [{ status: "pending" }] }), null);
});

test("preserves a lightweight hover derivative on normalized clips", () => {
  const clip = normalizeModeledVideoClip({
    id: "clip-one",
    status: "completed",
    video: "/full.mp4",
    hoverVideo: "/hover.mp4",
  });
  assert.equal(clip.video, "/full.mp4");
  assert.equal(clip.hoverVideo, "/hover.mp4");
});

test("steps completed hover clips backward without crossing the first frame", () => {
  assert.equal(reverseModeledVideoTime(2, 1 / 24), 2 - (1 / 24));
  assert.equal(reverseModeledVideoTime(0.02, 1 / 24), 0);
  assert.equal(reverseModeledVideoTime(2, 1), 1.92);
});

test("estimates duration, resolution, and audio-sensitive video cost", () => {
  const silent = estimateVideoCost({
    model: "bytedance/seedance-1-5-pro",
    duration: 10,
    resolution: "480p",
    audio: false,
  });
  const withAudio = estimateVideoCost({
    model: "bytedance/seedance-1-5-pro",
    duration: 10,
    resolution: "480p",
    audio: true,
  });
  assert.ok(Math.abs(silent - 0.11529) < 0.00001);
  assert.ok(Math.abs(withAudio - 0.23058) < 0.00001);
  assert.equal(estimateVideoCost({ model: "google/veo-3.1-lite", duration: 4, resolution: "720p" }), 0.12);
  assert.equal(estimateVideoCost({ model: "google/veo-3.1-lite", duration: 10, resolution: "720p" }), null);
});

test("normalizes video controls against the preferred model capabilities", () => {
  const settings = normalizeModeledVideoSettings({
    duration: 10,
    resolution: "480p",
    frameType: "last_frame",
    movement: "walk-and-grab",
    objectDescription: "  a red umbrella  ",
    audio: true,
    audioPreset: "traffic",
  }, "google/veo-3.1-lite");

  assert.equal(settings.duration, 4);
  assert.equal(settings.resolution, "720p");
  assert.equal(settings.frameType, "last_frame");
  assert.equal(settings.objectDescription, "a red umbrella");
  assert.equal(settings.audio, true);
});

test("couples movement and sound directions in the generation prompt", () => {
  const prompt = modeledVideoPrompt({
    model: "bytedance/seedance-1-5-pro",
    duration: 6,
    resolution: "720p",
    frameType: "first_frame",
    movement: "walk-and-grab",
    objectDescription: "a newspaper",
    direction: "slow dolly forward",
    audio: true,
    audioPreset: "chatting",
    audioDirection: "quiet and distant",
  });

  assert.match(prompt, /walks naturally/i);
  assert.match(prompt, /newspaper/i);
  assert.match(prompt, /synchronized audio/i);
  assert.match(prompt, /chatting/i);
  assert.match(prompt, /quiet and distant/i);
});

test("describes the garment as a separate fidelity reference instead of another frame", () => {
  const prompt = modeledVideoPrompt({ model: RECOMMENDED_VIDEO_MODEL }, { garmentReference: true });
  assert.match(prompt, /separate reference image shows the exact clean garment/i);
  assert.match(prompt, /do not turn the product cutout into a scene or an additional frame/i);
});
