"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const current =
        (data.user.user_metadata as any)?.display_name ?? "";
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

    const { error } = await supabase.auth.updateUser({
      data: { display_name: name },
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Saved!");
  }

  if (loading) {
    return (
      <main style={{ padding: 16, fontFamily: "system-ui" }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Profile</h1>

      <label>
        Display Name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Marc, Jacob, Emma..."
          style={{
            display: "block",
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
            marginTop: 6,
          }}
        />
      </label>

      <button
        onClick={save}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Save
      </button>

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
    </main>
  );
}
