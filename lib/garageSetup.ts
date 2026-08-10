import { supabase } from "@/lib/supabaseClient";

type AuthenticatedGarage = {
  displayName: string;
  garageId: string;
  userId: string;
};

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Something went wrong.";
}

export async function ensureUserSetup() {
  const { data, error } = await supabase.rpc("ensure_user_setup");

  if (error) throw error;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Garage setup did not return a garage.");
  }

  return data;
}

export async function resolveAuthenticatedGarage(): Promise<AuthenticatedGarage | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) throw error;
  if (!data.user) return null;

  const garageId = await ensureUserSetup();
  const displayName =
    typeof data.user.user_metadata?.display_name === "string"
      ? data.user.user_metadata.display_name
      : "";

  return {
    displayName,
    garageId,
    userId: data.user.id,
  };
}
