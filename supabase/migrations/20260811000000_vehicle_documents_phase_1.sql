BEGIN;

-- Abort if production has drifted from the approved preflight.
DO $phase_1_preflight$
BEGIN
  IF pg_catalog.to_regclass(
    'public.vehicle_documents'
  ) IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration blocked: public.vehicle_documents already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket_row
    WHERE bucket_row.id = 'vehicle-documents'
       OR bucket_row.name = 'vehicle-documents'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: vehicle-documents Storage bucket already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies AS policy_row
    WHERE policy_row.schemaname = 'storage'
      AND policy_row.tablename = 'objects'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: storage.objects policies changed after the approved preflight';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'file_size_limit'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
      AND column_name = 'allowed_mime_types'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: expected Storage bucket configuration columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
      AND column_name = 'bucket_id'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
      AND column_name = 'name'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
      AND column_name = 'owner_id'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: expected Storage object path/ownership columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND relation.relkind IN ('r', 'p')
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: RLS is not enabled on storage.objects';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
            'public.vehicles'::regclass
      AND constraint_row.conname =
            'vehicles_id_garage_id_key'
      AND constraint_row.contype = 'u'
      AND constraint_row.convalidated
      AND NOT constraint_row.condeferrable
      AND pg_catalog.pg_get_constraintdef(
            constraint_row.oid,
            true
          ) = 'UNIQUE (id, garage_id)'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: required vehicles(id, garage_id) unique constraint is missing or incompatible';
  END IF;

  IF pg_catalog.to_regprocedure(
    'public.is_garage_member(uuid)'
  ) IS NULL
  OR pg_catalog.to_regprocedure(
    'public.is_garage_owner(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Migration blocked: required garage authorization helpers are missing';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure_row
    WHERE procedure_row.oid IN (
      pg_catalog.to_regprocedure(
        'public.is_garage_member(uuid)'
      ),
      pg_catalog.to_regprocedure(
        'public.is_garage_owner(uuid)'
      )
    )
      AND procedure_row.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(
          COALESCE(
            procedure_row.proconfig,
            ARRAY[]::text[]
          )
        ) AS config_row(setting)
        WHERE replace(config_row.setting, ' ', '')
              IN ('search_path=""', 'search_path=')
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'Migration blocked: garage authorization helpers are not hardened as expected';
  END IF;
END;
$phase_1_preflight$;

CREATE TABLE public.vehicle_documents (
  id uuid
    DEFAULT gen_random_uuid()
    NOT NULL,

  garage_id uuid
    NOT NULL,

  vehicle_id uuid
    NOT NULL,

  uploaded_by uuid,

  storage_path text
    NOT NULL,

  filename text
    NOT NULL,

  mime_type text
    NOT NULL,

  document_type text,

  document_date date,

  created_at timestamp with time zone
    DEFAULT now()
    NOT NULL,

  CONSTRAINT vehicle_documents_pkey
    PRIMARY KEY (id),

  CONSTRAINT vehicle_documents_storage_path_key
    UNIQUE (storage_path),

  CONSTRAINT vehicle_documents_garage_id_fkey
    FOREIGN KEY (garage_id)
    REFERENCES public.garages(id)
    ON DELETE RESTRICT,

  CONSTRAINT vehicle_documents_vehicle_garage_id_fkey
    FOREIGN KEY (vehicle_id, garage_id)
    REFERENCES public.vehicles(id, garage_id)
    ON DELETE RESTRICT,

  CONSTRAINT vehicle_documents_uploaded_by_fkey
    FOREIGN KEY (uploaded_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT vehicle_documents_filename_check
    CHECK (
      filename = btrim(filename)
      AND char_length(filename) BETWEEN 1 AND 255
      AND filename !~ '[[:cntrl:]]'
      AND strpos(filename, '/') = 0
      AND strpos(filename, chr(92)) = 0
    ),

  CONSTRAINT vehicle_documents_mime_type_check
    CHECK (
      mime_type IN (
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      )
    ),

  CONSTRAINT vehicle_documents_document_type_check
    CHECK (
      document_type IS NULL
      OR document_type IN (
        'repair_invoice',
        'registration',
        'inspection',
        'insurance',
        'other'
      )
    ),

  CONSTRAINT vehicle_documents_storage_path_check
    CHECK (
      storage_path =
        garage_id::text
        || '/'
        || vehicle_id::text
        || '/'
        || id::text
        || '/original.'
        || CASE mime_type
             WHEN 'application/pdf' THEN 'pdf'
             WHEN 'image/jpeg' THEN 'jpg'
             WHEN 'image/png' THEN 'png'
             WHEN 'image/webp' THEN 'webp'
             WHEN 'image/heic' THEN 'heic'
             WHEN 'image/heif' THEN 'heif'
           END
    )
);

CREATE INDEX vehicle_documents_vehicle_created_at_idx
ON public.vehicle_documents (
  vehicle_id,
  created_at DESC
);

ALTER TABLE public.vehicle_documents
ENABLE ROW LEVEL SECURITY;

-- Remove any broad privileges inherited from public-schema defaults,
-- then grant only the Phase 1 operations.
REVOKE ALL
ON TABLE public.vehicle_documents
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
ON TABLE public.vehicle_documents
TO authenticated;

CREATE POLICY vehicle_documents_select_if_member
ON public.vehicle_documents
FOR SELECT
TO authenticated
USING (
  public.is_garage_member(garage_id)
);

CREATE POLICY vehicle_documents_insert_if_member
ON public.vehicle_documents
FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by = (
    SELECT auth.uid()
  )
  AND public.is_garage_member(garage_id)
);

CREATE POLICY vehicle_documents_delete_if_uploader_or_owner
ON public.vehicle_documents
FOR DELETE
TO authenticated
USING (
  public.is_garage_member(garage_id)
  AND (
    uploaded_by = (
      SELECT auth.uid()
    )
    OR public.is_garage_owner(garage_id)
  )
);

-- Create the bucket privately with a 15 MiB object limit.
-- The project-wide Storage limit must be confirmed separately
-- to be at least this large before applying the migration.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'vehicle-documents',
  'vehicle-documents',
  false,
  15 * 1024 * 1024,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
);

-- A new object is accepted only when:
-- 1. it is in the private vehicle-documents bucket;
-- 2. Storage assigned the current JWT subject as owner_id;
-- 3. a matching canonical metadata row already exists;
-- 4. that metadata row belongs to the current uploader;
-- 5. the uploader remains a member of the garage.
CREATE POLICY vehicle_documents_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-documents'
  AND owner_id = (
    SELECT auth.uid()::text
  )
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.storage_path = name
      AND document_row.uploaded_by = (
        SELECT auth.uid()
      )
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

-- This policy supports authorized listing, authenticated reads,
-- signed-URL creation, and Storage's post-upload RETURNING behavior.
-- Only objects that still have an authorized metadata row are readable.
CREATE POLICY vehicle_documents_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.storage_path = name
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

-- Originals are immutable: intentionally create no UPDATE policy.

-- Delete authorization deliberately does not depend on the metadata row.
-- That allows an orphaned object to be removed after its metadata has
-- already disappeared.
--
-- The caller must still be a current member of the garage encoded in
-- the first canonical path segment. Within that garage, deletion is
-- allowed to either:
-- 1. the Storage-assigned object owner_id (the uploader); or
-- 2. a current garage owner.
CREATE POLICY vehicle_documents_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vehicle-documents'
  AND EXISTS (
    SELECT 1
    FROM public.garage_members AS membership_row
    WHERE membership_row.garage_id::text =
            (storage.foldername(name))[1]
      AND membership_row.user_id = (
        SELECT auth.uid()
      )
      AND (
        owner_id = (
          SELECT auth.uid()::text
        )
        OR membership_row.role = 'owner'
      )
  )
);

COMMIT;
