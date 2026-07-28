import { useLayoutEffect, useState } from "react";
import { Check, CoatHanger, ImageSquare, Sparkle, SuitcaseRolling, UserCircle, X } from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import { TUTORIAL_STEPS } from "./tutorial.js";
import "./tutorial-walkthrough.css";

const STEP_TARGETS = {
  profile: ['[data-tutorial="profile-name"]'],
  upload: [
    '[data-tutorial="import-review"]',
    '[data-tutorial="import-analysis"]',
    '[data-tutorial="import-source"]',
    '[data-tutorial="import-add"]',
  ],
  garment: ['[data-tutorial="garment-card"]'],
  panel: ['[data-tutorial="garment-panel"]'],
  explore: ['[data-tutorial="wardrobe-tools"]'],
  finish: ['[data-tutorial="planner-dialog"]', '[data-tutorial="outfit-studio"]'],
};

const STEP_ICONS = {
  profile: UserCircle,
  upload: ImageSquare,
  garment: CoatHanger,
  panel: CoatHanger,
  explore: Sparkle,
  finish: Check,
};

function targetForStep(step) {
  for (const selector of STEP_TARGETS[step] || []) {
    const candidate = document.querySelector(selector);
    if (candidate instanceof HTMLElement) return candidate;
  }
  return null;
}

function copyForStep(step, name, targetKind) {
  if (step === "profile") return {
    eyebrow: tr("A wardrobe that knows you"),
    title: tr("Hello, {name}", { name: name || tr("there") }),
    body: tr("Confirm the name you would like Wardrobe to use. You can also add your city, age, language, and reference photos now or return to them later."),
    hint: tr("Save your profile to continue the tutorial."),
  };
  if (step === "upload") {
    if (targetKind === "import-analysis") return {
      eyebrow: tr("Your first import"),
      title: tr("Wardrobe is finding the garments"),
      body: tr("The AI is identifying every distinct piece and preparing editable crops. Nothing is added to your wardrobe until you review and approve it."),
      hint: tr("Keep this window open while the analysis finishes."),
    };
    if (targetKind === "import-review") return {
      eyebrow: tr("Your first import"),
      title: tr("Check what Wardrobe found"),
      body: tr("Select each detected garment, check that its crop and details describe the right piece, then approve it. Reject anything that is not a garment you want to keep."),
      hint: tr("Continue after at least one garment has been approved."),
    };
    return {
      eyebrow: tr("Your first import"),
      title: tr("Add a clothing photo"),
      body: tr("Use a clear garment photo or a photo of a complete outfit. You can load a file, drag it here, paste it, or use the camera."),
      hint: tr("This step is required while your wardrobe is empty."),
    };
  }
  if (step === "garment") return {
    eyebrow: tr("Your wardrobe"),
    title: tr("Select a garment"),
    body: tr("Choose any garment card to open it. This is how you inspect a piece, edit its details, view source photos, and create color or modeled versions."),
    hint: tr("Select a garment to continue."),
  };
  if (step === "panel") return {
    eyebrow: tr("Garment details"),
    title: tr("This is the garment panel"),
    body: tr("The full garment stays visible here while you edit its name, colors, purchase details, materials, seasons, care instructions, original photos, and modeled looks."),
    hint: tr("You can return to this panel by selecting any garment."),
  };
  if (step === "explore") return {
    eyebrow: tr("Build with your wardrobe"),
    title: tr("What would you like to explore?"),
    body: tr("Plan packs real garments for a trip or event. Outfit Studio lets you combine pieces visually and create a modeled scene."),
    hint: tr("Open either tool to finish the walkthrough."),
  };
  return {
    eyebrow: tr("You are ready"),
    title: targetKind === "planner-dialog" ? tr("Plan a trip or event") : tr("Build a visual outfit"),
    body: targetKind === "planner-dialog"
      ? tr("Add a destination, dates, and dress code. Wardrobe uses your saved clothes and preferences to suggest what to pack and wear.")
      : tr("Add garments to the board, include context such as weather or occasion, and generate a modeled look only when you choose to."),
    hint: tr("You can restart this walkthrough from Personal preferences at any time."),
  };
}

export function TutorialWalkthrough({
  step,
  userName,
  garmentCount,
  hasSelectedGarment,
  onAdvance,
  onCancel,
  onOpenProfile,
  onOpenImporter,
  onOpenPlanner,
  onOpenOutfitStudio,
  onFinish,
}) {
  const [targetState, setTargetState] = useState({ rect: null, kind: "" });
  const stepIndex = Math.max(0, TUTORIAL_STEPS.indexOf(step));
  const Icon = STEP_ICONS[step] || Sparkle;

  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = targetForStep(step);
        if (!target) {
          setTargetState({ rect: null, kind: "" });
          return;
        }
        const bounds = target.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > window.innerHeight) target.scrollIntoView({ block: "center", behavior: "smooth" });
        setTargetState({
          rect: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom },
          kind: target.dataset.tutorial || "",
        });
      });
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tutorial", "data-open", "class"] });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [garmentCount, hasSelectedGarment, step]);

  const copy = copyForStep(step, userName, targetState.kind);
  const rect = targetState.rect;
  const cardWidth = Math.min(360, window.innerWidth - 28);
  const left = rect
    ? rect.right + 18 + cardWidth < window.innerWidth
      ? rect.right + 18
      : rect.left - cardWidth - 18 > 0
        ? rect.left - cardWidth - 18
        : Math.max(14, Math.min(window.innerWidth - cardWidth - 14, rect.left))
    : Math.max(14, (window.innerWidth - cardWidth) / 2);
  const top = rect
    ? Math.max(14, Math.min(window.innerHeight - 360, rect.top))
    : Math.max(14, (window.innerHeight - 330) / 2);
  const canLeaveUpload = garmentCount > 0;

  return (
    <div className="tutorial-layer" aria-live="polite">
      {rect && <div className="tutorial-spotlight" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <aside className="tutorial-card" role="dialog" aria-label={tr("Wardrobe walkthrough")} style={{ left, top, width: cardWidth }}>
        <header>
          <span className="tutorial-card__icon"><Icon /></span>
          <div><small>{copy.eyebrow}</small><strong>{tr("Step {current} of {total}", { current: stepIndex + 1, total: TUTORIAL_STEPS.length })}</strong></div>
          <button type="button" onClick={onCancel} aria-label={tr("Cancel walkthrough")} title={tr("Cancel walkthrough")}><X /></button>
        </header>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <span className="tutorial-card__hint">{copy.hint}</span>
        <footer>
          {step === "profile" && (
            <>
              {!rect && <button type="button" onClick={onOpenProfile}>{tr("Open personal preferences")}</button>}
              <button type="button" className="tutorial-link" onClick={() => onAdvance("upload")}>{tr("Skip this step")}</button>
            </>
          )}
          {step === "upload" && (
            <>
              {!['import-source', 'import-analysis', 'import-review'].includes(targetState.kind) && <button type="button" onClick={onOpenImporter}>{tr("Open importer")}</button>}
              {canLeaveUpload && <button type="button" className="primary" onClick={() => onAdvance("garment")}>{tr("Continue")}</button>}
            </>
          )}
          {step === "garment" && (
            <>
              <button type="button" className="tutorial-link" onClick={() => onAdvance("panel")}>{tr("Skip this step")}</button>
              <button type="button" className="primary" disabled={!hasSelectedGarment} onClick={() => onAdvance("panel")}>{tr("Continue")}</button>
            </>
          )}
          {step === "panel" && <button type="button" className="primary" onClick={() => onAdvance("explore")}>{tr("Continue")}</button>}
          {step === "explore" && (
            <>
              <button type="button" onClick={onOpenPlanner}><SuitcaseRolling />{tr("Open Plan")}</button>
              <button type="button" className="primary" onClick={onOpenOutfitStudio}><Sparkle />{tr("Open Outfit Studio")}</button>
            </>
          )}
          {step === "finish" && <button type="button" className="primary" onClick={onFinish}><Check />{tr("Finish walkthrough")}</button>}
        </footer>
      </aside>
    </div>
  );
}
