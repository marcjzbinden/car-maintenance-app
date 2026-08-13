import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useId, useRef } from "react";
import { Button, Card, StatusBadge } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import type {
  AnalysisDocumentType,
  DocumentAnalysisResult,
  DocumentReviewDraft,
} from "@/lib/documentAnalysis";
import styles from "./DocumentAnalysisReview.module.css";

type SavedDocumentReview = Tables<"vehicle_document_reviews">;

const documentTypeOptions: Array<{
  label: string;
  value: AnalysisDocumentType;
}> = [
  { label: "Repair invoice", value: "repair_invoice" },
  { label: "Registration", value: "registration" },
  { label: "Inspection", value: "inspection" },
  { label: "Insurance", value: "insurance" },
  { label: "Other", value: "other" },
];

const documentTypeLabels: Record<AnalysisDocumentType, string> =
  Object.fromEntries(
    documentTypeOptions.map((option) => [option.value, option.label]),
  ) as Record<AnalysisDocumentType, string>;

function formatDateOnly(value: string | null) {
  if (!value) return "Not recorded";
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

function formatNumber(value: number | null, maximumFractionDigits = 0) {
  if (value === null) return "Not recorded";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
}

function ReviewFields({
  values,
}: {
  values: Omit<SavedDocumentReview, "document_id" | "reviewed_at" | "reviewed_by">;
}) {
  return (
    <>
      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt>Document type</dt>
          <dd>{documentTypeLabels[values.document_type as AnalysisDocumentType]}</dd>
        </div>
        <div className={styles.field}>
          <dt>Document / service date</dt>
          <dd>{formatDateOnly(values.document_date)}</dd>
        </div>
        <div className={styles.field}>
          <dt>Expiration date</dt>
          <dd>{formatDateOnly(values.expiration_date)}</dd>
        </div>
        <div className={styles.field}>
          <dt>Mileage</dt>
          <dd>{formatNumber(values.mileage)}</dd>
        </div>
        <div className={styles.field}>
          <dt>Provider / shop</dt>
          <dd>{values.provider ?? "Not recorded"}</dd>
        </div>
        <div className={styles.field}>
          <dt>Total</dt>
          <dd>{formatNumber(values.total_cost, 2)}</dd>
        </div>
      </dl>

      <div className={styles.lists}>
        <ReviewList title="Completed work" items={values.completed_work} />
        <ReviewList
          title="Recommendations / deferred work"
          items={values.recommendations}
        />
      </div>
    </>
  );
}

export function SavedDocumentReview({
  review,
  isEditing,
  onEdit,
}: {
  review: SavedDocumentReview;
  isEditing: boolean;
  onEdit: () => void;
}) {
  return (
    <Card tone="subtle" padding="md" className={styles.savedReview}>
      <div className={styles.headingWithAction}>
        <div className={styles.heading}>
          <StatusBadge tone="success">Reviewed</StatusBadge>
          <p className={styles.metadata}>Reviewed {formatTimestamp(review.reviewed_at)}</p>
        </div>
        <Button size="sm" variant="secondary" disabled={isEditing} onClick={onEdit}>
          {isEditing ? "Editing review" : "Edit review"}
        </Button>
      </div>

      <ReviewFields values={review} />
    </Card>
  );
}

export function DocumentAnalysisProposal({
  analysis,
  onUseProposal,
  onDiscardProposal,
}: {
  analysis: DocumentAnalysisResult;
  onUseProposal: () => void;
  onDiscardProposal: () => void;
}) {
  return (
    <Card tone="subtle" padding="md" className={styles.analysis}>
      <div className={styles.headingWithAction}>
        <div className={styles.heading}>
          <StatusBadge tone="info">New AI proposal</StatusBadge>
          <h4 className={styles.title}>Review before saving</h4>
        </div>
        <div className={styles.proposalActions}>
          <Button size="sm" variant="secondary" onClick={onDiscardProposal}>
            Discard proposal
          </Button>
          <Button size="sm" variant="primary" onClick={onUseProposal}>
            Use proposal as draft
          </Button>
        </div>
      </div>

      <ReviewFields values={analysis} />
      {analysis.document_date_evidence ? (
        <p className={styles.evidence}>
          Date source: {analysis.document_date_evidence}
        </p>
      ) : null}

      <p className={styles.notice}>
        This proposal is temporary. It will not change the saved review unless you use it
        as a draft and save.
      </p>
    </Card>
  );
}

export function DocumentReviewForm({
  draft,
  evidence,
  isSaving,
  error,
  isAiDraft,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: DocumentReviewDraft;
  evidence: string | null;
  isSaving: boolean;
  error: string | null;
  isAiDraft: boolean;
  onChange: (draft: DocumentReviewDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateList(
    field: "completed_work" | "recommendations",
    index: number,
    value: string,
  ) {
    const nextItems = [...draft[field]];
    nextItems[index] = value;
    onChange({ ...draft, [field]: nextItems });
  }

  function removeListItem(
    field: "completed_work" | "recommendations",
    index: number,
  ) {
    onChange({
      ...draft,
      [field]: draft[field].filter((_, itemIndex) => itemIndex !== index),
    });
  }

  function addListItem(field: "completed_work" | "recommendations") {
    onChange({ ...draft, [field]: [...draft[field], ""] });
  }

  function updateField(
    field: Exclude<
      keyof DocumentReviewDraft,
      "completed_work" | "recommendations"
    >,
  ) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onChange({ ...draft, [field]: event.target.value });
    };
  }

  return (
    <Card tone="elevated" padding="md" className={styles.reviewFormCard}>
      <div className={styles.heading}>
        {isAiDraft ? <StatusBadge tone="info">AI extracted</StatusBadge> : null}
        <h4 className={styles.title}>Review and edit details</h4>
      </div>
      <p className={styles.formIntroduction}>
        Confirm these values against the original document before saving.
      </p>

      <form onSubmit={onSubmit}>
        <div className={styles.formGrid}>
          <label className={styles.label}>
            Document type
            <select
              required
              value={draft.document_type}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("document_type")}
            >
              {documentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.label}>
            Document / service date
            <input
              type="date"
              value={draft.document_date}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("document_date")}
            />
            {evidence ? <span className={styles.fieldHelp}>Source: {evidence}</span> : null}
          </label>

          <label className={styles.label}>
            Expiration date
            <input
              type="date"
              value={draft.expiration_date}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("expiration_date")}
            />
          </label>

          <label className={styles.label}>
            Mileage
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="2147483647"
              step="1"
              value={draft.mileage}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("mileage")}
            />
          </label>

          <label className={styles.label}>
            Provider / shop
            <input
              value={draft.provider}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("provider")}
            />
          </label>

          <label className={styles.label}>
            Total cost (USD)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={draft.total_cost}
              disabled={isSaving}
              className={styles.input}
              onChange={updateField("total_cost")}
            />
          </label>
        </div>

        <EditableReviewList
          title="Completed work"
          singularLabel="completed-work item"
          items={draft.completed_work}
          disabled={isSaving}
          onChange={(index, value) => updateList("completed_work", index, value)}
          onRemove={(index) => removeListItem("completed_work", index)}
          onAdd={() => addListItem("completed_work")}
        />
        <EditableReviewList
          title="Recommendations / deferred work"
          singularLabel="recommendation"
          items={draft.recommendations}
          disabled={isSaving}
          onChange={(index, value) => updateList("recommendations", index, value)}
          onRemove={(index) => removeListItem("recommendations", index)}
          onAdd={() => addListItem("recommendations")}
        />

        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save review"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditableReviewList({
  title,
  singularLabel,
  items,
  disabled,
  onChange,
  onRemove,
  onAdd,
}: {
  title: string;
  singularLabel: string;
  items: string[];
  disabled: boolean;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}) {
  const lastInputRef = useRef<HTMLInputElement>(null);
  const previousLengthRef = useRef(items.length);
  const inputIdBase = useId();

  useEffect(() => {
    if (items.length > previousLengthRef.current) {
      lastInputRef.current?.focus();
    }
    previousLengthRef.current = items.length;
  }, [items.length]);

  return (
    <fieldset className={styles.editableList}>
      <legend className={styles.listTitle}>{title}</legend>
      {items.map((item, index) => (
        <div className={styles.editableListRow} key={index}>
          <label className={styles.srOnly} htmlFor={`${inputIdBase}-${index}`}>
            {title} item {index + 1}
          </label>
          <input
            ref={index === items.length - 1 ? lastInputRef : undefined}
            id={`${inputIdBase}-${index}`}
            value={item}
            disabled={disabled}
            className={styles.input}
            onChange={(event) => onChange(index, event.target.value)}
          />
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={`Remove ${singularLabel} ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button size="sm" type="button" variant="secondary" disabled={disabled} onClick={onAdd}>
        + Add {singularLabel}
      </Button>
    </fieldset>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5 className={styles.listTitle}>{title}</h5>
      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyValue}>None recorded</p>
      )}
    </div>
  );
}
