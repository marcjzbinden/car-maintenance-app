"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MaintenanceItemCard,
  type LinkedMaintenanceDocument,
  type MaintenanceDisplayStatus,
} from "@/components/maintenance/MaintenanceItemCard";
import { VehicleDocumentsSection } from "@/components/documents/VehicleDocumentsSection";
import { AppShell, Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { resolveAuthenticatedGarage } from "@/lib/garageSetup";
import {
  completedAtToLocalDateInput,
  dateOnlyToNoonUtc,
  getLocalDateInputValue,
} from "@/lib/maintenanceDates";
import { supabase } from "@/lib/supabaseClient";
import { createVehicleDocumentSignedUrl } from "@/lib/vehicleDocumentAccess";
import styles from "./vehicle-detail.module.css";

type VehicleRow = {
  id: string;
  garage_id: string;
  nickname: string;
  year: string | null;
  make: string | null;
  model: string | null;
};

type MaintenanceRow = {
  id: string;
  garage_id: string;
  vehicle_id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  service_mileage: number | null;
  notes: string | null;
  created_at: string;
};

function getStatus(item: MaintenanceRow): MaintenanceDisplayStatus {
  if (item.completed_at) return "completed";
  if (!item.due_date) return "unscheduled";

  const today = new Date();
  const due = new Date(item.due_date);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "overdue";

  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);

  if (due <= in30) return "upcoming";
  return "open";
}

const urgencyRank: Record<Exclude<MaintenanceDisplayStatus, "completed">, number> = {
  overdue: 0,
  upcoming: 1,
  open: 2,
  unscheduled: 3,
};

type AddMaintenanceMode = "open" | "completed";

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function parseServiceMileage(value: string) {
  const normalized = value.trim();
  if (!normalized) return { value: null, error: null };

  if (!/^\d+$/.test(normalized)) {
    return { value: null, error: "Service mileage must be a whole number." };
  }

  const mileage = Number(normalized);
  if (!Number.isSafeInteger(mileage) || mileage > MAX_POSTGRES_INTEGER) {
    return {
      value: null,
      error: "Service mileage is too large.",
    };
  }

  return { value: mileage, error: null };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load vehicle.";
}

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [items, setItems] = useState<MaintenanceRow[]>([]);
  const [linkedDocumentsByMaintenanceId, setLinkedDocumentsByMaintenanceId] =
    useState<Record<string, LinkedMaintenanceDocument[]>>({});

  const [showAddItem, setShowAddItem] = useState(false);
  const [title, setTitle] = useState("");
  const [addMode, setAddMode] = useState<AddMaintenanceMode>("open");
  const [dueDate, setDueDate] = useState("");
  const [completionDate, setCompletionDate] = useState(getLocalDateInputValue);
  const [serviceMileage, setServiceMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addAnnouncement, setAddAnnouncement] = useState("");
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  const [editingItem, setEditingItem] = useState<MaintenanceRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCompletionDate, setEditCompletionDate] = useState("");
  const [originalEditCompletionDate, setOriginalEditCompletionDate] = useState("");
  const [editServiceMileage, setEditServiceMileage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editTitleInputRef = useRef<HTMLInputElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [completingItem, setCompletingItem] = useState<MaintenanceRow | null>(null);
  const [completeDate, setCompleteDate] = useState("");
  const [completeMileage, setCompleteMileage] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const completeDateInputRef = useRef<HTMLInputElement>(null);
  const completeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const maintenanceHistoryHeadingRef = useRef<HTMLHeadingElement>(null);

  const canAdd = useMemo(() => title.trim().length > 0, [title]);

  const openItems = useMemo(
    () =>
      items
        .filter((item) => !item.completed_at)
        .sort((a, b) => {
          const aStatus = getStatus(a) as Exclude<MaintenanceDisplayStatus, "completed">;
          const bStatus = getStatus(b) as Exclude<MaintenanceDisplayStatus, "completed">;
          const rankDifference = urgencyRank[aStatus] - urgencyRank[bStatus];

          if (rankDifference !== 0) return rankDifference;
          if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
          return b.created_at.localeCompare(a.created_at);
        }),
    [items],
  );

  const completedItems = useMemo(
    () =>
      items
        .filter((item) => item.completed_at)
        .sort((a, b) => {
          const aCompleted = a.completed_at ?? a.created_at;
          const bCompleted = b.completed_at ?? b.created_at;
          return bCompleted.localeCompare(aCompleted);
        }),
    [items],
  );

  async function loadAll() {
    const { data: vData, error: vErr } = await supabase
      .from("vehicles")
      .select("id, garage_id, nickname, year, make, model")
      .eq("id", vehicleId)
      .single();

    if (vErr) throw vErr;
    setVehicle(vData as VehicleRow);

    const [maintenanceResult, linkResult] = await Promise.all([
      supabase
        .from("maintenance_items")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false }),
      supabase
        .from("maintenance_item_documents")
        .select("document_id, maintenance_item_id, vehicle_id")
        .eq("vehicle_id", vehicleId),
    ]);

    if (maintenanceResult.error) throw maintenanceResult.error;
    if (linkResult.error) throw linkResult.error;
    setItems((maintenanceResult.data ?? []) as MaintenanceRow[]);

    const links = linkResult.data ?? [];
    const documentIds = Array.from(new Set(links.map((link) => link.document_id)));
    let linkedDocuments: Array<{
      id: string;
      filename: string;
      storage_path: string;
    }> = [];

    if (documentIds.length > 0) {
      const { data: documentData, error: documentError } = await supabase
        .from("vehicle_documents")
        .select("id, filename, storage_path")
        .eq("vehicle_id", vehicleId)
        .in("id", documentIds);

      if (documentError) throw documentError;
      linkedDocuments = documentData ?? [];
    }

    const documentById = new Map(
      linkedDocuments.map((document) => [document.id, document]),
    );
    const nextLinkedDocuments: Record<string, LinkedMaintenanceDocument[]> = {};

    for (const link of links) {
      const document = documentById.get(link.document_id);
      if (!document) continue;

      const current = nextLinkedDocuments[link.maintenance_item_id] ?? [];
      current.push({
        id: document.id,
        filename: document.filename,
        storagePath: document.storage_path,
      });
      nextLinkedDocuments[link.maintenance_item_id] = current;
    }

    setLinkedDocumentsByMaintenanceId(nextLinkedDocuments);
  }

  async function openLinkedDocument(document: LinkedMaintenanceDocument) {
    const pendingWindow = window.open("", "_blank");
    if (pendingWindow) pendingWindow.opener = null;

    const { data, error } = await createVehicleDocumentSignedUrl(
      document.storagePath,
      document.filename,
    );

    if (error || !data?.signedUrl) {
      pendingWindow?.close();
      alert(error?.message ?? "Could not create a secure document link.");
    } else if (pendingWindow) {
      pendingWindow.location.replace(data.signedUrl);
    } else {
      window.location.assign(data.signedUrl);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const setup = await resolveAuthenticatedGarage();
        if (!setup) {
          router.replace("/login");
          return;
        }
        setUserId(setup.userId);
        setDisplayName(setup.displayName);

        await loadAll();
      } catch (error: unknown) {
        alert(getErrorMessage(error));
        router.replace("/");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  useEffect(() => {
    if (!showAddItem) return;

    const focusTimer = window.setTimeout(() => addTitleInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [showAddItem]);

  const closeEdit = useCallback((restoreFocus = true) => {
    setEditingItem(null);
    setEditTitle("");
    setEditDueDate("");
    setEditCompletionDate("");
    setOriginalEditCompletionDate("");
    setEditServiceMileage("");
    setEditNotes("");
    setEditError(null);

    if (restoreFocus) {
      window.requestAnimationFrame(() => editTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!editingItem) return;

    const focusTimer = window.setTimeout(() => editTitleInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEdit();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingItem, closeEdit]);

  const closeCompletion = useCallback((restoreFocus = true) => {
    setCompletingItem(null);
    setCompleteDate("");
    setCompleteMileage("");
    setCompleteError(null);
    setIsCompleting(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => completeTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!completingItem) return;

    const focusTimer = window.setTimeout(() => completeDateInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isCompleting) return;
      event.preventDefault();
      closeCompletion();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [completingItem, isCompleting, closeCompletion]);

  async function addItem() {
    if (!vehicle || !userId || !canAdd) return;

    setAddAnnouncement("");
    setAddError(null);

    const parsedMileage = parseServiceMileage(serviceMileage);
    if (addMode === "completed" && parsedMileage.error) {
      setAddError(parsedMileage.error);
      return;
    }

    const completedAt = addMode === "completed"
      ? dateOnlyToNoonUtc(completionDate)
      : null;

    if (addMode === "completed" && !completedAt) {
      setAddError("Choose a valid completion date.");
      return;
    }

    const payload = {
      garage_id: vehicle.garage_id,
      vehicle_id: vehicle.id,
      title: title.trim(),
      due_date: addMode === "open" ? dueDate.trim() || null : null,
      completed_at: completedAt,
      service_mileage: addMode === "completed" ? parsedMileage.value : null,
      notes: notes.trim() || null,
      created_by: userId,
    };

    const { error } = await supabase.from("maintenance_items").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }

    setTitle("");
    setAddMode("open");
    setDueDate("");
    setCompletionDate(getLocalDateInputValue());
    setServiceMileage("");
    setNotes("");

    await loadAll();
    setShowAddItem(false);
    setAddAnnouncement("Maintenance item added.");
    window.requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  function openCompletion(item: MaintenanceRow, trigger: HTMLButtonElement) {
    completeTriggerRef.current = trigger;
    setCompleteError(null);
    setCompletingItem(item);
    setCompleteDate(getLocalDateInputValue());
    setCompleteMileage(item.service_mileage?.toString() ?? "");
  }

  async function markCompleted() {
    if (!completingItem) return;

    setCompleteError(null);
    const completedAt = dateOnlyToNoonUtc(completeDate);
    if (!completedAt) {
      setCompleteError("Choose a valid completion date.");
      return;
    }

    const parsedMileage = parseServiceMileage(completeMileage);
    if (parsedMileage.error) {
      setCompleteError(parsedMileage.error);
      return;
    }

    setIsCompleting(true);
    const { error } = await supabase
      .from("maintenance_items")
      .update({
        completed_at: completedAt,
        service_mileage: parsedMileage.value,
      })
      .eq("id", completingItem.id);

    if (error) {
      setCompleteError(error.message);
      setIsCompleting(false);
      return;
    }

    setItems((prev) => prev.map((item) => (
      item.id === completingItem.id
        ? {
            ...item,
            completed_at: completedAt,
            service_mileage: parsedMileage.value,
          }
        : item
    )));
    closeCompletion(false);
    window.requestAnimationFrame(() => maintenanceHistoryHeadingRef.current?.focus());
  }

  async function reopen(id: string) {
    const { error } = await supabase
      .from("maintenance_items")
      .update({ completed_at: null })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, completed_at: null } : item)));
  }

  function openEdit(item: MaintenanceRow, trigger: HTMLButtonElement) {
    editTriggerRef.current = trigger;
    setEditError(null);
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDueDate(item.due_date ?? "");
    const displayedCompletionDate = item.completed_at
      ? completedAtToLocalDateInput(item.completed_at)
      : "";
    setEditCompletionDate(displayedCompletionDate);
    setOriginalEditCompletionDate(displayedCompletionDate);
    setEditServiceMileage(item.service_mileage?.toString() ?? "");
    setEditNotes(item.notes ?? "");
  }

  async function saveEdit() {
    if (!editingItem) return;

    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setEditError("Title is required.");
      return;
    }

    setIsSavingEdit(true);

    const parsedMileage = parseServiceMileage(editServiceMileage);
    if (editingItem.completed_at && parsedMileage.error) {
      setEditError(parsedMileage.error);
      setIsSavingEdit(false);
      return;
    }

    let nextCompletedAt = editingItem.completed_at;
    if (editingItem.completed_at) {
      if (!editCompletionDate) {
        setEditError("Completion date is required for completed maintenance.");
        setIsSavingEdit(false);
        return;
      }

      if (editCompletionDate !== originalEditCompletionDate) {
        nextCompletedAt = dateOnlyToNoonUtc(editCompletionDate);
        if (!nextCompletedAt) {
          setEditError("Choose a valid completion date.");
          setIsSavingEdit(false);
          return;
        }
      }
    }

    const payload = {
      title: nextTitle,
      due_date: editDueDate ? editDueDate : null,
      notes: editNotes.trim() ? editNotes.trim() : null,
      ...(editingItem.completed_at
        ? {
            completed_at: nextCompletedAt,
            service_mileage: parsedMileage.value,
          }
        : {}),
    };

    const { error } = await supabase
      .from("maintenance_items")
      .update(payload)
      .eq("id", editingItem.id);

    if (error) {
      setEditError(error.message);
      setIsSavingEdit(false);
      return;
    }

    setItems((prev) =>
      prev.map((item) => (item.id === editingItem.id ? { ...item, ...payload } : item)),
    );

    setIsSavingEdit(false);
    closeEdit();
  }

  function submitAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void addItem();
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveEdit();
  }

  function resetAddForm() {
    setTitle("");
    setAddMode("open");
    setDueDate("");
    setCompletionDate(getLocalDateInputValue());
    setServiceMileage("");
    setNotes("");
    setAddError(null);
  }

  function closeAddPanel() {
    setShowAddItem(false);
    resetAddForm();
    window.requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  function toggleAddPanel() {
    if (showAddItem) {
      closeAddPanel();
      return;
    }

    resetAddForm();
    setShowAddItem(true);
  }

  if (loading) {
    return (
      <AppShell contentWidth="narrow">
        <p>Loading…</p>
      </AppShell>
    );
  }

  if (!vehicle) {
    return (
      <AppShell authenticated displayName={displayName} contentWidth="narrow">
        <PageHeader
          title="Vehicle not found"
        />
        <p>Vehicle not found.</p>
      </AppShell>
    );
  }

  return (
    <AppShell authenticated displayName={displayName} contentWidth="narrow">
      <PageHeader
        title={vehicle.nickname}
        description={
          [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
          "Vehicle details"
        }
      />

      <section className={styles.section} aria-labelledby="open-maintenance-heading">
        <div className={`${styles.sectionHeader} ${styles.openMaintenanceHeader}`}>
          <div>
            <div className={styles.sectionHeading}>
              <h2 id="open-maintenance-heading" className={styles.sectionTitle}>
                Open maintenance
              </h2>
              <StatusBadge tone="neutral">{openItems.length}</StatusBadge>
            </div>
            <p className={styles.sectionDescription}>
              Ordered by urgency so the most important work stays visible.
            </p>
          </div>
          <Button
            ref={addTriggerRef}
            variant="primary"
            className={styles.addMaintenanceAction}
            aria-label={showAddItem ? "Close add maintenance item form" : "Add maintenance item"}
            aria-expanded={showAddItem}
            aria-controls="add-maintenance-panel"
            onClick={toggleAddPanel}
          >
            <span className={styles.actionLabelDesktop} aria-hidden="true">
              {showAddItem ? "Close" : "+ Add Maintenance Item"}
            </span>
            <span className={styles.actionLabelMobile} aria-hidden="true">
              {showAddItem ? "Close" : "+ Add"}
            </span>
          </Button>
        </div>

        <span className={styles.srOnly} role="status" aria-live="polite">
          {addAnnouncement}
        </span>

        {showAddItem ? (
          <Card id="add-maintenance-panel" tone="subtle" padding="lg" className={styles.addPanel}>
            <h3 className={styles.panelTitle}>Add maintenance item</h3>
            <p className={styles.panelDescription}>
              Plan future work or record maintenance that is already complete.
            </p>

            <form onSubmit={submitAddItem}>
              <fieldset className={styles.modeFieldset}>
                <legend className={styles.modeLegend}>Maintenance status</legend>
                <div className={styles.modeOptions}>
                  <label className={styles.modeChoice}>
                    <input
                      type="radio"
                      name="add-maintenance-mode"
                      value="open"
                      checked={addMode === "open"}
                      onChange={() => {
                        setAddMode("open");
                        setAddError(null);
                      }}
                      className={styles.modeInput}
                    />
                    <span className={styles.modeChoiceText}>Open</span>
                  </label>
                  <label className={styles.modeChoice}>
                    <input
                      type="radio"
                      name="add-maintenance-mode"
                      value="completed"
                      checked={addMode === "completed"}
                      onChange={() => {
                        setAddMode("completed");
                        setCompletionDate((current) => current || getLocalDateInputValue());
                        setAddError(null);
                      }}
                      className={styles.modeInput}
                    />
                    <span className={styles.modeChoiceText}>Already completed</span>
                  </label>
                </div>
              </fieldset>

              <div className={styles.formGrid}>
                <label className={styles.label}>
                  Title
                  <input
                    ref={addTitleInputRef}
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Oil change, brake fluid, inspection…"
                    className={styles.input}
                  />
                </label>

                {addMode === "open" ? (
                  <label className={styles.label}>
                    Due date <span className={styles.optional}>(optional)</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className={styles.input}
                    />
                  </label>
                ) : (
                  <>
                    <label className={styles.label}>
                      Completion date
                      <input
                        required
                        type="date"
                        value={completionDate}
                        max={getLocalDateInputValue()}
                        onChange={(event) => setCompletionDate(event.target.value)}
                        className={styles.input}
                      />
                    </label>

                    <label className={styles.label}>
                      Service mileage <span className={styles.optional}>(optional)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={MAX_POSTGRES_INTEGER}
                        step="1"
                        value={serviceMileage}
                        onChange={(event) => setServiceMileage(event.target.value)}
                        className={styles.input}
                      />
                    </label>
                  </>
                )}

                <label className={`${styles.label} ${styles.fieldFull}`}>
                  Notes <span className={styles.optional}>(optional)</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Parts used, torque specs, or anything worth remembering"
                    className={styles.textarea}
                  />
                </label>
              </div>

              {addError ? (
                <p role="alert" className={styles.formError}>
                  {addError}
                </p>
              ) : null}

              <div className={styles.formActions}>
                <Button variant="ghost" onClick={closeAddPanel}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!canAdd}>
                  Add maintenance item
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {openItems.length === 0 ? (
          <Card tone="subtle" className={styles.emptyState}>
            <p className={styles.emptyTitle}>All caught up</p>
            <p className={styles.emptyCopy}>No open maintenance for this vehicle.</p>
          </Card>
        ) : (
          <ul className={styles.itemList}>
            {openItems.map((item) => (
              <li key={item.id}>
                <MaintenanceItemCard
                  title={item.title}
                  status={getStatus(item)}
                  dueDate={item.due_date}
                  completedAt={item.completed_at}
                  serviceMileage={item.service_mileage}
                  notes={item.notes}
                  linkedDocuments={linkedDocumentsByMaintenanceId[item.id] ?? []}
                  onOpenLinkedDocument={(document) => void openLinkedDocument(document)}
                  onEdit={(trigger) => openEdit(item, trigger)}
                  onMarkCompleted={(trigger) => openCompletion(item, trigger)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="maintenance-history-heading">
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionHeading}>
              <h2
                ref={maintenanceHistoryHeadingRef}
                id="maintenance-history-heading"
                className={styles.sectionTitle}
                tabIndex={-1}
              >
                Maintenance history
              </h2>
              <StatusBadge tone="neutral">{completedItems.length}</StatusBadge>
            </div>
            <p className={styles.sectionDescription}>Most recently completed work appears first.</p>
          </div>
        </div>

        {completedItems.length === 0 ? (
          <Card tone="subtle" className={styles.emptyState}>
            <p className={styles.emptyTitle}>No maintenance history yet</p>
            <p className={styles.emptyCopy}>Completed work will appear here.</p>
          </Card>
        ) : (
          <ul className={styles.itemList}>
            {completedItems.map((item) => (
              <li key={item.id}>
                <MaintenanceItemCard
                  title={item.title}
                  status="completed"
                  dueDate={item.due_date}
                  completedAt={item.completed_at}
                  serviceMileage={item.service_mileage}
                  notes={item.notes}
                  linkedDocuments={linkedDocumentsByMaintenanceId[item.id] ?? []}
                  onOpenLinkedDocument={(document) => void openLinkedDocument(document)}
                  onEdit={(trigger) => openEdit(item, trigger)}
                  onReopen={() => void reopen(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {userId ? (
        <VehicleDocumentsSection
          garageId={vehicle.garage_id}
          vehicleId={vehicle.id}
          currentUserId={userId}
          maintenanceItems={items}
          onMaintenanceDataChange={loadAll}
        />
      ) : null}

      {editingItem ? (
        <div className={styles.dialogOverlay}>
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-maintenance-title"
            tone="elevated"
            padding="lg"
            className={styles.dialog}
          >
            <h2 id="edit-maintenance-title" className={styles.dialogTitle}>
              Edit maintenance
            </h2>

            <form onSubmit={submitEdit} className={styles.dialogForm}>
              <label className={styles.label}>
                Title
                <input
                  ref={editTitleInputRef}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className={styles.input}
                />
              </label>

              <label className={styles.label}>
                Due date <span className={styles.optional}>(optional)</span>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(event) => setEditDueDate(event.target.value)}
                  className={styles.input}
                />
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className={styles.clearDateButton}
                  onClick={() => setEditDueDate("")}
                >
                  Clear due date · Unscheduled
                </Button>
              </label>

              {editingItem.completed_at ? (
                <div className={styles.formGrid}>
                  <label className={styles.label}>
                    Completion date
                    <input
                      required
                      type="date"
                      value={editCompletionDate}
                      max={getLocalDateInputValue()}
                      onChange={(event) => setEditCompletionDate(event.target.value)}
                      className={styles.input}
                    />
                  </label>

                  <label className={styles.label}>
                    Service mileage <span className={styles.optional}>(optional)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={MAX_POSTGRES_INTEGER}
                      step="1"
                      value={editServiceMileage}
                      onChange={(event) => setEditServiceMileage(event.target.value)}
                      className={styles.input}
                    />
                  </label>
                </div>
              ) : null}

              <label className={styles.label}>
                Notes <span className={styles.optional}>(optional)</span>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  className={styles.textarea}
                />
              </label>

              {editError ? (
                <p role="alert" className={styles.dialogError}>
                  {editError}
                </p>
              ) : null}

              <div className={styles.formActions}>
                <Button type="button" variant="ghost" onClick={() => closeEdit()}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSavingEdit}>
                  {isSavingEdit ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {completingItem ? (
        <div className={styles.dialogOverlay}>
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-maintenance-title"
            tone="elevated"
            padding="lg"
            className={styles.dialog}
          >
            <h2 id="complete-maintenance-title" className={styles.dialogTitle}>
              Mark maintenance done
            </h2>
            <p className={styles.dialogDescription}>{completingItem.title}</p>

            <form
              className={styles.dialogForm}
              onSubmit={(event) => {
                event.preventDefault();
                void markCompleted();
              }}
            >
              <label className={styles.label}>
                Completion date
                <input
                  required
                  ref={completeDateInputRef}
                  type="date"
                  value={completeDate}
                  max={getLocalDateInputValue()}
                  onChange={(event) => setCompleteDate(event.target.value)}
                  className={styles.input}
                />
              </label>

              <label className={styles.label}>
                Service mileage <span className={styles.optional}>(optional)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={MAX_POSTGRES_INTEGER}
                  step="1"
                  value={completeMileage}
                  onChange={(event) => setCompleteMileage(event.target.value)}
                  className={styles.input}
                />
              </label>

              {completeError ? (
                <p role="alert" className={styles.dialogError}>
                  {completeError}
                </p>
              ) : null}

              <div className={styles.formActions}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isCompleting}
                  onClick={() => closeCompletion()}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isCompleting}>
                  {isCompleting ? "Saving…" : "Mark done"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
