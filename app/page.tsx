"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import { VehicleCard } from "@/components/vehicles/VehicleCard";
import { getErrorMessage, resolveAuthenticatedGarage } from "@/lib/garageSetup";
import { supabase } from "@/lib/supabaseClient";
import styles from "./dashboard.module.css";

type VehicleRow = {
  id: string;
  garage_id: string;
  created_by: string | null;
  nickname: string;
  year: string | null;
  make: string | null;
  model: string | null;
  created_at: string;
};

type MaintenanceRow = {
  id: string;
  vehicle_id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

type MaintenanceStatus = "completed" | "overdue" | "upcoming" | "open";

function getStatus(item: MaintenanceRow): MaintenanceStatus {
  if (item.completed_at) return "completed";
  if (!item.due_date) return "open";

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

export default function Home() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [maintItems, setMaintItems] = useState<MaintenanceRow[]>([]);
  const [maintLoading, setMaintLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [nickname, setNickname] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [activeGarageId, setActiveGarageId] = useState<string | null>(null);
  const [activeGarageName, setActiveGarageName] = useState("Garage");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);

  const canAdd = useMemo(() => nickname.trim().length > 0, [nickname]);

  const maintenanceCounts = useMemo(() => {
    const counts = new Map<string, { overdue: number; upcoming: number }>();

    for (const item of maintItems) {
      const current = counts.get(item.vehicle_id) ?? { overdue: 0, upcoming: 0 };
      const status = getStatus(item);

      if (status === "overdue") current.overdue += 1;
      if (status === "upcoming") current.upcoming += 1;
      counts.set(item.vehicle_id, current);
    }

    return counts;
  }, [maintItems]);

  const flaggedMaintenance = useMemo(
    () =>
      maintItems.filter((item) => {
        const status = getStatus(item);
        return status === "overdue" || status === "upcoming";
      }),
    [maintItems],
  );

  const maintenanceByVehicle = useMemo(
    () =>
      flaggedMaintenance.reduce<Record<string, MaintenanceRow[]>>((groups, item) => {
        (groups[item.vehicle_id] ||= []).push(item);
        return groups;
      }, {}),
    [flaggedMaintenance],
  );

  async function loadVehicles(garageId: string) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("garage_id", garageId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setVehicles((data ?? []) as VehicleRow[]);
  }

  async function loadDashboardMaintenance(garageId: string) {
    setMaintLoading(true);
    try {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("garage_id", garageId);

      if (vehicleError) throw vehicleError;

      const vehicleIds = (vehicleData ?? []).map((vehicle: { id: string }) => vehicle.id);

      if (vehicleIds.length === 0) {
        setMaintItems([]);
        return;
      }

      const { data: maintenanceData, error: maintenanceError } = await supabase
        .from("maintenance_items")
        .select("id, vehicle_id, title, due_date, completed_at, notes, created_at")
        .in("vehicle_id", vehicleIds)
        .order("created_at", { ascending: false });

      if (maintenanceError) throw maintenanceError;
      setMaintItems((maintenanceData ?? []) as MaintenanceRow[]);
    } finally {
      setMaintLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoading(true);
        setSetupError(null);

        const setup = await resolveAuthenticatedGarage();
        if (!setup) {
          router.replace("/login");
          return;
        }

        if (!isMounted) return;

        setUserId(setup.userId);
        setDisplayName(setup.displayName);
        setActiveGarageId(setup.garageId);
        setActiveGarageName("Garage");

        await loadVehicles(setup.garageId);
        await loadDashboardMaintenance(setup.garageId);
      } catch (error: unknown) {
        console.error("Home load failed:", error);
        if (isMounted) setSetupError(getErrorMessage(error));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router, setupAttempt]);

  async function addVehicle() {
    if (!canAdd || !userId || !activeGarageId) return;

    const payload = {
      garage_id: activeGarageId,
      created_by: userId,
      nickname: nickname.trim(),
      year: year.trim() || null,
      make: make.trim() || null,
      model: model.trim() || null,
    };

    const { error } = await supabase.from("vehicles").insert(payload);

    if (error) {
      alert(error.message);
      return;
    }

    setNickname("");
    setYear("");
    setMake("");
    setModel("");
    setShowAddVehicle(false);

    await loadVehicles(activeGarageId);
    await loadDashboardMaintenance(activeGarageId);
  }

  function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void addVehicle();
  }

  const vehicleName = (id: string) =>
    vehicles.find((vehicle) => vehicle.id === id)?.nickname ?? "Vehicle";

  if (loading) {
    return (
      <AppShell>
        <p className={styles.loading}>Loading your garage…</p>
      </AppShell>
    );
  }

  if (setupError) {
    return (
      <AppShell authenticated displayName={displayName}>
        <PageHeader
          eyebrow="Garage setup"
          title="We couldn’t open your glovebox"
          description="Your account is signed in, but garage setup did not finish."
        />
        <Card tone="subtle" padding="lg">
          <p className={styles.emptyCopy}>{setupError}</p>
          <Button variant="primary" onClick={() => setSetupAttempt((attempt) => attempt + 1)}>
            Retry setup
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell authenticated displayName={displayName}>
      <PageHeader
        eyebrow={activeGarageName}
        title="Your digital glovebox"
        description={displayName ? `Welcome back, ${displayName}.` : "Vehicles and maintenance, all in one place."}
      />

      <section aria-labelledby="vehicles-heading">
        <div className={`${styles.sectionHeader} ${styles.vehicleSectionHeader}`}>
          <div>
            <h2 id="vehicles-heading" className={styles.sectionTitle}>
              Vehicles
            </h2>
            <p className={styles.sectionDescription}>
              Open a vehicle to view its maintenance history and upcoming work.
            </p>
          </div>
          <Button
            variant="primary"
            className={styles.addVehicleAction}
            aria-label={showAddVehicle ? "Close add vehicle form" : "Add vehicle"}
            aria-expanded={showAddVehicle}
            aria-controls="add-vehicle-panel"
            onClick={() => setShowAddVehicle((current) => !current)}
          >
            <span className={styles.actionLabelDesktop} aria-hidden="true">
              {showAddVehicle ? "Close" : "+ Add Vehicle"}
            </span>
            <span className={styles.actionLabelMobile} aria-hidden="true">
              {showAddVehicle ? "Close" : "+ Add"}
            </span>
          </Button>
        </div>

        {showAddVehicle ? (
          <Card
            id="add-vehicle-panel"
            tone="subtle"
            padding="lg"
            className={styles.addVehiclePanel}
          >
            <div className={styles.formHeader}>
              <h3 className={styles.formTitle}>Add a vehicle</h3>
              <p className={styles.formDescription}>
                A nickname is all you need to get started.
              </p>
            </div>

            <form onSubmit={submitVehicle}>
              <div className={styles.formGrid}>
                <label className={`${styles.label} ${styles.fieldFull}`}>
                  Nickname
                  <input
                    autoFocus
                    required
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="Integra, F-150, Jeep…"
                    className={styles.input}
                  />
                </label>

                <label className={styles.label}>
                  Year <span className={styles.optional}>(optional)</span>
                  <input
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                    placeholder="1998"
                    inputMode="numeric"
                    className={styles.input}
                  />
                </label>

                <label className={styles.label}>
                  Make <span className={styles.optional}>(optional)</span>
                  <input
                    value={make}
                    onChange={(event) => setMake(event.target.value)}
                    placeholder="Acura"
                    className={styles.input}
                  />
                </label>

                <label className={`${styles.label} ${styles.fieldFull}`}>
                  Model <span className={styles.optional}>(optional)</span>
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="Integra"
                    className={styles.input}
                  />
                </label>
              </div>

              <div className={styles.formActions}>
                <Button variant="ghost" onClick={() => setShowAddVehicle(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!canAdd}>
                  Add vehicle
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {vehicles.length === 0 ? (
          <Card tone="subtle" className={styles.emptyState}>
            <p className={styles.emptyTitle}>Your glovebox is empty</p>
            <p className={styles.emptyCopy}>Add your first vehicle to start tracking maintenance.</p>
          </Card>
        ) : (
          <div className={styles.vehicleGrid}>
            {vehicles.map((vehicle) => {
              const counts = maintenanceCounts.get(vehicle.id) ?? { overdue: 0, upcoming: 0 };

              return (
                <VehicleCard
                  key={vehicle.id}
                  id={vehicle.id}
                  nickname={vehicle.nickname}
                  year={vehicle.year}
                  make={vehicle.make}
                  model={vehicle.model}
                  overdueCount={counts.overdue}
                  dueSoonCount={counts.upcoming}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="maintenance-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="maintenance-heading" className={styles.sectionTitle}>
              Needs attention
            </h2>
            <p className={styles.sectionDescription}>Overdue maintenance and work due in the next 30 days.</p>
          </div>
        </div>

        <Card tone="default" padding="md">
          {maintLoading ? (
            <p className={styles.loading}>Loading maintenance…</p>
          ) : flaggedMaintenance.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Nothing needs attention</p>
              <p className={styles.emptyCopy}>No maintenance is overdue or due soon.</p>
            </div>
          ) : (
            <div className={styles.maintenancePanel}>
              {Object.entries(maintenanceByVehicle).map(([vehicleId, items]) => (
                <div key={vehicleId} className={styles.maintenanceGroup}>
                  <Link href={`/vehicle/${vehicleId}`} className={styles.maintenanceVehicleLink}>
                    {vehicleName(vehicleId)} →
                  </Link>
                  <ul className={styles.maintenanceList}>
                    {items.map((item) => {
                      const status = getStatus(item);
                      return (
                        <li key={item.id} className={styles.maintenanceItem}>
                          <StatusBadge tone={status === "overdue" ? "danger" : "warning"}>
                            {status === "overdue" ? "Overdue" : "Due soon"}
                          </StatusBadge>
                          <div>
                            <div className={styles.maintenanceTitle}>{item.title}</div>
                            <div className={styles.maintenanceMeta}>
                              {item.due_date ? `Due ${item.due_date}` : "No due date"}
                              {item.notes ? ` — ${item.notes}` : ""}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}
