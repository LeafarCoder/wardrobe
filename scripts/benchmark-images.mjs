// Explicit, paid benchmark. Never imports results into a person's wardrobe.
// node scripts/benchmark-images.mjs manifest.json output-directory [--railway]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prepareProviderImage } from "./import-job-api.mjs";

const [manifestPath, outputPath, railway] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error("Provide manifest.json and an output directory; --railway reads credentials without printing them.");
const output = path.resolve(outputPath);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
let env = process.env;
if (railway === "--railway") {
  const { project, environment, service } = manifest.railway;
  env = JSON.parse(execFileSync("railway", ["variables", "--json", "-p", project, "-e", environment, "-s", service], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (!env.OPENROUTER_API_KEY) {
    // Production stores personal keys with their profile. Capture only the
    // selected payer's key in memory, never the whole user store or stdout.
    const userId = manifest.userId || "default";
    if (!/^[a-zA-Z0-9-]+$/.test(userId)) throw new Error("Invalid benchmark payer ID");
    const code = `const u=require("/data/users.json").users.find(u=>u.id===${JSON.stringify(userId)});process.stdout.write(JSON.stringify({key:u?.openRouterApiKey||""}));`;
    const encoded = Buffer.from(code).toString("base64");
    try {
      const raw = execFileSync("railway", ["ssh", "-p", project, "-e", environment, "-s", service, "--", `node -e 'eval(Buffer.from("${encoded}","base64").toString())'`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
      env.OPENROUTER_API_KEY = JSON.parse(raw.slice(raw.indexOf("{"))).key;
    } catch { throw new Error("Could not load the selected benchmark payer key securely."); }
  }
}
if (!env.OPENROUTER_API_KEY) throw new Error("No OpenRouter server key is configured.");
const base = env.OPENROUTER_API_BASE_URL || "https://openrouter.ai/api/v1";
const reportFile = path.join(output, "results.json");
await mkdir(output, { recursive: true });
let report;
try { report = JSON.parse(await readFile(reportFile, "utf8")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  report = { startedAt: new Date().toISOString(), protocol: manifest.protocol, cases: [], results: [], pricing: {} };
}
const headers = { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": `https://${env.RAILWAY_PUBLIC_DOMAIN || "wardrobe.up.railway.app"}`, "X-OpenRouter-Title": "Wardrobe benchmark" };
const checkpoint = () => writeFile(reportFile, JSON.stringify(report, null, 2));
const number = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
const clean = (value) => String(value || "").replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image removed]").slice(0, 1800);
const seen = new Set(report.results.map((r) => `${r.caseId}:${r.model}`));

for (const testCase of manifest.cases) {
  const references = [];
  const referenceFiles = [];
  for (const [index, file] of testCase.images.entries()) {
    const bytes = await readFile(file);
    const prepared = await prepareProviderImage(bytes);
    const name = `${testCase.id}-reference-${index}${prepared.extension}`;
    await writeFile(path.join(output, name), prepared.data);
    referenceFiles.push(name);
    references.push({ type: "image_url", image_url: { url: `data:${prepared.mime};base64,${prepared.data.toString("base64")}` } });
  }
  if (!report.cases.some((c) => c.id === testCase.id)) report.cases.push({ id: testCase.id, label: testCase.label, task: testCase.task, references: referenceFiles, prompt: testCase.prompt, promptHash: createHash("sha256").update(testCase.prompt).digest("hex") });
  await checkpoint();
  for (const model of testCase.models) {
    if (seen.has(`${testCase.id}:${model}`)) continue;
    if (report.results.length >= (manifest.maxRequests || 12)) throw new Error("Benchmark request limit reached.");
    const knownSpend = report.results.reduce((sum, r) => sum + (r.costUsd || 0), 0);
    if (knownSpend >= (manifest.stopAfterReportedCostUsd || 5)) throw new Error("Reported benchmark cost ceiling reached.");
    if (!report.pricing[model]) {
      const response = await fetch(`${base}/images/models/${model}/endpoints`);
      report.pricing[model] = { checkedAt: new Date().toISOString(), status: response.status, data: await response.json() };
    }
    const gpt = model.startsWith("openai/gpt-image-2.6-");
    const klein = model === "black-forest-labs/flux.2-klein-4b";
    if (klein && env.OPENROUTER_ALLOW_NON_ZDR_GARMENT !== "true") throw new Error("Klein requires the existing explicit non-ZDR garment exception.");
    const request = { model, prompt: testCase.prompt, n: 1, input_references: references, output_format: "png", provider: { zdr: !klein } };
    if (!klein) {
      request.aspect_ratio = testCase.task === "garment" ? "1:1" : "3:2";
      request.background = testCase.task === "garment" ? "transparent" : "opaque";
      if (gpt) {
        request.quality = "medium";
        request.provider.options = { openai: { complexity: "medium" } };
      } else request.resolution = model.includes("seedream") ? (testCase.task === "garment" ? "2K" : "4K") : "1K";
    }
    if (model.startsWith("google/")) request.provider.only = ["google-vertex/global"];
    if (model.includes("seedream")) request.provider.only = ["seed"];
    const endpoints = report.pricing[model].data.endpoints || [];
    const supported = new Set(endpoints.flatMap((e) => Object.keys(e.supported_parameters || {})));
    for (const key of ["output_format", "background", "aspect_ratio", "quality", "resolution"]) {
      if (!supported.has(key)) delete request[key];
    }
    const row = { caseId: testCase.id, model, startedAt: new Date().toISOString(), settings: { ...request, prompt: undefined, input_references: undefined }, status: "running", costUsd: null };
    report.results.push(row);
    // A crash leaves a running row visible; reruns never silently pay twice.
    await checkpoint();
    const start = performance.now();
    console.log(`START ${testCase.id} ${model}`);
    try {
      const response = await fetch(`${base}/images`, { method: "POST", headers, body: JSON.stringify(request), signal: AbortSignal.timeout(240_000) });
      row.httpStatus = response.status;
      const result = await response.json();
      row.providerSeconds = (performance.now() - start) / 1000;
      row.requestId = result.id || response.headers.get("x-request-id");
      row.usage = result.usage || null;
      row.costUsd = number(result.usage?.cost ?? result.usage?.total_cost ?? result.cost);
      const data = result.data?.[0];
      if (!response.ok || (!data?.b64_json && !data?.url)) {
        const error = result.error || {};
        row.error = { code: error.code ?? null, message: clean(error.message || result.message || "Provider returned no image"), provider: clean(error.metadata?.provider_name), detail: clean(error.metadata?.raw || error.metadata?.provider_error), finishReason: result.finish_reason || data?.finish_reason || null };
        const signal = JSON.stringify(row.error);
        row.status = /PROHIBITED_CONTENT|IMAGE_SAFETY|content.policy|safety|moderation|refus/i.test(signal) ? "refusal" : "error";
        row.reasonEvidence = row.status === "refusal" ? "Provider reported a safety/content-policy refusal; specific triggering content is unknown unless stated above." : "API, routing, configuration, or empty-output failure; not evidence of a content refusal.";
      } else {
        let bytes;
        if (data.b64_json) bytes = Buffer.from(data.b64_json, "base64");
        else {
          const download = await fetch(data.url, { signal: AbortSignal.timeout(60_000) });
          if (!download.ok) throw new Error(`Image download HTTP ${download.status}`);
          bytes = Buffer.from(await download.arrayBuffer());
        }
        const metadata = await sharp(bytes).metadata();
        row.output = `${testCase.id}-${model.split("/").at(-1)}.png`;
        const savedBytes = await sharp(bytes).png().toBuffer();
        await writeFile(path.join(output, row.output), savedBytes);
        row.dimensions = { width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha };
        row.status = "generated";
        row.providerOutputHash = createHash("sha256").update(bytes).digest("hex");
        row.outputHash = createHash("sha256").update(savedBytes).digest("hex");
      }
    } catch (error) {
      row.status = "error";
      row.error = { code: error.name, message: clean(error.message) };
      row.reasonEvidence = "Transport, timeout, decode, or download failure; not evidence of a content refusal. Timeout costs may remain unknown.";
    }
    row.totalSeconds = (performance.now() - start) / 1000;
    await checkpoint();
    console.log(JSON.stringify({ case: row.caseId, model, status: row.status, seconds: row.totalSeconds, costUsd: row.costUsd, error: row.error }));
  }
}
report.completedAt = new Date().toISOString();
await checkpoint();
console.log(`Saved ${report.results.length} attempts to ${reportFile}`);
