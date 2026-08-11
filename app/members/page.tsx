"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle } from "@/app/uiStyles";
import { AppShell, Button, Card, PageHeader } from "@/components/ui";
import { getErrorMessage, resolveAuthenticatedGarage } from "@/lib/garageSetup";
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [members, setMembers] = useState<GarageMemberRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);

  const profileById = useMemo(() => {
    const profileMap = new Map<string, ProfileRow>();
    for (const profile of profiles) profileMap.set(profile.id, profile);
    return profileMap;
  }, [profiles]);

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === "owner").length,
    [members],
  );

  async function loadMembers(gId: string, userId: string) {
    const { data: memberRows, error: memberError } = await supabase
      .from("garage_members")
      .select("user_id,role")
      .eq("garage_id", gId)
      .order("role", { ascending: false });

    if (memberError) throw memberError;

    const nextMembers = (memberRows ?? []) as GarageMemberRow[];
    setMembers(nextMembers);
    setCurrentRole(nextMembers.find((member) => member.user_id === userId)?.role ?? null);

    const memberIds = nextMembers.map((member) => member.user_id);
    if (memberIds.length === 0) {
      setProfiles([]);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,full_name")
      .in("id", memberIds)
      .order("email", { ascending: true });

    if (profileError) throw profileError;
    setProfiles((profileRows ?? []) as ProfileRow[]);
  }

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoading(true);
        setSetupError(null);
        setMsg(null);

        const setup = await resolveAuthenticatedGarage();
        if (!setup) {
          router.replace("/login");
          return;
        }

        if (!isMounted) return;

        setGarageId(setup.garageId);
        setCurrentUserId(setup.userId);
        setDisplayName(setup.displayName);
        await loadMembers(setup.garageId, setup.userId);
      } catch (error: unknown) {
        if (isMounted) setSetupError(getErrorMessage(error));
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router, setupAttempt]);

  async function updateRole(userId: string, role: Role) {
    if (!garageId || !currentUserId || currentRole !== "owner") return;

    setMsg(null);
    setWorking(true);

    const { error } = await supabase.rpc("set_garage_member_role", {
      p_garage_id: garageId,
      p_user_id: userId,
      p_role: role,
    });

    if (error) {
      setMsg(error.message);
      setWorking(false);
      return;
    }

    try {
      await loadMembers(garageId, currentUserId);
      setMsg("Member role updated.");
    } catch (refreshError: unknown) {
      setMsg(`Role updated, but refresh failed: ${getErrorMessage(refreshError)}`);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <AppShell contentWidth="narrow">
        <p style={{ opacity: 0.8 }}>Setting up your garage...</p>
      </AppShell>
    );
  }

  if (setupError) {
    return (
      <AppShell authenticated displayName={displayName} contentWidth="narrow">
        <PageHeader
          eyebrow="Garage setup"
          title="We couldn’t load garage members"
          description="Your account is signed in, but garage setup or roster loading did not finish."
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
        title="Garage members"
        description={
          currentRole === "owner"
            ? "Manage roles for the people who already share this digital glovebox."
            : "See the people who share this digital glovebox."
        }
      />

      <Card tone="subtle" padding="md" style={{ marginTop: 14 }}>
        <p style={{ margin: 0, opacity: 0.78 }}>
          Adding or inviting new people is not available yet. Invitations will require acceptance
          before access is granted.
        </p>
      </Card>

      <Card padding="md" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Current members</h2>

        {members.length === 0 ? (
          <p style={{ opacity: 0.75 }}>No members found.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {members.map((member) => {
              const profile = profileById.get(member.user_id);
              const label = profile?.full_name || profile?.email || "Garage member";
              const isFinalOwner = member.role === "owner" && ownerCount === 1;

              return (
                <li
                  key={member.user_id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {label}
                      {member.user_id === currentUserId ? " (you)" : ""}
                    </div>
                    {profile?.email ? (
                      <div style={{ opacity: 0.7, fontSize: 13 }}>{profile.email}</div>
                    ) : null}
                  </div>

                  {currentRole === "owner" ? (
                    <select
                      aria-label={`Role for ${label}`}
                      value={member.role}
                      onChange={(event) => void updateRole(member.user_id, event.target.value as Role)}
                      disabled={working || isFinalOwner}
                      title={isFinalOwner ? "A garage must retain at least one owner." : undefined}
                      style={{ ...inputStyle, width: "auto", minWidth: 120 }}
                    >
                      <option value="member">member</option>
                      <option value="owner">owner</option>
                    </select>
                  ) : (
                    <span style={{ opacity: 0.75, textTransform: "capitalize" }}>{member.role}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {msg ? <p role="status" style={{ marginBottom: 0 }}>{msg}</p> : null}
      </Card>
    </AppShell>
  );
}
