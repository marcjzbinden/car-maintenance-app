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
import { supabase } from "@/lib/supabaseClient";
import { createUuidV4 } from "@/lib/uuid";
import styles from "./VehicleDocumentsSection.module.css";

type VehicleDocument = Tables<"vehicle_documents">;
type VehicleDocumentInsert = TablesInsert<"vehicle_documents">;
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
};

const BUCKET_NAME = "vehicle-documents";
const SIGNED_URL_LIFETIME_SECONDS = 60;
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

export function VehicleDocumentsSection({
  garageId,
  vehicleId,
  currentUserId,
}: VehicleDocumentsSectionProps) {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
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

  const uploadTriggerRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

    setLoadError(null);
    setDocuments((documentResult.data ?? []) as VehicleDocument[]);
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

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        document.storage_path,
        SIGNED_URL_LIFETIME_SECONDS,
        download ? { download: document.filename } : undefined,
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
    setDeletingDocumentId(null);
    setAnnouncement(`${document.filename} deleted.`);
    window.requestAnimationFrame(() => headingRef.current?.focus());
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
            const friendlyType = getFriendlyDocumentType(document.document_type);
            const canDelete = document.uploaded_by === currentUserId || isGarageOwner;
            const isOpening = openingDocumentId === document.id;
            const isDownloading = downloadingDocumentId === document.id;
            const isDeleting = deletingDocumentId === document.id;

            return (
              <li key={document.id}>
                <Card padding="md" className={styles.documentCard}>
                  <div className={styles.documentContent}>
                    <div className={styles.documentDetails}>
                      <div className={styles.documentHeading}>
                        <h3 className={styles.filename}>{document.filename}</h3>
                        {friendlyType ? (
                          <StatusBadge tone="info">{friendlyType}</StatusBadge>
                        ) : null}
                      </div>
                      <div className={styles.documentMeta}>
                        {document.document_date ? (
                          <span>Document date {formatDateOnly(document.document_date)}</span>
                        ) : null}
                        <span>Uploaded {formatTimestamp(document.created_at)}</span>
                      </div>
                    </div>

                    <div className={styles.documentActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isOpening || isDownloading || isDeleting}
                        onClick={() => void openDocument(document, false)}
                      >
                        {isOpening ? "Opening…" : "Open"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isOpening || isDownloading || isDeleting}
                        onClick={() => void openDocument(document, true)}
                      >
                        {isDownloading ? "Preparing…" : "Download"}
                      </Button>
                      {canDelete ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isOpening || isDownloading || isDeleting}
                          onClick={() => void deleteDocument(document)}
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </Button>
                      ) : null}
                    </div>
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
