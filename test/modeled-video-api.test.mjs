import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "modeled-video-test-session-secret";
const ITEM_ID = "import-00000000-0000-4000-8000-000000000099";
const LOOK_ID = "look-one";

function mockRequest(url, method = "GET", input = null) {
  const chunks = input === null ? [] : [Buffer.from(JSON.stringify(input))];
  const request = Readable.from(chunks);
  request.url = url;
  request.method = method;
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  const headers = new Map();
  let responseBody = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(chunk = "") {
      responseBody += chunk ? String(chunk) : "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    json() { return responseBody ? JSON.parse(responseBody) : null; },
  };
}

test("submits, polls, downloads, and persists a modeled-look video", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-modeled-video-"));
  const dataDir = path.join(root, "data");
  const importedDir = path.join(dataDir, "imported");
  const calls = [];
  const videoBytes = Buffer.from("test-mp4-video-content");
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
      OPENROUTER_API_KEY: "sk-or-v1-server-test-video-key",
      WARDROBE_AI_PROVIDER: "openrouter",
      OPENROUTER_VIDEO_MODEL: "bytedance/seedance-1-5-pro",
    },
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/videos") && options.method === "POST") {
        return new Response(JSON.stringify({ id: "video-job-one", status: "pending" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      if (String(url).endsWith("/videos/video-job-one")) {
        return new Response(JSON.stringify({
          id: "video-job-one",
          status: "completed",
          unsigned_urls: ["https://video.example/result.mp4"],
          usage: { cost: 0.20736 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url) === "https://video.example/result.mp4") {
        return new Response(videoBytes, {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": String(videoBytes.length) },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
  });

  try {
    await api.initialize(root);
    const modeledImage = await sharp({
      create: { width: 90, height: 160, channels: 3, background: "#c6b7aa" },
    }).png().toBuffer();
    const garmentImage = await sharp({
      create: { width: 90, height: 160, channels: 3, background: "#233f58" },
    }).png().toBuffer();
    await writeFile(path.join(importedDir, "modeled.png"), modeledImage);
    await writeFile(path.join(importedDir, "garment.png"), garmentImage);
    await writeFile(path.join(dataDir, "library.json"), JSON.stringify([{
      id: ITEM_ID,
      userId: "default",
      name: "Editorial coat",
      part: "wholebody_up",
      image: "/api/import/library/garment.png",
      modeledLooks: [{ id: LOOK_ID, image: "/api/import/library/modeled.png" }],
    }], null, 2));

    const submitResponse = mockResponse();
    await api.handler(mockRequest(
      `/api/import/wardrobe/${ITEM_ID}/modeled/${LOOK_ID}/videos`,
      "POST",
      {
        duration: 6,
        resolution: "720p",
        frameType: "last_frame",
        movement: "walk-and-grab",
        objectDescription: "a red umbrella",
        audio: true,
        audioPreset: "traffic",
        audioDirection: "quiet and distant",
      },
    ), submitResponse, () => {});

    assert.equal(submitResponse.statusCode, 202);
    const submitted = submitResponse.json();
    const clipId = submitted.clipId;
    assert.match(clipId, /^[a-f0-9-]{36}$/i);
    assert.equal(submitted.item.modeledLooks[0].videoClips[0].status, "pending");
    const submittedPayload = JSON.parse(calls[0].options.body);
    assert.equal(submittedPayload.model, "bytedance/seedance-1-5-pro");
    assert.equal(submittedPayload.duration, 6);
    assert.equal(submittedPayload.resolution, "720p");
    assert.equal(submittedPayload.generate_audio, true);
    assert.equal(submittedPayload.frame_images[0].frame_type, "last_frame");
    assert.match(submittedPayload.frame_images[0].image_url.url, /^data:image\/png;base64,/);
    assert.equal(submittedPayload.input_references.length, 1);
    assert.match(submittedPayload.input_references[0].image_url.url, /^data:image\/png;base64,/);
    assert.notEqual(submittedPayload.input_references[0].image_url.url, submittedPayload.frame_images[0].image_url.url);
    assert.match(submittedPayload.prompt, /red umbrella/i);
    assert.match(submittedPayload.prompt, /city traffic/i);
    assert.match(submittedPayload.prompt, /exact clean garment/i);

    const pollResponse = mockResponse();
    await api.handler(mockRequest(
      `/api/import/wardrobe/${ITEM_ID}/modeled/${LOOK_ID}/videos/${clipId}`,
    ), pollResponse, () => {});

    assert.equal(pollResponse.statusCode, 200);
    const completed = pollResponse.json().item.modeledLooks[0].videoClips[0];
    assert.equal(completed.status, "completed");
    assert.equal(completed.cost, 0.20736);
    assert.match(completed.video.split("?")[0], new RegExp(`${clipId}\\.mp4$`));
    const savedName = path.basename(completed.video.split("?")[0]);
    assert.deepEqual(await readFile(path.join(importedDir, savedName)), videoBytes);
    await stat(path.join(importedDir, savedName));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
