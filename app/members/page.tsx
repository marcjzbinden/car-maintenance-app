"use client";

import { useEffect, useMemo, useState } from "react";
import { panelStyle, inputStyle, buttonStyle, disabledButtonStyle } from "@/app/uiStyles";
import { AppShell, PageHeader } from "@/components/ui";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "member" | "owner";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type GarageMemberRow = {
  user_id: string;
  role: Role;
};

export default function MembersPage() {
  const router = useRouter();

  const [garageId, setGarageId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<GarageMemberRow[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newRole, setNewRole] = useState<Role>("member");

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  // Map user_id -> profile for display
  const profileById = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const availableProfiles = useMemo(() => {
    // Only show people not already in this garage
    return profiles.filter((p) => !memberIds.has(p.id));
  }, [profiles, memberIds]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      setDisplayName(
        typeof data.user.user_metadata?.display_name === "string"
          ? data.user.user_metadata.display_name
          : "",
      );

      // Discover garage_id from current user's membership row
      const { data: memberships, error: memErr } = await supabase
        .from("garage_members")
        .select("garage_id")
        .eq("user_id", data.user.id);

      if (memErr) {
        setMsg(memErr.message);
        setLoading(false);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setMsg("No garage membership found for your user.");
        setLoading(false);
        return;
      }

      const gId = memberships[0].garage_id as string;
      setGarageId(gId);

      // Load profiles (dropdown)
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id,email,full_name")
        .order("email", { ascending: true });

      if (profErr) {
        setMsg(`Profiles error: ${profErr.message}`);
        setLoading(false);
        return;
      }
      setProfiles((profs ?? []) as ProfileRow[]);

      // Load current garage members
      const { data: gms, error: gmErr } = await supabase
        .from("garage_members")
        .select("user_id,role")
        .eq("garage_id", gId)
        .order("role", { ascending: false });

      if (gmErr) {
        setMsg(`Members error: ${gmErr.message}`);
        setLoading(false);
        return;
      }
      setMembers((gms ?? []) as GarageMemberRow[]);

      setLoading(false);
    })();
  }, [router]);

async function refreshMembers() {
  if (!garageId) return;

  const { data: gms, error } = await supabase
    .from("garage_members")
    .select("user_id,role")
    .eq("garage_id", garageId);

  if (error) {
    setMsg(`Refresh members failed: ${error.message}`);
    return;
  }

  setMembers((gms ?? []) as GarageMemberRow[]);
  setMsg((prev) => (prev ? prev : `Members loaded: ${(gms ?? []).length}`));
}


  async function addSelectedMember() {
    setMsg(null);
    if (!garageId) return;

    if (!selectedUserId) {
      setMsg("Pick a user to add.");
      return;
    }

    setWorking(true);
    const { error } = await supabase.rpc("add_garage_member", {
      p_garage_id: garageId,
      p_user_id: selectedUserId,
      p_role: newRole,
    });

    const { data: check, error: checkErr } = await supabase
  .from("garage_members")
  .select("user_id,role")
  .eq("garage_id", garageId)
  .eq("user_id", selectedUserId)
  .maybeSingle();

if (checkErr) {
  setMsg(`Added, but verification failed: ${checkErr.message}`);
} else if (!check) {
  setMsg("RPC returned success, but the member row was not found. (Likely RPC/RLS issue)");
} else {
  setMsg("Member added.");
}


    if (error) {
      setMsg(error.message);
      setWorking(false);
      return;
    }

    setMsg("Member added/updated.");
    setSelectedUserId("");
    setNewRole("member");
    await refreshMembers();
    setWorking(false);
  }

  async function updateRole(userId: string, role: Role) {
    setMsg(null);
    if (!garageId) return;

    setWorking(true);
    const { error } = await supabase.rpc("add_garage_member", {
      p_garage_id: garageId,
      p_user_id: userId,
      p_role: role,
    });

    if (error) {
      setMsg(error.message);
      setWorking(false);
      return;
    }

    await refreshMembers();
    setWorking(false);
  }

  return (
<AppShell authenticated displayName={displayName} contentWidth="narrow">
      <PageHeader
        eyebrow="Garage"
        title="Garage members"
        description="Manage the people who can access this digital glovebox."
      />
      {loading ? (
        <p style={{ opacity: 0.8 }}>Loading…</p>
      ) : (
        <>
          <section style={{ ...panelStyle, marginTop: 14 }}>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Add member</h2>
            <label>
              User
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a user…</option>
                {availableProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.full_name || p.email || p.id).toString()}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ marginTop: 10 }}>
              <label>
                Role&nbsp;
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  style={inputStyle}
                >
                  <option value="member">member</option>
                  <option value="owner">owner</option>
                </select>
              </label>
            </div>

            <button
    onClick={addSelectedMember}
    disabled={working}
    style={working ? disabledButtonStyle : { ...buttonStyle, marginTop: 12 }}
  >
    {working ? "Working…" : "Add / Update Member"}
  </button>

            {availableProfiles.length === 0 && (
              <p style={{ marginTop: 10, opacity: 0.75 }}>
                No available users to add.
              </p>
            )}

            {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
        </section>

        <section style={{ ...panelStyle, marginTop: 14 }}>
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Current members</h2>
            {members.length === 0 ? (
              <p style={{ opacity: 0.75 }}>No members found.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {members.map((m) => {
                  const p = profileById.get(m.user_id);
                  const label = p?.full_name || p?.email || m.user_id;

                  return (
                    <li key={m.user_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{label}</div>
                        {p?.email && <div style={{ opacity: 0.7, fontSize: 13 }}>{p.email}</div>}
                      </div>

                      <select
                        value={m.role}
                        onChange={(e) => updateRole(m.user_id, e.target.value as Role)}
                        disabled={working}
                        style={inputStyle}
                      >
                        <option value="member">member</option>
                        <option value="owner">owner</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
