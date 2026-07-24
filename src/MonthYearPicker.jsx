import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { getLocale, tr, useLocale } from "./i18n.js";
import "./month-year-picker.css";

const MIN_YEAR = 1900;
const YEARS_PER_PAGE = 12;

function clampYear(year) {
  const maxYear = new Date().getFullYear() + 1;
  return Math.min(maxYear, Math.max(MIN_YEAR, year));
}

function parsedMonth(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < MIN_YEAR || year > new Date().getFullYear() + 1) return null;
  return { year, month: Number(match[2]) };
}

function yearPageFor(year) {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

export function formatMonthYear(value, locale = getLocale()) {
  const parsed = parsedMonth(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

export function MonthYearPicker({ value, onChange, ariaLabel = tr("Purchase month and year") }) {
  const locale = useLocale();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const selected = parsedMonth(value);
  const today = new Date();
  const maxYear = today.getFullYear() + 1;
  const initialYear = selected?.year || today.getFullYear();
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(initialYear);
  const [choosingYear, setChoosingYear] = useState(false);
  const [yearPageStart, setYearPageStart] = useState(yearPageFor(initialYear));
  const [placement, setPlacement] = useState("down");
  const placeholder = locale === "pt-PT" ? "AAAA-MM" : "YYYY-MM";
  const formattedValue = formatMonthYear(value, locale);
  const monthLabels = useMemo(() => (
    Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, month, 1))).replace(/\.$/, ""))
  ), [locale]);
  const pageYears = Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPageStart + index)
    .filter((year) => year >= MIN_YEAR && year <= maxYear);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setChoosingYear(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const openPicker = () => {
    const nextYear = selected?.year || today.getFullYear();
    setDisplayYear(nextYear);
    setYearPageStart(yearPageFor(nextYear));
    setChoosingYear(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) close(false);
    };
    const closeFromKeyboard = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    requestAnimationFrame(() => {
      popoverRef.current
        ?.querySelector("[data-selected='true'], .month-year-picker__month")
        ?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const availableBelow = window.innerHeight - rect.bottom;
    const availableAbove = rect.top;
    setPlacement(availableBelow < 330 && availableAbove > availableBelow ? "up" : "down");
  }, [choosingYear, open]);

  const selectMonth = (month) => {
    onChange(`${displayYear}-${String(month).padStart(2, "0")}`);
    close(true);
  };

  const moveYear = (amount) => {
    setDisplayYear((current) => clampYear(current + amount));
  };

  const toggleYearChooser = () => {
    setYearPageStart(yearPageFor(displayYear));
    setChoosingYear((current) => !current);
  };

  return (
    <div className={`month-year-picker${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="month-year-picker__trigger"
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => open ? close(false) : openPicker()}
      >
        <span className={formattedValue ? "" : "is-placeholder"}>{formattedValue || placeholder}</span>
        <CalendarBlank size={17} weight="regular" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`month-year-picker__popover is-${placement}`}
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="month-year-picker__header">
            <button
              type="button"
              aria-label={tr(choosingYear ? "Previous years" : "Previous year")}
              disabled={choosingYear ? yearPageStart <= MIN_YEAR : displayYear <= MIN_YEAR}
              onClick={() => choosingYear
                ? setYearPageStart((current) => Math.max(MIN_YEAR, current - YEARS_PER_PAGE))
                : moveYear(-1)}
            >
              <CaretLeft size={16} aria-hidden="true" />
            </button>
            <button
              className="month-year-picker__year-toggle"
              type="button"
              aria-label={tr("Choose year")}
              aria-pressed={choosingYear}
              onClick={toggleYearChooser}
            >
              {choosingYear
                ? `${pageYears[0]}–${pageYears[pageYears.length - 1]}`
                : displayYear}
            </button>
            <button
              type="button"
              aria-label={tr(choosingYear ? "Next years" : "Next year")}
              disabled={choosingYear
                ? yearPageStart + YEARS_PER_PAGE > maxYear
                : displayYear >= maxYear}
              onClick={() => choosingYear
                ? setYearPageStart((current) => Math.min(yearPageFor(maxYear), current + YEARS_PER_PAGE))
                : moveYear(1)}
            >
              <CaretRight size={16} aria-hidden="true" />
            </button>
          </div>

          {choosingYear ? (
            <div className="month-year-picker__years">
              {pageYears.map((year) => (
                <button
                  type="button"
                  data-selected={year === displayYear}
                  aria-pressed={year === displayYear}
                  key={year}
                  onClick={() => {
                    setDisplayYear(year);
                    setChoosingYear(false);
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : (
            <div className="month-year-picker__months">
              {monthLabels.map((monthLabel, index) => {
                const month = index + 1;
                const isSelected = selected?.year === displayYear && selected?.month === month;
                return (
                  <button
                    className="month-year-picker__month"
                    type="button"
                    data-selected={isSelected}
                    aria-pressed={isSelected}
                    key={month}
                    onClick={() => selectMonth(month)}
                  >
                    {monthLabel}
                  </button>
                );
              })}
            </div>
          )}

          <div className="month-year-picker__footer">
            <button type="button" onClick={() => { onChange(""); close(true); }}>
              {tr("Clear date")}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
                close(true);
              }}
            >
              {tr("This month")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
