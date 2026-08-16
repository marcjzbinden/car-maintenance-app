"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { dateOnlyToNoonUtc } from "@/lib/maintenanceDates";
import { supabase } from "@/lib/supabaseClient";
import styles from "./DocumentMaintenanceLinks.module.css";

type MaintenanceItem = Pick<
  Tables<"maintenance_items">,
  | "id"
  | "vehicle_id"
  | "title"
  | "due_date"
  | "completed_at"
  | "service_mileage"
  | "created_at"
>;

type DocumentReview = Tables<"vehicle_document_reviews">;
type MaintenanceDocumentLink = Tables<"maintenance_item_documents">;

type DocumentMaintenanceLinksProps = {
  documentId: string;
  vehicleId: string;
  review: DocumentReview;
  maintenanceItems: MaintenanceItem[];
  links: MaintenanceDocumentLink[];
  onDocumentRelationshipsChanged: () => Promise<void>;
  onMaintenanceDataChanged: () => Promise<void>;
  onAnnounce: (message: string) => void;
};

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

function formatCompletedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMileage(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function getItemContext(item: MaintenanceItem) {
  if (item.completed_at) {
    return `Completed ${formatCompletedDate(item.completed_at)}`;
  }

  return item.due_date ? `Due ${formatDateOnly(item.due_date)}` : "No due date";
}

export function DocumentMaintenanceLinks({
  documentId,
  vehicleId,
  review,
  maintenanceItems,
  links,
  onDocumentRelationshipsChanged,
  onMaintenanceDataChanged,
  onAnnounce,
}: DocumentMaintenanceLinksProps) {
  const [showChooser, setShowChooser] = useState(false);
  const [selectedMaintenanceItemId, setSelectedMaintenanceItemId] = useState("");
  const [markCompletedFromInvoice, setMarkCompletedFromInvoice] = useState(false);
  const [useInvoiceMileage, setUseInvoiceMileage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unlinkingMaintenanceItemId, setUnlinkingMaintenanceItemId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const linkedMaintenanceItemIds = useMemo(
    () => new Set(links.map((link) => link.maintenance_item_id)),
    [links],
  );

  const sortedMaintenanceItems = useMemo(
    () => [...maintenanceItems].sort((a, b) => {
      const completionDifference = Number(Boolean(a.completed_at))
        - Number(Boolean(b.completed_at));
      if (completionDifference !== 0) return completionDifference;

      if (!a.completed_at && !b.completed_at) {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
      }

      if (a.completed_at && b.completed_at) {
        return b.completed_at.localeCompare(a.completed_at);
      }

      return b.created_at.localeCompare(a.created_at);
    }),
    [maintenanceItems],
  );

  const selectedMaintenanceItem = maintenanceItems.find(
    (item) => item.id === selectedMaintenanceItemId,
  );
  const linkedMaintenanceItems = links
    .map((link) => maintenanceItems.find((item) => item.id === link.maintenance_item_id))
    .filter((item): item is MaintenanceItem => item !== undefined);
  const canOfferInvoiceCompletion = Boolean(
    selectedMaintenanceItem
    && !selectedMaintenanceItem.completed_at
    && review.document_date,
  );
  const hasInvoiceMileage = review.mileage !== null && review.mileage >= 0;

  function resetChooser() {
    setSelectedMaintenanceItemId("");
    setMarkCompletedFromInvoice(false);
    setUseInvoiceMileage(false);
    setError(null);
  }

  function closeChooser() {
    setShowChooser(false);
    resetChooser();
  }

  async function refreshRelatedData() {
    const results = await Promise.allSettled([
      onDocumentRelationshipsChanged(),
      onMaintenanceDataChanged(),
    ]);

    return results.some((result) => result.status === "rejected");
  }

  async function linkMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMaintenanceItem || saving) return;

    if (linkedMaintenanceItemIds.has(selectedMaintenanceItem.id)) {
      setError("This maintenance item is already linked.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: linkError } = await supabase
      .from("maintenance_item_documents")
      .insert({
        document_id: documentId,
        maintenance_item_id: selectedMaintenanceItem.id,
        vehicle_id: vehicleId,
      });

    if (linkError) {
      setError(
        linkError.code === "23505"
          ? "This maintenance item is already linked."
          : linkError.message,
      );
      setSaving(false);
      await onDocumentRelationshipsChanged();
      return;
    }

    let completionError: string | null = null;
    if (
      markCompletedFromInvoice
      && canOfferInvoiceCompletion
      && review.document_date
    ) {
      const completedAt = dateOnlyToNoonUtc(review.document_date);

      if (!completedAt) {
        completionError = "The invoice date could not be converted safely.";
      } else {
        const updatePayload: {
          completed_at: string;
          service_mileage?: number;
        } = {
          completed_at: completedAt,
        };

        if (useInvoiceMileage && hasInvoiceMileage && review.mileage !== null) {
          updatePayload.service_mileage = review.mileage;
        }

        const { data: completedItem, error: updateError } = await supabase
          .from("maintenance_items")
          .update(updatePayload)
          .eq("id", selectedMaintenanceItem.id)
          .eq("vehicle_id", vehicleId)
          .is("completed_at", null)
          .select("id")
          .maybeSingle();

        if (updateError || !completedItem) {
          completionError = updateError?.message
            ?? "The maintenance item was no longer open or could not be updated.";
        }
      }
    }

    const refreshFailed = await refreshRelatedData();

    setSaving(false);
    setShowChooser(false);
    setSelectedMaintenanceItemId("");
    setMarkCompletedFromInvoice(false);
    setUseInvoiceMileage(false);

    if (completionError) {
      setError(
        `Document linked, but maintenance completion/details were not updated. ${completionError}`,
      );
      onAnnounce("Document linked, but maintenance details were not updated.");
    } else if (refreshFailed) {
      setError(
        "Document linked, but the updated maintenance display could not be refreshed. Reload the page to verify it.",
      );
      onAnnounce("Document linked. Reload the page to refresh maintenance details.");
    } else {
      setError(null);
      onAnnounce(
        markCompletedFromInvoice
          ? "Document linked and maintenance marked completed."
          : "Document linked to maintenance.",
      );
    }
  }

  async function unlinkMaintenance(item: MaintenanceItem) {
    const confirmed = window.confirm(
      `Unlink "${item.title}" from this document? The document and maintenance item will be kept.`,
    );
    if (!confirmed) return;

    setUnlinkingMaintenanceItemId(item.id);
    setError(null);

    const { data: removedLink, error: unlinkError } = await supabase
      .from("maintenance_item_documents")
      .delete()
      .eq("document_id", documentId)
      .eq("maintenance_item_id", item.id)
      .eq("vehicle_id", vehicleId)
      .select("maintenance_item_id")
      .maybeSingle();

    if (unlinkError || !removedLink) {
      setError(unlinkError?.message ?? "The maintenance link could not be removed.");
      setUnlinkingMaintenanceItemId(null);
      return;
    }

    const refreshFailed = await refreshRelatedData();
    setUnlinkingMaintenanceItemId(null);
    if (refreshFailed) {
      setError(
        "Maintenance was unlinked, but the display could not be refreshed. Reload the page to verify it.",
      );
      onAnnounce("Maintenance unlinked. Reload the page to refresh the display.");
    } else {
      onAnnounce("Maintenance unlinked. The document and maintenance record were kept.");
    }
  }

  return (
    <Card tone="subtle" padding="md" className={styles.panel}>
      <div className={styles.headingRow}>
        <div className={styles.heading}>
          <h4 className={styles.title}>Linked maintenance</h4>
          <StatusBadge tone="neutral">{linkedMaintenanceItems.length}</StatusBadge>
        </div>
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={showChooser}
          aria-controls={`maintenance-link-chooser-${documentId}`}
          onClick={() => {
            if (showChooser) {
              closeChooser();
            } else {
              setError(null);
              setShowChooser(true);
            }
          }}
        >
          {showChooser ? "Close" : "Link maintenance"}
        </Button>
      </div>

      {linkedMaintenanceItems.length > 0 ? (
        <ul className={styles.linkedList}>
          {linkedMaintenanceItems.map((item) => (
            <li key={item.id} className={styles.linkedItem}>
              <div>
                <p className={styles.itemTitle}>{item.title}</p>
                <p className={styles.itemMeta}>{getItemContext(item)}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={unlinkingMaintenanceItemId !== null || saving}
                onClick={() => void unlinkMaintenance(item)}
              >
                {unlinkingMaintenanceItemId === item.id ? "Unlinking..." : "Unlink"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyCopy}>No maintenance records linked yet.</p>
      )}

      {showChooser ? (
        <form
          id={`maintenance-link-chooser-${documentId}`}
          className={styles.chooser}
          onSubmit={linkMaintenance}
        >
          <fieldset className={styles.fieldset} disabled={saving}>
            <legend className={styles.legend}>Choose maintenance</legend>
            {sortedMaintenanceItems.length > 0 ? (
              <div className={styles.options}>
                {sortedMaintenanceItems.map((item) => {
                  const alreadyLinked = linkedMaintenanceItemIds.has(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`${styles.option} ${alreadyLinked ? styles.optionDisabled : ""}`}
                    >
                      <input
                        type="radio"
                        name={`maintenance-link-${documentId}`}
                        value={item.id}
                        checked={selectedMaintenanceItemId === item.id}
                        disabled={alreadyLinked}
                        onChange={() => {
                          setSelectedMaintenanceItemId(item.id);
                          setMarkCompletedFromInvoice(false);
                          setUseInvoiceMileage(false);
                          setError(null);
                        }}
                      />
                      <span className={styles.optionCopy}>
                        <span className={styles.optionTitleRow}>
                          <span className={styles.itemTitle}>{item.title}</span>
                          <StatusBadge tone={item.completed_at ? "success" : "neutral"}>
                            {alreadyLinked
                              ? "Linked"
                              : item.completed_at
                                ? "Completed"
                                : "Open"}
                          </StatusBadge>
                        </span>
                        <span className={styles.itemMeta}>
                          {getItemContext(item)}
                          {item.service_mileage !== null
                            ? ` · ${formatMileage(item.service_mileage)} mi`
                            : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyCopy}>No maintenance records for this vehicle.</p>
            )}
          </fieldset>

          {selectedMaintenanceItem && !selectedMaintenanceItem.completed_at ? (
            <div className={styles.completionOptions}>
              {canOfferInvoiceCompletion && review.document_date ? (
                <>
                  <label className={styles.checkboxChoice}>
                    <input
                      type="checkbox"
                      checked={markCompletedFromInvoice}
                      disabled={saving}
                      onChange={(event) => {
                        setMarkCompletedFromInvoice(event.target.checked);
                        if (!event.target.checked) setUseInvoiceMileage(false);
                      }}
                    />
                    <span>
                      Mark this maintenance item completed using invoice details
                    </span>
                  </label>
                  {markCompletedFromInvoice ? (
                    <div className={styles.invoiceValues}>
                      <p>
                        Completion date: <strong>{formatDateOnly(review.document_date)}</strong>
                      </p>
                      {hasInvoiceMileage && review.mileage !== null ? (
                        <label className={styles.checkboxChoice}>
                          <input
                            type="checkbox"
                            checked={useInvoiceMileage}
                            disabled={saving}
                            onChange={(event) => setUseInvoiceMileage(event.target.checked)}
                          />
                          <span>
                            Use invoice mileage: {formatMileage(review.mileage)} mi
                          </span>
                        </label>
                      ) : (
                        <p>Service mileage: Not recorded on the invoice</p>
                      )}
                    </div>
                  ) : null}
                </>
              ) : review.mileage !== null ? (
                <p className={styles.helperCopy}>
                  Invoice mileage is available, but a reviewed service date is required to
                  complete the item here. Link it now and use the normal Mark done flow later.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" disabled={saving} onClick={closeChooser}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!selectedMaintenanceItem || saving}
            >
              {saving ? "Linking..." : "Link maintenance"}
            </Button>
          </div>
        </form>
      ) : error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
