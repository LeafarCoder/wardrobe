# Image model benchmark

The benchmark is explicit and paid. It does not run with `npm test`, import
outputs into wardrobes, change image model defaults, or invoke automatic
fallbacks. Each case independently calls the existing route, the existing
Seedream fallback, GPT Image 2.6 Flare, and GPT Image 2.6 Sunburst.

Run with a private manifest and an output directory outside the repository:

```sh
node scripts/benchmark-images.mjs /private/path/manifest.json /private/path/results --railway
node scripts/benchmark-report.mjs /private/path/results
```

Without `--railway`, credentials come from `OPENROUTER_API_KEY`. With it,
`manifest.railway` supplies `project`, `environment`, and `service`; the runner
captures Railway variables in memory and, when no server key exists, reads only
the selected `manifest.userId` profile key through SSH (default `default`). It
never prints or persists credentials. Personal photos and prompts require
explicit authorization for the external providers before running.

A manifest contains `cases` with `id`, `label`, `task` (`garment` or `modeled`),
absolute `images` paths, the exact `prompt`, and `models`. Set `maxRequests` and
`stopAfterReportedCostUsd`. The latter stops subsequent calls after the reported
spend threshold; it is not a provider-enforced cap, and unknown costs cannot be
counted. One in-flight request can exceed the threshold.

Results checkpoint before each request, so interrupted runs never silently pay
for that pair again. Inspect an interrupted `running` row before explicitly
retrying. Refusals and API/transport/configuration failures are separate statuses;
the saved provider error is evidence, not a guess about triggering content.
Unknown cost is `null`, never zero.

The initial comparison uses identical prompts and reference preparation per
case, with provider-appropriate settings: GPT medium quality/medium complexity,
Gemini 1K, Seedream 2K square or 4K landscape, and Klein's provider-selected
size. These are not equal-pixel outputs. Endpoint capabilities and price tables
are saved with a timestamp. Provider and total wall-clock times are recorded
separately; local garment background cleanup is timed by the report builder.
The initial garment cleanup uses the white T-shirt case and the prompt's green
key. Adapt those protected colors for other garment cases.

`review.html` contains full-resolution output links, original references,
request settings, errors, timings, costs, and human rating controls. Garment
cards show raw provider outputs and link the local background-cleaned version
separately. Ratings apply to the raw outputs, so they remain stable when a
cleaned preview is added. The report does not assign quality or usability. Ratings
persist in browser local storage; download the review JSON to retain them.
Cost per usable result uses all reported model costs divided by human-accepted
outputs. Pending reviews and missing costs are marked, and one attempt per case
cannot establish reliable refusal rates or latency distributions.

Keep manifests, results, reference copies, and reports private. Do not put them
in source control or public hosting. Existing production fallbacks remain
unchanged while these candidates are evaluated.
