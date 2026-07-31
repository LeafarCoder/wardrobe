import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateVideoCost,
  modeledVideoPrompt,
  normalizeModeledVideoSettings,
  RECOMMENDED_VIDEO_MODEL,
  videoModel,
} from "../src/video-generation.js";

test("recommends the least expensive flexible video model", () => {
  const model = videoModel(RECOMMENDED_VIDEO_MODEL);
  assert.equal(model.id, "bytedance/seedance-1-5-pro");
  assert.deepEqual(model.durations, [4, 6, 8, 10]);
  assert.deepEqual(model.resolutions, ["480p", "720p", "1080p"]);
  assert.deepEqual(model.frames, ["first_frame", "last_frame"]);
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
