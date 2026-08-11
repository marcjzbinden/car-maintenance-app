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
import { MaintenanceItemCard, type MaintenanceDisplayStatus } from "@/components/maintenance/MaintenanceItemCard";
import { AppShell, Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { resolveAuthenticatedGarage } from "@/lib/garageSetup";
import { supabase } from "@/lib/supabaseClient";
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

  const [showAddItem, setShowAddItem] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [addAnnouncement, setAddAnnouncement] = useState("");
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addTitleInputRef = useRef<HTMLInputElement>(null);

  const [editingItem, setEditingItem] = useState<MaintenanceRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editTitleInputRef = useRef<HTMLInputElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);

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

    const { data: mData, error: mErr } = await supabase
      .from("maintenance_items")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });

    if (mErr) throw mErr;
    setItems((mData ?? []) as MaintenanceRow[]);
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

  async function addItem() {
    if (!vehicle || !userId || !canAdd) return;

    setAddAnnouncement("");
    const payload = {
      garage_id: vehicle.garage_id,
      vehicle_id: vehicle.id,
      title: title.trim(),
      due_date: dueDate.trim() || null,
      notes: notes.trim() || null,
      created_by: userId,
    };

    const { error } = await supabase.from("maintenance_items").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }

    setTitle("");
    setDueDate("");
    setNotes("");

    await loadAll();
    setShowAddItem(false);
    setAddAnnouncement("Maintenance item added.");
    window.requestAnimationFrame(() => addTriggerRef.current?.focus());
  }

  async function markCompleted(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("maintenance_items")
      .update({ completed_at: now })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, completed_at: now } : item)));
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

    const payload = {
      title: nextTitle,
      due_date: editDueDate ? editDueDate : null,
      notes: editNotes.trim() ? editNotes.trim() : null,
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

  function closeAddPanel() {
    setShowAddItem(false);
    window.requestAnimationFrame(() => addTriggerRef.current?.focus());
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
            onClick={() => setShowAddItem((current) => !current)}
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
              Add a due date now or leave it unscheduled for later.
            </p>

            <form onSubmit={submitAddItem}>
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

                <label className={styles.label}>
                  Due date <span className={styles.optional}>(optional)</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className={styles.input}
                  />
                </label>

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
                  notes={item.notes}
                  onEdit={(trigger) => openEdit(item, trigger)}
                  onMarkCompleted={() => void markCompleted(item.id)}
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
              <h2 id="maintenance-history-heading" className={styles.sectionTitle}>
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
                  notes={item.notes}
                  onEdit={(trigger) => openEdit(item, trigger)}
                  onReopen={() => void reopen(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </AppShell>
  );
}
