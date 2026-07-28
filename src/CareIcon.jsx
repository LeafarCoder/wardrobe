function CrossMark() {
  return <path d="M8 8l20 20M28 8L8 28" strokeWidth="2.3" strokeLinecap="round" />;
}

function NoBadge() {
  return (
    <g>
      <rect x="20" y="25" width="12" height="7" rx="2.2" fill="currentColor" stroke="none" />
      <text x="26" y="30.2" textAnchor="middle" stroke="none" fill="white" fontSize="4.8" fontWeight="750">NO</text>
    </g>
  );
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
          <path d="M10 11h8l2 4v11H8V15l2-4zM11 8h6v3h-6z" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M24 14c0 0-4 4.2-4 7a4 4 0 0 0 8 0c0-2.8-4-7-4-7z" strokeWidth="1.5" strokeLinejoin="round" />
          {option === "any-bleach" && <path d="M22 21h4M24 19v4" strokeWidth="1.2" strokeLinecap="round" />}
          {option === "oxygen-only" && <text x="24" y="22.5" textAnchor="middle" stroke="none" fill="currentColor" fontSize="5.3" fontWeight="700">O₂</text>}
          {option === "do-not-bleach" && <NoBadge />}
        </>
      )}
      {group === "tumbleDrying" && (
        <>
          <rect x="7" y="7" width="22" height="22" rx="3" strokeWidth="1.5" />
          <path d="M7 13h22" strokeWidth="1.3" />
          <circle cx="18" cy="21" r="6" strokeWidth="1.5" />
          <circle cx="11" cy="10" r="1" fill="currentColor" stroke="none" />
          <path d={option === "low" ? "M15 22c1-2 1-2 2 0" : "M14 22c1-2 1-2 2 0s1 2 2 0 1-2 2 0"} strokeWidth="1.2" strokeLinecap="round" />
          {option === "do-not-tumble" && <NoBadge />}
        </>
      )}
      {group === "naturalDrying" && (
        <>
          {option?.startsWith("flat") ? (
            <>
              <path d="M7 25h22M10 21h16l-3-7H13l-3 7z" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 17h10" strokeWidth="1.2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M6 11c7 2 17 2 24 0" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M12 13l3 2 3-2 3 2 3-2v10H12V13z" strokeWidth="1.5" strokeLinejoin="round" />
            </>
          )}
          {option?.endsWith("shade") && <><path d="M23 8a4 4 0 0 1 5 5" strokeWidth="1.3" strokeLinecap="round" /><path d="M22 13h8" strokeWidth="1.3" strokeLinecap="round" /></>}
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
          <path d="M7 14h22v14H7V14zM9 8h18l3 6H6l3-6z" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M14 22c0-2 2-4 4-4s4 2 4 4M13 23h10" strokeWidth="1.4" strokeLinecap="round" />
          <text x="18" y="12.5" textAnchor="middle" stroke="none" fill="currentColor" fontSize="4.7" fontWeight="750">PRO</text>
          {option === "gentle-dry-clean" && <path d="M24 18c3-1 4 1 2 3-2 2-4 2-5 2 1-2 1-4 3-5z" strokeWidth="1" strokeLinejoin="round" />}
          {option === "do-not-dry-clean" && <NoBadge />}
        </>
      )}
      {prohibited && ["washing", "ironing"].includes(group) && <CrossMark />}
    </svg>
  );
}
