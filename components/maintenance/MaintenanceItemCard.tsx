"use client";

import { useId, useState } from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import styles from "./MaintenanceItemCard.module.css";

export type MaintenanceDisplayStatus =
  | "overdue"
  | "upcoming"
  | "open"
  | "unscheduled"
  | "completed";

export type LinkedMaintenanceDocument = {
  id: string;
  filename: string;
  storagePath: string;
};

type MaintenanceItemCardProps = {
  title: string;
  status: MaintenanceDisplayStatus;
  dueDate: string | null;
  completedAt: string | null;
  serviceMileage: number | null;
  serviceProvider: string | null;
  selfPerformed: boolean;
  notes: string | null;
  linkedDocuments?: LinkedMaintenanceDocument[];
  onOpenLinkedDocument?: (document: LinkedMaintenanceDocument) => void;
  onEdit: (trigger: HTMLButtonElement) => void;
  onMarkCompleted?: (trigger: HTMLButtonElement) => void;
  onReopen?: () => void;
};

const statusPresentation: Record<
  MaintenanceDisplayStatus,
  { label: string; tone: "danger" | "warning" | "info" | "neutral" | "success" }
> = {
  overdue: { label: "Overdue", tone: "danger" },
  upcoming: { label: "Due soon", tone: "warning" },
  open: { label: "Scheduled", tone: "info" },
  unscheduled: { label: "Unscheduled", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
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

export function MaintenanceItemCard({
  title,
  status,
  dueDate,
  completedAt,
  serviceMileage,
  serviceProvider,
  selfPerformed,
  notes,
  linkedDocuments = [],
  onOpenLinkedDocument,
  onEdit,
  onMarkCompleted,
  onReopen,
}: MaintenanceItemCardProps) {
  const presentation = statusPresentation[status];
  const completed = status === "completed";
  const performer = selfPerformed ? "Self-performed" : serviceProvider?.trim() || null;
  const [showDocuments, setShowDocuments] = useState(false);
  const documentListId = useId();

  return (
    <Card tone={completed ? "subtle" : "default"} padding="md" className={styles.card}>
      <div className={styles.content}>
        <div className={styles.details}>
          <div className={styles.headingRow}>
            <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
            <h3 className={styles.title}>{title}</h3>
          </div>

          {completed && completedAt ? (
            <p className={styles.completedDate}>
              Completed {formatCompletedDate(completedAt)}
              {serviceMileage !== null ? ` · ${formatMileage(serviceMileage)} mi` : ""}
              {performer ? ` · ${performer}` : ""}
            </p>
          ) : null}

          <p className={styles.dateContext}>
            {completed
              ? dueDate
                ? `Originally due ${formatDateOnly(dueDate)}`
                : "No original due date"
              : dueDate
                ? `Due ${formatDateOnly(dueDate)}`
                : "No due date"}
          </p>

          {notes ? <p className={styles.notes}>{notes}</p> : null}

          {linkedDocuments.length > 0 ? (
            <div className={styles.documents}>
              <button
                type="button"
                className={styles.documentsTrigger}
                aria-expanded={showDocuments}
                aria-controls={documentListId}
                onClick={() => setShowDocuments((current) => !current)}
              >
                {linkedDocuments.length} {linkedDocuments.length === 1 ? "document" : "documents"}
                <span aria-hidden="true">{showDocuments ? " −" : " +"}</span>
              </button>

              {showDocuments ? (
                <ul id={documentListId} className={styles.documentList}>
                  {linkedDocuments.map((document) => (
                    <li key={document.id} className={styles.documentItem}>
                      <span className={styles.documentFilename}>{document.filename}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onOpenLinkedDocument?.(document)}
                      >
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.actions}>
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => onEdit(event.currentTarget)}
          >
            Edit
          </Button>
          {completed ? (
            <Button size="sm" variant="secondary" onClick={onReopen}>
              Reopen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => onMarkCompleted?.(event.currentTarget)}
            >
              Mark done
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
