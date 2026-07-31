import {
  Aperture,
  Armchair,
  ArrowDown,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Buildings,
  Bed,
  BookOpen,
  Camera,
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Confetti,
  Coffee,
  Eye,
  FilmSlate,
  ForkKnife,
  Heart,
  House,
  ImageSquare,
  Lightbulb,
  Mountains,
  Moon,
  PersonSimple,
  PersonSimpleRun,
  PersonSimpleTaiChi,
  PersonSimpleWalk,
  Scissors,
  Smiley,
  SmileyMeh,
  SmileySad,
  SmileyWink,
  Sparkle,
  SpinnerGap,
  Sun,
  Tree,
  UserFocus,
  Wind,
  Waves,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { tr } from "./i18n.js";
import {
  EMPTY_MODELED_LOOK_CONTEXT,
  MODELED_LOOK_CONTEXT_OPTIONS,
} from "./modeled-look-context.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import "./modeled-look-dialog.css";

const OPTION_ICONS = {
  editorial: Aperture,
  candid: Camera,
  "street-style": Buildings,
  cinematic: FilmSlate,
  minimal: ImageSquare,
  standing: PersonSimple,
  walking: PersonSimpleWalk,
  running: PersonSimpleRun,
  jumping: PersonSimpleTaiChi,
  sitting: Armchair,
  lying: Moon,
  crouching: PersonSimpleTaiChi,
  "stairs-up": ArrowUp,
  "stairs-down": ArrowDown,
  "long-loose": Scissors,
  "shoulder-length": Scissors,
  short: Scissors,
  ponytail: Scissors,
  bun: Scissors,
  braid: Scissors,
  updo: Scissors,
  front: ArrowUp,
  "three-quarter": ArrowUpRight,
  side: ArrowRight,
  back: ArrowDown,
  camera: Eye,
  forward: ArrowUp,
  right: ArrowRight,
  left: ArrowLeft,
  down: ArrowDownRight,
  up: ArrowUpRight,
  "over-shoulder": UserFocus,
  inside: House,
  outside: Tree,
  "living-room": Armchair,
  fireplace: House,
  bedroom: Bed,
  kitchen: House,
  office: Buildings,
  restaurant: ForkKnife,
  "movie-theater": FilmSlate,
  cafe: Coffee,
  gallery: ImageSquare,
  "hotel-lobby": Buildings,
  library: BookOpen,
  park: Tree,
  "grass-park": Tree,
  forest: Tree,
  city: Buildings,
  mountain: Mountains,
  beach: Waves,
  garden: Tree,
  lakeside: Waves,
  countryside: Tree,
  rooftop: Buildings,
  "old-town": Buildings,
  promenade: Waves,
  sunny: Sun,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  "light-rain": CloudRain,
  "heavy-rain": CloudRain,
  thunderstorm: CloudLightning,
  snowing: CloudSnow,
  foggy: CloudFog,
  windy: Wind,
  neutral: SmileyMeh,
  smiling: Smiley,
  smirking: SmileyWink,
  flirty: Heart,
  sad: SmileySad,
  rejoicing: Confetti,
  yawning: Moon,
  surprised: Sparkle,
  thoughtful: Lightbulb,
  serious: UserFocus,
};

function ChoiceGroup({ label, options, value, onChange, visual = false }) {
  return (
    <fieldset className="modeled-context__group">
      <legend>{tr(label)}</legend>
      <div className={`modeled-context__choices${visual ? " is-visual" : ""}`}>
        {options.map((option) => {
          const Icon = OPTION_ICONS[option.id];
          return (
          <button
            key={option.id}
            type="button"
            className={`${value === option.id ? "is-selected " : ""}modeled-choice--${option.id}`}
            aria-pressed={value === option.id}
            onClick={() => onChange(value === option.id ? "" : option.id)}
          >
            {value === option.id && <Check className="modeled-context__selected-check" size={12} weight="bold" aria-hidden="true" />}
            {Icon && <Icon className="modeled-context__choice-icon" size={visual ? 22 : 14} weight="light" aria-hidden="true" />}
            <span>{tr(option.label)}{visual && option.description && <small>{tr(option.description)}</small>}</span>
          </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ModeledLookDialog({
  itemName,
  garmentName = itemName,
  colorVersions = [],
  backgroundReferences = [],
  people = [],
  eyebrow = "Create a style look",
  busy,
  onClose,
  onGenerate,
}) {
  const closeButtonRef = useRef(null);
  const [variantId, setVariantId] = useState(() => colorVersions[0]?.id || null);
  const [context, setContext] = useState(() => ({
    ...EMPTY_MODELED_LOOK_CONTEXT,
    people: people.map((person) => ({
      personId: person.id,
      pose: "",
      hairstyle: "",
      bodyOrientation: "",
      headOrientation: "",
      expression: "",
      additionalDirection: "",
    })),
  }));
  const [error, setError] = useState("");
  const settingOptions = context.environmentType === "inside"
    ? MODELED_LOOK_CONTEXT_OPTIONS.insideSetting
    : context.environmentType === "outside"
      ? MODELED_LOOK_CONTEXT_OPTIONS.outsideSetting
      : [];

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const update = (field, value) => {
    setContext((current) => ({
      ...current,
      [field]: value,
      ...(field === "environmentType" ? { setting: "" } : {}),
    }));
  };

  const updatePerson = (personId, field, value) => {
    setContext((current) => ({
      ...current,
      people: current.people.map((person) => person.personId === personId
        ? { ...person, [field]: value }
        : person),
    }));
  };

  const submit = async () => {
    setError("");
    try {
      await onGenerate(variantId, context);
    } catch (requestError) {
      setError(requestError?.message || tr("Could not create the style look"));
    }
  };

  return (
    <div
      className="modeled-context-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <section className="modeled-context" role="dialog" aria-modal="true" aria-labelledby="modeled-context-title">
        <header>
          <div>
            <p>{tr(eyebrow)}</p>
            <h2 id="modeled-context-title">{tr("Direct the new photo")}</h2>
            <span>{tr("Choose only what matters. Leave everything blank for a freely composed image.")}</span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} aria-label={tr("Close style look options")}>
            <X size={21} aria-hidden="true" />
          </button>
        </header>

        <div className="modeled-context__body">
          {colorVersions.length > 1 && (
            <fieldset className="modeled-context__group modeled-context__versions">
              <legend>{tr("Garment version")}</legend>
              <div className="modeled-context__version-list">
                {colorVersions.map((version, index) => {
                  const selected = (version.id || null) === variantId;
                  return (
                    <button
                      key={version.id || "original"}
                      type="button"
                      className={selected ? "is-selected" : ""}
                      aria-pressed={selected}
                      onClick={() => setVariantId(version.id || null)}
                    >
                      <OptimizedImage src={version.thumbnail || version.preview || version.image} alt="" sizes="64px" />
                      <span>{tr(version.original ? "Original" : "Color version {number}", { number: index })}</span>
                      {selected && <Check size={13} weight="bold" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <details className="modeled-context__section" open>
            <summary><span>{tr("Model")}</span><small>{tr("Pose, orientation, hair, and expression")}</small></summary>
            <div className="modeled-context__section-body">
            {!people.length ? (
              <div className="modeled-context__columns">
                <div>
                  <ChoiceGroup label="Pose" options={MODELED_LOOK_CONTEXT_OPTIONS.pose} value={context.pose} onChange={(value) => update("pose", value)} />
                  <ChoiceGroup label="Hairstyle" options={MODELED_LOOK_CONTEXT_OPTIONS.hairstyle} value={context.hairstyle} onChange={(value) => update("hairstyle", value)} />
                  <ChoiceGroup label="Expression" options={MODELED_LOOK_CONTEXT_OPTIONS.expression} value={context.expression} onChange={(value) => update("expression", value)} />
                </div>
                <div>
                  <ChoiceGroup label="Body orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.bodyOrientation} value={context.bodyOrientation} onChange={(value) => update("bodyOrientation", value)} />
                  <ChoiceGroup label="Head orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.headOrientation} value={context.headOrientation} onChange={(value) => update("headOrientation", value)} />
                </div>
              </div>
            ) : (
              <section className="modeled-context__people">
                <div className="modeled-context__people-heading">
                  <span>{tr("People in this image")}</span>
                  <small>{tr("Direct each person separately while sharing one scene.")}</small>
                </div>
                {people.map((person) => {
                  const direction = context.people.find((entry) => entry.personId === person.id);
                  if (!direction) return null;
                  return (
                    <article key={person.id}>
                      <header>
                        <span className="modeled-context__person-avatar">
                          {person.referenceImage
                            ? <OptimizedImage src={person.referenceImage} alt="" sizes="44px" />
                            : <ImageSquare size={18} aria-hidden="true" />}
                        </span>
                        <div><strong>{person.name}</strong>{person.detail && <small>{person.detail}</small>}</div>
                      </header>
                      <div className="modeled-context__person-grid">
                        <ChoiceGroup label="Pose" options={MODELED_LOOK_CONTEXT_OPTIONS.pose} value={direction.pose} onChange={(value) => updatePerson(person.id, "pose", value)} />
                        <ChoiceGroup label="Hairstyle" options={MODELED_LOOK_CONTEXT_OPTIONS.hairstyle} value={direction.hairstyle} onChange={(value) => updatePerson(person.id, "hairstyle", value)} />
                        <ChoiceGroup label="Body orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.bodyOrientation} value={direction.bodyOrientation} onChange={(value) => updatePerson(person.id, "bodyOrientation", value)} />
                        <ChoiceGroup label="Head orientation" options={MODELED_LOOK_CONTEXT_OPTIONS.headOrientation} value={direction.headOrientation} onChange={(value) => updatePerson(person.id, "headOrientation", value)} />
                        <ChoiceGroup label="Expression" options={MODELED_LOOK_CONTEXT_OPTIONS.expression} value={direction.expression} onChange={(value) => updatePerson(person.id, "expression", value)} />
                      </div>
                      <label className="modeled-context__additional modeled-context__person-direction">
                        <span>{tr("Direction for {name}", { name: person.name })}</span>
                        <textarea value={direction.additionalDirection} maxLength={400} rows={2} placeholder={tr("Add a gesture, interaction, or other personal direction…")} onChange={(event) => updatePerson(person.id, "additionalDirection", event.target.value)} />
                      </label>
                    </article>
                  );
                })}
              </section>
            )}
            </div>
          </details>

          <details className="modeled-context__section" open>
            <summary><span>{tr("Scene")}</span><small>{tr("Place, room, weather, and atmosphere")}</small></summary>
            <div className="modeled-context__section-body">
            <div className="modeled-context__columns">
              <div>
              <ChoiceGroup label="Environment" options={MODELED_LOOK_CONTEXT_OPTIONS.environmentType} value={context.environmentType} onChange={(value) => update("environmentType", value)} />
              {settingOptions.length > 0 && (
                <ChoiceGroup
                  label={context.environmentType === "inside" ? "Interior setting" : "Open-air setting"}
                  options={settingOptions}
                  value={context.setting}
                  onChange={(value) => update("setting", value)}
                />
              )}
              <ChoiceGroup label="Weather" options={MODELED_LOOK_CONTEXT_OPTIONS.weather} value={context.weather} onChange={(value) => update("weather", value)} />
              </div>
            </div>

            {!!backgroundReferences.length && (
            <fieldset className="modeled-context__group modeled-context__backgrounds">
              <legend>{tr("Saved background")}</legend>
              <p>{tr("Use one of your own places as the scene reference. The people and garments will be composed naturally into it.")}</p>
              <div className="modeled-context__background-list">
                {backgroundReferences.map((reference) => {
                  const selected = context.backgroundReferenceId === reference.id;
                  return (
                    <button
                      key={reference.id}
                      type="button"
                      className={selected ? "is-selected" : ""}
                      aria-pressed={selected}
                      onClick={() => update("backgroundReferenceId", selected ? "" : reference.id)}
                    >
                      <OptimizedImage src={reference.previewUrl || reference.url} alt="" sizes="160px" />
                      <span>{reference.name}</span>
                      {selected && <Check size={13} weight="bold" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            )}
            </div>
          </details>

          <details className="modeled-context__section" open>
            <summary><span>{tr("Photography & composition")}</span><small>{tr("Visual style and any final direction")}</small></summary>
            <div className="modeled-context__section-body">
              <ChoiceGroup visual label="Style" options={MODELED_LOOK_CONTEXT_OPTIONS.photographicStyle} value={context.photographicStyle} onChange={(value) => update("photographicStyle", value)} />
              <label className="modeled-context__additional">
                <span>{tr("More direction")}</span>
                <textarea value={context.additionalDirection} maxLength={800} rows={3} placeholder={tr("Add any other detail for this photo…")} onChange={(event) => update("additionalDirection", event.target.value)} />
                <small>{tr("Optional · {count}/800", { count: context.additionalDirection.length })}</small>
              </label>
            </div>
          </details>
        </div>

        <footer>
          <div>
            <strong>{garmentName}</strong>
            <span>{tr("Selections apply only to this new image.")}</span>
          </div>
          {error && <p className="modeled-context__error" role="alert">{error}</p>}
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>{tr("Cancel")}</button>
          <button className="primary-button" type="button" onClick={submit} disabled={busy}>
            {busy ? <SpinnerGap className="modeled-context__spinner" size={16} aria-hidden="true" /> : <Sparkle size={16} weight="fill" aria-hidden="true" />}
            {tr(busy ? "Creating style look…" : "Create look")}
          </button>
        </footer>
      </section>
    </div>
  );
}
