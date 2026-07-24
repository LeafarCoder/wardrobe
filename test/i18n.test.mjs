import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getLocale,
  hasTranslation,
  normalizeLocale,
  setLocale,
  tr,
} from "../src/i18n.js";
import { AI_TASKS, AI_OPERATION_LABELS } from "../src/ai-preferences.js";
import {
  FIT_OPTIONS,
  SIZE_FIELDS,
  SIZE_SYSTEMS,
} from "../src/wardrobe-metadata.js";
import {
  GARMENT_FIT_SUGGESTIONS,
  GRID_DENSITIES,
  MATERIAL_SUGGESTIONS,
  SEASON_OPTIONS,
  WARDROBE_BACKGROUND_STYLES,
  WARDROBE_DETAIL_FIELDS,
  WARDROBE_SHOWCASE_MODES,
} from "../src/wardrobe-discovery.js";

test("normalizes and translates the supported locales", () => {
  const previous = getLocale();
  assert.equal(normalizeLocale("pt-PT"), "pt-PT");
  assert.equal(normalizeLocale("pt-BR"), "en-US");
  setLocale("pt-PT", { persist: false });
  assert.equal(tr("Wardrobe"), "Guarda-roupa");
  assert.equal(tr("{count} garments", { count: 3 }), "3 peças");
  setLocale(previous, { persist: false });
});

test("every literal interface translation key has a Portuguese translation", async () => {
  const files = [
    new URL("../src/App.jsx", import.meta.url),
    new URL("../src/import-flow.jsx", import.meta.url),
    new URL("../src/GarmentColorPreview.jsx", import.meta.url),
    new URL("../src/MonthYearPicker.jsx", import.meta.url),
  ];
  const keys = new Set();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\btr\("([^"]+)"/g)) keys.add(match[1]);
  }
  const missing = [...keys].filter((key) => !hasTranslation(key)).sort();
  assert.deepEqual(missing, []);
});

test("every translated metadata option has a Portuguese label", () => {
  const keys = [
    ...SIZE_FIELDS.map((item) => item.label),
    ...FIT_OPTIONS.map((item) => item.label),
    ...SIZE_SYSTEMS.map((item) => item.label),
    ...SEASON_OPTIONS.map((item) => item.label),
    ...GRID_DENSITIES.map((item) => item.label),
    ...WARDROBE_SHOWCASE_MODES.map((item) => item.label),
    ...WARDROBE_BACKGROUND_STYLES.map((item) => item.label),
    ...WARDROBE_DETAIL_FIELDS.map((item) => item.label),
    ...MATERIAL_SUGGESTIONS,
    ...GARMENT_FIT_SUGGESTIONS,
    ...Object.values(AI_OPERATION_LABELS),
    ...AI_TASKS.flatMap((task) => [
      task.label,
      task.description,
      ...task.options.flatMap((option) => [option.badge, option.note]),
    ]),
  ];
  const missing = [...new Set(keys)].filter((key) => !hasTranslation(key)).sort();
  assert.deepEqual(missing, []);
});
