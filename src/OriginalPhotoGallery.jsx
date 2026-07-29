import { useEffect, useMemo, useRef } from "react";
import { ArrowRight, CoatHanger, ImageSquare, X } from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import { OptimizedImage } from "./OptimizedImage.jsx";
import "./original-photo-gallery.css";

function garmentCountLabel(count) {
  return tr(count === 1 ? "{count} garment" : "{count} garments", { count });
}

export function OriginalPhotoGallery({ photos, selectedId, onSelect, onOpenGarment, onClose }) {
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const selectedPhoto = useMemo(
    () => photos.find((photo) => photo.id === selectedId) || null,
    [photos, selectedId],
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

  return (
    <div className="original-photo-library-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="original-photo-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="original-photo-library-title"
      >
        <header className="original-photo-library__header">
          <div>
            <p>{tr("Photo library")}</p>
            <h2 id="original-photo-library-title">{tr("Original photos")}</h2>
            <span>{tr("Browse every uploaded photo and see the garments connected to it.")}</span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={tr("Close original photo gallery")}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="original-photo-library__body">
          <div className="original-photo-library__collection">
            {!photos.length ? (
              <div className="original-photo-library__empty">
                <ImageSquare size={34} weight="light" aria-hidden="true" />
                <h3>{tr("No original photos yet")}</h3>
                <p>{tr("Photos used to import garments will appear here.")}</p>
              </div>
            ) : (
              <div className="original-photo-library__grid" aria-label={tr("Original photo gallery")}>
                {photos.map((photo, index) => (
                  <button
                    className={`original-photo-card${selectedId === photo.id ? " is-selected" : ""}`}
                    type="button"
                    key={photo.id}
                    onClick={() => onSelect(photo.id)}
                    aria-pressed={selectedId === photo.id}
                    aria-label={tr("View photo {number}, connected to {garments}", {
                      number: index + 1,
                      garments: garmentCountLabel(photo.garments.length),
                    })}
                  >
                    <span className="original-photo-card__image">
                      <OptimizedImage
                        src={photo.preview || photo.image}
                        alt=""
                        sizes="(max-width: 720px) 44vw, (max-width: 1200px) 28vw, 240px"
                        breakpoints={[160, 240, 320, 480]}
                        priority={index < 6}
                        reveal
                      />
                      <span className="original-photo-card__count">
                        <CoatHanger size={13} aria-hidden="true" />
                        {garmentCountLabel(photo.garments.length)}
                      </span>
                    </span>
                    <span className="original-photo-card__caption">
                      <strong>{photo.sourceFileName || tr("Uploaded photo {number}", { number: index + 1 })}</strong>
                      <small>{tr("Select to view its garments")}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside ref={panelRef} className={`original-photo-library__panel${selectedPhoto ? " has-selection" : ""}`} aria-live="polite">
            {!selectedPhoto ? (
              <div className="original-photo-library__prompt">
                <ImageSquare size={30} weight="light" aria-hidden="true" />
                <h3>{tr("Select an original photo")}</h3>
                <p>{tr("The garments created from it will appear here.")}</p>
              </div>
            ) : (
              <>
                <div className="original-photo-library__selected-photo">
                  <OptimizedImage src={selectedPhoto.preview || selectedPhoto.image} alt="" sizes="340px" breakpoints={[240, 320, 480]} />
                </div>
                <div className="original-photo-library__panel-heading">
                  <p>{tr("Connected garments")}</p>
                  <h3>{garmentCountLabel(selectedPhoto.garments.length)}</h3>
                  <span>{tr("Every garment below originated from this photo or was later connected through a merge.")}</span>
                </div>
                <div className="original-photo-library__garments">
                  {selectedPhoto.garments.map((garment) => (
                    <button type="button" key={garment.id} onClick={() => onOpenGarment(garment.id)}>
                      <span className="original-photo-library__garment-image">
                        <OptimizedImage src={garment.thumbnail || garment.preview || garment.image} alt="" sizes="72px" breakpoints={[72, 120, 160]} />
                      </span>
                      <span>
                        <strong>{garment.name || tr("Wardrobe item")}</strong>
                        {garment.brand && <small>{garment.brand}</small>}
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
