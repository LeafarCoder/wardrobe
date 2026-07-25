import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOpenRouterApiKey,
  openRouterApiKeyHint,
  providerWithProfilePreferences,
} from "../scripts/import-job-api.mjs";

const SERVER = { id: "openrouter", key: "sk-or-v1-serverSharedKey0000000000", visionModel: "m" };
const RAFAEL = { name: "Rafael", openRouterApiKey: "sk-or-v1-rafaelKey00000000000000000" };
const SARA = { name: "Sara", openRouterApiKey: "sk-or-v1-saraKey000000000000000000" };

test("accepts a real OpenRouter key and rejects anything else", () => {
  assert.equal(normalizeOpenRouterApiKey("sk-or-v1-abcdefghij"), "sk-or-v1-abcdefghij");
  assert.equal(normalizeOpenRouterApiKey("  sk-or-v1-abcdefghij  "), "sk-or-v1-abcdefghij");
  for (const junk of ["", "not-a-key", "sk-ant-abcdefghij", "sk-or-", null, undefined, 42, {}]) {
    assert.equal(normalizeOpenRouterApiKey(junk), "");
  }
});

test("the hint identifies a key without revealing it", () => {
  const hint = openRouterApiKeyHint("sk-or-v1-abcdefghijklmnop");

  assert.equal(hint, "sk-or-v1-ab…mnop");
  assert.equal(hint.includes("cdefghijkl"), false);
  assert.equal(openRouterApiKeyHint("junk"), "");
});

test("a person's own key pays for their own wardrobe", () => {
  assert.equal(providerWithProfilePreferences(SERVER, SARA, SARA).key, SARA.openRouterApiKey);
});

test("an owner working in someone else's wardrobe spends their own credit", () => {
  // The whole point: the key follows the signed-in account, not the wardrobe.
  const provider = providerWithProfilePreferences(SERVER, SARA, RAFAEL);

  assert.equal(provider.key, RAFAEL.openRouterApiKey);
  assert.notEqual(provider.key, SARA.openRouterApiKey);
  assert.equal(provider.keyOwner, "profile");
});

test("the server key is the fallback until someone adds their own", () => {
  const provider = providerWithProfilePreferences(SERVER, { name: "New" }, { name: "New" });

  assert.equal(provider.key, SERVER.key);
  assert.equal(provider.keyOwner, undefined);
});

test("an invalid stored key never becomes the request key", () => {
  const provider = providerWithProfilePreferences(SERVER, SARA, { name: "X", openRouterApiKey: "not-a-key" });
  assert.equal(provider.key, SERVER.key);
});

test("the payer's key does not disturb the wardrobe's model choices", () => {
  const wardrobe = { ...SARA, aiPreferences: { garmentModel: "google/gemini-3-pro-image" }, language: "pt-PT" };
  const provider = providerWithProfilePreferences(SERVER, wardrobe, RAFAEL);

  assert.equal(provider.garmentModel, "google/gemini-3-pro-image");
  assert.equal(provider.responseLanguage, "pt-PT");
  assert.equal(provider.key, RAFAEL.openRouterApiKey);
});

test("a non-OpenRouter provider is left alone", () => {
  const provider = providerWithProfilePreferences({ id: "openai", key: "sk-openai" }, SARA, RAFAEL);
  assert.equal(provider.key, "sk-openai");
});
