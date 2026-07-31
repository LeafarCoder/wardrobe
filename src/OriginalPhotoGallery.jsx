import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CoatHanger, ImageSquare, Sparkle, SuitcaseRolling, X } from "@phosphor-icons/react";
import { formatDate, tr } from "./i18n.js";
import { modeledLookContextDetails } from "./modeled-look-context.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import "./original-photo-gallery.css";

function garmentCountLabel(count) {
  return tr(count === 1 ? "{count} garment" : "{count} garments", { count });
}

function garmentVersionLabel(value) {
  const colorVersion = /^Color version (\d+) of (\d+)$/.exec(value || "");
  if (colorVersion) return tr("Color version {current} of {total}", { current: colorVersion[1], total: colorVersion[2] });
  const originalVersion = /^Original version · 1 of (\d+)$/.exec(value || "");
  if (originalVersion) return tr("Original version · 1 of {total}", { total: originalVersion[1] });
  return tr(value || "");
}

const GENERATED_SOURCES = {
  "outfit-studio": { label: "Outfit Studio", icon: Sparkle },
  planner: { label: "Planner", icon: SuitcaseRolling },
  garment: { label: "Garment modeled look", icon: CoatHanger },
};

function GeneratedSourceTag({ source }) {
  const config = GENERATED_SOURCES[source] || GENERATED_SOURCES.garment;
  const Icon = config.icon;
  return <span className={`generated-photo-source is-${source}`}><Icon size={12} weight="fill" aria-hidden="true" />{tr(config.label)}</span>;
}

function GarmentList({ garments, onOpenGarment, heading = "Garments used" }) {
  if (!garments?.length) return null;
  return (
    <section className="image-library-detail-section">
      <p>{tr(heading)}</p>
      <div className="original-photo-library__garments">
        {garments.map((garment) => (
          <button type="button" key={garment.itemId || garment.id} onClick={() => onOpenGarment(garment.itemId || garment.id)}>
            <span className="original-photo-library__garment-image">
              {garment.thumbnail || garment.preview || garment.image
                ? <OptimizedImage src={garment.thumbnail || garment.preview || garment.image} alt="" sizes="72px" breakpoints={[72, 120, 160]} />
                : <CoatHanger size={22} weight="light" aria-hidden="true" />}
            </span>
            <span>
              <strong>{garment.name || tr("Wardrobe item")}</strong>
              {(garment.version || garment.brand) && <small>{garment.version ? garmentVersionLabel(garment.version) : garment.brand}</small>}
              {garment.wearerName && <small>{tr("Worn by {name}", { name: garment.wearerName })}</small>}
            </span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function OriginalPhotoPanel({ photo, onOpenGarment }) {
  return (
    <>
      <div className="original-photo-library__selected-photo">
        <OptimizedImage src={photo.preview || photo.image} alt="" sizes="340px" breakpoints={[240, 320, 480]} />
      </div>
      <div className="original-photo-library__panel-heading">
        <p>{tr("Connected garments")}</p>
        <h3>{garmentCountLabel(photo.garments.length)}</h3>
        <span>{tr("Every garment below originated from this photo or was later connected through a merge.")}</span>
      </div>
      <GarmentList garments={photo.garments} onOpenGarment={onOpenGarment} heading="Garments from this photo" />
    </>
  );
}

function GeneratedPhotoPanel({ photo, onOpenGarment }) {
  const contextDetails = modeledLookContextDetails(photo.context);
  return (
    <>
      <div className="original-photo-library__selected-photo generated-photo-detail__image">
        <OptimizedImage src={photo.preview || photo.image} alt="" sizes="340px" breakpoints={[240, 320, 480]} />
      </div>
      <div className="original-photo-library__panel-heading generated-photo-detail__heading">
        <GeneratedSourceTag source={photo.source} />
        <h3>{photo.title}</h3>
        {photo.generatedAt && <span>{tr("Generated {date}", { date: formatDate(photo.generatedAt, { dateStyle: "medium", timeStyle: "short" }) })}</span>}
      </div>
      <GarmentList garments={photo.garments} onOpenGarment={onOpenGarment} />
      {!!photo.details?.length && (
        <section className="image-library-detail-section generated-photo-details">
          <p>{tr(photo.source === "planner" ? "Plan and weather" : "Saved settings")}</p>
          <dl>
            {photo.details.map((entry) => <div key={`${entry.label}-${entry.value}`}><dt>{tr(entry.label)}</dt><dd>{tr(entry.value)}</dd></div>)}
          </dl>
        </section>
      )}
      {!!contextDetails.length && (
        <section className="image-library-detail-section generated-photo-details">
          <p>{tr("Image direction")}</p>
          <dl>
            {contextDetails.map((entry) => (
              <div key={entry.id}>
                <dt>{tr(entry.label)}</dt>
                <dd>{entry.values.map((value) => entry.translateValues ? tr(value) : value).join(", ")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {(photo.model || photo.fallbackUsed) && (
        <section className="image-library-detail-section generated-photo-details is-technical">
          <p>{tr("Generation")}</p>
          <dl>
            {photo.model && <div><dt>{tr("Model")}</dt><dd>{photo.model}</dd></div>}
            {photo.fallbackUsed && <div><dt>{tr("Routing")}</dt><dd>{tr("Fallback model used")}</dd></div>}
          </dl>
        </section>
      )}
    </>
  );
}

export function OriginalPhotoGallery({ photos, generatedPhotos = [], selectedId, onSelect, onOpenGarment, onClose }) {
  const [activeTab, setActiveTab] = useState("originals");
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const visiblePhotos = activeTab === "originals" ? photos : generatedPhotos;
  const selectedPhoto = useMemo(
    () => visiblePhotos.find((photo) => photo.id === selectedId) || null,
    [selectedId, visiblePhotos],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!selectedId || !window.matchMedia("(max-width: 760px)").matches) return;
    panelRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [selectedId]);

  const chooseTab = (tab) => {
    setActiveTab(tab);
    onSelect(null);
  };

  return (
    <div className="original-photo-library-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="original-photo-library" role="dialog" aria-modal="true" aria-labelledby="original-photo-library-title">
        <header className="original-photo-library__header">
          <div>
            <p>{tr("Image library")}</p>
            <h2 id="original-photo-library-title">{tr("Originals and generated photos")}</h2>
            <span>{tr("Browse source photos and every modeled image created in Wardrobe.")}</span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={tr("Close image library")}><X size={20} aria-hidden="true" /></button>
        </header>

        <nav className="image-library-tabs" role="tablist" aria-label={tr("Image type")}>
          <button type="button" role="tab" aria-selected={activeTab === "originals"} className={activeTab === "originals" ? "active" : ""} onClick={() => chooseTab("originals")}>
            <ImageSquare size={15} aria-hidden="true" />{tr("Original photos")}<span>{photos.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "generated"} className={activeTab === "generated" ? "active" : ""} onClick={() => chooseTab("generated")}>
            <Sparkle size={15} weight="fill" aria-hidden="true" />{tr("Generated photos")}<span>{generatedPhotos.length}</span>
          </button>
        </nav>

        <div className={`original-photo-library__body${selectedPhoto ? " has-selection" : ""}`}>
          <div className="original-photo-library__collection">
            {!visiblePhotos.length ? (
              <div className="original-photo-library__empty">
                {activeTab === "originals" ? <ImageSquare size={34} weight="light" aria-hidden="true" /> : <Sparkle size={34} weight="light" aria-hidden="true" />}
                <h3>{tr(activeTab === "originals" ? "No original photos yet" : "No generated photos yet")}</h3>
                <p>{tr(activeTab === "originals" ? "Photos used to import garments will appear here." : "Modeled looks from garments, Outfit Studio, and Planner will appear here.")}</p>
              </div>
            ) : (
              <div className="original-photo-library__grid" role="tabpanel" aria-label={tr(activeTab === "originals" ? "Original photo gallery" : "Generated photo gallery")}>
                {visiblePhotos.map((photo, index) => (
                  <button className={`original-photo-card${selectedId === photo.id ? " is-selected" : ""}`} type="button" key={photo.id} onClick={() => onSelect(photo.id)} aria-pressed={selectedId === photo.id}>
                    <span className="original-photo-card__image">
                      <OptimizedImage src={photo.preview || photo.image} alt="" sizes="(max-width: 720px) 44vw, (max-width: 1200px) 28vw, 240px" breakpoints={[160, 240, 320, 480]} priority={index < 6} reveal />
                      {activeTab === "originals"
                        ? <span className="original-photo-card__count"><CoatHanger size={13} aria-hidden="true" />{garmentCountLabel(photo.garments.length)}</span>
                        : <GeneratedSourceTag source={photo.source} />}
                    </span>
                    <span className="original-photo-card__caption">
                      <strong>{activeTab === "originals" ? photo.sourceFileName || tr("Uploaded photo {number}", { number: index + 1 }) : photo.title}</strong>
                      <small>{tr(activeTab === "originals" ? "Select to view its garments" : "Select to view generation details")}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPhoto && (
            <aside ref={panelRef} className="original-photo-library__panel has-selection" aria-live="polite">
              {activeTab === "originals"
                ? <OriginalPhotoPanel photo={selectedPhoto} onOpenGarment={onOpenGarment} />
                : <GeneratedPhotoPanel photo={selectedPhoto} onOpenGarment={onOpenGarment} />}
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}
