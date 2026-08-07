import { Button, Card, StatusBadge } from "@/components/ui";
import styles from "./MaintenanceItemCard.module.css";

export type MaintenanceDisplayStatus =
  | "overdue"
  | "upcoming"
  | "open"
  | "unscheduled"
  | "completed";

type MaintenanceItemCardProps = {
  title: string;
  status: MaintenanceDisplayStatus;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  onEdit: (trigger: HTMLButtonElement) => void;
  onMarkCompleted?: () => void;
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

export function MaintenanceItemCard({
  title,
  status,
  dueDate,
  completedAt,
  notes,
  onEdit,
  onMarkCompleted,
  onReopen,
}: MaintenanceItemCardProps) {
  const presentation = statusPresentation[status];
  const completed = status === "completed";

  return (
    <Card tone={completed ? "subtle" : "default"} padding="md" className={styles.card}>
      <div className={styles.content}>
        <div className={styles.details}>
          <div className={styles.headingRow}>
            <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
            <h3 className={styles.title}>{title}</h3>
          </div>

          {completed && completedAt ? (
            <p className={styles.completedDate}>Completed {formatCompletedDate(completedAt)}</p>
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
            <Button size="sm" variant="secondary" onClick={onMarkCompleted}>
              Mark done
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
