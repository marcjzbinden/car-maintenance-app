import Link from "next/link";
import { Card, StatusBadge } from "@/components/ui";
import styles from "./VehicleCard.module.css";

type VehicleCardProps = {
  id: string;
  nickname: string;
  year: string | null;
  make: string | null;
  model: string | null;
  overdueCount: number;
  dueSoonCount: number;
};

export function VehicleCard({
  id,
  nickname,
  year,
  make,
  model,
  overdueCount,
  dueSoonCount,
}: VehicleCardProps) {
  const vehicleDescription = [year, make, model].filter(Boolean).join(" ");
  const isUpToDate = overdueCount === 0 && dueSoonCount === 0;
  const maintenanceStatus = isUpToDate
    ? "Maintenance up to date"
    : [
        overdueCount > 0 ? `${overdueCount} overdue` : null,
        dueSoonCount > 0 ? `${dueSoonCount} due soon` : null,
      ]
        .filter(Boolean)
        .join(", ");

  return (
    <Link
      href={`/vehicle/${id}`}
      className={styles.cardLink}
      aria-label={`Open ${nickname}${vehicleDescription ? `, ${vehicleDescription}` : ""}. ${maintenanceStatus}`}
    >
      <Card tone="elevated" padding="lg" className={styles.card}>
        <div className={styles.identity}>
          <div>
            <h3 className={styles.nickname}>{nickname}</h3>
            <p className={styles.vehicleDescription}>
              {vehicleDescription || "Vehicle details not added"}
            </p>
          </div>
          <span className={styles.openAffordance} aria-hidden="true">
            &rarr;
          </span>
        </div>

        <div className={styles.statuses} aria-label="Maintenance status">
          {isUpToDate ? (
            <StatusBadge tone="success">&#10003; Up to date</StatusBadge>
          ) : (
            <>
              {overdueCount > 0 ? (
                <StatusBadge tone="danger">{overdueCount} overdue</StatusBadge>
              ) : null}
              {dueSoonCount > 0 ? (
                <StatusBadge tone="warning">{dueSoonCount} due soon</StatusBadge>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </Link>
  );
}
