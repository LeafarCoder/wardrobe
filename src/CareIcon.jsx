function CrossMark() {
  return <path d="M8 8l20 20M28 8L8 28" strokeWidth="2.3" strokeLinecap="round" />;
}

export function CareIcon({ group, option, size = 38, className = "" }) {
  const prohibited = option?.startsWith("do-not-");
  const temperature = option?.match(/(?:machine|gentle)-(\d+)/)?.[1];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="34" height="34" rx="9" strokeWidth="1.2" opacity=".24" />
      {group === "washing" && (
        <>
          <path d="M7 20c3-3 5 3 8 0s5 3 8 0 4 1 6 0" strokeWidth="1.8" strokeLinecap="round" />
          {temperature && <text x="18" y="16" textAnchor="middle" stroke="none" fill="currentColor" fontSize="8" fontWeight="600">{temperature}°</text>}
          {option === "hand-wash" && <path d="M11 15c2-5 4-5 5 0 1-6 3-6 4 0 1-5 3-4 3 1 4-3 5 1 2 6-2 4-11 5-13-1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
          {option?.startsWith("gentle-") && <path d="M10 27h16" strokeWidth="1.5" strokeLinecap="round" />}
        </>
      )}
      {group === "bleaching" && (
        <>
          <path d="M18 7l2.3 7.4L28 17l-7.7 2.6L18 27l-2.3-7.4L8 17l7.7-2.6L18 7z" strokeWidth="1.5" strokeLinejoin="round" />
          {option === "oxygen-only" && <text x="18" y="20" textAnchor="middle" stroke="none" fill="currentColor" fontSize="7" fontWeight="650">O₂</text>}
        </>
      )}
      {group === "tumbleDrying" && (
        <>
          <path d="M11 12c5-5 14-2 15 4M25 24c-5 5-14 2-15-4" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M23 12h3v3M13 24h-3v-3" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          {option !== "do-not-tumble" && <circle cx="18" cy="18" r={option === "low" ? "1.4" : "2.2"} fill="currentColor" stroke="none" />}
        </>
      )}
      {group === "naturalDrying" && (
        <>
          <path d={option?.startsWith("flat") ? "M8 22h20" : "M9 11h18M12 11v14M24 11v14"} strokeWidth="1.8" strokeLinecap="round" />
          {option?.endsWith("shade") && <><circle cx="25" cy="10" r="3" strokeWidth="1.3" /><path d="M22 13l-9 12" strokeWidth="1.4" strokeLinecap="round" /></>}
        </>
      )}
      {group === "ironing" && (
        <>
          <path d="M8 23h20l-3-9H14c-3 0-5 4-6 9z" strokeWidth="1.7" strokeLinejoin="round" />
          {!prohibited && [0, 1, 2].slice(0, option === "low" ? 1 : option === "medium" ? 2 : 3).map((index) => <circle key={index} cx={15 + (index * 3)} cy="19" r=".9" fill="currentColor" stroke="none" />)}
        </>
      )}
      {group === "professionalCare" && (
        <>
          <path d="M10 24c0-5 3-9 8-9s8 4 8 9" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M14 15c0-5 8-5 8 0M11 25h14" strokeWidth="1.7" strokeLinecap="round" />
          {option === "gentle-dry-clean" && <path d="M13 28h10" strokeWidth="1.4" strokeLinecap="round" />}
        </>
      )}
      {prohibited && <CrossMark />}
    </svg>
  );
}
