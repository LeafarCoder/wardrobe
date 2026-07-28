export const CARE_GROUPS = [
  {
    id: "washing",
    label: "Washing",
    options: [
      { id: "machine-30", label: "Machine wash at 30°C", description: "Use a normal machine cycle with water no warmer than 30°C." },
      { id: "gentle-30", label: "Gentle wash at 30°C", description: "Use a gentle cycle at no more than 30°C with reduced agitation and spin." },
      { id: "machine-40", label: "Machine wash at 40°C", description: "Use a normal machine cycle with water no warmer than 40°C." },
      { id: "gentle-40", label: "Gentle wash at 40°C", description: "Use a gentle cycle at no more than 40°C with reduced agitation and spin." },
      { id: "machine-60", label: "Machine wash at 60°C", description: "Use a normal machine cycle with water no warmer than 60°C." },
      { id: "hand-wash", label: "Hand wash", description: "Wash gently by hand in cool or lukewarm water. Do not rub, pull, or wring." },
      { id: "do-not-wash", label: "Do not wash", description: "Do not wash at home. Follow the other saved instructions or consult a professional cleaner." },
    ],
  },
  {
    id: "bleaching",
    label: "Bleaching",
    options: [
      { id: "any-bleach", label: "Bleach when needed", description: "Chlorine or oxygen bleach may be used when the product instructions allow it." },
      { id: "oxygen-only", label: "Non-chlorine bleach only", description: "Use oxygen-based, non-chlorine bleach only." },
      { id: "do-not-bleach", label: "Do not bleach", description: "Do not use chlorine or oxygen bleach. Choose a bleach-free detergent." },
    ],
  },
  {
    id: "tumbleDrying",
    label: "Tumble drying",
    options: [
      { id: "normal", label: "Tumble dry", description: "Tumble dry on a normal heat setting." },
      { id: "low", label: "Tumble dry on low heat", description: "Use a low-temperature, gentle tumble-drying program." },
      { id: "do-not-tumble", label: "Do not tumble dry", description: "Keep this garment out of the tumble dryer and use its natural-drying instruction instead." },
    ],
  },
  {
    id: "naturalDrying",
    label: "Natural drying",
    options: [
      { id: "line", label: "Line dry", description: "Hang the garment on a line or hanger and let it air-dry." },
      { id: "line-shade", label: "Line dry in the shade", description: "Hang the garment to air-dry away from direct sunlight." },
      { id: "flat", label: "Dry flat", description: "Lay the garment flat in its natural shape while it dries." },
      { id: "flat-shade", label: "Dry flat in the shade", description: "Lay the garment flat in its natural shape away from direct sunlight." },
    ],
  },
  {
    id: "ironing",
    label: "Ironing",
    options: [
      { id: "low", label: "Iron on low heat", description: "Use a low-temperature iron, up to approximately 120°C, and avoid steam on sensitive fabric." },
      { id: "medium", label: "Iron on medium heat", description: "Use a medium-temperature iron, up to approximately 160°C, without heavy pressure." },
      { id: "high", label: "Iron on high heat", description: "Use a hot iron, up to approximately 210°C, only as permitted by the physical label." },
      { id: "do-not-iron", label: "Do not iron", description: "Do not use an iron because heat or pressure may permanently damage the garment." },
    ],
  },
  {
    id: "professionalCare",
    label: "Professional care",
    options: [
      { id: "dry-clean", label: "Professional dry clean", description: "Take the garment to a professional cleaner and show them the physical care label." },
      { id: "gentle-dry-clean", label: "Gentle professional dry clean", description: "Ask a professional cleaner to use a reduced-action process appropriate to the physical label." },
      { id: "do-not-dry-clean", label: "Do not dry clean", description: "Do not use professional solvent dry-cleaning or solvent-based stain removers." },
    ],
  },
];

export const CARE_GROUP_IDS = CARE_GROUPS.map((group) => group.id);
const CARE_OPTION_IDS = Object.fromEntries(CARE_GROUPS.map((group) => [
  group.id,
  new Set(group.options.map((option) => option.id)),
]));

export function normalizeCareInstructions(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(CARE_GROUP_IDS.map((groupId) => {
    const candidate = typeof source[groupId] === "string" ? source[groupId].trim() : "";
    return [groupId, CARE_OPTION_IDS[groupId].has(candidate) ? candidate : null];
  }));
}

export function selectedCareInstructions(value = {}) {
  const normalized = normalizeCareInstructions(value);
  return CARE_GROUPS.flatMap((group) => {
    const option = group.options.find((candidate) => candidate.id === normalized[group.id]);
    return option ? [{ groupId: group.id, groupLabel: group.label, ...option }] : [];
  });
}

export function careInstructionCount(value = {}) {
  return selectedCareInstructions(value).length;
}

export const CARE_TRANSLATION_KEYS = CARE_GROUPS.flatMap((group) => [
  group.label,
  ...group.options.flatMap((option) => [option.label, option.description]),
]);
