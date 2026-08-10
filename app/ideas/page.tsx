"use client";

import { useEffect, useMemo, useState } from "react";
import { colors, panelStyle, inputStyle, buttonStyle, disabledButtonStyle } from "@/app/uiStyles";
import { AppShell, Button, Card, PageHeader } from "@/components/ui";
import { useRouter } from "next/navigation";
import { getErrorMessage, resolveAuthenticatedGarage } from "@/lib/garageSetup";
import { supabase } from "@/lib/supabaseClient";


type IdeaRow = {
  id: string;
  garage_id: string;
  created_by: string;
  title: string;
  details: string | null;
  status: "open" | "planned" | "done" | string;
  created_at: string;
};

export default function IdeasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [garageId, setGarageId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);

  const [ideas, setIdeas] = useState<IdeaRow[]>([]);

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const canAdd = useMemo(() => title.trim().length > 0, [title]);

  async function loadIdeas(gid: string) {
    const { data, error } = await supabase
      .from("ideas")
      .select("id, garage_id, created_by, title, details, status, created_at")
      .eq("garage_id", gid)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setIdeas((data ?? []) as IdeaRow[]);
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
        setGarageId(setup.garageId);

        await loadIdeas(setup.garageId);
      } catch (error: unknown) {
        console.error("Ideas load failed:", error);
        if (isMounted) setSetupError(getErrorMessage(error));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router, setupAttempt]);

  async function addIdea() {
    if (!canAdd || !userId || !garageId) return;

    setSaving(true);
    try {
      const payload = {
        garage_id: garageId,
        created_by: userId,
        title: title.trim(),
        details: details.trim() || null,
        status: "open",
      };

      const { error } = await supabase.from("ideas").insert(payload);
      if (error) throw error;

      setTitle("");
      setDetails("");

      await loadIdeas(garageId);
    } catch (e: any) {
      alert(e?.message ?? "Failed to add idea.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: IdeaRow["status"]) {
    if (!garageId) return;

    const { error } = await supabase.from("ideas").update({ status }).eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadIdeas(garageId);
  }

  async function removeIdea(id: string) {
    if (!garageId) return;

    const ok = confirm("Delete this idea?");
    if (!ok) return;

    const { error } = await supabase.from("ideas").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadIdeas(garageId);
  }

  if (loading) {
    return (
      <AppShell contentWidth="narrow">
        <p>Loading…</p>
      </AppShell>
    );
  }

  if (setupError) {
    return (
      <AppShell authenticated displayName={displayName} contentWidth="narrow">
        <PageHeader
          eyebrow="Garage setup"
          title="We couldn’t open your ideas"
          description="Your account is signed in, but garage setup did not finish."
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
        eyebrow="Garage"
        title="Future ideas"
        description="Keep track of improvements and projects for your digital glovebox."
      />

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Add Idea</h2>

        <div style={{ display: "grid", gap: 10 }}>
          <label>
            Title <span style={{ opacity: 0.6 }}>(required)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </label>

          <label>
            Details
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              style={{ ...inputStyle, minHeight: 90 }}
            />
          </label>

          <button
            onClick={addIdea}
            disabled={!canAdd || saving}
            style={!canAdd || saving ? disabledButtonStyle : buttonStyle}
          >
            {saving ? "Saving…" : "+ Add Idea"}
          </button>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Ideas</h2>

        {ideas.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No ideas yet. Add one above.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {ideas.map((it) => (
              <li
                key={it.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: 12,
                  background: colors.bg,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{it.title}</div>
                    {it.details ? (
                      <div style={{ opacity: 0.85, marginTop: 6, color: colors.muted }}>{it.details}</div>
                    ) : null}
                    <div style={{ opacity: 0.7, marginTop: 8, fontSize: 12 }}>
                      Status: <span style={{ fontWeight: 700 }}>{it.status}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => setStatus(it.id, "open")} style={buttonStyle}>
                      Open
                    </button>
                    <button onClick={() => setStatus(it.id, "planned")} style={buttonStyle}>
                      Planned
                    </button>
                    <button onClick={() => setStatus(it.id, "done")} style={buttonStyle}>
                      Done
                    </button>
                    <button onClick={() => removeIdea(it.id)} style={buttonStyle}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
