"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import type { Tables, TablesInsert } from "@/lib/database.types";
import {
  isAnalyzableDocumentMimeType,
  isDocumentAnalysisResult,
  type DocumentAnalysisResult,
  type DocumentReviewDraft,
  type DocumentReviewValues,
} from "@/lib/documentAnalysis";
import { supabase } from "@/lib/supabaseClient";
import { createUuidV4 } from "@/lib/uuid";
import { createVehicleDocumentSignedUrl } from "@/lib/vehicleDocumentAccess";
import {
  DocumentAnalysisProposal,
  DocumentReviewForm,
  SavedDocumentReview,
} from "./DocumentAnalysisReview";
import { DocumentMaintenanceLinks } from "./DocumentMaintenanceLinks";
import styles from "./VehicleDocumentsSection.module.css";

type VehicleDocument = Tables<"vehicle_documents">;
type VehicleDocumentInsert = TablesInsert<"vehicle_documents">;
type VehicleDocumentReview = Tables<"vehicle_document_reviews">;
type VehicleDocumentReviewInsert = TablesInsert<"vehicle_document_reviews">;
type MaintenanceDocumentLink = Tables<"maintenance_item_documents">;
type MaintenanceItem = Pick<
  Tables<"maintenance_items">,
  | "id"
  | "vehicle_id"
  | "title"
  | "due_date"
  | "completed_at"
  | "service_mileage"
  | "service_provider"
  | "self_performed"
  | "created_at"
>;
type ReviewWritePayload = Omit<
  VehicleDocumentReviewInsert,
  "reviewed_at" | "reviewed_by"
>;
type DocumentType =
  | "repair_invoice"
  | "registration"
  | "inspection"
  | "insurance"
  | "other";

type VehicleDocumentsSectionProps = {
  garageId: string;
  vehicleId: string;
  currentUserId: string;
  maintenanceItems: MaintenanceItem[];
  onMaintenanceDataChange: () => Promise<void>;
};

const BUCKET_NAME = "vehicle-documents";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const extensionByMimeType = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
} as const;

type AcceptedMimeType = keyof typeof extensionByMimeType;

const acceptedMimeTypes = Object.keys(extensionByMimeType) as AcceptedMimeType[];
const fileAcceptValue = acceptedMimeTypes.join(",");

const documentTypeOptions: Array<{ label: string; value: DocumentType }> = [
  { label: "Repair invoice", value: "repair_invoice" },
  { label: "Registration", value: "registration" },
  { label: "Inspection", value: "inspection" },
  { label: "Insurance", value: "insurance" },
  { label: "Other", value: "other" },
];

const documentTypeLabels: Record<DocumentType, string> = {
  repair_invoice: "Repair invoice",
  registration: "Registration",
  inspection: "Inspection",
  insurance: "Insurance",
  other: "Other",
};

function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return Object.hasOwn(extensionByMimeType, value);
}

function hasInvalidFilenameCharacter(filename: string) {
  return Array.from(filename).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === "/" || character === "\\";
  });
}

function validateFile(file: File) {
  if (file.size <= 0) return "Choose a non-empty document.";
  if (file.size > MAX_FILE_SIZE_BYTES) return "Documents must be 15 MB or smaller.";
  if (!isAcceptedMimeType(file.type)) {
    return "Choose a PDF, JPEG, PNG, WebP, HEIC, or HEIF file.";
  }
  if (
    file.name.length === 0 ||
    file.name.length > 255 ||
    file.name !== file.name.trim() ||
    hasInvalidFilenameCharacter(file.name)
  ) {
    return "The original filename is not supported. Remove path characters, control characters, or leading and trailing spaces.";
  }

  return null;
}

function formatDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getFriendlyDocumentType(value: string | null) {
  if (!value) return null;
  return documentTypeLabels[value as DocumentType] ?? value;
}

function createReviewDraft(
  values: DocumentReviewValues | VehicleDocumentReview,
): DocumentReviewDraft {
  return {
    document_type: values.document_type as DocumentType,
    document_date: values.document_date ?? "",
    expiration_date: values.expiration_date ?? "",
    mileage: values.mileage === null ? "" : String(values.mileage),
    provider: values.provider ?? "",
    total_cost: values.total_cost === null ? "" : values.total_cost.toFixed(2),
    completed_work: [...values.completed_work],
    recommendations: [...values.recommendations],
  };
}

function normalizeReviewDraft(
  documentId: string,
  draft: DocumentReviewDraft,
): { payload: ReviewWritePayload; error: null } | { payload: null; error: string } {
  const mileageText = draft.mileage.trim();
  const totalCostText = draft.total_cost.trim();

  if (mileageText && !/^\d+$/.test(mileageText)) {
    return { payload: null, error: "Mileage must be a nonnegative whole number." };
  }

  const mileage = mileageText ? Number(mileageText) : null;
  if (
    mileage !== null &&
    (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2147483647)
  ) {
    return { payload: null, error: "Mileage is outside the supported range." };
  }

  if (totalCostText && !/^\d+(?:\.\d{1,2})?$/.test(totalCostText)) {
    return {
      payload: null,
      error: "Total cost must be a nonnegative amount with no more than two decimals.",
    };
  }

  const totalCost = totalCostText ? Number(totalCostText) : null;
  if (
    totalCost !== null &&
    (!Number.isFinite(totalCost) || totalCost < 0 || totalCost > 9999999999.99)
  ) {
    return { payload: null, error: "Total cost is outside the supported range." };
  }

  const cleanItems = (items: string[]) =>
    items.map((item) => item.trim()).filter((item) => item.length > 0);

  return {
    payload: {
      document_id: documentId,
      document_type: draft.document_type,
      document_date: draft.document_date || null,
      expiration_date: draft.expiration_date || null,
      mileage,
      provider: draft.provider.trim() || null,
      total_cost: totalCost,
      completed_work: cleanItems(draft.completed_work),
      recommendations: cleanItems(draft.recommendations),
    },
    error: null,
  };
}

export function VehicleDocumentsSection({
  garageId,
  vehicleId,
  currentUserId,
  maintenanceItems,
  onMaintenanceDataChange,
}: VehicleDocumentsSectionProps) {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [reviewsByDocumentId, setReviewsByDocumentId] = useState<
    Record<string, VehicleDocumentReview>
  >({});
  const [maintenanceDocumentLinks, setMaintenanceDocumentLinks] = useState<
    MaintenanceDocumentLink[]
  >([]);
  const [isGarageOwner, setIsGarageOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType | "">("");
  const [documentDate, setDocumentDate] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [analyzingDocumentId, setAnalyzingDocumentId] = useState<string | null>(null);
  const [openActionMenuDocumentId, setOpenActionMenuDocumentId] = useState<
    string | null
  >(null);
  const [analysisByDocumentId, setAnalysisByDocumentId] = useState<
    Record<string, DocumentAnalysisResult>
  >({});
  const [analysisErrorByDocumentId, setAnalysisErrorByDocumentId] = useState<
    Record<string, string>
  >({});
  const [draftByDocumentId, setDraftByDocumentId] = useState<
    Record<string, DocumentReviewDraft>
  >({});
  const [draftOriginByDocumentId, setDraftOriginByDocumentId] = useState<
    Record<string, "ai" | "saved">
  >({});
  const [draftEvidenceByDocumentId, setDraftEvidenceByDocumentId] = useState<
    Record<string, string | null>
  >({});
  const [savingReviewDocumentId, setSavingReviewDocumentId] = useState<string | null>(
    null,
  );
  const [reviewErrorByDocumentId, setReviewErrorByDocumentId] = useState<
    Record<string, string>
  >({});

  const uploadTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const canUpload = useMemo(
    () => selectedFile !== null && !isUploading,
    [isUploading, selectedFile],
  );

  const loadDocuments = useCallback(async () => {
    const [documentResult, ownerResult] = await Promise.all([
      supabase
        .from("vehicle_documents")
        .select("*")
        .eq("garage_id", garageId)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false }),
      supabase.rpc("is_garage_owner", { p_garage_id: garageId }),
    ]);

    if (documentResult.error) {
      setLoadError(documentResult.error.message);
      setIsLoading(false);
      return;
    }

    const loadedDocuments = (documentResult.data ?? []) as VehicleDocument[];
    let loadedReviews: VehicleDocumentReview[] = [];
    let loadedLinks: MaintenanceDocumentLink[] = [];

    if (loadedDocuments.length > 0) {
      const documentIds = loadedDocuments.map((document) => document.id);
      const [reviewResult, linkResult] = await Promise.all([
        supabase
          .from("vehicle_document_reviews")
          .select("*")
          .in("document_id", documentIds),
        supabase
          .from("maintenance_item_documents")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .in("document_id", documentIds),
      ]);

      if (reviewResult.error) {
        setLoadError(`Document reviews could not be loaded. ${reviewResult.error.message}`);
        setIsLoading(false);
        return;
      }

      if (linkResult.error) {
        setLoadError(`Maintenance links could not be loaded. ${linkResult.error.message}`);
        setIsLoading(false);
        return;
      }

      loadedReviews = (reviewResult.data ?? []) as VehicleDocumentReview[];
      loadedLinks = (linkResult.data ?? []) as MaintenanceDocumentLink[];
    }

    setLoadError(null);
    setDocuments(loadedDocuments);
    setReviewsByDocumentId(
      Object.fromEntries(
        loadedReviews.map((review) => [review.document_id, review]),
      ),
    );
    setMaintenanceDocumentLinks(loadedLinks);
    setIsGarageOwner(ownerResult.error ? false : ownerResult.data === true);
    setIsLoading(false);
  }, [garageId, vehicleId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadDocuments(), 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadDocuments]);

  useEffect(() => {
    if (!showUpload) return;

    const focusTimer = window.setTimeout(() => fileInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [showUpload]);

  useEffect(() => {
    if (!openActionMenuDocumentId) return;

    function closeActionMenu(restoreFocus: boolean) {
      setOpenActionMenuDocumentId(null);
      if (restoreFocus) {
        window.requestAnimationFrame(() => actionMenuTriggerRef.current?.focus());
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !actionMenuRef.current?.contains(event.target)
      ) {
        closeActionMenu(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeActionMenu(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuDocumentId]);

  function toggleActionMenu(
    documentId: string,
    trigger: HTMLButtonElement,
  ) {
    actionMenuTriggerRef.current = trigger;
    setOpenActionMenuDocumentId((current) =>
      current === documentId ? null : documentId,
    );
  }

  function closeActionMenu() {
    setOpenActionMenuDocumentId(null);
  }

  function resetUploadForm() {
    setSelectedFile(null);
    setDocumentType("");
    setDocumentDate("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeUploadPanel(restoreFocus = true) {
    setShowUpload(false);
    setActionError(null);

    if (restoreFocus) {
      window.requestAnimationFrame(() => uploadTriggerRef.current?.focus());
    }
  }

  function toggleUploadPanel() {
    setActionError(null);
    setShowUpload((current) => !current);
  }

  async function uploadDocument() {
    if (!selectedFile || isUploading) return;

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setActionError(validationError);
      fileInputRef.current?.focus();
      return;
    }

    const mimeType = selectedFile.type;
    if (!isAcceptedMimeType(mimeType)) return;

    let documentId: string;
    try {
      documentId = createUuidV4();
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Secure random UUID generation is not available in this browser.",
      );
      return;
    }

    setIsUploading(true);
    setActionError(null);
    setAnnouncement("");

    const extension = extensionByMimeType[mimeType];
    const storagePath = `${garageId}/${vehicleId}/${documentId}/original.${extension}`;
    const payload: VehicleDocumentInsert = {
      id: documentId,
      garage_id: garageId,
      vehicle_id: vehicleId,
      uploaded_by: currentUserId,
      storage_path: storagePath,
      filename: selectedFile.name,
      mime_type: mimeType,
      document_type: documentType || null,
      document_date: documentDate || null,
    };

    const { error: metadataError } = await supabase
      .from("vehicle_documents")
      .insert(payload);

    if (metadataError) {
      setActionError(metadataError.message);
      setIsUploading(false);
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, selectedFile, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });

    if (storageError) {
      const { data: removedMetadata, error: cleanupError } = await supabase
        .from("vehicle_documents")
        .delete()
        .eq("id", documentId)
        .eq("garage_id", garageId)
        .eq("vehicle_id", vehicleId)
        .select("id")
        .maybeSingle();

      const cleanupFailed = cleanupError || !removedMetadata;
      setActionError(
        cleanupFailed
          ? `${storageError.message} Metadata cleanup also failed; retry or contact the garage owner.`
          : storageError.message,
      );
      setIsUploading(false);
      return;
    }

    resetUploadForm();
    await loadDocuments();
    setShowUpload(false);
    setIsUploading(false);
    setAnnouncement(`${selectedFile.name} uploaded.`);
    window.requestAnimationFrame(() => uploadTriggerRef.current?.focus());
  }

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void uploadDocument();
  }

  async function openDocument(document: VehicleDocument, download: boolean) {
    const pendingWindow = window.open("", "_blank");
    if (pendingWindow) pendingWindow.opener = null;

    setActionError(null);
    if (download) {
      setDownloadingDocumentId(document.id);
    } else {
      setOpeningDocumentId(document.id);
    }

    const { data, error } = await createVehicleDocumentSignedUrl(
      document.storage_path,
      document.filename,
      download,
    );

    if (error || !data?.signedUrl) {
      pendingWindow?.close();
      setActionError(error?.message ?? "Could not create a secure document link.");
    } else if (pendingWindow) {
      pendingWindow.location.replace(data.signedUrl);
    } else {
      window.location.assign(data.signedUrl);
    }

    setOpeningDocumentId(null);
    setDownloadingDocumentId(null);
  }

  async function deleteDocument(document: VehicleDocument) {
    const confirmed = window.confirm(
      `Delete “${document.filename}”? This permanently removes the original file.`,
    );
    if (!confirmed) return;

    setDeletingDocumentId(document.id);
    setActionError(null);
    setAnnouncement("");

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([document.storage_path]);

    if (storageError) {
      setActionError(`The file was not deleted. ${storageError.message}`);
      setDeletingDocumentId(null);
      return;
    }

    const { data: removedMetadata, error: metadataError } = await supabase
      .from("vehicle_documents")
      .delete()
      .eq("id", document.id)
      .eq("garage_id", garageId)
      .eq("vehicle_id", vehicleId)
      .select("id")
      .maybeSingle();

    if (metadataError || !removedMetadata) {
      setActionError(
        "The original file was removed, but its document record could not be deleted. Please retry or contact the garage owner.",
      );
      setDeletingDocumentId(null);
      return;
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setAnalysisByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setAnalysisErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setReviewsByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setMaintenanceDocumentLinks((current) =>
      current.filter((link) => link.document_id !== document.id),
    );
    setDraftByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setDraftOriginByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setDraftEvidenceByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setReviewErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setDeletingDocumentId(null);
    setAnnouncement(`${document.filename} deleted.`);
    try {
      await onMaintenanceDataChange();
    } catch {
      setActionError(
        "The document was deleted, but linked maintenance could not be refreshed. Reload the page to update it.",
      );
    }
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function setReviewDraft(
    documentId: string,
    draft: DocumentReviewDraft,
    origin: "ai" | "saved",
    evidence: string | null = null,
  ) {
    setDraftByDocumentId((current) => ({ ...current, [documentId]: draft }));
    setDraftOriginByDocumentId((current) => ({
      ...current,
      [documentId]: origin,
    }));
    setDraftEvidenceByDocumentId((current) => ({
      ...current,
      [documentId]: evidence,
    }));
    setReviewErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
  }

  function clearReviewDraft(documentId: string) {
    setDraftByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    setDraftOriginByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    setDraftEvidenceByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
    setReviewErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
  }

  function editSavedReview(review: VehicleDocumentReview) {
    setReviewDraft(review.document_id, createReviewDraft(review), "saved");
  }

  function applyProposalAsDraft(
    documentId: string,
    analysis: DocumentAnalysisResult,
  ) {
    if (
      draftByDocumentId[documentId] &&
      !window.confirm("Replace your current unsaved review edits with this AI proposal?")
    ) {
      return;
    }

    setReviewDraft(
      documentId,
      createReviewDraft(analysis),
      "ai",
      analysis.document_date_evidence,
    );
  }

  function discardProposal(documentId: string) {
    setAnalysisByDocumentId((current) => {
      const next = { ...current };
      delete next[documentId];
      return next;
    });
  }

  async function saveReview(
    document: VehicleDocument,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (savingReviewDocumentId !== null) return;

    const draft = draftByDocumentId[document.id];
    if (!draft) return;

    const normalized = normalizeReviewDraft(document.id, draft);
    if (normalized.error) {
      setReviewErrorByDocumentId((current) => ({
        ...current,
        [document.id]: normalized.error,
      }));
      return;
    }

    setSavingReviewDocumentId(document.id);
    setReviewErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setAnnouncement("");

    const existingReview = reviewsByDocumentId[document.id];
    const mutation = existingReview
      ? supabase
          .from("vehicle_document_reviews")
          .update(normalized.payload)
          .eq("document_id", document.id)
          .select("document_id")
          .maybeSingle()
      : supabase
          .from("vehicle_document_reviews")
          .insert(normalized.payload)
          .select("document_id")
          .maybeSingle();
    const { data: changedReview, error: saveError } = await mutation;

    if (saveError || !changedReview) {
      setReviewErrorByDocumentId((current) => ({
        ...current,
        [document.id]:
          saveError?.message ?? "The review was not saved. Check your access and retry.",
      }));
      setSavingReviewDocumentId(null);
      return;
    }

    const { data: savedReview, error: reloadError } = await supabase
      .from("vehicle_document_reviews")
      .select("*")
      .eq("document_id", document.id)
      .single();

    if (reloadError || !savedReview) {
      setReviewErrorByDocumentId((current) => ({
        ...current,
        [document.id]:
          reloadError?.message ??
          "The review saved, but its persisted values could not be reloaded.",
      }));
      setSavingReviewDocumentId(null);
      return;
    }

    setReviewsByDocumentId((current) => ({
      ...current,
      [document.id]: savedReview as VehicleDocumentReview,
    }));
    clearReviewDraft(document.id);
    setAnalysisByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });
    setSavingReviewDocumentId(null);
    setAnnouncement(`${document.filename} review saved.`);
  }

  async function analyzeDocument(document: VehicleDocument) {
    if (analyzingDocumentId !== null) return;

    if (!isAnalyzableDocumentMimeType(document.mime_type)) {
      setAnalysisErrorByDocumentId((current) => ({
        ...current,
        [document.id]:
          "AI analysis currently supports PDF, JPEG, PNG, and WebP documents. HEIC and HEIF analysis is not available yet.",
      }));
      return;
    }

    setAnalyzingDocumentId(document.id);
    setAnalysisErrorByDocumentId((current) => {
      const next = { ...current };
      delete next[document.id];
      return next;
    });

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      setAnalysisErrorByDocumentId((current) => ({
        ...current,
        [document.id]: "Your session is no longer valid. Sign in again.",
      }));
      setAnalyzingDocumentId(null);
      return;
    }

    try {
      const response = await fetch("/api/documents/analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId: document.id }),
      });
      const result: unknown = await response.json();

      if (
        !response.ok ||
        typeof result !== "object" ||
        result === null ||
        !("analysis" in result) ||
        !isDocumentAnalysisResult(result.analysis)
      ) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "AI analysis failed. Please try again.";
        throw new Error(message);
      }

      const analysis = result.analysis;
      if (!reviewsByDocumentId[document.id] && !draftByDocumentId[document.id]) {
        setAnalysisByDocumentId((current) => {
          const next = { ...current };
          delete next[document.id];
          return next;
        });
        setReviewDraft(
          document.id,
          createReviewDraft(analysis),
          "ai",
          analysis.document_date_evidence,
        );
      } else {
        setAnalysisByDocumentId((current) => ({
          ...current,
          [document.id]: analysis,
        }));
      }
      setAnnouncement(`${document.filename} analyzed. Review the extracted proposal.`);
    } catch (error: unknown) {
      setAnalysisErrorByDocumentId((current) => ({
        ...current,
        [document.id]:
          error instanceof Error
            ? error.message
            : "AI analysis failed. Please try again.",
      }));
    } finally {
      setAnalyzingDocumentId(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="vehicle-documents-heading">
      <div className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <div className={styles.sectionHeading}>
            <h2
              ref={headingRef}
              id="vehicle-documents-heading"
              className={styles.sectionTitle}
              tabIndex={-1}
            >
              Documents
            </h2>
            <StatusBadge tone="neutral">{documents.length}</StatusBadge>
          </div>
          <p className={styles.sectionDescription}>
            Keep important vehicle records with the vehicle they belong to.
          </p>
        </div>

        <Button
          ref={uploadTriggerRef}
          variant="primary"
          className={styles.addDocumentAction}
          aria-label={showUpload ? "Close add document form" : "Add document"}
          aria-expanded={showUpload}
          aria-controls="add-vehicle-document-panel"
          onClick={toggleUploadPanel}
        >
          <span className={styles.actionLabelDesktop} aria-hidden="true">
            {showUpload ? "Close" : "+ Add document"}
          </span>
          <span className={styles.actionLabelMobile} aria-hidden="true">
            {showUpload ? "Close" : "+ Add"}
          </span>
        </Button>
      </div>

      <span className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </span>

      {showUpload ? (
        <Card
          id="add-vehicle-document-panel"
          tone="subtle"
          padding="lg"
          className={styles.uploadPanel}
        >
          <h3 className={styles.panelTitle}>Add document</h3>
          <p className={styles.panelDescription}>
            Upload one PDF or image up to 15 MB. The original file is stored privately.
          </p>

          <form onSubmit={submitUpload}>
            <div className={styles.formGrid}>
              <label className={`${styles.label} ${styles.fileField}`}>
                File
                <input
                  ref={fileInputRef}
                  type="file"
                  required
                  disabled={isUploading}
                  accept={fileAcceptValue}
                  className={styles.fileInput}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setActionError(file ? validateFile(file) : null);
                  }}
                />
                <span className={styles.fileHelp}>
                  PDF, JPEG, PNG, WebP, HEIC, or HEIF · 15 MB maximum
                </span>
              </label>

              <label className={styles.label}>
                Document type <span className={styles.optional}>(optional)</span>
                <select
                  value={documentType}
                  disabled={isUploading}
                  className={styles.input}
                  onChange={(event) =>
                    setDocumentType(event.target.value as DocumentType | "")
                  }
                >
                  <option value="">Not specified</option>
                  {documentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.label}>
                Document date <span className={styles.optional}>(optional)</span>
                <input
                  type="date"
                  value={documentDate}
                  disabled={isUploading}
                  className={styles.input}
                  onChange={(event) => setDocumentDate(event.target.value)}
                />
              </label>
            </div>

            {actionError ? (
              <p role="alert" className={styles.errorMessage}>
                {actionError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <Button
                variant="ghost"
                disabled={isUploading}
                onClick={() => closeUploadPanel()}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!canUpload || !!actionError}>
                {isUploading ? "Uploading…" : "Upload document"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {!showUpload && actionError ? (
        <p role="alert" className={styles.errorMessage}>
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <Card tone="subtle" className={styles.emptyState}>
          <p className={styles.emptyTitle}>Loading documents…</p>
        </Card>
      ) : loadError ? (
        <Card tone="subtle" className={styles.emptyState}>
          <p className={styles.emptyTitle}>Documents could not be loaded</p>
          <p className={styles.emptyCopy}>{loadError}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              void loadDocuments();
            }}
          >
            Retry
          </Button>
        </Card>
      ) : documents.length === 0 ? (
        <Card tone="subtle" className={styles.emptyState}>
          <p className={styles.emptyTitle}>No documents yet</p>
          <p className={styles.emptyCopy}>
            Store repair invoices, registrations, inspections, insurance documents, and other
            vehicle records here.
          </p>
        </Card>
      ) : (
        <ul className={styles.documentList}>
          {documents.map((document) => {
            const savedReview = reviewsByDocumentId[document.id];
            const friendlyType = getFriendlyDocumentType(
              savedReview?.document_type ?? document.document_type,
            );
            const displayDocumentDate = savedReview
              ? savedReview.document_date
              : document.document_date;
            const canDelete = document.uploaded_by === currentUserId || isGarageOwner;
            const isOpening = openingDocumentId === document.id;
            const isDownloading = downloadingDocumentId === document.id;
            const isDeleting = deletingDocumentId === document.id;
            const isAnalyzing = analyzingDocumentId === document.id;
            const analysis = analysisByDocumentId[document.id];
            const analysisError = analysisErrorByDocumentId[document.id];
            const reviewDraft = draftByDocumentId[document.id];
            const reviewError = reviewErrorByDocumentId[document.id];
            const isSavingReview = savingReviewDocumentId === document.id;
            const isAiDraft = draftOriginByDocumentId[document.id] === "ai";
            const draftEvidence = draftEvidenceByDocumentId[document.id] ?? null;

            return (
              <li key={document.id}>
                <Card padding="md" className={styles.documentCard}>
                  <div className={styles.documentContent}>
                    <div className={styles.documentMainRow}>
                      <div className={styles.documentDetails}>
                        <div className={styles.documentHeading}>
                          <h3 className={styles.filename}>{document.filename}</h3>
                          {friendlyType ? (
                            <StatusBadge tone="info">{friendlyType}</StatusBadge>
                          ) : null}
                          {savedReview ? (
                            <StatusBadge tone="success">Saved review</StatusBadge>
                          ) : null}
                        </div>
                        <div className={styles.documentMeta}>
                          {displayDocumentDate ? (
                            <span>Document date {formatDateOnly(displayDocumentDate)}</span>
                          ) : null}
                          <span>Uploaded {formatTimestamp(document.created_at)}</span>
                        </div>
                      </div>

                      <div className={styles.documentActions}>
                        {!savedReview ? (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={
                              analyzingDocumentId !== null ||
                              isOpening ||
                              isDownloading ||
                              isDeleting
                            }
                            onClick={() => void analyzeDocument(document)}
                          >
                            {isAnalyzing ? "Analyzing…" : "Analyze"}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isOpening || isDownloading || isDeleting || isAnalyzing}
                          onClick={() => void openDocument(document, false)}
                        >
                          {isOpening ? "Opening…" : "Open"}
                        </Button>

                        <div
                          ref={
                            openActionMenuDocumentId === document.id
                              ? actionMenuRef
                              : undefined
                          }
                          className={styles.actionMenuRoot}
                        >
                          <button
                            type="button"
                            className={styles.actionMenuTrigger}
                            aria-label={`More actions for ${document.filename}`}
                            aria-expanded={openActionMenuDocumentId === document.id}
                            aria-controls={`document-actions-${document.id}`}
                            disabled={isOpening || isDownloading || isDeleting || isAnalyzing}
                            onClick={(event) =>
                              toggleActionMenu(document.id, event.currentTarget)
                            }
                          >
                            <span aria-hidden="true">•••</span>
                          </button>

                          {openActionMenuDocumentId === document.id ? (
                            <div
                              id={`document-actions-${document.id}`}
                              className={styles.actionMenu}
                              role="group"
                              aria-label={`More actions for ${document.filename}`}
                            >
                              {savedReview ? (
                                <button
                                  type="button"
                                  className={styles.actionMenuItem}
                                  disabled={analyzingDocumentId !== null}
                                  onClick={() => {
                                    closeActionMenu();
                                    void analyzeDocument(document);
                                  }}
                                >
                                  Re-analyze
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.actionMenuItem}
                                onClick={() => {
                                  closeActionMenu();
                                  void openDocument(document, true);
                                }}
                              >
                                Download
                              </button>
                              {canDelete ? (
                                <>
                                  <div
                                    className={styles.actionMenuSeparator}
                                    role="separator"
                                  />
                                  <button
                                    type="button"
                                    className={`${styles.actionMenuItem} ${styles.actionMenuDanger}`}
                                    onClick={() => {
                                      closeActionMenu();
                                      void deleteDocument(document);
                                    }}
                                  >
                                    Delete document
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {isAnalyzing ? (
                      <p className={styles.analysisStatus} role="status">
                        Analyzing the private original document…
                      </p>
                    ) : null}
                    {analysisError ? (
                      <p className={styles.analysisError} role="alert">
                        {analysisError}
                      </p>
                    ) : null}
                    {savedReview ? (
                      <SavedDocumentReview
                        review={savedReview}
                        isEditing={reviewDraft !== undefined}
                        onEdit={() => editSavedReview(savedReview)}
                      />
                    ) : null}

                    {savedReview?.document_type === "repair_invoice" ? (
                      <DocumentMaintenanceLinks
                        documentId={document.id}
                        vehicleId={vehicleId}
                        review={savedReview}
                        maintenanceItems={maintenanceItems}
                        links={maintenanceDocumentLinks.filter(
                          (link) => link.document_id === document.id,
                        )}
                        onDocumentRelationshipsChanged={loadDocuments}
                        onMaintenanceDataChanged={onMaintenanceDataChange}
                        onAnnounce={setAnnouncement}
                      />
                    ) : null}

                    {analysis ? (
                      <DocumentAnalysisProposal
                        analysis={analysis}
                        onDiscardProposal={() => discardProposal(document.id)}
                        onUseProposal={() =>
                          applyProposalAsDraft(document.id, analysis)
                        }
                      />
                    ) : null}

                    {reviewDraft ? (
                      <DocumentReviewForm
                        draft={reviewDraft}
                        evidence={isAiDraft ? draftEvidence : null}
                        isSaving={isSavingReview}
                        error={reviewError ?? null}
                        isAiDraft={isAiDraft}
                        onChange={(draft) =>
                          setDraftByDocumentId((current) => ({
                            ...current,
                            [document.id]: draft,
                          }))
                        }
                        onCancel={() => clearReviewDraft(document.id)}
                        onSubmit={(event) => void saveReview(document, event)}
                      />
                    ) : null}

                    {!reviewDraft && reviewError ? (
                      <p className={styles.analysisError} role="alert">
                        {reviewError}
                      </p>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
