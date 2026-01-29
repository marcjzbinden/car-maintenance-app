"use client";

import { useRouter } from "next/navigation";

const colors = {
  bg: "#1e1e1e",
  panel: "#252526",
  border: "#3c3c3c",
  text: "#e6e6e6",
  muted: "#a0a0a0",
};

type Idea = {
  title: string;
  bullets: string[];
  priority?: "P1" | "P2" | "P3";
  notes?: string;
};

const ideas: { section: string; items: Idea[] }[] = [
  {
    section: "Documentation & Evidence",
    items: [
      {
        title: "Attach photos & files",
        priority: "P2",
        bullets: [
          "Repair photos",
          "Shop invoice / receipt",
          "Parts used / packaging labels",
        ],
        notes: "Likely Supabase Storage + an attachments table.",
      },
    ],
  },
  {
    section: "Who Did the Work",
    items: [
      {
        title: "Track DIY vs shop",
        priority: "P1",
        bullets: ["Mark item as DIY or Shop", "Optional shop name"],
      },
    ],
  },
  {
    section: "Parts & Cost Tracking",
    items: [
      {
        title: "Track parts source + costs",
        priority: "P2",
        bullets: [
          "Vendor/source (RockAuto, dealer, Amazon, local shop)",
          "Part cost",
          "Optional link / notes",
        ],
      },
      {
        title: "Track labor cost (shop)",
        priority: "P2",
        bullets: ["Labor cost", "Total cost (parts + labor)"],
      },
    ],
  },
  {
    section: "Service Intervals & Recurrence",
    items: [
      {
        title: "Auto-create next service interval",
        priority: "P3",
        bullets: [
          "Next service based on date interval (e.g., 6 months)",
          "Next service based on mileage interval (e.g., 5,000 miles)",
          "Templates: oil change, inspection, emissions, etc.",
        ],
      },
    ],
  },
  {
    section: "Reminders & Notifications",
    items: [
      {
        title: "Send reminders for upcoming/overdue",
        priority: "P3",
        bullets: [
          "Email reminders (easy first)",
          "Calendar reminders (nice)",
          "Push notifications (later)",
        ],
      },
    ],
  },
];

function pillStyle(priority?: Idea["priority"]) {
  const base = {
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    fontSize: 12,
    color: colors.text,
    background: colors.panel,
  } as const;

  if (!priority) return base;

  const bg =
    priority === "P1" ? "#1f3b2c" : priority === "P2" ? "#3b321f" : "#2b2b3b";

  return { ...base, background: bg };
}

export default function IdeasPage() {
  const router = useRouter();

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui",
        maxWidth: 900,
        margin: "0 auto",
        background: colors.bg,
        color: colors.text,
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Future Ideas</h1>

        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${colors.border}`,
            background: colors.panel,
            color: colors.text,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </div>

      <p style={{ color: colors.muted, marginTop: 10 }}>
        Parking lot for enhancements. We’ll prioritize as we go.
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {ideas.map((group) => (
          <section
            key={group.section}
            style={{
              border: `1px solid ${colors.border}`,
              background: colors.panel,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <h2 style={{ fontSize: 18, margin: 0 }}>{group.section}</h2>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {group.items.map((it) => (
                <div
                  key={it.title}
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: 12,
                    background: colors.bg,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 700 }}>{it.title}</div>
                    <span style={pillStyle(it.priority)}>{it.priority ?? "—"}</span>
                  </div>

                  <ul style={{ marginTop: 8, marginBottom: 0, color: colors.muted }}>
                    {it.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>

                  {it.notes ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>
                      Note: {it.notes}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
