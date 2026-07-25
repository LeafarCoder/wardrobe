import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { tr, useLocale } from "./i18n.js";
import "./day-date-picker.css";

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const YEARS_PER_PAGE = 12;

function parseDate(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function dateValue(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateValue(value, locale) {
  const parsed = parseDate(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

function yearPageFor(year) {
  return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

export function DayDatePicker({
  value,
  min = "",
  onChange,
  ariaLabel = tr("Choose date"),
  required = false,
  align = "start",
}) {
  const locale = useLocale();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const today = new Date();
  const selected = parseDate(value);
  const minimum = parseDate(min);
  const initialYear = selected?.year || today.getFullYear();
  const initialMonth = selected?.month || today.getMonth() + 1;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("days");
  const [displayYear, setDisplayYear] = useState(initialYear);
  const [displayMonth, setDisplayMonth] = useState(initialMonth);
  const [yearPageStart, setYearPageStart] = useState(yearPageFor(initialYear));
  const [placement, setPlacement] = useState("down");
  const formattedValue = formatDateValue(value, locale);
  const monthLabels = useMemo(() => Array.from({ length: 12 }, (_, month) => (
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(2024, month, 1)))
      .replace(/\.$/, "")
  )), [locale]);
  const longMonth = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(displayYear, displayMonth - 1, 1)));
  const weekStartsMonday = locale === "pt-PT";
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const sundayBasedDay = weekStartsMonday ? index + 1 : index;
    return new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" })
      .format(new Date(Date.UTC(2024, 0, 7 + sundayBasedDay)));
  }), [locale, weekStartsMonday]);
  const firstWeekday = new Date(Date.UTC(displayYear, displayMonth - 1, 1)).getUTCDay();
  const leadingBlanks = weekStartsMonday ? (firstWeekday + 6) % 7 : firstWeekday;
  const daysInMonth = new Date(Date.UTC(displayYear, displayMonth, 0)).getUTCDate();
  const pageYears = Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPageStart + index)
    .filter((year) => year >= MIN_YEAR && year <= MAX_YEAR);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setMode("days");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const openPicker = () => {
    const nextYear = selected?.year || today.getFullYear();
    setDisplayYear(nextYear);
    setDisplayMonth(selected?.month || today.getMonth() + 1);
    setYearPageStart(yearPageFor(nextYear));
    setMode("days");
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
      popoverRef.current?.querySelector("[data-selected='true'], .day-date-picker__day:not(:disabled)")?.focus({ preventScroll: true });
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
    setPlacement(availableBelow < 390 && rect.top > availableBelow ? "up" : "down");
  }, [mode, open]);

  const moveMonth = (amount) => {
    const next = new Date(Date.UTC(displayYear, displayMonth - 1 + amount, 1));
    setDisplayYear(Math.max(MIN_YEAR, Math.min(MAX_YEAR, next.getUTCFullYear())));
    setDisplayMonth(next.getUTCMonth() + 1);
  };

  const isBeforeMinimum = (day) => (
    minimum && dateValue(displayYear, displayMonth, day) < dateValue(minimum.year, minimum.month, minimum.day)
  );

  const selectDay = (day) => {
    onChange(dateValue(displayYear, displayMonth, day));
    close(true);
  };

  const headerLabel = mode === "years"
    ? `${pageYears[0]}–${pageYears.at(-1)}`
    : mode === "months"
      ? String(displayYear)
      : `${longMonth} ${displayYear}`;

  return (
    <div className={`day-date-picker is-align-${align}${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        className="day-date-picker__trigger"
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-required={required}
        onClick={() => open ? close(false) : openPicker()}
      >
        <span className={formattedValue ? "" : "is-placeholder"}>{formattedValue || (locale === "pt-PT" ? "DD/MM/AAAA" : "MM/DD/YYYY")}</span>
        <CalendarBlank size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className={`day-date-picker__popover is-${placement}`} ref={popoverRef} role="dialog" aria-label={ariaLabel}>
          <div className="day-date-picker__header">
            <button
              type="button"
              aria-label={tr(mode === "days" ? "Previous month" : mode === "months" ? "Previous year" : "Previous years")}
              onClick={() => mode === "days"
                ? moveMonth(-1)
                : mode === "months"
                  ? setDisplayYear((current) => Math.max(MIN_YEAR, current - 1))
                  : setYearPageStart((current) => Math.max(MIN_YEAR, current - YEARS_PER_PAGE))}
            >
              <CaretLeft size={16} aria-hidden="true" />
            </button>
            <button
              className="day-date-picker__period"
              type="button"
              onClick={() => {
                if (mode === "days") setMode("months");
                else if (mode === "months") {
                  setYearPageStart(yearPageFor(displayYear));
                  setMode("years");
                }
              }}
            >
              {headerLabel}
            </button>
            <button
              type="button"
              aria-label={tr(mode === "days" ? "Next month" : mode === "months" ? "Next year" : "Next years")}
              onClick={() => mode === "days"
                ? moveMonth(1)
                : mode === "months"
                  ? setDisplayYear((current) => Math.min(MAX_YEAR, current + 1))
                  : setYearPageStart((current) => Math.min(yearPageFor(MAX_YEAR), current + YEARS_PER_PAGE))}
            >
              <CaretRight size={16} aria-hidden="true" />
            </button>
          </div>

          {mode === "days" && (
            <div className="day-date-picker__calendar">
              <div className="day-date-picker__weekdays">
                {weekdayLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
              </div>
              <div className="day-date-picker__days">
                {Array.from({ length: leadingBlanks }, (_, index) => <i key={`blank-${index}`} />)}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const isSelected = selected?.year === displayYear && selected?.month === displayMonth && selected?.day === day;
                  return (
                    <button
                      className="day-date-picker__day"
                      type="button"
                      key={day}
                      data-selected={isSelected}
                      aria-pressed={isSelected}
                      disabled={isBeforeMinimum(day)}
                      onClick={() => selectDay(day)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "months" && (
            <div className="day-date-picker__months">
              {monthLabels.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  data-selected={selected?.year === displayYear && selected?.month === index + 1}
                  onClick={() => {
                    setDisplayMonth(index + 1);
                    setMode("days");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "years" && (
            <div className="day-date-picker__years">
              {pageYears.map((year) => (
                <button
                  type="button"
                  key={year}
                  data-selected={year === displayYear}
                  onClick={() => {
                    setDisplayYear(year);
                    setMode("months");
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <div className="day-date-picker__footer">
            {!required && <button type="button" onClick={() => { onChange(""); close(true); }}>{tr("Clear date")}</button>}
            <button
              type="button"
              disabled={minimum && dateValue(today.getFullYear(), today.getMonth() + 1, today.getDate()) < min}
              onClick={() => {
                onChange(dateValue(today.getFullYear(), today.getMonth() + 1, today.getDate()));
                close(true);
              }}
            >
              {tr("Today")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { formatDateValue };
