"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, pageStyle, panelStyle, inputStyle, buttonStyle, disabledButtonStyle } from "@/app/uiStyles";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const canSubmit = !!email.trim() && !!password && (!busy);

  async function submit() {
    setMsg(null);

    if (mode === "signup" && displayName.trim().length === 0) {
      setMsg("Please enter a display name.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const trimmedDisplayName = displayName.trim();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: trimmedDisplayName,
            },
          },
        });

        if (error) throw error;

        if (data.session) {
          router.push("/");
        } else {
          setMsg("Account created. Check your email to confirm your account, then sign in.");
          setDisplayName("");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        router.push("/"); // consistent with your nav pattern
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
      </div>

      <section style={{ ...panelStyle, marginTop: 14, maxWidth: 520 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {mode === "signup" && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Marc, Jacob, Emma..."
                style={inputStyle}
              />
            </label>
          )}

          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              style={inputStyle}
            />
          </label>

          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <button
              onClick={submit}
              disabled={!canSubmit || (mode === "signup" && displayName.trim().length === 0)}
              style={
                !canSubmit || (mode === "signup" && displayName.trim().length === 0)
                  ? disabledButtonStyle
                  : buttonStyle
              }
            >
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>

            <button
              onClick={() => {
                setMsg(null);
                setMode(mode === "signin" ? "signup" : "signin");
              }}
              style={buttonStyle}
              disabled={busy}
            >
              {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
            </button>
          </div>

          {msg && (
            <p style={{ margin: 0, color: msg.toLowerCase().includes("error") ? "#ff8080" : colors.muted }}>
              {msg}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
