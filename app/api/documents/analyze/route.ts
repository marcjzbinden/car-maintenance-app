import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import {
  analysisDocumentTypes,
  isAnalyzableDocumentMimeType,
  normalizeDocumentAnalysisResult,
} from "@/lib/documentAnalysis";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

const BUCKET_NAME = "vehicle-documents";
const DOCUMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extractionInstructions = `Extract a reviewable proposal from this vehicle document.

Use only facts that are visible in or supported by the document. Do not invent missing values.
For a repair invoice, actively look for labeled dates such as Invoice date, Repair order date, RO date, Closed date, Completion date, Service date, and Date out or Vehicle out. Prefer the date representing when the documented service was completed or invoiced.
Extract only a date supported by the document. Preserve the printed year exactly; do not infer, manufacture, or repair a malformed year. Do not use the upload date, an estimate date when a final service or invoice date exists, an unrelated prior-service date, or a malformed or implausible date. If the date or year is unclear, return null.
For document_date_evidence, return a short exact or near-exact label and value from the document, such as "Invoice Date: 07/27/2026". The evidence must support document_date. If no supported date is available, return null for both fields.
For registration, inspection, or insurance documents, extract an expiration date separately when it is clearly shown.
Completed work means work actually performed. Return concise, line-item-style owner-facing summaries rather than invoice transcription or narrative paragraphs. Target 2 to 6 items when the document supports that many. Each item should normally be no more than about 10 to 12 words. Prefer language such as "Diagnosed charging-system/battery warning", "Replaced alternator", "Replaced serpentine belt and tensioner", and "Performed multi-point inspection". Consolidate closely related repair lines. Do not list every component checked during a routine inspection. Include diagnostics or inspections only when meaningful to understanding the visit.
Recommendations must contain only work that clearly remains outstanding after the documented visit: recommended future repairs or maintenance, declined services, deferred work, unresolved repairs, or a clearly stated need for a future visit. If an issue was diagnosed and repaired or completed on the same invoice, it must not appear as a recommendation. Customer complaints, technician notes, diagnostic steps, verification steps, completed repairs, inspection limitations, and items simply marked as not inspected are not recommendations. If there is no clearly outstanding or deferred work, return an empty recommendations array.
total_cost means the final grand total or customer invoice total when clearly available. Prefer values labeled Grand Total, Invoice Total, Total Due, Amount Due, or another clear final customer charge. Do not use a parts subtotal, labor subtotal, pre-tax subtotal, or intermediate total when a final total is visible. If the final total is ambiguous, return null rather than guessing.
If a value is uncertain or absent, return null or an empty array rather than guessing.`;

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: {
      type: "string",
      enum: analysisDocumentTypes,
    },
    document_date: {
      description:
        "Only a document-supported date with the printed year preserved exactly; null when the date or year is unclear.",
      anyOf: [
        { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { type: "null" },
      ],
    },
    document_date_evidence: {
      description:
        "A short exact or near-exact date label and value from the document that supports document_date; null when no supported date is available.",
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    expiration_date: {
      anyOf: [
        { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { type: "null" },
      ],
    },
    mileage: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
    },
    provider: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    total_cost: {
      description:
        "The clearly identified final grand total or customer invoice total, never a subtotal or intermediate total; null when ambiguous.",
      anyOf: [{ type: "number", minimum: 0 }, { type: "null" }],
    },
    completed_work: {
      description:
        "Two to six concise line-item-style owner summaries when supported, normally about 10 to 12 words or fewer; consolidate related completed operations and avoid narrative paragraphs.",
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    recommendations: {
      description:
        "Only work clearly requiring future action after the visit; exclude complaints, diagnostic or verification steps, technician workflow, completed repairs, inspection limitations, and items not inspected.",
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "document_type",
    "document_date",
    "document_date_evidence",
    "expiration_date",
    "mileage",
    "provider",
    "total_cost",
    "completed_work",
    "recommendations",
  ],
} as const;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return errorResponse("Authentication is required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("A valid document ID is required.", 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("documentId" in body) ||
    typeof body.documentId !== "string" ||
    !DOCUMENT_ID_PATTERN.test(body.documentId)
  ) {
    return errorResponse("A valid document ID is required.", 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabasePublishableKey) {
    return errorResponse("Document analysis is not configured.", 503);
  }

  const supabase = createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return errorResponse("Your session is no longer valid. Sign in again.", 401);
  }

  const { data: document, error: documentError } = await supabase
    .from("vehicle_documents")
    .select("id, filename, mime_type, storage_path")
    .eq("id", body.documentId)
    .maybeSingle();

  if (documentError) {
    console.error("Document lookup failed during analysis.", documentError);
    return errorResponse("The document could not be accessed.", 500);
  }

  if (!document) {
    return errorResponse("The document was not found or is not accessible.", 404);
  }

  if (!isAnalyzableDocumentMimeType(document.mime_type)) {
    return errorResponse(
      "AI analysis currently supports PDF, JPEG, PNG, and WebP documents. HEIC and HEIF analysis is not available yet.",
      415,
    );
  }

  const { data: original, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(document.storage_path);

  if (downloadError || !original) {
    console.error("Private document download failed during analysis.", downloadError);
    return errorResponse("The original document could not be accessed.", 500);
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return errorResponse("AI analysis is not configured.", 503);
  }

  const base64 = Buffer.from(await original.arrayBuffer()).toString("base64");
  const documentInput: ResponseInputContent =
    document.mime_type === "application/pdf"
      ? {
          type: "input_file",
          filename: document.filename,
          file_data: `data:application/pdf;base64,${base64}`,
        }
      : {
          type: "input_image",
          image_url: `data:${document.mime_type};base64,${base64}`,
          detail: "high",
        };

  try {
    const openai = new OpenAI({ apiKey: openAiApiKey });
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: extractionInstructions },
            documentInput,
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "vehicle_document_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    });

    if (!response.output_text) {
      return errorResponse("AI analysis did not return a result. Please try again.", 502);
    }

    const parsed: unknown = JSON.parse(response.output_text);
    const normalized = normalizeDocumentAnalysisResult(parsed);
    if (!normalized) {
      return errorResponse("AI analysis returned an unexpected result. Please try again.", 502);
    }

    return Response.json({ analysis: normalized });
  } catch (error: unknown) {
    console.error(
      "OpenAI document analysis failed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return errorResponse("AI analysis failed. Please try again.", 502);
  }
}
