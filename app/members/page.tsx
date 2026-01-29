"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function MembersPage() {
  const router = useRouter();

  const [garageId, setGarageId] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      // Get THIS user's membership row to discover garage_id
      const { data: memberships, error } = await supabase
        .from("garage_members")
        .select("garage_id")
        .eq("user_id", data.user.id)
        .limit(1);

      if (error) {
        setMsg(error.message);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setMsg("No garage membership found for your user.");
        return;
      }

      setGarageId(memberships[0].garage_id);
    })();
  }, [router]);

  async function addMember() {
    setMsg(null);
    if (!garageId) return;

    const userId = newUserId.trim();
    if (!userId) {
      setMsg("Paste the user's UUID.");
      return;
    }

    const { error } = await supabase.rpc("add_garage_member", {
      p_garage_id: garageId,
      p_user_id: userId,
      p_role: role,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Member added/updated.");
    setNewUserId("");
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Garage Members (Owner)</h1>

      <p style={{ opacity: 0.75, marginBottom: 12 }}>
        For now, add family members by their Supabase User UUID (from Supabase → Authentication → Users).
      </p>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <label>
          User UUID
          <input
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ display: "block", width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
          />
        </label>

        <div style={{ marginTop: 10 }}>
          <label>
            Role&nbsp;
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #ccc" }}
            >
              <option value="member">member</option>
              <option value="owner">owner</option>
            </select>
          </label>
        </div>

        <button
          onClick={addMember}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Add / Update Member
        </button>

        {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
      </div>
    </main>
  );
}
