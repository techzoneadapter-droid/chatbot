export interface PhoneDetection {
  raw: string | null;
  normalized: string | null;
  valid: boolean;
}

const MOBILE_PREFIXES = new Set([
  "032",
  "033",
  "034",
  "035",
  "036",
  "037",
  "038",
  "039",
  "052",
  "056",
  "058",
  "070",
  "076",
  "077",
  "078",
  "079",
  "081",
  "082",
  "083",
  "084",
  "085",
  "086",
  "088",
  "089",
  "090",
  "091",
  "092",
  "093",
  "094",
  "096",
  "097",
  "098",
  "099"
]);

function normalizeDigits(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0084")) digits = `0${digits.slice(4)}`;
  if (digits.startsWith("84")) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isValidVietnameseMobile(normalized: string) {
  return /^0\d{9}$/.test(normalized) && MOBILE_PREFIXES.has(normalized.slice(0, 3));
}

export function detectVietnamesePhone(input: string): PhoneDetection {
  const candidates = input.match(/(?:\+?84|0084|0)(?:[\s.-]?\d){8,10}\b/g) ?? [];

  for (const raw of candidates) {
    const digits = normalizeDigits(raw);
    if (isValidVietnameseMobile(digits)) return { raw, normalized: digits, valid: true };
  }

  const invalid = candidates[0];
  return invalid ? { raw: invalid, normalized: null, valid: false } : { raw: null, normalized: null, valid: false };
}
