BEGIN;

ALTER TABLE ONLY public.maintenance_items
  ADD CONSTRAINT maintenance_items_id_vehicle_id_key
  UNIQUE (id, vehicle_id)
  NOT DEFERRABLE;

ALTER TABLE ONLY public.vehicle_documents
  ADD CONSTRAINT vehicle_documents_id_vehicle_id_key
  UNIQUE (id, vehicle_id)
  NOT DEFERRABLE;

CREATE TABLE public.maintenance_item_documents (
  document_id uuid
    NOT NULL,

  maintenance_item_id uuid
    NOT NULL,

  vehicle_id uuid
    NOT NULL,

  linked_at timestamp with time zone
    DEFAULT pg_catalog.now()
    NOT NULL,

  linked_by uuid
    DEFAULT auth.uid(),

  CONSTRAINT maintenance_item_documents_pkey
    PRIMARY KEY (document_id, maintenance_item_id),

  CONSTRAINT maintenance_item_documents_document_vehicle_fkey
    FOREIGN KEY (document_id, vehicle_id)
    REFERENCES public.vehicle_documents(id, vehicle_id)
    ON DELETE CASCADE,

  CONSTRAINT maintenance_item_documents_maintenance_vehicle_fkey
    FOREIGN KEY (maintenance_item_id, vehicle_id)
    REFERENCES public.maintenance_items(id, vehicle_id)
    ON DELETE CASCADE,

  CONSTRAINT maintenance_item_documents_linked_by_fkey
    FOREIGN KEY (linked_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL
);

CREATE FUNCTION public.stamp_maintenance_item_document_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.linked_at := pg_catalog.now();
  NEW.linked_by := auth.uid();

  RETURN NEW;
END;
$function$;

CREATE TRIGGER maintenance_item_documents_stamp_insert
BEFORE INSERT
ON public.maintenance_item_documents
FOR EACH ROW
EXECUTE FUNCTION public.stamp_maintenance_item_document_link();

REVOKE ALL
ON FUNCTION public.stamp_maintenance_item_document_link()
FROM PUBLIC, anon, authenticated;

CREATE INDEX maintenance_item_documents_maintenance_item_id_idx
ON public.maintenance_item_documents (maintenance_item_id);

ALTER TABLE public.maintenance_item_documents
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.maintenance_item_documents
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
ON TABLE public.maintenance_item_documents
TO authenticated;

CREATE POLICY maintenance_item_documents_select_if_member
ON public.maintenance_item_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          maintenance_item_documents.document_id
      AND document_row.vehicle_id =
          maintenance_item_documents.vehicle_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

CREATE POLICY maintenance_item_documents_insert_if_member
ON public.maintenance_item_documents
FOR INSERT
TO authenticated
WITH CHECK (
  linked_by = (
    SELECT auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          maintenance_item_documents.document_id
      AND document_row.vehicle_id =
          maintenance_item_documents.vehicle_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

CREATE POLICY maintenance_item_documents_delete_if_member
ON public.maintenance_item_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.vehicle_documents AS document_row
    WHERE document_row.id =
          maintenance_item_documents.document_id
      AND document_row.vehicle_id =
          maintenance_item_documents.vehicle_id
      AND public.is_garage_member(
        document_row.garage_id
      )
  )
);

COMMIT;
