export const analysisDocumentTypes = [
  "repair_invoice",
  "registration",
  "inspection",
  "insurance",
  "other",
] as const;

export type AnalysisDocumentType = (typeof analysisDocumentTypes)[number];

export type DocumentAnalysisResult = {
  document_type: AnalysisDocumentType;
  document_date: string | null;
  document_date_evidence: string | null;
  expiration_date: string | null;
  mileage: number | null;
  provider: string | null;
  total_cost: number | null;
  completed_work: string[];
  recommendations: string[];
};

export type DocumentReviewValues = Omit<
  DocumentAnalysisResult,
  "document_date_evidence"
>;

export type DocumentReviewDraft = {
  document_type: AnalysisDocumentType;
  document_date: string;
  expiration_date: string;
  mileage: string;
  provider: string;
  total_cost: string;
  completed_work: string[];
  recommendations: string[];
};

export const analyzableDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AnalyzableDocumentMimeType =
  (typeof analyzableDocumentMimeTypes)[number];

export function isAnalyzableDocumentMimeType(
  value: string,
): value is AnalyzableDocumentMimeType {
  return (analyzableDocumentMimeTypes as readonly string[]).includes(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function normalizeDateValue(
  value: unknown,
  earliestDate: string,
  latestDate: string,
) {
  if (value === null) return null;
  if (typeof value !== "string" || !isNullableDate(value)) return null;
  return value >= earliestDate && value <= latestDate ? value : null;
}

const monthNumberByPrefix: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function toIsoDate(year: number, month: number, day: number) {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isNullableDate(value) ? value : null;
}

function normalizeEvidenceYear(yearText: string, currentYear: number) {
  if (yearText.length === 4) return Number(yearText);

  const shortYear = Number(yearText);
  const earliestContemporaryYear = currentYear - 50;
  const candidates = [1900 + shortYear, 2000 + shortYear].filter(
    (year) => year >= earliestContemporaryYear && year <= currentYear,
  );

  return candidates.length === 1 ? candidates[0] : null;
}

export function normalizeDocumentDateEvidence(
  evidence: string,
  now = new Date(),
) {
  if (Number.isNaN(now.getTime())) return [];

  const today = now.toISOString().slice(0, 10);
  const currentYear = now.getUTCFullYear();
  const candidates = new Set<string>();

  function addCandidate(yearText: string, month: number, day: number) {
    const year = normalizeEvidenceYear(yearText, currentYear);
    if (year === null) return;

    const candidate = toIsoDate(year, month, day);
    if (candidate && candidate >= "1900-01-01" && candidate <= today) {
      candidates.add(candidate);
    }
  }

  for (const match of evidence.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    addCandidate(match[1], Number(match[2]), Number(match[3]));
  }

  for (const match of evidence.matchAll(
    /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g,
  )) {
    addCandidate(match[3], Number(match[1]), Number(match[2]));
  }

  for (const match of evidence.matchAll(
    /\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4}|\d{2})\b/gi,
  )) {
    const month = monthNumberByPrefix[match[2].toLowerCase()];
    addCandidate(match[3], month, Number(match[1]));
  }

  const monthPattern =
    "January|February|March|April|May|June|July|August|September|Sept|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
  const monthFirstPattern = new RegExp(
    `\\b(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4}|\\d{2})\\b`,
    "gi",
  );
  const dayFirstPattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\.?[,]?\\s+(\\d{4}|\\d{2})\\b`,
    "gi",
  );

  for (const match of evidence.matchAll(monthFirstPattern)) {
    const month = monthNumberByPrefix[match[1].slice(0, 3).toLowerCase()];
    addCandidate(match[3], month, Number(match[2]));
  }

  for (const match of evidence.matchAll(dayFirstPattern)) {
    const month = monthNumberByPrefix[match[2].slice(0, 3).toLowerCase()];
    addCandidate(match[3], month, Number(match[1]));
  }

  return [...candidates];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isDocumentAnalysisResult(
  value: unknown,
): value is DocumentAnalysisResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const result = value as Record<string, unknown>;
  const keys = Object.keys(result);
  const expectedKeys = [
    "document_type",
    "document_date",
    "document_date_evidence",
    "expiration_date",
    "mileage",
    "provider",
    "total_cost",
    "completed_work",
    "recommendations",
  ];

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(result, key)) &&
    typeof result.document_type === "string" &&
    (analysisDocumentTypes as readonly string[]).includes(result.document_type) &&
    isNullableDate(result.document_date) &&
    isNullableString(result.document_date_evidence) &&
    isNullableDate(result.expiration_date) &&
    (result.mileage === null ||
      (typeof result.mileage === "number" &&
        Number.isInteger(result.mileage) &&
        result.mileage >= 0)) &&
    isNullableString(result.provider) &&
    (result.total_cost === null ||
      (typeof result.total_cost === "number" &&
        Number.isFinite(result.total_cost) &&
        result.total_cost >= 0)) &&
    isStringArray(result.completed_work) &&
    isStringArray(result.recommendations)
  );
}

export function normalizeDocumentAnalysisResult(
  value: unknown,
  now = new Date(),
): DocumentAnalysisResult | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Number.isNaN(now.getTime())
  ) {
    return null;
  }

  const currentYear = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const candidate = value as Record<string, unknown>;
  const evidence =
    typeof candidate.document_date_evidence === "string"
      ? candidate.document_date_evidence.trim() || null
      : candidate.document_date_evidence;
  const plausibleDocumentDate = normalizeDateValue(
    candidate.document_date,
    "1900-01-01",
    today,
  );
  const evidenceDates =
    typeof evidence === "string"
      ? normalizeDocumentDateEvidence(evidence, now)
      : [];
  const supportedDocumentDate = plausibleDocumentDate
    ? evidenceDates.includes(plausibleDocumentDate)
      ? plausibleDocumentDate
      : evidenceDates.length === 1
        ? evidenceDates[0]
        : null
    : evidenceDates.length === 1
      ? evidenceDates[0]
      : null;
  const normalized = {
    ...candidate,
    document_date: supportedDocumentDate,
    document_date_evidence: evidence,
    expiration_date: normalizeDateValue(
      candidate.expiration_date,
      "1900-01-01",
      `${currentYear + 20}-12-31`,
    ),
  };

  return isDocumentAnalysisResult(normalized) ? normalized : null;
}
