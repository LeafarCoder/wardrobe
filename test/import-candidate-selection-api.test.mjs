import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createSessionToken, wardrobeImportApi } from "../scripts/import-job-api.mjs";

const SESSION_SECRET = "import-candidate-selection-test-secret";

function mockRequest(url) {
  const request = Readable.from([]);
  request.url = url;
  request.method = "POST";
  request.headers = {
    "content-type": "application/json",
    cookie: `wardrobe_session=${createSessionToken(SESSION_SECRET, "default")}`,
  };
  request.socket = { remoteAddress: "127.0.0.1" };
  return request;
}

function mockResponse() {
  let responseBody = "";
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader() {},
    end(chunk = "") {
      responseBody += chunk ? String(chunk) : "";
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    destroy(error) { throw error; },
    json() { return responseBody ? JSON.parse(responseBody) : null; },
  };
}

test("the import API selects an earlier generated garment without deleting newer candidates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wardrobe-import-candidates-"));
  const dataDir = path.join(root, "data");
  const jobId = "00000000-0000-4000-8000-000000000031";
  const jobDir = path.join(dataDir, "jobs", jobId);
  const api = wardrobeImportApi({
    env: {
      WARDROBE_DATA_DIR: dataDir,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-client-secret",
      WARDROBE_SESSION_SECRET: SESSION_SECRET,
    },
  });

  try {
    await api.initialize(root);
    await mkdir(jobDir, { recursive: true });
    await writeFile(path.join(jobDir, "job.json"), JSON.stringify({
      id: jobId,
      userId: "default",
      status: "active",
      metadata: { name: "Test top", part: "upperbody", color: "#222222" },
      stages: {
        crop: { status: "approved" },
        garment: {
          status: "review",
          attempts: 2,
          assetUrl: `/api/import/assets/${jobId}/garment-2.png`,
          selectedCandidateId: "garment-2",
          candidates: [
            { id: "garment-1", assetUrl: `/api/import/assets/${jobId}/garment-1.png`, attempt: 1, backgroundTransparent: false },
            { id: "garment-2", assetUrl: `/api/import/assets/${jobId}/garment-2.png`, attempt: 2 },
          ],
        },
        modeled: { status: "pending" },
      },
    }, null, 2));

    const response = mockResponse();
    await api.handler(
      mockRequest(`/api/import/jobs/${jobId}/stages/garment/candidates/garment-1/select`),
      response,
      () => {},
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().stages.garment.selectedCandidateId, "garment-1");
    assert.match(response.json().stages.garment.assetUrl, /garment-1\.png/);
    assert.equal(response.json().stages.garment.candidates.length, 2);

    const unconfirmedApproval = mockResponse();
    await api.handler(
      mockRequest(`/api/import/jobs/${jobId}/stages/garment/approve`),
      unconfirmedApproval,
      () => {},
    );
    assert.equal(unconfirmedApproval.statusCode, 409);
    assert.equal(unconfirmedApproval.json().code, "opaque_garment_confirmation_required");

    const stored = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8"));
    assert.equal(stored.stages.garment.selectedCandidateId, "garment-1");
    assert.equal(stored.stages.garment.candidates.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
