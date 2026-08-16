import { supabase } from "@/lib/supabaseClient";

const VEHICLE_DOCUMENT_BUCKET = "vehicle-documents";
const SIGNED_URL_LIFETIME_SECONDS = 60;

export function createVehicleDocumentSignedUrl(
  storagePath: string,
  filename: string,
  download = false,
) {
  return supabase.storage
    .from(VEHICLE_DOCUMENT_BUCKET)
    .createSignedUrl(
      storagePath,
      SIGNED_URL_LIFETIME_SECONDS,
      download ? { download: filename } : undefined,
    );
}
