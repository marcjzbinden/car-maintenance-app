BEGIN;

CREATE TABLE public.vehicle_document_reviews (
  document_id uuid
    NOT NULL,

  document_type text
    NOT NULL,

  document_date date,

  expiration_date date,

  mileage integer,

  provider text,

  total_cost numeric(12, 2),

  completed_work text[]
    DEFAULT '{}'::text[]
    NOT NULL,

  recommendations text[]
    DEFAULT '{}'::text[]
    NOT NULL,

  reviewed_at timestamp with time zone
    NOT NULL,

  reviewed_by uuid,

  CONSTRAINT vehicle_document_reviews_pkey
    PRIMARY KEY (document_id),

  CONSTRAINT vehicle_document_reviews_document_id_fkey
    FOREIGN KEY (document_id)
    REFERENCES public.vehicle_documents(id)
    ON DELETE CASCADE,

  CONSTRAINT vehicle_document_reviews_reviewed_by_fkey
    FOREIGN KEY (reviewed_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT vehicle_document_reviews_document_type_check
    CHECK (
      document_type IN (
        'repair_invoice',
        'registration',
        'inspection',
        'insurance',
        'other'
      )
    ),

  CONSTRAINT vehicle_document_reviews_mileage_check
    CHECK (
      mileage IS NULL
      OR mileage >= 0
    ),

  CONSTRAINT vehicle_document_reviews_total_cost_check
    CHECK (
      total_cost IS NULL
      OR total_cost >= 0
    ),

  CONSTRAINT vehicle_document_reviews_completed_work_check
    CHECK (
      NOT pg_catalog.jsonb_path_exists(
        pg_catalog.to_jsonb(completed_work),
        '$[*] ? ((@ == null) || (@ like_regex "^\\s*$"))'
      )
    ),

  CONSTRAINT vehicle_document_reviews_recommendations_check
    CHECK (
      NOT pg_catalog.jsonb_path_exists(
        pg_catalog.to_jsonb(recommendations),
        '$[*] ? ((@ == null) || (@ like_regex "^\\s*$"))'
      )
    )
);

CREATE FUNCTION public.stamp_vehicle_document_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document_id IS DISTINCT FROM OLD.document_id THEN
      RAISE EXCEPTION
        'A vehicle document review cannot be reassigned to another document'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.reviewed_at := pg_catalog.now();
  NEW.reviewed_by := auth.uid();

  RETURN NEW;
END;
$function$;

CREATE TRIGGER vehicle_document_reviews_stamp_review
BEFORE INSERT OR UPDATE
ON public.vehicle_document_reviews
FOR EACH ROW
EXECUTE FUNCTION public.stamp_vehicle_document_review();

-- The table owner retains the ability to invoke the trigger function.
-- Application roles do not need or receive direct EXECUTE access.
REVOKE ALL
ON FUNCTION public.stamp_vehicle_document_review()
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.vehicle_document_reviews
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.vehicle_document_reviews
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.vehicle_document_reviews
TO authenticated;

CREATE POLICY vehicle_document_reviews_select_if_member
ON public.vehicle_document_reviews
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          vehicle_document_reviews.document_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

CREATE POLICY vehicle_document_reviews_insert_if_member
ON public.vehicle_document_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  reviewed_by = (
    SELECT auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          vehicle_document_reviews.document_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

CREATE POLICY vehicle_document_reviews_update_if_member
ON public.vehicle_document_reviews
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          vehicle_document_reviews.document_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
)
WITH CHECK (
  reviewed_by = (
    SELECT auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          vehicle_document_reviews.document_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

COMMIT;
