"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");


  async function submit() {
    setMsg(null);
    setBusy(true);
    if (mode === "signup" && displayName.trim().length === 0) {
  setMsg("Please enter a display name.");
  setBusy(false);
  return;
}

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      display_name: displayName.trim(),
    },
  },
});

        if (error) throw error;
        setMsg("Account created. You can sign in now.");
        setDisplayName("");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
{mode === "signup" && (
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
)}

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ display: "block", width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
          />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            style={{ display: "block", width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
          />
        </label>

        <button
          onClick={submit}
          disabled={busy || !email || !password}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
        </button>

        {msg && <p>{msg}</p>}
      </div>
    </main>
  );
}
