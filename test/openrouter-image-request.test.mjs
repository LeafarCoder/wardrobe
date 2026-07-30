import test from "node:test";
import assert from "node:assert/strict";
import {
  analysisPrompt,
  buildGarmentPrompt,
  buildModeledPrompt,
  buildOutfitStudioModeledPrompt,
  buildPlannedOutfitPrompt,
  editWithSafetyFallback,
  garmentNeedsContextReference,
  garmentSemanticMismatch,
  modeledModelForReferenceCount,
  openRouterHeaders,
  openRouterImageRequest,
  openRouterOutfitRequest,
  openRouterOutfitNameRequest,
  openRouterPlannerRequest,
  OPENROUTER_WARDROBE_PLAN_SCHEMA,
  plannerModelCandidates,
  parseOutfitRefinement,
  parseOutfitName,
  providerResponseError,
  WARDROBE_PLAN_SCHEMA,
  wardrobePlanPrompt,
  outfitRefinementPrompt,
  outfitNamePrompt,
} from "../scripts/import-job-api.mjs";

test("makes a Portuguese bracelet correction override watch-like crop ambiguity", () => {
  const prompt = buildGarmentPrompt({
    name: "Pulseira de prata",
    part: "accessories_up",
    color: "#c0c0c0",
    tags: ["brilhante", "acessório"],
  }, "#00ff00", {
    hasContextReference: true,
    userDirection: "Não é para gerar um relógio. É uma pulseira de prata com várias peças.",
  });

  assert.match(prompt, /bracelet or wrist chain/i);
  assert.match(prompt, /not a watch or timepiece/i);
  assert.match(prompt, /USER CORRECTION — AUTHORITATIVE AND HIGHEST PRIORITY/);
  assert.match(prompt, /Não é para gerar um relógio/);
  assert.doesNotMatch(prompt, /face or body, case, crown, strap/i);
  assert.equal(garmentSemanticMismatch(
    { name: "Pulseira de prata", part: "accessories_up" },
    [{ name: "Silver wristwatch", part: "accessories_up", tags: ["watch", "dial"] }],
  ), "generated a watch instead of a bracelet");
});

test("keeps women's pointed high heels from becoming men's dress shoes", () => {
  const metadata = {
    name: "Sapatos pretos de salto",
    part: "shoes",
    color: "#000000",
    tags: ["sapatos", "salto alto", "scarpin"],
  };
  const prompt = buildGarmentPrompt(metadata, "#00ff00", {
    userDirection: "These are women's shoes with a pointy front and a high heel.",
  });

  assert.match(prompt, /women's high-heeled footwear/i);
  assert.match(prompt, /pointed toe/i);
  assert.match(prompt, /Do not create a men's Oxford/i);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Black Oxford shoe", part: "shoes", tags: ["lace-up", "menswear"] }],
  ), "generated men's or flat dress footwear instead of a high heel");
});

test("treats explicit sleeveless midi dress construction as mandatory", () => {
  const metadata = {
    name: "button-down shirt dress",
    part: "wholebody",
    color: "#e3a830",
    tags: ["midi", "collared", "belted", "sleeveless"],
  };
  const prompt = buildGarmentPrompt(metadata, "#00ffff");

  assert.match(prompt, /Construction requirements — mandatory/);
  assert.match(prompt, /SLEEVELESS means no sleeves at all/);
  assert.match(prompt, /do not add cap, short, three-quarter, or long sleeves/i);
  assert.match(prompt, /MIDI means below the knee and around mid-calf/i);
  assert.match(prompt, /preserve the visible constructed collar/i);
  assert.match(prompt, /preserve the matching belt or self-tie/i);
  assert.match(prompt, /preserve the visible front-button or button-down construction/i);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Long-sleeve shirt dress", part: "wholebody", tags: ["midi", "collared", "belted", "long-sleeve"] }],
  ), "generated long sleeves instead of the explicitly requested sleeveless construction");
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Sleeveless midi shirt dress", part: "wholebody", tags: ["collared", "belted", "sleeveless"] }],
  ), null);
});

test("recognizes Portuguese sleeveless construction and lets a correction replace it", () => {
  const metadata = {
    name: "vestido camisa",
    part: "wholebody",
    tags: ["midi", "com colarinho", "com cinto", "sem mangas"],
  };

  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Vestido de manga comprida", part: "wholebody", tags: ["mangas compridas"] }],
  ), "generated long sleeves instead of the explicitly requested sleeveless construction");

  const correctedPrompt = buildGarmentPrompt(metadata, "#00ffff", {
    userDirection: "Change it to long sleeves.",
  });
  assert.match(correctedPrompt, /preserve the full long-sleeve construction/i);
  assert.doesNotMatch(correctedPrompt, /SLEEVELESS means no sleeves at all/);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Long-sleeve dress", part: "wholebody", tags: ["long-sleeve"] }],
    "Change it to long sleeves.",
  ), null);
});

test("turns a common subset of neckline details into hard reconstruction requirements", () => {
  const cases = [
    ["V-neck", /two diagonal edges meeting at the visible V point/i],
    ["crew neck", /close, round crew or jewel curve/i],
    ["scoop neck", /broad, visibly deep U-shaped scoop curve/i],
    ["square neck", /square opening with a straight horizontal lower edge/i],
    ["boat neck", /wide, shallow boat or Sabrina curve/i],
    ["sweetheart neckline", /two rounded upper curves and a clear central dip/i],
    ["halter neck", /halter construction rising from the bodice/i],
    ["high neck", /close high-neck construction/i],
    ["off-shoulder", /off-shoulder edge below both shoulders/i],
    ["one-shoulder", /asymmetric one-shoulder construction/i],
    ["strapless", /strapless straight-across upper edge/i],
    ["spaghetti straps", /two very thin spaghetti shoulder straps/i],
    ["keyhole neckline", /distinct keyhole cutout/i],
    ["asymmetric chest cutout", /large open negative-space cutout/i],
  ];

  for (const [tag, expected] of cases) {
    const prompt = buildGarmentPrompt({
      name: "evening dress",
      part: "wholebody",
      tags: [tag],
    }, "#00ffff");
    assert.match(prompt, expected, tag);
  }
});

test("preserves compatible neckline features together without applying them to accessories", () => {
  const sweetheartStraps = buildGarmentPrompt({
    name: "summer dress",
    part: "wholebody",
    tags: ["spaghetti straps", "sweetheart neckline"],
  }, "#00ffff");
  assert.match(sweetheartStraps, /two very thin spaghetti shoulder straps/i);
  assert.match(sweetheartStraps, /two rounded upper curves and a clear central dip/i);

  const highNeckKeyhole = buildGarmentPrompt({
    name: "keyhole blouse",
    part: "upperbody",
    tags: ["high neck", "keyhole neckline"],
  }, "#00ffff");
  assert.match(highNeckKeyhole, /close high-neck construction/i);
  assert.match(highNeckKeyhole, /distinct keyhole cutout/i);

  const necklace = buildGarmentPrompt({
    name: "sweetheart necklace",
    part: "accessories_up",
    tags: ["heart pendant"],
  }, "#00ffff");
  assert.doesNotMatch(necklace, /two rounded upper curves and a clear central dip/i);
});

test("preserves a diagonal-strap chest opening as transparent garment topology", () => {
  const metadata = {
    name: "asymmetric ribbed top",
    part: "upperbody",
    color: "#a95f32",
    tags: ["sleeveless"],
  };
  const correction = "A diagonal strap crosses the chest. The area above the chest is uncovered and must remain an asymmetric chest cutout.";
  const prompt = buildGarmentPrompt(metadata, "#00ffff", { userDirection: correction });

  assert.match(prompt, /asymmetric one-shoulder construction/i);
  assert.match(prompt, /large open negative-space cutout/i);
  assert.match(prompt, /every pixel inside it must be transparent alpha 0/i);
  assert.match(prompt, /Do not fill, bridge, shrink, close, or cover it with fabric/i);
  assert.match(prompt, /preserving every intentional asymmetry, diagonal edge, strap route, opening, and cutout/i);
  assert.doesNotMatch(prompt, /naturally arranged and symmetrical/i);
  assert.equal(garmentNeedsContextReference(metadata, correction, { lowDetail: false }), true);
  assert.equal(garmentNeedsContextReference(metadata, "", { lowDetail: false }), false);

  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "one-shoulder ribbed top", part: "upperbody", tags: ["one-shoulder", "solid chest panel"] }],
    correction,
  ), "filled or removed the explicitly requested asymmetric chest cutout");
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "one-shoulder cutout top", part: "upperbody", tags: ["one-shoulder", "asymmetric chest cutout"] }],
    correction,
  ), null);
});

test("rejects an explicitly contradictory generated neckline in English or Portuguese", () => {
  assert.equal(garmentSemanticMismatch(
    { name: "V-neck dress", part: "wholebody", tags: ["V-neck"] },
    [{ name: "Square-neck dress", part: "wholebody", tags: ["square neckline"] }],
  ), "generated a square neckline instead of the explicitly requested V-neckline");

  assert.equal(garmentSemanticMismatch(
    { name: "top de decote quadrado", part: "upperbody", tags: ["decote quadrado"] },
    [{ name: "top com decote em V", part: "upperbody", tags: ["decote em V"] }],
  ), "generated a V-neckline instead of the explicitly requested square neckline");

  assert.equal(garmentSemanticMismatch(
    { name: "scoop-neck top", part: "upperbody", tags: ["scoop neck"] },
    [{ name: "Scoop-neck top", part: "upperbody", tags: ["scoop neckline"] }],
  ), null);
});

test("lets an explicit neckline correction replace saved neckline metadata", () => {
  const metadata = {
    name: "V-neck dress",
    part: "wholebody",
    tags: ["V-neck", "midi"],
  };
  const correction = "Change the V-neck to a scoop neck.";
  const prompt = buildGarmentPrompt(metadata, "#00ffff", { userDirection: correction });

  assert.match(prompt, /broad, visibly deep U-shaped scoop curve/i);
  assert.doesNotMatch(prompt, /two diagonal edges meeting at the visible V point/i);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Scoop-neck dress", part: "wholebody", tags: ["scoop neckline", "midi"] }],
    correction,
  ), null);
});

test("uses category clarification choices as prompt and semantic-validation facts", () => {
  const metadata = {
    name: "black evening top",
    part: "upperbody",
    color: "#111111",
    garmentClarifications: {
      neckline: "square",
      sleeves: "sleeveless",
      closure: "zipper",
    },
  };
  const prompt = buildGarmentPrompt(metadata, "#00ffff");

  assert.match(prompt, /HUMAN-SELECTED PRODUCT DETAILS — AUTHORITATIVE/);
  assert.match(prompt, /Neckline: a square neckline with a straight lower edge/);
  assert.match(prompt, /Sleeves: no sleeves at all/);
  assert.match(prompt, /Closure: a visible front zipper/);
  assert.match(prompt, /square opening with a straight horizontal lower edge/i);
  assert.match(prompt, /SLEEVELESS means no sleeves at all/);
  assert.equal(garmentSemanticMismatch(
    metadata,
    [{ name: "Long-sleeve V-neck top", part: "upperbody", tags: ["long sleeves", "V-neck"] }],
  ), "generated long sleeves instead of the explicitly requested sleeveless construction");
});

test("asks analysis to prioritize visible garment construction", () => {
  const prompt = analysisPrompt("en-US");

  assert.match(prompt, /whether it is sleeveless or the visible sleeve length/i);
  assert.match(prompt, /collar or exact common neckline, front closure, straps, waist construction/i);
  assert.match(prompt, /mini, midi, or maxi hem length/i);
  assert.match(prompt, /V-neck, crew or jewel neck, scoop neck, square neck/i);
  assert.match(prompt, /off-shoulder, one-shoulder, strapless straight-across/i);
  assert.match(prompt, /tag both one-shoulder and asymmetric chest cutout/i);
  assert.match(prompt, /empty space in the garment, not a fabric panel/i);
  assert.match(prompt, /Never describe a sleeveless garment as sleeved/i);
});

test("grounds a planned modeled outfit in every garment, place, date, and occasion", () => {
  const prompt = buildPlannedOutfitPrompt(
    2,
    { name: "Rafael", fashionStyle: "quiet tailoring" },
    {
      input: {
        location: "Paris, France",
        startDate: "2026-12-04",
        endDate: "2026-12-07",
      },
      result: {
        expectedWeather: {
          temperatureRange: "3–9 °C",
          summary: "Cold with occasional rain",
          conditions: ["cold", "rain"],
        },
      },
    },
    {
      name: "Formal winter dinner",
      note: "A composed evening look for a formal restaurant",
    },
    [
      { name: "Navy wool jacket", part: "wholebody_up", color: "#14213d", materials: ["wool"] },
      { name: "Black leather shoes", part: "shoes", color: "#181818", materials: ["leather"] },
    ],
  );

  assert.match(prompt, /Subjects: Rafael \(Character 1\) = Image 0, Image 1/);
  assert.match(prompt, /Image 2 is the exact reference for "Navy wool jacket"/);
  assert.match(prompt, /Image 3 is the exact reference for "Black leather shoes"/);
  assert.match(prompt, /EVERY supplied garment reference/);
  assert.match(prompt, /Paris, France/);
  assert.match(prompt, /2026-12-04 through 2026-12-07/);
  assert.match(prompt, /formal restaurant/);
  assert.match(prompt, /Cold with occasional rain/);
});

test("locks facial and anatomical identity in every modeled-look workflow", () => {
  const garmentPrompt = buildModeledPrompt(2, { name: "Rafael", age: 34 }, { name: "Navy jacket" });
  const plannedPrompt = buildPlannedOutfitPrompt(
    2,
    { name: "Rafael", age: 34 },
    {},
    { name: "Dinner" },
    [{ name: "Navy jacket", part: "wholebody_up" }],
  );
  const studioPrompt = buildOutfitStudioModeledPrompt(
    [
      { profile: { name: "Rafael", age: 34 }, referenceCount: 2 },
      { profile: { name: "Sara", age: 31 }, referenceCount: 1 },
    ],
    { name: "Rafael" },
    {},
    [
      { name: "Navy jacket", wearerName: "Rafael" },
      { name: "Cream dress", wearerName: "Sara" },
    ],
  );

  for (const prompt of [garmentPrompt, plannedPrompt, studioPrompt]) {
    assert.match(prompt, /Image 0 is the first supplied image reference after this prompt; numbering is zero-based/i);
    assert.match(prompt, /Reference roles — mandatory/);
    assert.match(prompt, /identity evidence only/i);
    assert.match(prompt, /Ignore and do not copy the identity references' clothes, jewelry, accessories, pose/i);
    assert.match(prompt, /Hairstyle may change naturally for the requested scene/i);
    assert.match(prompt, /Use visible full-body information only to preserve natural body shape, height impression, and proportions/i);
    assert.match(prompt, /never use a garment image's person, mannequin, hanger, styling, or background as identity evidence/i);
    assert.match(prompt, /Identity lock — highest priority/);
    assert.match(prompt, /eye shape, color and spacing/i);
    assert.match(prompt, /nose/i);
    assert.match(prompt, /jawline and face contour/i);
    assert.match(prompt, /skin tone and visible skin texture/i);
    assert.match(prompt, /apparent age/i);
    assert.match(prompt, /body shape/i);
    assert.match(prompt, /Do not beautify, idealize/i);
    assert.match(prompt, /generic fashion-model face/i);
  }
  assert.match(garmentPrompt, /Subjects: Rafael \(Character 1\) = Image 0, Image 1/);
  assert.match(plannedPrompt, /Subjects: Rafael \(Character 1\) = Image 0, Image 1/);
  assert.match(studioPrompt, /Rafael \(Character 1\) = Image 0, Image 1/);
  assert.match(studioPrompt, /Sara \(Character 2\) = Image 2/);
  assert.match(studioPrompt, /from only that character's own subject mapping/i);
  assert.match(studioPrompt, /never average, blend or invent identities/i);
});

test("grounds an Outfit Studio image in every chosen garment and presentation control", () => {
  const prompt = buildOutfitStudioModeledPrompt(
    1,
    { name: "Sara", fashionStyle: "minimal tailoring" },
    {
      name: "Dinner look",
      context: { occasion: "dinner", weather: ["mild", "wind"], season: "autumn" },
      presentation: { background: "restaurant", style: "cinematic", pose: "sitting", direction: "Warm candlelight" },
    },
    [
      { name: "Silk shirt", part: "upperbody", color: "#eee9df" },
      { name: "Black trousers", part: "lowerbody", color: "#202020" },
    ],
  );

  assert.match(prompt, /Sara \(Character 1\) = Image 0/);
  assert.match(prompt, /Image 1 is the exact reference for "Silk shirt"/);
  assert.match(prompt, /Image 2 is the exact reference for "Black trousers"/);
  assert.match(prompt, /EVERY supplied garment/);
  assert.match(prompt, /Occasion dinner; weather mild, wind; season autumn/);
  assert.match(prompt, /Background: restaurant/);
  assert.match(prompt, /Photographic style: cinematic/);
  assert.match(prompt, /Pose: sitting/);
  assert.match(prompt, /Warm candlelight/);
});

test("keeps connected people and their assigned garments distinct in Outfit Studio", () => {
  const prompt = buildOutfitStudioModeledPrompt(
    [
      { profile: { id: "rafael", name: "Rafael", age: 34 }, referenceCount: 2 },
      { profile: { id: "sara", name: "Sara", age: 31 }, referenceCount: 1 },
    ],
    { name: "Rafael" },
    {
      context: { occasion: "walk", weather: ["mild"], season: "spring" },
      presentation: {
        background: "park",
        style: "candid",
        people: [
          { personId: "rafael", pose: "walking", hairstyle: "short", direction: "Look toward Sara." },
          { personId: "sara", pose: "standing", hairstyle: "ponytail", direction: "Hold Rafael's hand." },
        ],
      },
    },
    [
      { name: "Navy jacket", part: "wholebody_up", wearerName: "Rafael" },
      { name: "Cream dress", part: "wholebody", wearerName: "Sara" },
    ],
  );

  assert.match(prompt, /Rafael \(Character 1\) = Image 0, Image 1.*all images of the same person/i);
  assert.match(prompt, /Sara \(Character 2\) = Image 2/);
  assert.match(prompt, /Image 3 is the exact reference for "Navy jacket".*worn by Rafael/);
  assert.match(prompt, /Image 4 is the exact reference for "Cream dress".*worn by Sara/);
  assert.match(prompt, /Show exactly 2 people/);
  assert.match(prompt, /never blend faces, bodies, ages, or features/i);
  assert.match(prompt, /Rafael: Pose: walking with a natural mid-step stride; hairstyle: short hair with its natural texture/i);
  assert.match(prompt, /Sara: Pose: standing naturally; hairstyle: hair gathered into a natural ponytail/i);
  assert.match(prompt, /Look toward Sara/);
  assert.match(prompt, /Hold Rafael's hand/);
});

test("uses a compact strict schema for three AI outfit candidates", () => {
  const prompt = outfitRefinementPrompt(
    { garments: [{ itemId: "shirt" }], context: { occasion: "work", weather: ["mild"], season: "spring" } },
    { language: "pt-PT", fashionStyle: "minimal" },
    [
      { id: "shirt", name: "Camisa branca", part: "upperbody", color: "#ffffff" },
      { id: "trousers", name: "Calças pretas", part: "lowerbody", color: "#111111" },
    ],
  );
  const request = openRouterOutfitRequest({ provider: { zdr: true }, model: "planner", prompt });

  assert.match(prompt, /exactly three/i);
  assert.match(prompt, /European Portuguese/);
  assert.equal(request.response_format.json_schema.name, "outfit_refinement");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.provider.zdr, true);
  assert.equal(JSON.stringify(request.response_format).includes("maxItems"), false);
});

test("names an outfit from metadata and context with a compact text-only request", () => {
  const prompt = outfitNamePrompt(
    { garments: [{ itemId: "shirt" }], context: { occasion: "dinner", weather: ["mild"], season: "summer" } },
    { language: "pt-PT" },
    [{ id: "shirt", name: "Camisa de linho", part: "upperbody", color: "#ffffff", image: "private.png" }],
  );
  const request = openRouterOutfitNameRequest({ provider: { zdr: true }, model: "planner", prompt });

  assert.match(prompt, /European Portuguese/);
  assert.match(prompt, /Camisa de linho/);
  assert.doesNotMatch(prompt, /private\.png/);
  assert.equal(request.response_format.json_schema.name, "outfit_name");
  assert.equal(request.max_tokens, 100);
  assert.equal(parseOutfitName('{"name":"  Jantar de Linho  "}', { id: "openrouter", label: "OpenRouter" }), "Jantar de Linho");
});

test("filters invalid and duplicate AI outfit candidates locally", () => {
  const provider = { id: "openrouter", label: "OpenRouter" };
  const parsed = parseOutfitRefinement(JSON.stringify({ candidates: [
    { name: "One", itemIds: ["shirt", "trousers", "private"], explanation: "First" },
    { name: "Duplicate", itemIds: ["trousers", "shirt"], explanation: "Same" },
    { name: "Two", itemIds: ["shirt"], explanation: "Second" },
    { name: "Three", itemIds: ["trousers"], explanation: "Third" },
  ] }), provider, new Set(["shirt", "trousers"]));

  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0].itemIds, ["shirt", "trousers"]);
  assert.equal(parsed.some((candidate) => candidate.itemIds.includes("private")), false);
});

test("retries a fallback model when garment quality validation rejects the primary output", async () => {
  const calls = [];
  const result = await editWithSafetyFallback({
    editImage: async ({ model }) => {
      calls.push(model);
      return Buffer.from(model);
    },
    provider: { label: "OpenRouter" },
    model: "primary-image-model",
    fallbackModels: ["fallback-image-model"],
    validateImage: async (_bytes, { model }) => {
      if (model === "primary-image-model") {
        const error = new Error("wrong product");
        error.code = "garment_type_mismatch";
        throw error;
      }
    },
    prompt: "reconstruct a watch",
    images: [],
    operation: "garment",
  });

  assert.deepEqual(calls, ["primary-image-model", "fallback-image-model"]);
  assert.equal(result.model, "fallback-image-model");
  assert.equal(result.fallbackUsed, true);
});

test("uses Flash Lite for one identity reference and Flash for multiple references", () => {
  const provider = {
    modeledModel: "google/gemini-3.1-flash-lite-image",
    modeledMultiReferenceModel: "google/gemini-3.1-flash-image",
  };

  assert.equal(modeledModelForReferenceCount(provider, 1), "google/gemini-3.1-flash-lite-image");
  assert.equal(modeledModelForReferenceCount(provider, 2), "google/gemini-3.1-flash-image");
  assert.equal(modeledModelForReferenceCount(provider, 3), "google/gemini-3.1-flash-image");
});

test("falls back to the economy model when no multi-reference override is configured", () => {
  const provider = { modeledModel: "google/gemini-3.1-flash-lite-image" };
  assert.equal(modeledModelForReferenceCount(provider, 3), "google/gemini-3.1-flash-lite-image");
});

test("attributes every OpenRouter request to the Wardrobe app", () => {
  const headers = openRouterHeaders({
    key: "test-key",
    appUrl: "https://wardrobe.example/",
    appTitle: "Wardrobe",
  });

  assert.equal(headers["HTTP-Referer"], "https://wardrobe.example/");
  assert.equal(headers["X-OpenRouter-Title"], "Wardrobe");
});

test("does not send unsupported normalized dimensions to FLUX.2 Klein", () => {
  const request = openRouterImageRequest({
    model: "black-forest-labs/flux.2-klein-4b",
    prompt: "reconstruct this garment",
    inputReferences: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    size: "1024x1024",
    resolution: "1K",
    quality: "high",
    background: "transparent",
    routing: { only: ["black-forest-labs"], allow_fallbacks: false },
  });

  assert.deepEqual(request, {
    model: "black-forest-labs/flux.2-klein-4b",
    prompt: "reconstruct this garment",
    n: 1,
    input_references: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }],
    output_format: "png",
    provider: { only: ["black-forest-labs"], allow_fallbacks: false },
  });
});

test("keeps normalized dimensions for models that advertise them", () => {
  const request = openRouterImageRequest({
    model: "google/gemini-3.1-flash-lite-image",
    prompt: "create a modeled look",
    inputReferences: [],
    size: "1536x1024",
    resolution: "1K",
    quality: "auto",
  });

  assert.equal(request.resolution, "1K");
  assert.equal(request.aspect_ratio, "3:2");
  assert.equal("output_format" in request, false);
});

test("maps an exhausted OpenRouter balance to a human-readable credit error", () => {
  const error = providerResponseError(
    { status: 400 },
    { error: { message: "Insufficient credits" } },
    {
      provider: {
        id: "openrouter",
        label: "OpenRouter",
        keyEnv: "OPENROUTER_API_KEY",
      },
      model: "google/gemini-3.1-flash-lite",
      operation: "planner",
    },
  );

  assert.equal(error.status, 402);
  assert.equal(error.code, "openrouter_credits_exhausted");
  assert.match(error.message, /no available credit/i);
});

test("constrains planner response shape without provider state-heavy array bounds", () => {
  const request = openRouterPlannerRequest({
    provider: { zdr: true },
    model: "google/gemini-3.1-flash-lite",
    prompt: "Create a wardrobe plan and return JSON.",
  });

  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.name, "wardrobe_plan");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.deepEqual(request.response_format.json_schema.schema, OPENROUTER_WARDROBE_PLAN_SCHEMA);
  assert.deepEqual(OPENROUTER_WARDROBE_PLAN_SCHEMA.required, WARDROBE_PLAN_SCHEMA.required);
  assert.match(JSON.stringify(WARDROBE_PLAN_SCHEMA), /maxItems/);
  assert.doesNotMatch(JSON.stringify(OPENROUTER_WARDROBE_PLAN_SCHEMA), /(?:minItems|maxItems)/);
  assert.equal(request.provider.require_parameters, true);
  assert.equal(request.provider.data_collection, "deny");
  assert.equal(request.provider.zdr, true);
});

test("leaves enough output headroom for a long multi-day plan", () => {
  const request = openRouterPlannerRequest({
    provider: {},
    model: "google/gemini-3.1-flash-lite",
    prompt: "Create a wardrobe plan and return JSON.",
  });

  assert.ok(request.max_tokens >= 8192, "a truncated plan costs a paid retry on the fallback model");
});

test("puts the locally validated planner shape in the prompt", () => {
  const prompt = wardrobePlanPrompt(
    { kind: "trip", location: "Paris", startDate: "2026-08-14", endDate: "2026-08-16" },
    { name: "Test", sizeProfile: {} },
    [],
  );

  for (const key of ["expectedWeather", "recommendedItems", "outfitIdeas", "missingItems", "packingNotes", "disclaimer"]) {
    assert.match(prompt, new RegExp(`\"${key}\"`));
  }
  assert.match(prompt, /Return only one valid JSON object/i);
  assert.match(prompt, /exactly one individually purchasable garment or accessory/i);
  assert.match(prompt, /gloves, a scarf, and a beanie as three separate entries/i);
  assert.match(prompt, /normally two to four words/i);
  assert.match(prompt, /do not add its category/i);
});

test("asks AI-generated wardrobe copy to use the person's language", () => {
  const prompt = wardrobePlanPrompt(
    { kind: "trip", location: "Paris", startDate: "2026-08-14", endDate: "2026-08-16" },
    { name: "Test", language: "pt-PT", sizeProfile: {} },
    [],
  );

  assert.match(prompt, /European Portuguese \(Portugal\)/);
  assert.match(analysisPrompt("pt-PT"), /European Portuguese/);
  assert.match(analysisPrompt("pt-PT"), /Keep category ids and season ids exactly/i);
  assert.match(analysisPrompt("en-US"), /Do not box the whole person or the whole outfit/i);
  assert.match(analysisPrompt("en-US"), /stop at the jacket hem; exclude the trousers/i);
  assert.match(analysisPrompt("en-US"), /secondaryColor as null.*shadow.*darker interior.*jacket lining/i);
});

test("deduplicates the selected planner model and its fallbacks", () => {
  assert.deepEqual(
    plannerModelCandidates(
      { plannerFallbackModels: ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite"] },
      "google/gemini-3.1-flash-lite",
    ),
    ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite"],
  );
});

test("surfaces the upstream planner error without calling it an image or balance failure", () => {
  const error = providerResponseError(
    { status: 400 },
    {
      error: {
        message: "Provider returned error",
        metadata: {
          raw: JSON.stringify({
            error: {
              code: 400,
              message: "Request contains an invalid argument.",
              status: "INVALID_ARGUMENT",
            },
          }),
        },
      },
    },
    {
      provider: {
        id: "openrouter",
        label: "OpenRouter",
        keyEnv: "OPENROUTER_API_KEY",
      },
      model: "google/gemini-3.1-flash-lite",
      operation: "planner",
    },
  );

  assert.equal(error.status, 400);
  assert.equal(error.code, "openrouter_provider_error");
  assert.match(error.message, /could not create the wardrobe plan/i);
  assert.match(error.message, /request contains an invalid argument/i);
  assert.doesNotMatch(error.message, /balance|spending limit/i);
  assert.doesNotMatch(error.message, /requested image/i);
});
