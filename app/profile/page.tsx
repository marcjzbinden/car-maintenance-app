"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { colors, panelStyle, inputStyle, buttonStyle, disabledButtonStyle } from "@/app/uiStyles";
import { AppShell, Button, Card, PageHeader } from "@/components/ui";
import { ensureUserSetup, getErrorMessage, resolveAuthenticatedGarage } from "@/lib/garageSetup";

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setSetupError(null);

        const setup = await resolveAuthenticatedGarage();
        if (!setup) {
          router.replace("/login");
          return;
        }

        setDisplayName(setup.displayName);
      } catch (error: unknown) {
        setSetupError(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [router, setupAttempt]);

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

    try {
      await ensureUserSetup();
      setDisplayName(name);
      setMsg("Saved!");
    } catch (setupSyncError: unknown) {
      setMsg(`Name saved, but profile sync failed: ${getErrorMessage(setupSyncError)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell contentWidth="narrow">
        <p style={{ opacity: 0.8 }}>Loading…</p>
      </AppShell>
    );
  }

  if (setupError) {
    return (
      <AppShell authenticated displayName={displayName} contentWidth="narrow">
        <PageHeader
          eyebrow="Garage setup"
          title="We couldn’t finish account setup"
          description="Your account is signed in. Retry to finish opening your glovebox."
        />
        <Card tone="subtle" padding="lg">
          <p>{setupError}</p>
          <Button variant="primary" onClick={() => setSetupAttempt((attempt) => attempt + 1)}>
            Retry setup
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell authenticated displayName={displayName} contentWidth="narrow">
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Choose the name shown around your digital glovebox."
      />

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
    </AppShell>
  );
}
