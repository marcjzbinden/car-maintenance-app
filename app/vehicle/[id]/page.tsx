"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  due_date: string | null;       // YYYY-MM-DD
  completed_at: string | null;   // ISO timestamp
  notes: string | null;
  created_at: string;
};

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [items, setItems] = useState<MaintenanceRow[]>([]);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD
  const [notes, setNotes] = useState("");

  const canAdd = useMemo(() => title.trim().length > 0, [title]);

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
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setUserId(data.user.id);

        await loadAll();
      } catch (e: any) {
        alert(e?.message ?? "Failed to load vehicle.");
        router.replace("/");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  async function addItem() {
    if (!vehicle || !userId || !canAdd) return;

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

    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, completed_at: now } : x)));
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

    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, completed_at: null } : x)));
  }
function getStatus(item: MaintenanceRow) {
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

  if (loading) {
    return (
<main style={{ padding: 16, fontFamily: "system-ui", background: colors.bg, color: colors.text, minHeight: "100vh" }}>

        <p>Loading…</p>
      </main>
    );
  }

  if (!vehicle) {
    return (
<main style={{ padding: 16, fontFamily: "system-ui", background: colors.bg, color: colors.text, minHeight: "100vh" }}>
        <p>Vehicle not found.</p>
        <button
          onClick={() => router.push("/")}
          style={{
  marginTop: 10,
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  cursor: "pointer",
}}

        >
          Back
        </button>
      </main>
    );
  }

  return (
<main
  style={{
    padding: 16,
    fontFamily: "system-ui",
    maxWidth: 820,
    margin: "0 auto",
    background: colors.bg,
    color: colors.text,
    minHeight: "100vh",
  }}
>

      <button
        onClick={() => router.push("/")}
        style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${colors.border}`,
background: colors.panel,
color: colors.text,
 cursor: "pointer" }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 26, marginTop: 12 }}>
        {vehicle.nickname}
        <span style={{ opacity: 0.7, fontSize: 16, marginLeft: 8 }}>
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
        </span>
      </h1>

      <section style={{ border: `1px solid ${colors.border}`,
background: colors.panel,
 borderRadius: 12, padding: 14, marginTop: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Add Maintenance Item</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            Title <span style={{ color: colors.muted, fontSize: 16, marginLeft: 8  }}>(required)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Oil change, Brake fluid, Inspection..."
              style={{ display: "block", width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${colors.border}`,
background: colors.bg,
color: colors.text,
 marginTop: 6 }}
            />
          </label>

          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ display: "block", width: "fit-content", padding: 10, borderRadius: 10, border: `1px solid ${colors.border}`,
background: colors.bg,
color: colors.text,
 marginTop: 6 }}
            />
          </label>

          <label>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Parts used, torque specs, etc."
              style={{ display: "block", width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${colors.border}`,
background: colors.bg,
color: colors.text,
 marginTop: 6, minHeight: 80 }}
            />
          </label>

          <button
  onClick={addItem}
  disabled={!canAdd}
  style={{
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: canAdd ? colors.panel : colors.bg,
    color: colors.text,
    cursor: canAdd ? "pointer" : "not-allowed",
    width: "fit-content",
  }}
>
  + Add Item
</button>

        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Maintenance</h2>

        {items.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No maintenance items yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {items.map((it) => {
const status = getStatus(it);
const done = status === "completed";

              return (
               <li
  key={it.id}
  style={{
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    background:
      status === "overdue"
        ? colors.overdueBg
        : status === "upcoming"
        ? colors.upcomingBg
        : colors.openBg,
    color: colors.text,
    opacity: done ? 0.6 : 1,
  }}
>

                  <div>
<div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>
  {it.title}
</div>

                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2, color: colors.muted }}>
  {status === "overdue" && "Overdue"}
  {status === "upcoming" && "Due soon"}
  {status === "completed" && "Completed"}
  {status === "open" && "Open"}
</div>


<div style={{ opacity: 0.8, color: colors.muted }}>

                      {it.due_date ? `Due: ${it.due_date}` : "No due date"}
                      {it.notes ? ` • ${it.notes}` : ""}
                    </div>
                  </div>

                  {done ? (
                    <button
                      onClick={() => reopen(it.id)}
                      style={{
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  cursor: "pointer",
  whiteSpace: "nowrap",
}}


                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => markCompleted(it.id)}
                      style={{
  padding: "8px 10px",
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  background: colors.panel,
  color: colors.text,
  cursor: "pointer",
  whiteSpace: "nowrap",
}}


                    >
                      Mark done
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
