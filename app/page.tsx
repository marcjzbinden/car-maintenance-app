"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
const colors = {
  bg: "#1e1e1e",
  panel: "#252526",
  border: "#3c3c3c",
  text: "#e6e6e6",
  muted: "#a0a0a0",

  overdueBg: "#4b1e1e",
  upcomingBg: "#4a3b1a",
  openBg: "#252526",
};
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
  due_date: string | null;       // YYYY-MM-DD
  completed_at: string | null;   // ISO timestamp
  notes: string | null;
  created_at: string;
};


export default function Home() {
const [displayName, setDisplayName] = useState<string>("");
const [maintItems, setMaintItems] = useState<MaintenanceRow[]>([]);
const [maintLoading, setMaintLoading] = useState(false);
const router = useRouter();
const [userId, setUserId] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
const [nickname, setNickname] = useState("");
const [year, setYear] = useState("");
const [make, setMake] = useState("");
const [model, setModel] = useState("");
const canAdd = useMemo(() => nickname.trim().length > 0, [nickname]);
const [activeGarageId, setActiveGarageId] = useState<string | null>(null);
const [activeGarageName, setActiveGarageName] = useState<string>("Garage");
const pageStyle: CSSProperties = {
  padding: 16,
  fontFamily: "system-ui",
  maxWidth: 720,
  margin: "0 auto",
  background: colors.bg,
  color: colors.text,
  minHeight: "100vh",
};

const panelStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  borderRadius: 12,
  padding: 14,
};

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.bg,
  color: colors.text,
  marginTop: 6,
};

const buttonStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const smallButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: "8px 10px",
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: colors.bg,
  color: colors.muted,
  cursor: "not-allowed",
};

const vehicleCardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  borderRadius: 12,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

async function loadVehicles(garageId: string) {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("garage_id", garageId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  setVehicles((data ?? []) as VehicleRow[]);
}

// Paste helper functions here
 function getStatus(it: MaintenanceRow) {
  if (it.completed_at) return "completed";
  if (!it.due_date) return "open";

  const today = new Date();
  const due = new Date(it.due_date);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  if (due < today) return "overdue";

  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);

  if (due <= in30) return "upcoming";
  return "open";
}

async function loadDashboardMaintenance(garageId: string) {
  setMaintLoading(true);
  try {
    // 1) get vehicle ids for this garage
    const { data: vData, error: vErr } = await supabase
      .from("vehicles")
      .select("id")
      .eq("garage_id", garageId);

    if (vErr) throw vErr;

    const vehicleIds = (vData ?? []).map((v: any) => v.id);

    if (vehicleIds.length === 0) {
      setMaintItems([]);
      return;
    }

    // 2) get maintenance items for those vehicles
    const { data: mData, error: mErr } = await supabase
      .from("maintenance_items")
      .select("id, vehicle_id, title, due_date, completed_at, notes, created_at")
      .in("vehicle_id", vehicleIds)
      .order("created_at", { ascending: false });

    if (mErr) throw mErr;

    setMaintItems((mData ?? []) as MaintenanceRow[]);
  } finally {
    setMaintLoading(false);
  }
}

  useEffect(() => {
  let isMounted = true;

  (async () => {
    try {
      // 1) Ensure user is signed in
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const u = data.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      if (!isMounted) return;
      setUserId(u.id);
      setDisplayName((u.user_metadata as any)?.display_name ?? "");


      // 2) Load garage memberships (keep it simple first)
      const { data: memberships, error: mErr } = await supabase
        .from("garage_members")
        .select("garage_id, role")
        .eq("user_id", u.id);

      if (mErr) throw mErr;

      if (!memberships || memberships.length === 0) {
        alert("No garage membership found for this user.");
        router.replace("/login");
        return;
      }

      const activeGarageId = memberships[0].garage_id;

      if (!isMounted) return;
      setActiveGarageId(activeGarageId);
      setActiveGarageName("Garage"); // optional; we’ll add real name later

      // 3) Load vehicles for this garage
      await loadVehicles(activeGarageId);
      await loadDashboardMaintenance(activeGarageId);

    } catch (e: any) {
      // show something while we stabilize
      console.error("Home load failed:", e);
      alert(e?.message ?? "Home load failed (see console).");
      router.replace("/login");
    } finally {
      if (isMounted) setLoading(false);
    }
  })();

  return () => {
    isMounted = false;
  };
}, [router]);

  async function addVehicle() {
  if (!canAdd || !userId || !activeGarageId) return;

const payload = {
  garage_id: activeGarageId,
  created_by: userId, // matches policy: created_by = auth.uid()
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

await loadVehicles(activeGarageId);
await loadDashboardMaintenance(activeGarageId);
  }

  async function removeVehicle(id: string) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    if (activeGarageId) await loadDashboardMaintenance(activeGarageId);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main style={{ padding: 16, fontFamily: "system-ui" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
<main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>
  Car Maintenance Tracker - {activeGarageName}
  {displayName ? (
    <span style={{ fontSize: 14, marginLeft: 10, opacity: 0.75 }}>
      Welcome, {displayName}
    </span>
  ) : null}
</h1>

<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
  <button
    onClick={() => router.push("/profile")}
    style={buttonStyle}
  >
    Profile
  </button>

  <button
    onClick={() => router.push("/members")}
    style={buttonStyle}
  >
    Members
  </button>
<button
  onClick={() => router.push("/ideas")}
  style={buttonStyle}
>
  Ideas
</button>

  <button
    onClick={signOut}
    style={buttonStyle}
  >
    Sign out
  </button>
</div>
</div>
<section style={{ ...panelStyle, marginBottom: 18 }}>

  <h2 style={{ fontSize: 18, marginBottom: 10 }}>Garage Dashboard</h2>

  {maintLoading ? (
    <p style={{ opacity: 0.7 }}>Loading maintenance…</p>
  ) : (() => {
      const flagged = maintItems.filter((it) => {
        const s = getStatus(it);
        return s === "overdue" || s === "upcoming";
      });

      if (flagged.length === 0) {
        return <p style={{ opacity: 0.7 }}>Nothing overdue or due soon. Nice work.</p>;
      }

      // group by vehicle_id
      const byVehicle = flagged.reduce((acc: Record<string, MaintenanceRow[]>, it) => {
        (acc[it.vehicle_id] ||= []).push(it);
        return acc;
      }, {});

      // helper to show vehicle nickname
      const vehicleName = (id: string) =>
        vehicles.find((v) => v.id === id)?.nickname ?? "Vehicle";

      return (
        <div style={{ display: "grid", gap: 12 }}>
          {Object.entries(byVehicle).map(([vid, list]) => (
              <div key={vid} style={{ ...panelStyle, padding: 12 }}>
              <div
                onClick={() => router.push(`/vehicle/${vid}`)}
                style={{ fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
              >
                {vehicleName(vid)}
              </div>

              <ul style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
                {list.map((it) => {
                  const s = getStatus(it);
                  return (
                    <li key={it.id} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>
                        {s === "overdue" ? "🔴" : "🟡"} {it.title}
                      </span>
                      <span style={{ opacity: 0.8 }}>
                        {it.due_date ? ` — due ${it.due_date}` : ""}
                        {it.notes ? ` — ${it.notes}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      );
    })()}
</section>

      <section style={panelStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Add Vehicle</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            Nickname <span style={{ opacity: 0.6 }}>(required)</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Integra, F-150, Jeep..."
              style={inputStyle}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              Year
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="1998"
                inputMode="numeric"
                style={inputStyle}
              />
            </label>

            <label>
              Make
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Acura"
                style={inputStyle}
              />
            </label>
          </div>

          <label>
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Integra"
              style={inputStyle}
            />
          </label>

          <button
            onClick={addVehicle}
            disabled={!canAdd}
            style={canAdd ? buttonStyle : disabledButtonStyle}
          >
            + Add Vehicle
          </button>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Vehicles</h2>

        {vehicles.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No vehicles yet. Add one above.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {vehicles.map((v) => (
  <li key={v.id} style={vehicleCardStyle}>

    <div
      onClick={() => router.push(`/vehicle/${v.id}`)}
      style={{ cursor: "pointer" }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, textDecoration: "underline" }}>
        {v.nickname}
      </div>
      <div style={{ opacity: 0.75 }}>
        {[v.year, v.make, v.model].filter(Boolean).join(" ")}
      </div>
    </div>

    <button
      onClick={() => removeVehicle(v.id)}
      style={smallButtonStyle}
    >
      Remove
    </button>
  </li>
))}

          </ul>
        )}
      </section>
    </main>
  );
}
