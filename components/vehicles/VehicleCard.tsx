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

  return (
    <Link
      href={`/vehicle/${id}`}
      className={styles.cardLink}
      aria-label={`Open ${nickname}${vehicleDescription ? `, ${vehicleDescription}` : ""}`}
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
            Open <span>→</span>
          </span>
        </div>

        <div className={styles.statuses} aria-label="Maintenance status">
          <StatusBadge tone={overdueCount > 0 ? "danger" : "neutral"}>
            {overdueCount} overdue
          </StatusBadge>
          <StatusBadge tone={dueSoonCount > 0 ? "warning" : "neutral"}>
            {dueSoonCount} due soon
          </StatusBadge>
        </div>
      </Card>
    </Link>
  );
}
