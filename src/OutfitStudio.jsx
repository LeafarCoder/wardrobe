import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Check,
  CloudRain,
  CoatHanger,
  EyeSlash,
  FloppyDisk,
  Flower,
  Leaf,
  MagicWand,
  MagnifyingGlass,
  Palette,
  Plus,
  PushPin,
  Snowflake,
  Sparkle,
  SpinnerGap,
  Sun,
  Trash,
  Wind,
  X,
} from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { ModeledLookDialog } from "./ModeledLookDialog.jsx";
import {
  currentNorthernSeason,
  normalizeOutfitContext,
  normalizeOutfitPresentation,
  OUTFIT_MAX_GARMENTS,
  OUTFIT_OCCASIONS,
  OUTFIT_SEASONS,
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

const WEATHER_ICONS = { hot: Sun, mild: Sun, cold: Snowflake, rain: CloudRain, wind: Wind };
const SEASON_ICONS = { spring: Flower, summer: Sun, autumn: Leaf, winter: Snowflake };

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
          const Icon = option.icon;
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
              {Icon && <Icon aria-hidden="true" />}
              {tr(option.label)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ContextControls({ context, onChange }) {
  const seasonOptions = OUTFIT_SEASONS.map((id) => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    icon: SEASON_ICONS[id],
  }));
  const weatherOptions = OUTFIT_WEATHER.map((option) => ({ ...option, icon: WEATHER_ICONS[option.id] }));
  return (
    <>
      <ChipGroup title="Occasion" options={OUTFIT_OCCASIONS} value={context.occasion} onChange={(occasion) => onChange({ ...context, occasion })} />
      <ChipGroup title="Weather" options={weatherOptions} value={context.weather} multiple onChange={(weather) => onChange({ ...context, weather })} />
      <ChipGroup title="Season" options={seasonOptions} value={context.season} onChange={(season) => onChange({ ...context, season })} />
    </>
  );
}

function StudioDialog({ title, eyebrow, children, onCancel, actions }) {
  return (
    <div className="outfit-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="outfit-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><span>{eyebrow}</span><h3>{title}</h3></div>
          <button type="button" onClick={onCancel} aria-label={tr("Close")}><X /></button>
        </header>
        <div className="outfit-dialog-body">{children}</div>
        {actions && <footer>{actions}</footer>}
      </section>
    </div>
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
  onGenerateName,
  onReorder,
  onGenerate,
  onDeleteLook,
  onArchiveLook,
}) {
  const [draft, setDraft] = useState(blankDraft);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activePersonId, setActivePersonId] = useState(user.id);
  const [aiCandidates, setAiCandidates] = useState([]);
  const [activeAiIndex, setActiveAiIndex] = useState(0);
  const [aiOriginal, setAiOriginal] = useState(null);
  const [undoDraft, setUndoDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLookId, setDeleteLookId] = useState(null);
  const [activeLookId, setActiveLookId] = useState(null);
  const [savedPinned, setSavedPinned] = useState(false);
  const [draggedOutfitId, setDraggedOutfitId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [pendingContext, setPendingContext] = useState(normalizeOutfitContext({}));
  const [modeledDialogOpen, setModeledDialogOpen] = useState(false);
  const draftId = useRef(crypto.randomUUID());
  const connectionMap = useMemo(() => new Map(connections.map((connection) => [connection.person.id, connection])), [connections]);
  const allItems = useMemo(() => [
    ...items.map((item) => ({ ...item, userId: user.id })),
    ...connections.flatMap((connection) => connection.garments || []),
  ], [connections, items, user.id]);
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);
  const savedOutfits = user.wardrobeOutfits || [];
  const selectedIds = new Set(draft.garments.map((entry) => entry.itemId));
  const scenePeople = [
    { id: user.id, name: user.name || tr("Me"), profile: user, isMe: true },
    ...draft.companions.flatMap((personId) => {
      const connection = connectionMap.get(personId);
      return connection ? [{ id: personId, name: connection.person.name, profile: connection.person, connection }] : [];
    }),
  ];
  const wearerIdFor = (selection) => selection.wearerId
    || selection.ownerId
    || itemMap.get(selection.itemId)?.userId
    || user.id;
  const boardGarments = draft.garments.flatMap((selection, draftIndex) => (
    wearerIdFor(selection) === activePersonId ? [{ selection, draftIndex }] : []
  ));
  const garmentCountByPerson = new Map(scenePeople.map((person) => [
    person.id,
    draft.garments.filter((selection) => wearerIdFor(selection) === person.id).length,
  ]));
  const activePerson = scenePeople.find((person) => person.id === activePersonId) || scenePeople[0];
  const availableBoardConnections = connections.filter((connection) => (
    connection.person.referenceCount
    && connection.permissions.garments
    && !draft.companions.includes(connection.person.id)
  ));
  const activeItems = activePersonId === user.id ? items : connectionMap.get(activePersonId)?.garments || [];
  const filteredItems = activeItems.filter((item) => {
    const words = `${item.name || ""} ${item.brand || ""} ${(item.tags || []).join(" ")}`.toLocaleLowerCase();
    return (category === "all" || item.part === category) && words.includes(search.trim().toLocaleLowerCase());
  });
  const pickerItems = activeItems.filter((item) => {
    const words = `${item.name || ""} ${item.brand || ""} ${(item.tags || []).join(" ")}`.toLocaleLowerCase();
    return !selectedIds.has(item.id) && words.includes(pickerSearch.trim().toLocaleLowerCase());
  });

  const resetAiResult = () => {
    setAiCandidates([]);
    setAiOriginal(null);
    setUndoDraft(null);
  };

  const changeDraft = (change) => {
    setDraft((current) => ({ ...current, ...change }));
    resetAiResult();
    setError("");
  };

  const loadOutfit = (outfit) => {
    setDraft({ ...outfit, garments: outfit.garments.map((garment) => ({ ...garment })) });
    setActivePersonId(user.id);
    resetAiResult();
    setDeleteId(null);
    setDeleteLookId(null);
    setActiveLookId(outfit.modeledLooks?.at(-1)?.id || null);
    setError("");
    draftId.current = crypto.randomUUID();
  };

  const addGarment = (itemId) => {
    if (selectedIds.has(itemId)) return;
    if (draft.garments.length >= OUTFIT_MAX_GARMENTS) {
      setError(tr("Choose up to ten garments for an outfit."));
      return;
    }
    const item = itemMap.get(itemId);
    if (!item) return;
    const wearerId = item.userId || user.id;
    if (wearerId !== activePersonId) return;
    const companions = wearerId === user.id || draft.companions.includes(wearerId)
      ? draft.companions
      : [...draft.companions, wearerId];
    changeDraft({
      garments: [...draft.garments, { itemId, variantId: null, ownerId: wearerId, wearerId }],
      companions,
      source: "manual",
    });
    setPickerOpen(false);
    setPickerSearch("");
  };

  const toggleCompanion = (personId) => {
    const active = draft.companions.includes(personId);
    const companions = active ? draft.companions.filter((id) => id !== personId) : [...draft.companions, personId];
    const garments = active
      ? draft.garments.filter((entry) => (entry.ownerId || itemMap.get(entry.itemId)?.userId) !== personId)
      : draft.garments;
    if (activePersonId === personId && active) setActivePersonId(user.id);
    if (!active) setActivePersonId(personId);
    setPickerOpen(false);
    changeDraft({ companions, garments, source: "manual" });
  };

  const addNextPersonBoard = () => {
    const connection = availableBoardConnections[0];
    if (connection) toggleCompanion(connection.person.id);
  };

  const removeGarment = (itemId) => changeDraft({ garments: draft.garments.filter((entry) => entry.itemId !== itemId), source: "manual" });

  const moveGarment = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= boardGarments.length) return;
    const currentDraftIndex = boardGarments[index].draftIndex;
    const nextDraftIndex = boardGarments[nextIndex].draftIndex;
    const garments = [...draft.garments];
    [garments[currentDraftIndex], garments[nextDraftIndex]] = [garments[nextDraftIndex], garments[currentDraftIndex]];
    changeDraft({ garments });
  };

  const cycleVariant = (index) => {
    const selection = draft.garments[index];
    const item = itemMap.get(selection.itemId);
    const versions = [null, ...garmentColorVariants(item).map((variant) => variant.id)];
    if (versions.length < 2) return;
    const currentIndex = Math.max(0, versions.indexOf(selection.variantId || null));
    changeDraft({ garments: draft.garments.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, variantId: versions[(currentIndex + 1) % versions.length] }
      : entry) });
  };

  const applyCandidate = (candidate) => {
    setUndoDraft(draft);
    setDraft((current) => ({
      ...current,
      name: current.name || candidate.name,
      garments: selectionForIds(candidate.itemIds, current.garments),
      source: "ai",
      explanation: candidate.explanation || "",
    }));
    setAiCandidates([]);
    setAiOriginal(null);
  };

  const beginRefine = () => {
    if (draft.companions.length) {
      setError(tr("AI outfit improvement is available for one-person outfits for now."));
      return;
    }
    setPendingContext({ ...draft.context, weather: [...draft.context.weather] });
    setContextDialogOpen(true);
  };

  const refineWithAi = async () => {
    const requestDraft = { ...draft, context: pendingContext, draftId: draftId.current };
    setDraft((current) => ({ ...current, context: pendingContext }));
    setContextDialogOpen(false);
    setBusy("refine");
    setError("");
    try {
      const original = { ...requestDraft, garments: requestDraft.garments.map((entry) => ({ ...entry })) };
      const result = await onRefine(requestDraft);
      setAiOriginal(original);
      setAiCandidates(result.candidates || []);
      setActiveAiIndex(0);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };

  const generateName = async () => {
    if (!draft.garments.length) {
      setError(tr("Add at least one garment before asking AI for a name."));
      return;
    }
    setBusy("name");
    setError("");
    try {
      const result = await onGenerateName({ ...draft, draftId: draftId.current });
      setDraft((current) => ({ ...current, name: result.name }));
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

  const beginModeled = () => {
    const undressedPeople = scenePeople.filter((person) => !(garmentCountByPerson.get(person.id) || 0));
    if (undressedPeople.length) {
      setError(tr("Add at least one garment to every person's board before generating."));
      setActivePersonId(undressedPeople[0].id);
      return;
    }
    setModeledDialogOpen(true);
  };

  const generateModeled = async (_variantId, context) => {
    setBusy("generate");
    setError("");
    try {
      const saved = await onSave({ ...draft, name: draft.name || tr("Untitled outfit") });
      const result = await onGenerate(saved.id, context);
      loadOutfit(result.outfit);
      setModeledDialogOpen(false);
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
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

  const reorderSavedOutfits = async (targetId) => {
    if (!draggedOutfitId || draggedOutfitId === targetId) return;
    const ids = savedOutfits.map((outfit) => outfit.id);
    const from = ids.indexOf(draggedOutfitId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDraggedOutfitId(null);
    setBusy("reorder");
    try {
      await onReorder(ids);
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

  const archiveModeledLook = async (lookId) => {
    if (!draft.id || busy) return;
    setBusy("archive-look");
    setError("");
    try {
      const result = await onArchiveLook(draft.id, lookId);
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
  const visibleLook = draft.modeledLooks?.find((look) => look.id === activeLookId) || draft.modeledLooks?.at(-1);
  const slots = Array.from({ length: OUTFIT_MAX_GARMENTS - draft.garments.length });

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      if (pickerOpen) setPickerOpen(false);
      else if (contextDialogOpen) setContextDialogOpen(false);
      else if (modeledDialogOpen) setModeledDialogOpen(false);
      else if (aiCandidates.length) { setAiCandidates([]); setAiOriginal(null); }
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [aiCandidates.length, busy, contextDialogOpen, modeledDialogOpen, onClose, pickerOpen]);

  return (
    <div className="outfit-studio-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="outfit-studio" data-tutorial="outfit-studio" role="dialog" aria-modal="true" aria-labelledby="outfit-studio-title">
        <header className="outfit-studio-header">
          <div>
            <span>{tr("Visual outfit builder")}</span>
            <h2 id="outfit-studio-title">{tr("Outfit Studio")}</h2>
            <p>{tr("Build with your real garments, refine the selection with context, and create a modeled look when you are ready.")}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={Boolean(busy)} aria-label={tr("Close Outfit Studio")}><X size={19} /></button>
        </header>

        <div className={`outfit-studio-layout${savedPinned ? " saved-pinned" : ""}`}>
          <aside className={`outfit-saved-rail${savedPinned ? " is-pinned" : ""}`}>
            <div className="outfit-rail-tools">
              <button type="button" onClick={() => loadOutfit(blankDraft())} aria-label={tr("New outfit")}><Plus /></button>
              <button type="button" className={savedPinned ? "active" : ""} onClick={() => setSavedPinned((value) => !value)} aria-label={savedPinned ? tr("Unpin saved outfits") : tr("Pin saved outfits")}><PushPin /></button>
            </div>
            <div className="outfit-rail-content">
              <div className="outfit-saved-heading"><div><span>{tr("Collection")}</span><h3>{tr("Saved outfits")}</h3></div><button type="button" onClick={() => loadOutfit(blankDraft())}><Plus />{tr("New")}</button></div>
              <div className="outfit-saved-list">
                {savedOutfits.length ? savedOutfits.map((outfit) => {
                  const preview = outfit.modeledLooks?.at(-1);
                  return (
                    <article
                      className={draft.id === outfit.id ? "active" : ""}
                      key={outfit.id}
                      draggable
                      onDragStart={() => setDraggedOutfitId(outfit.id)}
                      onDragEnd={() => setDraggedOutfitId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => reorderSavedOutfits(outfit.id)}
                    >
                      <button type="button" className="outfit-saved-card" onClick={() => loadOutfit(outfit)}>
                        {preview ? <OptimizedImage src={preview.preview || preview.image} alt="" sizes="62px" /> : <span className="outfit-saved-empty" />}
                        <span><strong>{outfit.name}</strong><small>{tr("{count} pieces", { count: outfit.garments.length })}</small></span>
                      </button>
                      <button type="button" className={deleteId === outfit.id ? "confirm-delete" : ""} onClick={() => removeSavedOutfit(outfit.id)} aria-label={deleteId === outfit.id ? tr("Confirm delete") : tr("Delete {name}", { name: outfit.name })}>
                        {busy === "delete" && deleteId === outfit.id ? <SpinnerGap className="spin" /> : deleteId === outfit.id ? <Check /> : <X />}
                      </button>
                    </article>
                  );
                }) : <p>{tr("Your saved outfits will appear here.")}</p>}
              </div>
              <p className="outfit-reorder-note">{tr("Drag saved outfits to reorder them.")}</p>
            </div>
          </aside>

          <main className="outfit-workspace">
            <div className="outfit-name-row">
              <label><span>{tr("Outfit name")}</span><span className="outfit-name-input"><input value={draft.name} maxLength="100" onChange={(event) => changeDraft({ name: event.target.value })} placeholder={tr("Untitled outfit")} /><button type="button" onClick={generateName} disabled={Boolean(busy) || !draft.garments.length} aria-label={tr("Name this outfit with AI")} title={tr("Name this outfit with AI")}>{busy === "name" ? <SpinnerGap className="spin" /> : <Sparkle />}</button></span></label>
              {undoDraft && <button type="button" className="subtle-button" onClick={() => { setDraft(undoDraft); setUndoDraft(null); }}>{tr("Undo last change")}</button>}
              <button type="button" className="outfit-save-button" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? <SpinnerGap className="spin" /> : <FloppyDisk />}{tr("Save outfit")}</button>
            </div>

            <section
              className={`outfit-board${boardGarments.length ? " has-garments" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); addGarment(event.dataTransfer.getData("application/x-wardrobe-garment")); }}
            >
              <div className="outfit-board-tabs" role="tablist" aria-label={tr("Outfit boards")}>
                {scenePeople.map((person) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePerson.id === person.id}
                    className={activePerson.id === person.id ? "active" : ""}
                    onClick={() => { setActivePersonId(person.id); setPickerOpen(false); }}
                    key={person.id}
                  >
                    <span>{person.isMe ? tr("Me") : person.name}</span>
                    <small>{garmentCountByPerson.get(person.id) || 0}</small>
                  </button>
                ))}
                {!!availableBoardConnections.length && (
                  <button type="button" className="add-person" onClick={addNextPersonBoard} aria-label={tr("Add another person board")}>
                    <Plus /><span>{tr("Add person")}</span>
                  </button>
                )}
              </div>
              <div className="outfit-board-heading">
                <span>{tr("Outfit board: {name}", { name: activePerson.isMe ? tr("Me") : activePerson.name })}</span>
                <small>{tr("{count} selected pieces", { count: boardGarments.length })}</small>
              </div>
              <button type="button" className="outfit-board-ai" onClick={beginRefine} disabled={busy === "refine" || !items.length || Boolean(draft.companions.length)} aria-label={tr("Improve outfit selection")}>
                {busy === "refine" ? <SpinnerGap className="spin" /> : <MagicWand />}<span>{tr("Improve outfit selection")}</span>
              </button>
              {!boardGarments.length && <div className="outfit-board-empty"><CoatHanger size={30} /><strong>{tr("Add garments for {name}", { name: activePerson.isMe ? tr("Me") : activePerson.name })}</strong><p>{tr("Only this person's wardrobe appears on the right. Their selected clothes stay on this board.")}</p></div>}
              <div className="outfit-board-grid">
                {boardGarments.map(({ selection, draftIndex }, index) => {
                  const item = itemMap.get(selection.itemId);
                  if (!item) return null;
                  const variants = garmentColorVariants(item);
                  return (
                    <article key={selection.itemId}>
                      <OptimizedImage src={garmentImage(item, selection)} alt={item.name} sizes="160px" />
                      <div><strong>{item.name}</strong><small>{tr(CATEGORY_OPTIONS.find((option) => option.id === item.part)?.label || "Garment")}</small></div>
                      <nav>
                        <button type="button" onClick={() => moveGarment(index, -1)} disabled={!index} aria-label={tr("Move {name} earlier", { name: item.name })}><ArrowUp /></button>
                        <button type="button" onClick={() => moveGarment(index, 1)} disabled={index === boardGarments.length - 1} aria-label={tr("Move {name} later", { name: item.name })}><ArrowDown /></button>
                        {!!variants.length && <button type="button" className={selection.variantId ? "active" : ""} onClick={() => cycleVariant(draftIndex)} aria-label={tr("Change color version for {name}", { name: item.name })}><Palette /></button>}
                        <button type="button" onClick={() => removeGarment(item.id)} aria-label={tr("Remove {name} from outfit", { name: item.name })}><X /></button>
                      </nav>
                    </article>
                  );
                })}
                {slots.map((_, index) => <button type="button" className="outfit-empty-slot" key={`slot-${index}`} onClick={() => setPickerOpen(true)} aria-label={tr("Choose a garment for this slot")}><Plus /></button>)}
              </div>
              {pickerOpen && (
                <div className="outfit-slot-picker">
                  <header><div><span>{tr("Wardrobe")}</span><strong>{tr("Choose a garment")}</strong></div><button type="button" onClick={() => setPickerOpen(false)} aria-label={tr("Close")}><X /></button></header>
                  <label className="outfit-search"><MagnifyingGlass /><input autoFocus value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder={tr("Search by garment name")} /></label>
                  <div>{pickerItems.map((item) => <button type="button" key={item.id} onClick={() => addGarment(item.id)}><OptimizedImage src={item.thumbnail || item.imagePreview || item.image} alt="" sizes="92px" /><span>{item.name}</span></button>)}</div>
                  {!pickerItems.length && <p>{tr("No matching garments.")}</p>}
                </div>
              )}
            </section>

            <details className="outfit-context-panel">
              <summary><div><span>{tr("Context")}</span><h3>{tr("What are you dressing for?")}</h3></div><div><small>{draft.context.occasion ? tr(OUTFIT_OCCASIONS.find((option) => option.id === draft.context.occasion)?.label || "") : tr("Add context")}</small><CaretDown /></div></summary>
              <div className="outfit-context-body">
                <button type="button" className={draft.context.season === currentNorthernSeason() ? "active" : ""} onClick={() => changeDraft({ context: { ...draft.context, season: currentNorthernSeason() } })}>{tr("Current season: {season}", { season: tr(currentNorthernSeason()[0].toUpperCase() + currentNorthernSeason().slice(1)) })}</button>
                <ContextControls context={draft.context} onChange={(context) => changeDraft({ context })} />
                <p>{tr("This context guides AI outfit improvement, AI naming, and the modeled scene.")}</p>
              </div>
            </details>

            <section className="outfit-presentation">
              <div className="outfit-section-heading"><div><span>{tr("Modeled look")}</span><h3>{tr("See the outfit worn")}</h3></div><button type="button" className="outfit-generate-button" onClick={beginModeled} disabled={Boolean(busy) || !draft.garments.length}>{busy === "generate" ? <SpinnerGap className="spin" /> : <Sparkle />}{tr(busy === "generate" ? "Creating look…" : "Create this look")}</button></div>
              <p className="outfit-presentation-note">{tr("Image direction stays hidden until you choose to generate.")}</p>
              {visibleLook && (
                <div className="outfit-modeled-gallery">
                  <div className="outfit-modeled-stage">
                    <OptimizedImage src={visibleLook.preview || visibleLook.image} alt={draft.name} sizes="720px" />
                    <button type="button" onClick={() => archiveModeledLook(visibleLook.id)} disabled={Boolean(busy)} title={tr("Move this photo to the Vault")}>
                      {busy === "archive-look" ? <SpinnerGap className="spin" /> : <EyeSlash />}{tr("Move to Vault")}
                    </button>
                  </div>
                  <div>{draft.modeledLooks.map((look) => <span className={look.id === visibleLook.id ? "active" : ""} key={look.id}><button type="button" className="outfit-look-preview" onClick={() => setActiveLookId(look.id)} aria-label={tr("Show this modeled look")}><OptimizedImage src={look.preview || look.image} alt="" sizes="88px" /></button><button type="button" className={deleteLookId === look.id ? "confirm-delete" : ""} onClick={() => removeModeledLook(look.id)} aria-label={deleteLookId === look.id ? tr("Confirm delete") : tr("Delete modeled look")}>{deleteLookId === look.id ? <Check /> : <Trash />}</button></span>)}</div>
                </div>
              )}
            </section>
            {draft.explanation && <p className="outfit-explanation">{draft.explanation}</p>}
            {error && <p className="outfit-error" role="alert">{error}</p>}
          </main>

          <aside className="outfit-library">
            <div className="outfit-people-heading"><span>{tr("People in this scene")}</span><small>{tr("Your account is always included")}</small></div>
            <div className="outfit-people-list">
              <button type="button" className={`active${activePersonId === user.id ? " is-current-board" : ""}`} aria-pressed="true" onClick={() => { setActivePersonId(user.id); setPickerOpen(false); }}><span className="outfit-person-avatar">{user.referenceImages?.[0] ? <img src={user.referenceImages[0].avatarUrl || user.referenceImages[0].url} alt="" /> : user.name?.[0]}</span><span><strong>{tr("Me")}</strong><small>{user.name}</small></span><Check /></button>
              {connections.map((connection) => {
                const active = draft.companions.includes(connection.person.id);
                const reference = connection.person.referenceImages?.[0];
                const unavailable = !connection.person.referenceCount || !connection.permissions.garments;
                return <button type="button" className={`${active ? "active" : ""}${activePersonId === connection.person.id ? " is-current-board" : ""}`} aria-pressed={active} disabled={!active && unavailable} onClick={() => toggleCompanion(connection.person.id)} key={connection.person.id}><span className="outfit-person-avatar">{reference ? <img src={reference.avatarUrl} alt="" /> : connection.person.name?.[0]}</span><span><strong>{connection.person.name}</strong><small>{!connection.person.referenceCount ? tr("Needs a reference photo") : !connection.permissions.garments ? tr("Does not share garments") : connection.relationship}</small></span>{active ? <Check /> : <Plus />}</button>;
              })}
            </div>

            <div className="outfit-wardrobe-heading">
              <h3>{tr("Choose clothes for {name}", { name: activePerson.isMe ? tr("Me") : activePerson.name })}</h3>
              <small>{tr("{count} selected pieces", { count: boardGarments.length })}</small>
            </div>
            <label className="outfit-search"><MagnifyingGlass /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("Search garments")} /></label>
            <div className="outfit-category-tabs">{CATEGORY_OPTIONS.map((option) => <button type="button" className={category === option.id ? "active" : ""} key={option.id} onClick={() => setCategory(option.id)}>{tr(option.label)}</button>)}</div>
            <div className="outfit-library-grid">{filteredItems.map((item) => <button type="button" className={selectedIds.has(item.id) ? "selected" : ""} key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-wardrobe-garment", item.id)} onClick={() => addGarment(item.id)} disabled={selectedIds.has(item.id)}><OptimizedImage src={item.thumbnail || item.imagePreview || item.image} alt="" sizes="110px" /><span>{item.name}</span>{selectedIds.has(item.id) ? <Check /> : <Plus />}</button>)}</div>
            {!filteredItems.length && <p className="outfit-library-empty">{tr("No matching garments in this wardrobe.")}</p>}
          </aside>
        </div>

        {contextDialogOpen && <StudioDialog title={tr("Improve outfit selection")} eyebrow={tr("AI context")} onCancel={() => setContextDialogOpen(false)} actions={<><button type="button" onClick={() => setContextDialogOpen(false)}>{tr("Cancel")}</button><button type="button" className="primary" onClick={refineWithAi}><MagicWand />{tr("Continue with AI")}</button></>}><p>{tr("Confirm what you are dressing for. AI may keep, add, remove, or replace garments, and you will review its options before anything changes.")}</p><ContextControls context={pendingContext} onChange={setPendingContext} /></StudioDialog>}

        {!!aiCandidates.length && activeAi && <StudioDialog title={tr("Choose an improved outfit")} eyebrow={tr("AI suggestions")} onCancel={() => { setAiCandidates([]); setAiOriginal(null); }} actions={<><button type="button" onClick={() => { setAiCandidates([]); setAiOriginal(null); }}>{tr("Keep mine")}</button><button type="button" className="primary" onClick={() => applyCandidate(activeAi)}><Check />{tr("Use this outfit")}</button></>}><div className="outfit-ai-tabs">{aiCandidates.map((candidate, index) => <button type="button" className={activeAiIndex === index ? "active" : ""} key={candidate.id || index} onClick={() => setActiveAiIndex(index)}>{tr("Option {number}", { number: index + 1 })}</button>)}</div><div className="outfit-comparison-boards"><article><span>{tr("Your outfit")}</span><h4>{aiOriginal?.name || tr("Current board")}</h4><div>{(aiOriginal?.garments || []).map((selection) => <MiniGarment key={selection.itemId} item={itemMap.get(selection.itemId)} selection={selection} changed={!candidateIds.has(selection.itemId)} removed={!candidateIds.has(selection.itemId)} />)}</div></article><article className="ai-option"><span><Sparkle />{tr("AI option")}</span><h4>{activeAi.name}</h4><div>{activeAi.itemIds.map((id) => <MiniGarment key={id} item={itemMap.get(id)} changed={!originalIds.has(id)} />)}</div><p>{activeAi.explanation}</p></article></div></StudioDialog>}

        {modeledDialogOpen && (
          <ModeledLookDialog
            itemName={draft.name || tr("Untitled outfit")}
            backgroundReferences={user.backgroundReferences || []}
            people={scenePeople.map((person) => ({
              id: person.id,
              name: person.isMe ? tr("Me") : person.name,
              referenceImage: person.profile.referenceImages?.[0]?.avatarUrl || person.profile.referenceImages?.[0]?.url,
              detail: tr("{count} selected pieces", { count: garmentCountByPerson.get(person.id) || 0 }),
            }))}
            eyebrow="Paid AI image"
            busy={busy === "generate"}
            onClose={() => setModeledDialogOpen(false)}
            onGenerate={generateModeled}
          />
        )}
      </section>
    </div>
  );
}
