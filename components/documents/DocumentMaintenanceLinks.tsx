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
  | "service_provider"
  | "self_performed"
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
  const [replaceCompletionDateFromInvoice, setReplaceCompletionDateFromInvoice] =
    useState(false);
  const [useInvoiceMileage, setUseInvoiceMileage] = useState(false);
  const [useInvoiceProvider, setUseInvoiceProvider] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingMaintenanceItemId, setApplyingMaintenanceItemId] = useState<
    string | null
  >(null);
  const [applyLinkedCompletionDate, setApplyLinkedCompletionDate] = useState(false);
  const [applyLinkedMileage, setApplyLinkedMileage] = useState(false);
  const [applyLinkedProvider, setApplyLinkedProvider] = useState(false);
  const [savingLinkedDetails, setSavingLinkedDetails] = useState(false);
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
  const reviewedProvider = review.provider?.trim() || null;

  function resetChooser() {
    setSelectedMaintenanceItemId("");
    setMarkCompletedFromInvoice(false);
    setReplaceCompletionDateFromInvoice(false);
    setUseInvoiceMileage(false);
    setUseInvoiceProvider(false);
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

  async function updateMaintenanceFromInvoice(
    item: MaintenanceItem,
    useCompletionDate: boolean,
    useServiceMileage: boolean,
    useServiceProvider: boolean,
  ) {
    const updatePayload: {
      completed_at?: string;
      service_mileage?: number;
      service_provider?: string | null;
      self_performed?: boolean;
    } = {};

    if (useCompletionDate) {
      if (!review.document_date) {
        return "The reviewed invoice does not contain a service date.";
      }

      const completedAt = dateOnlyToNoonUtc(review.document_date);
      if (!completedAt) {
        return "The invoice date could not be converted safely.";
      }
      updatePayload.completed_at = completedAt;
    }

    if (useServiceMileage) {
      if (!hasInvoiceMileage || review.mileage === null) {
        return "The reviewed invoice does not contain valid service mileage.";
      }
      updatePayload.service_mileage = review.mileage;
    }

    if (useServiceProvider) {
      if (!reviewedProvider) {
        return "The reviewed invoice does not contain a service provider.";
      }
      updatePayload.service_provider = reviewedProvider;
      updatePayload.self_performed = false;
    }

    if (Object.keys(updatePayload).length === 0) return null;

    let updateQuery = supabase
      .from("maintenance_items")
      .update(updatePayload)
      .eq("id", item.id)
      .eq("vehicle_id", vehicleId);

    updateQuery = item.completed_at
      ? updateQuery.eq("completed_at", item.completed_at)
      : updateQuery.is("completed_at", null);

    const { data: updatedItem, error: updateError } = await updateQuery
      .select("id")
      .maybeSingle();

    if (updateError || !updatedItem) {
      return updateError?.message
        ?? "The maintenance item changed or could not be updated.";
    }

    return null;
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

    const useCompletionDate = selectedMaintenanceItem.completed_at
      ? replaceCompletionDateFromInvoice
      : markCompletedFromInvoice && canOfferInvoiceCompletion;
    const useServiceMileage = selectedMaintenanceItem.completed_at
      ? useInvoiceMileage
      : markCompletedFromInvoice && useInvoiceMileage;
    const useServiceProvider = useInvoiceProvider && Boolean(reviewedProvider);
    const maintenanceUpdateRequested =
      useCompletionDate || useServiceMileage || useServiceProvider;
    const maintenanceUpdateError = maintenanceUpdateRequested
      ? await updateMaintenanceFromInvoice(
          selectedMaintenanceItem,
          useCompletionDate,
          useServiceMileage,
          useServiceProvider,
        )
      : null;

    const refreshFailed = await refreshRelatedData();

    setSaving(false);
    setShowChooser(false);
    setSelectedMaintenanceItemId("");
    setMarkCompletedFromInvoice(false);
    setReplaceCompletionDateFromInvoice(false);
    setUseInvoiceMileage(false);
    setUseInvoiceProvider(false);

    if (maintenanceUpdateError) {
      setError(
        `Document linked, but maintenance details were not updated. ${maintenanceUpdateError}`,
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
        maintenanceUpdateRequested
          ? "Document linked and selected maintenance details updated."
          : "Document linked to maintenance.",
      );
    }
  }

  function closeApplyDetails() {
    setApplyingMaintenanceItemId(null);
    setApplyLinkedCompletionDate(false);
    setApplyLinkedMileage(false);
    setApplyLinkedProvider(false);
    setSavingLinkedDetails(false);
    setError(null);
  }

  function toggleApplyDetails(item: MaintenanceItem) {
    if (applyingMaintenanceItemId === item.id) {
      closeApplyDetails();
      return;
    }

    if (showChooser) closeChooser();
    setApplyingMaintenanceItemId(item.id);
    setApplyLinkedCompletionDate(false);
    setApplyLinkedMileage(false);
    setApplyLinkedProvider(false);
    setError(null);
  }

  async function applyDetailsToLinkedMaintenance(
    event: FormEvent<HTMLFormElement>,
    item: MaintenanceItem,
  ) {
    event.preventDefault();
    if (savingLinkedDetails) return;

    const useCompletionDate = item.completed_at
      ? applyLinkedCompletionDate
      : applyLinkedCompletionDate && Boolean(review.document_date);
    const useServiceMileage = item.completed_at
      ? applyLinkedMileage
      : applyLinkedCompletionDate && applyLinkedMileage;
    const useServiceProvider = applyLinkedProvider && Boolean(reviewedProvider);

    if (!useCompletionDate && !useServiceMileage && !useServiceProvider) {
      setError("Choose at least one invoice value to apply.");
      return;
    }

    setSavingLinkedDetails(true);
    setError(null);
    const updateError = await updateMaintenanceFromInvoice(
      item,
      useCompletionDate,
      useServiceMileage,
      useServiceProvider,
    );

    if (updateError) {
      setError(`The link was kept, but maintenance details were not updated. ${updateError}`);
      setSavingLinkedDetails(false);
      onAnnounce("Maintenance details were not updated. The document link was kept.");
      return;
    }

    const refreshFailed = await refreshRelatedData();
    setSavingLinkedDetails(false);
    setApplyingMaintenanceItemId(null);
    setApplyLinkedCompletionDate(false);
    setApplyLinkedMileage(false);
    setApplyLinkedProvider(false);

    if (refreshFailed) {
      setError(
        "Maintenance details were updated, but the display could not be refreshed. Reload the page to verify them.",
      );
      onAnnounce("Maintenance details updated. Reload the page to refresh the display.");
    } else {
      setError(null);
      onAnnounce("Selected invoice details applied to maintenance.");
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
              if (applyingMaintenanceItemId) closeApplyDetails();
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
          {linkedMaintenanceItems.map((item) => {
            const canApplyInvoiceDetails = item.completed_at
              ? Boolean(review.document_date) || hasInvoiceMileage || Boolean(reviewedProvider)
              : Boolean(review.document_date) || Boolean(reviewedProvider);
            const isApplyingDetails = applyingMaintenanceItemId === item.id;

            return (
              <li key={item.id} className={styles.linkedEntry}>
                <div className={styles.linkedItem}>
                  <div>
                    <p className={styles.itemTitle}>{item.title}</p>
                    <p className={styles.itemMeta}>
                      {getItemContext(item)}
                      {item.service_mileage !== null
                        ? ` · ${formatMileage(item.service_mileage)} mi`
                        : ""}
                    </p>
                  </div>
                  <div className={styles.linkedActions}>
                    {canApplyInvoiceDetails ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-expanded={isApplyingDetails}
                        aria-controls={`apply-invoice-details-${documentId}-${item.id}`}
                        disabled={
                          unlinkingMaintenanceItemId !== null
                          || saving
                          || savingLinkedDetails
                        }
                        onClick={() => toggleApplyDetails(item)}
                      >
                        {isApplyingDetails ? "Close" : "Apply invoice details"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        unlinkingMaintenanceItemId !== null
                        || saving
                        || savingLinkedDetails
                      }
                      onClick={() => void unlinkMaintenance(item)}
                    >
                      {unlinkingMaintenanceItemId === item.id ? "Unlinking..." : "Unlink"}
                    </Button>
                  </div>
                </div>

                {isApplyingDetails ? (
                  <form
                    id={`apply-invoice-details-${documentId}-${item.id}`}
                    className={styles.applyDetails}
                    onSubmit={(event) =>
                      void applyDetailsToLinkedMaintenance(event, item)
                    }
                  >
                    <p className={styles.choiceTitle}>
                      Apply invoice details
                    </p>
                    <p className={styles.helperCopy}>
                      Only the values you select will change. The document link remains
                      independent.
                    </p>

                    {review.document_date ? (
                      <label className={styles.checkboxChoice}>
                        <input
                          type="checkbox"
                          checked={applyLinkedCompletionDate}
                          disabled={savingLinkedDetails}
                          onChange={(event) => {
                            setApplyLinkedCompletionDate(event.target.checked);
                            if (!event.target.checked && !item.completed_at) {
                              setApplyLinkedMileage(false);
                            }
                            setError(null);
                          }}
                        />
                        <span>
                          {item.completed_at ? "Replace completion date" : "Completion date"}: {" "}
                          <strong>{formatDateOnly(review.document_date)}</strong>
                        </span>
                      </label>
                    ) : null}

                    {hasInvoiceMileage && review.mileage !== null ? (
                      <label className={styles.checkboxChoice}>
                        <input
                          type="checkbox"
                          checked={applyLinkedMileage}
                          disabled={
                            savingLinkedDetails
                            || (!item.completed_at && !applyLinkedCompletionDate)
                          }
                          onChange={(event) => {
                            setApplyLinkedMileage(event.target.checked);
                            setError(null);
                          }}
                        />
                        <span>
                          Replace service mileage: {" "}
                          <strong>{formatMileage(review.mileage)} mi</strong>
                        </span>
                      </label>
                    ) : null}

                    {reviewedProvider ? (
                      <label className={styles.checkboxChoice}>
                        <input
                          type="checkbox"
                          checked={applyLinkedProvider}
                          disabled={savingLinkedDetails}
                          onChange={(event) => {
                            setApplyLinkedProvider(event.target.checked);
                            setError(null);
                          }}
                        />
                        <span>
                          Use provider / shop: <strong>{reviewedProvider}</strong>
                        </span>
                      </label>
                    ) : null}

                    <div className={styles.actions}>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={savingLinkedDetails}
                        onClick={closeApplyDetails}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={
                          savingLinkedDetails
                          || (
                            !applyLinkedCompletionDate
                            && !applyLinkedMileage
                            && !applyLinkedProvider
                          )
                        }
                      >
                        {savingLinkedDetails ? "Applying..." : "Apply selected details"}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
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
                          setReplaceCompletionDateFromInvoice(false);
                          setUseInvoiceMileage(false);
                          setUseInvoiceProvider(false);
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
              {reviewedProvider ? (
                <label className={styles.checkboxChoice}>
                  <input
                    type="checkbox"
                    checked={useInvoiceProvider}
                    disabled={saving}
                    onChange={(event) => {
                      setUseInvoiceProvider(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    Use provider / shop: <strong>{reviewedProvider}</strong>
                  </span>
                </label>
              ) : null}

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

          {selectedMaintenanceItem?.completed_at
          && (review.document_date || hasInvoiceMileage || reviewedProvider) ? (
            <div className={styles.completionOptions}>
              <p className={styles.choiceTitle}>Update maintenance from invoice</p>
              <p className={styles.helperCopy}>
                Optional. Select only the reviewed values you want to replace.
              </p>

              {review.document_date ? (
                <label className={styles.checkboxChoice}>
                  <input
                    type="checkbox"
                    checked={replaceCompletionDateFromInvoice}
                    disabled={saving}
                    onChange={(event) => {
                      setReplaceCompletionDateFromInvoice(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    Replace completion date: {" "}
                    <strong>{formatDateOnly(review.document_date)}</strong>
                  </span>
                </label>
              ) : null}

              {hasInvoiceMileage && review.mileage !== null ? (
                <label className={styles.checkboxChoice}>
                  <input
                    type="checkbox"
                    checked={useInvoiceMileage}
                    disabled={saving}
                    onChange={(event) => {
                      setUseInvoiceMileage(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    Replace service mileage: {" "}
                    <strong>{formatMileage(review.mileage)} mi</strong>
                  </span>
                </label>
              ) : null}

              {reviewedProvider ? (
                <label className={styles.checkboxChoice}>
                  <input
                    type="checkbox"
                    checked={useInvoiceProvider}
                    disabled={saving}
                    onChange={(event) => {
                      setUseInvoiceProvider(event.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    Replace provider / shop: <strong>{reviewedProvider}</strong>
                  </span>
                </label>
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
