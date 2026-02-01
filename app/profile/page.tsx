"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, pageStyle, panelStyle, inputStyle, buttonStyle, disabledButtonStyle } from "@/app/uiStyles";

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const current = (data.user.user_metadata as any)?.display_name ?? "";
      setDisplayName(current);
      setLoading(false);
    })();
  }, [router]);

  async function save() {
    setMsg(null);

    const name = displayName.trim();
    if (!name) {
      setMsg("Display name cannot be empty.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name },
    });

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    setMsg("Saved!");
    setSaving(false);
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <p style={{ opacity: 0.8 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Profile</h1>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/")} style={buttonStyle}>
            ← Back
          </button>
        </div>
      </div>

      <section style={{ ...panelStyle, marginTop: 14, maxWidth: 520 }}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Marc, Jacob, Emma..."
            style={inputStyle}
          />
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving} style={saving ? disabledButtonStyle : buttonStyle}>
            {saving ? "Saving..." : "Save"}
          </button>

          {msg && <span style={{ color: msg === "Saved!" ? colors.muted : "#ff8080" }}>{msg}</span>}
        </div>
      </section>
    </main>
  );
}
