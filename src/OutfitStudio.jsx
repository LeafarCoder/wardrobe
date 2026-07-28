import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CoatHanger,
  DiceFive,
  FloppyDisk,
  MagicWand,
  MagnifyingGlass,
  Palette,
  Plus,
  Sparkle,
  SpinnerGap,
  Trash,
  X,
} from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import {
  currentNorthernSeason,
  generateLocalOutfitCandidates,
  normalizeOutfitContext,
  normalizeOutfitPresentation,
  OUTFIT_BACKGROUNDS,
  OUTFIT_MAX_GARMENTS_PER_PERSON,
  OUTFIT_OCCASIONS,
  OUTFIT_POSES,
  OUTFIT_SEASONS,
  OUTFIT_STYLES,
  OUTFIT_WEATHER,
  outfitGarmentSource,
} from "./outfit-studio.js";
import { garmentColorVariants } from "./garment-variants.js";
import "./outfit-studio.css";

const CATEGORY_OPTIONS = [
  { id: "all", label: "All" },
  { id: "upperbody", label: "Tops" },
  { id: "wholebody_up", label: "Outerwear" },
  { id: "lowerbody", label: "Bottoms" },
  { id: "wholebody", label: "Dresses & one-pieces" },
  { id: "shoes", label: "Shoes" },
  { id: "accessories_up", label: "Accessories" },
];

function blankDraft() {
  return {
    id: null,
    name: "",
    garments: [],
    companions: [],
    context: normalizeOutfitContext({}),
    presentation: normalizeOutfitPresentation({}),
    source: "manual",
    explanation: "",
    modeledLooks: [],
  };
}

function selectionForIds(ids, previous = []) {
  const previousById = new Map(previous.map((entry) => [entry.itemId, entry]));
  return ids.map((itemId) => previousById.get(itemId) || { itemId, variantId: null });
}

function garmentImage(item, selection) {
  return outfitGarmentSource(item, selection?.variantId) || item?.thumbnail || item?.imagePreview || item?.image;
}

function MiniGarment({ item, selection, changed = false, removed = false }) {
  if (!item) return null;
  return (
    <div className={`outfit-mini-garment${changed ? " is-changed" : ""}${removed ? " is-removed" : ""}`}>
      <OptimizedImage src={garmentImage(item, selection)} alt="" sizes="72px" />
      <span>{item.name}</span>
      {changed && <i>{tr(removed ? "Removed" : "Changed")}</i>}
    </div>
  );
}

function ChipGroup({ title, options, value, multiple = false, onChange }) {
  const selected = multiple ? new Set(value) : null;
  return (
    <fieldset className="outfit-chip-group">
      <legend>{tr(title)}</legend>
      <div>
        {options.map((option) => {
          const active = multiple ? selected.has(option.id) : value === option.id;
          return (
            <button
              type="button"
              className={active ? "active" : ""}
              aria-pressed={active}
              key={option.id}
              onClick={() => onChange(multiple
                ? active ? value.filter((id) => id !== option.id) : [...value, option.id]
                : option.id)}
            >
              {tr(option.label)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function OutfitStudio({
  user,
  items,
  connections = [],
  onClose,
  onSave,
  onDelete,
  onRefine,
  onGenerate,
  onDeleteLook,
}) {
  const [draft, setDraft] = useState(blankDraft);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activeWardrobeId, setActiveWardrobeId] = useState(user.id);
  const [localCandidates, setLocalCandidates] = useState([]);
  const [aiCandidates, setAiCandidates] = useState([]);
  const [activeAiIndex, setActiveAiIndex] = useState(0);
  const [aiOriginal, setAiOriginal] = useState(null);
  const [undoDraft, setUndoDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLookId, setDeleteLookId] = useState(null);
  const draftId = useRef(crypto.randomUUID());
  const connectionMap = useMemo(() => new Map(connections.map((connection) => [connection.person.id, connection])), [connections]);
  const allItems = useMemo(() => [
    ...items.map((item) => ({ ...item, userId: user.id })),
    ...connections.flatMap((connection) => connection.garments || []),
  ], [connections, items, user.id]);
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);
  const savedOutfits = user.wardrobeOutfits || [];
  const selectedIds = new Set(draft.garments.map((entry) => entry.itemId));
  const activeItems = activeWardrobeId === user.id
    ? items
    : connectionMap.get(activeWardrobeId)?.garments || [];
  const filteredItems = activeItems.filter((item) => {
    const words = `${item.name || ""} ${item.brand || ""} ${(item.tags || []).join(" ")}`.toLocaleLowerCase();
    return (category === "all" || item.part === category) && words.includes(search.trim().toLocaleLowerCase());
  });

  const changeDraft = (change) => {
    setDraft((current) => ({ ...current, ...change }));
    setLocalCandidates([]);
    setAiCandidates([]);
    setAiOriginal(null);
    setUndoDraft(null);
    setError("");
  };

  const loadOutfit = (outfit) => {
    setDraft({ ...outfit, garments: outfit.garments.map((garment) => ({ ...garment })) });
    setLocalCandidates([]);
    setAiCandidates([]);
    setAiOriginal(null);
    setUndoDraft(null);
    setDeleteId(null);
    setDeleteLookId(null);
    setError("");
    draftId.current = crypto.randomUUID();
  };

  const addGarment = (itemId) => {
    if (selectedIds.has(itemId)) return;
    const item = itemMap.get(itemId);
    if (!item) return;
    const wearerId = item.userId || user.id;
    if (draft.garments.filter((entry) => (entry.wearerId || entry.ownerId || user.id) === wearerId).length >= OUTFIT_MAX_GARMENTS_PER_PERSON) {
      setError(tr("Choose up to six garments for each person."));
      return;
    }
    const companions = wearerId === user.id || draft.companions.includes(wearerId)
      ? draft.companions
      : [...draft.companions, wearerId];
    changeDraft({
      garments: [...draft.garments, { itemId, variantId: null, ownerId: wearerId, wearerId }],
      companions,
      source: "manual",
    });
  };

  const toggleCompanion = (personId) => {
    const active = draft.companions.includes(personId);
    const companions = active ? draft.companions.filter((id) => id !== personId) : [...draft.companions, personId];
    const garments = active
      ? draft.garments.filter((entry) => (entry.ownerId || itemMap.get(entry.itemId)?.userId) !== personId)
      : draft.garments;
    if (activeWardrobeId === personId && active) setActiveWardrobeId(user.id);
    changeDraft({ companions, garments, source: "manual" });
  };

  const removeGarment = (itemId) => {
    changeDraft({ garments: draft.garments.filter((entry) => entry.itemId !== itemId), source: "manual" });
  };

  const moveGarment = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.garments.length) return;
    const garments = [...draft.garments];
    [garments[index], garments[nextIndex]] = [garments[nextIndex], garments[index]];
    changeDraft({ garments });
  };

  const cycleVariant = (index) => {
    const selection = draft.garments[index];
    const item = itemMap.get(selection.itemId);
    const versions = [null, ...garmentColorVariants(item).map((variant) => variant.id)];
    if (versions.length < 2) return;
    const currentIndex = Math.max(0, versions.indexOf(selection.variantId || null));
    const garments = draft.garments.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, variantId: versions[(currentIndex + 1) % versions.length] }
      : entry);
    changeDraft({ garments });
  };

  const applyCandidate = (candidate, source) => {
    setUndoDraft(draft);
    setDraft((current) => ({
      ...current,
      name: current.name || candidate.name,
      garments: selectionForIds(candidate.itemIds, current.garments),
      source,
      explanation: candidate.explanation || "",
    }));
    setLocalCandidates([]);
    setAiCandidates([]);
    setAiOriginal(null);
  };

  const suggestLocally = () => {
    setError("");
    const candidates = generateLocalOutfitCandidates(items, draft.context).map((candidate, index) => ({
      ...candidate,
      name: tr("Local option {number}", { number: index + 1 }),
      explanation: tr("Built privately on this device from your occasion, weather, and season choices."),
    }));
    setLocalCandidates(candidates);
    setAiCandidates([]);
    setAiOriginal(null);
  };

  const refineWithAi = async () => {
    setBusy("refine");
    setError("");
    try {
      const original = { ...draft, garments: draft.garments.map((entry) => ({ ...entry })) };
      const result = await onRefine({ ...draft, draftId: draftId.current });
      setAiOriginal(original);
      setAiCandidates(result.candidates || []);
      setActiveAiIndex(0);
      setLocalCandidates([]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (!draft.garments.length) {
      setError(tr("Add at least one garment to save this outfit."));
      return null;
    }
    setBusy("save");
    setError("");
    try {
      const outfit = await onSave({ ...draft, name: draft.name || tr("Untitled outfit") });
      loadOutfit(outfit);
      return outfit;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy("");
    }
  };

  const generateModeled = async () => {
    setBusy("generate");
    setError("");
    try {
      const saved = await onSave({ ...draft, name: draft.name || tr("Untitled outfit") });
      const result = await onGenerate(saved.id);
      loadOutfit(result.outfit);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const removeSavedOutfit = async (id) => {
    if (deleteId !== id) {
      setDeleteId(id);
      return;
    }
    setBusy("delete");
    setError("");
    try {
      await onDelete(id);
      if (draft.id === id) setDraft(blankDraft());
      setDeleteId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const removeModeledLook = async (lookId) => {
    if (deleteLookId !== lookId) {
      setDeleteLookId(lookId);
      return;
    }
    setBusy("delete-look");
    setError("");
    try {
      const result = await onDeleteLook(draft.id, lookId);
      loadOutfit(result.outfit);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const activeAi = aiCandidates[activeAiIndex];
  const originalIds = new Set((aiOriginal?.garments || []).map((entry) => entry.itemId));
  const candidateIds = new Set(activeAi?.itemIds || []);
  const latestLook = draft.modeledLooks?.at(-1);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  return (
    <div className="outfit-studio-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="outfit-studio" role="dialog" aria-modal="true" aria-labelledby="outfit-studio-title">
        <header className="outfit-studio-header">
          <div>
            <span>{tr("Visual outfit builder")}</span>
            <h2 id="outfit-studio-title">{tr("Outfit Studio")}</h2>
            <p>{tr("Build with your real garments, compare suggestions, and create modeled looks when you are ready.")}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("Close Outfit Studio")}><X size={19} /></button>
        </header>

        <div className="outfit-studio-layout">
          <aside className="outfit-library">
            <div className="outfit-saved-heading">
              <h3>{tr("Saved outfits")}</h3>
              <button type="button" onClick={() => loadOutfit(blankDraft())}><Plus size={14} />{tr("New")}</button>
            </div>
            <div className="outfit-saved-list">
              {savedOutfits.length ? savedOutfits.map((outfit) => (
                <div className={draft.id === outfit.id ? "active" : ""} key={outfit.id}>
                  <button type="button" onClick={() => loadOutfit(outfit)}>
                    <span>{outfit.name}</span>
                    <small>{tr("{count} pieces", { count: outfit.garments.length })}</small>
                  </button>
                  <button type="button" className={deleteId === outfit.id ? "confirm-delete" : ""} onClick={() => removeSavedOutfit(outfit.id)} aria-label={deleteId === outfit.id ? tr("Confirm delete") : tr("Delete {name}", { name: outfit.name })}>
                    {busy === "delete" && deleteId === outfit.id ? <SpinnerGap className="spin" /> : deleteId === outfit.id ? <Check /> : <Trash />}
                  </button>
                </div>
              )) : <p>{tr("Your saved outfits will appear here.")}</p>}
            </div>

            <div className="outfit-people-heading"><span>{tr("People in this scene")}</span><small>{tr("Your account is always included")}</small></div>
            <div className="outfit-people-list">
              <button type="button" className="active" aria-pressed="true">
                <span className="outfit-person-avatar">{user.referenceImages?.[0] ? <img src={user.referenceImages[0].avatarUrl || user.referenceImages[0].url} alt="" /> : user.name?.[0]}</span>
                <span><strong>{tr("Me")}</strong><small>{user.name}</small></span><Check size={14} />
              </button>
              {connections.map((connection) => {
                const active = draft.companions.includes(connection.person.id);
                const reference = connection.person.referenceImages?.[0];
                return (
                  <button type="button" className={active ? "active" : ""} aria-pressed={active} disabled={!connection.person.referenceCount} onClick={() => toggleCompanion(connection.person.id)} key={connection.person.id}>
                    <span className="outfit-person-avatar">{reference ? <img src={reference.avatarUrl} alt="" /> : connection.person.name?.[0]}</span>
                    <span><strong>{connection.person.name}</strong><small>{connection.person.referenceCount ? connection.relationship : tr("Needs a reference photo")}</small></span>{active ? <Check size={14} /> : <Plus size={14} />}
                  </button>
                );
              })}
            </div>

            <div className="outfit-wardrobe-heading">
              <h3>{tr("Choose clothes for")}</h3>
              <div>
                <button type="button" className={activeWardrobeId === user.id ? "active" : ""} onClick={() => setActiveWardrobeId(user.id)}>{tr("Me")}</button>
                {draft.companions.map((personId) => {
                  const connection = connectionMap.get(personId);
                  if (!connection?.permissions.garments) return null;
                  return <button type="button" className={activeWardrobeId === personId ? "active" : ""} onClick={() => setActiveWardrobeId(personId)} key={personId}>{connection.person.name}</button>;
                })}
              </div>
            </div>
            <label className="outfit-search"><MagnifyingGlass size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Search garments")} /></label>
            <div className="outfit-category-tabs">
              {CATEGORY_OPTIONS.map((option) => <button type="button" className={category === option.id ? "active" : ""} key={option.id} onClick={() => setCategory(option.id)}>{tr(option.label)}</button>)}
            </div>
            <div className="outfit-library-grid">
              {filteredItems.map((item) => (
                <button
                  type="button"
                  className={selectedIds.has(item.id) ? "selected" : ""}
                  key={item.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("application/x-wardrobe-garment", item.id)}
                  onClick={() => addGarment(item.id)}
                  disabled={selectedIds.has(item.id)}
                >
                  <OptimizedImage src={item.thumbnail || item.imagePreview || item.image} alt="" sizes="110px" />
                  <span>{item.name}</span>
                  {selectedIds.has(item.id) ? <Check size={14} /> : <Plus size={14} />}
                </button>
              ))}
            </div>
          </aside>

          <main className="outfit-workspace">
            <div className="outfit-name-row">
              <label><span>{tr("Outfit name")}</span><input value={draft.name} maxLength="100" onChange={(event) => changeDraft({ name: event.target.value })} placeholder={tr("Untitled outfit")} /></label>
              {undoDraft && <button type="button" className="subtle-button" onClick={() => { setDraft(undoDraft); setUndoDraft(null); }}>{tr("Undo last change")}</button>}
              <button type="button" className="outfit-save-button" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? <SpinnerGap className="spin" /> : <FloppyDisk />}{tr("Save outfit")}</button>
            </div>

            <section
              className={`outfit-board${draft.garments.length ? " has-garments" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); addGarment(event.dataTransfer.getData("application/x-wardrobe-garment")); }}
            >
              <div className="outfit-board-heading"><span>{tr("Outfit board")}</span><small>{tr("{count} selected pieces", { count: draft.garments.length })}</small></div>
              {!draft.garments.length ? (
                <div className="outfit-board-empty"><CoatHanger size={34} /><strong>{tr("Add garments from your wardrobe")}</strong><p>{tr("Click or drag up to six pieces here. Suggestions will not replace this board until you choose one.")}</p></div>
              ) : (
                <div className="outfit-board-grid">
                  {draft.garments.map((selection, index) => {
                    const item = itemMap.get(selection.itemId);
                    if (!item) return null;
                    const variants = garmentColorVariants(item);
                    return (
                      <article key={selection.itemId}>
                        <OptimizedImage src={garmentImage(item, selection)} alt={item.name} sizes="180px" />
                        <div><strong>{item.name}</strong><small>{(selection.wearerId || item.userId) === user.id ? tr("For me") : tr("For {name}", { name: connectionMap.get(selection.wearerId || item.userId)?.person.name || tr("Companion") })} · {tr(CATEGORY_OPTIONS.find((option) => option.id === item.part)?.label || "Garment")}</small></div>
                        <nav>
                          <button type="button" onClick={() => moveGarment(index, -1)} disabled={!index} aria-label={tr("Move {name} earlier", { name: item.name })}><ArrowUp /></button>
                          <button type="button" onClick={() => moveGarment(index, 1)} disabled={index === draft.garments.length - 1} aria-label={tr("Move {name} later", { name: item.name })}><ArrowDown /></button>
                          {!!variants.length && <button type="button" className={selection.variantId ? "active" : ""} onClick={() => cycleVariant(index)} aria-label={tr("Change color version for {name}", { name: item.name })}><Palette /></button>}
                          <button type="button" onClick={() => removeGarment(item.id)} aria-label={tr("Remove {name} from outfit", { name: item.name })}><X /></button>
                        </nav>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="outfit-context-panel">
              <div className="outfit-section-heading"><div><span>{tr("Context")}</span><h3>{tr("What are you dressing for?")}</h3></div><button type="button" className={draft.context.season === currentNorthernSeason() ? "active" : ""} onClick={() => changeDraft({ context: { ...draft.context, season: currentNorthernSeason() } })}>{tr("Current season: {season}", { season: tr(currentNorthernSeason()[0].toUpperCase() + currentNorthernSeason().slice(1)) })}</button></div>
              <ChipGroup title="Occasion" options={OUTFIT_OCCASIONS} value={draft.context.occasion} onChange={(occasion) => changeDraft({ context: { ...draft.context, occasion } })} />
              <ChipGroup title="Weather" options={OUTFIT_WEATHER} value={draft.context.weather} multiple onChange={(weather) => changeDraft({ context: { ...draft.context, weather } })} />
              <ChipGroup title="Season" options={OUTFIT_SEASONS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }))} value={draft.context.season} onChange={(season) => changeDraft({ context: { ...draft.context, season } })} />
            </section>

            <section className="outfit-suggestions">
              <div className="outfit-section-heading"><div><span>{tr("Suggestions")}</span><h3>{tr("Explore three complete options")}</h3></div><p>{tr("Local suggestions are free and private. AI refinement is paid and may replace garments.")}</p></div>
              <div className="outfit-suggestion-actions">
                <button type="button" onClick={suggestLocally} disabled={Boolean(draft.companions.length)}><DiceFive />{tr("Suggest locally")}</button>
                <button type="button" className="primary" onClick={refineWithAi} disabled={busy === "refine" || !items.length || Boolean(draft.companions.length)}>{busy === "refine" ? <SpinnerGap className="spin" /> : <MagicWand />}{tr("Refine with AI")}</button>
              </div>
              {!!draft.companions.length && <p className="outfit-companion-note">{tr("Suggestions stay off for multi-person scenes so they do not replace clothes you assigned to each person.")}</p>}
              {!!localCandidates.length && <div className="outfit-candidate-grid">{localCandidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => applyCandidate(candidate, "local")}><strong>{candidate.name}</strong><div>{candidate.itemIds.map((id) => <MiniGarment key={id} item={itemMap.get(id)} />)}</div><p>{candidate.explanation}</p><span>{tr("Use this outfit")}</span></button>)}</div>}

              {!!aiCandidates.length && activeAi && (
                <div className="outfit-ai-comparison">
                  <div className="outfit-ai-tabs">{aiCandidates.map((candidate, index) => <button type="button" className={activeAiIndex === index ? "active" : ""} key={candidate.id || index} onClick={() => setActiveAiIndex(index)}>{tr("Option {number}", { number: index + 1 })}</button>)}</div>
                  <div className="outfit-comparison-boards">
                    <article><span>{tr("Your outfit")}</span><h4>{aiOriginal?.name || tr("Current board")}</h4><div>{(aiOriginal?.garments || []).map((selection) => <MiniGarment key={selection.itemId} item={itemMap.get(selection.itemId)} selection={selection} changed={!candidateIds.has(selection.itemId)} removed={!candidateIds.has(selection.itemId)} />)}</div></article>
                    <article className="ai-option"><span><Sparkle />{tr("AI option")}</span><h4>{activeAi.name}</h4><div>{activeAi.itemIds.map((id) => <MiniGarment key={id} item={itemMap.get(id)} changed={!originalIds.has(id)} />)}</div><p>{activeAi.explanation}</p></article>
                  </div>
                  <div className="outfit-comparison-actions"><button type="button" onClick={() => { setAiCandidates([]); setAiOriginal(null); }}>{tr("Keep mine")}</button><button type="button" className="primary" onClick={() => applyCandidate(activeAi, "ai")}><Check />{tr("Use this outfit")}</button></div>
                </div>
              )}
            </section>

            <section className="outfit-presentation">
              <div className="outfit-section-heading"><div><span>{tr("Modeled look")}</span><h3>{tr("Direct the final image")}</h3></div><p>{tr("Generating an image is a paid AI action and automatically saves this outfit first.")}</p></div>
              <ChipGroup title="Background" options={OUTFIT_BACKGROUNDS} value={draft.presentation.background} onChange={(background) => changeDraft({ presentation: { ...draft.presentation, background } })} />
              <ChipGroup title="Style" options={OUTFIT_STYLES} value={draft.presentation.style} onChange={(style) => changeDraft({ presentation: { ...draft.presentation, style } })} />
              <ChipGroup title="Pose" options={OUTFIT_POSES} value={draft.presentation.pose} onChange={(pose) => changeDraft({ presentation: { ...draft.presentation, pose } })} />
              <label className="outfit-direction"><span>{tr("Additional direction")} <small>{tr("optional")}</small></span><textarea rows="3" maxLength="300" value={draft.presentation.direction} onChange={(event) => changeDraft({ presentation: { ...draft.presentation, direction: event.target.value } })} placeholder={tr("For example: soft evening light, relaxed expression, full outfit visible…")} /><small>{draft.presentation.direction.length}/300</small></label>
              <button type="button" className="outfit-generate-button" onClick={generateModeled} disabled={Boolean(busy) || !draft.garments.length}>{busy === "generate" ? <SpinnerGap className="spin" /> : <Sparkle />}{tr("Generate modeled look")}</button>
              {latestLook && (
                <div className="outfit-modeled-gallery">
                  <OptimizedImage src={latestLook.preview || latestLook.image} alt={draft.name} sizes="720px" />
                  <div>{draft.modeledLooks.map((look) => <span className={look.id === latestLook.id ? "active" : ""} key={look.id}><OptimizedImage src={look.preview || look.image} alt="" sizes="88px" /><button type="button" className={deleteLookId === look.id ? "confirm-delete" : ""} onClick={() => removeModeledLook(look.id)} aria-label={deleteLookId === look.id ? tr("Confirm delete") : tr("Delete modeled look")}>{deleteLookId === look.id ? <Check /> : <Trash />}</button></span>)}</div>
                </div>
              )}
            </section>
            {draft.explanation && <p className="outfit-explanation">{draft.explanation}</p>}
            {error && <p className="outfit-error" role="alert">{error}</p>}
          </main>
        </div>
      </section>
    </div>
  );
}
