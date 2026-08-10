BEGIN;

-- Abort if production has drifted from the approved preflight.
DO $migration_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.garages AS g
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.garage_members AS gm
      WHERE gm.garage_id = g.id
        AND gm.role = 'owner'
    )
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one garage has no owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.garages AS g
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.garage_members AS gm
      WHERE gm.garage_id = g.id
    )
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one garage has no members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.garages AS g
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.garage_members AS gm
      WHERE gm.garage_id = g.id
        AND gm.user_id = g.created_by
    )
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one garage creator lacks membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.garages AS g
    JOIN public.garage_members AS gm
      ON gm.garage_id = g.id
     AND gm.user_id = g.created_by
    WHERE gm.role <> 'owner'
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one garage creator is not an owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.role IS NULL
       OR gm.role NOT IN ('owner', 'member')
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: invalid garage member role exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.maintenance_items AS mi
    JOIN public.vehicles AS v
      ON v.id = mi.vehicle_id
    WHERE mi.garage_id IS DISTINCT FROM v.garage_id
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: maintenance and vehicle garage IDs differ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.maintenance_items AS mi
    LEFT JOIN public.vehicles AS v
      ON v.id = mi.vehicle_id
    WHERE v.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one maintenance item lacks a vehicle';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = u.id
    )
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: at least one Auth user lacks a public profile';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    JOIN public.profiles AS p
      ON p.id = u.id
    WHERE lower(btrim(p.email))
          IS DISTINCT FROM
          lower(btrim(u.email))
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: Auth and profile emails differ';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(btrim(u.email))
      FROM auth.users AS u
      WHERE NULLIF(btrim(u.email), '') IS NOT NULL
      GROUP BY lower(btrim(u.email))
      HAVING count(*) > 1
    ) AS duplicate_auth_emails
  ) THEN
    RAISE EXCEPTION
      'Migration blocked: duplicate normalized Auth emails exist';
  END IF;
END;
$migration_preflight$;

-- Preserve the existing owner/member role constraint, or add it if absent.
DO $role_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
            'public.garage_members'::regclass
      AND constraint_row.conname =
            'garage_members_role_check'
      AND constraint_row.contype = 'c'
  ) THEN
    EXECUTE
      'ALTER TABLE ONLY public.garage_members
       ADD CONSTRAINT garage_members_role_check
       CHECK (role IN (''owner'', ''member''))
       NOT VALID';

    EXECUTE
      'ALTER TABLE ONLY public.garage_members
       VALIDATE CONSTRAINT garage_members_role_check';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
            'public.garage_members'::regclass
      AND constraint_row.conname =
            'garage_members_role_check'
      AND constraint_row.contype = 'c'
      AND NOT constraint_row.convalidated
  ) THEN
    EXECUTE
      'ALTER TABLE ONLY public.garage_members
       VALIDATE CONSTRAINT garage_members_role_check';
  END IF;
END;
$role_constraint$;

-- garage_members.role is the authoritative current ownership model.
CREATE OR REPLACE FUNCTION public.is_garage_member(
  p_garage_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.garage_id = p_garage_id
      AND gm.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_garage_owner(
  p_garage_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.garage_id = p_garage_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
  );
$function$;

-- Prevent removal or demotion of the final garage owner.
CREATE OR REPLACE FUNCTION public.protect_final_garage_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.role <> 'owner' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.garage_id = OLD.garage_id
     AND NEW.user_id = OLD.user_id
     AND NEW.role = 'owner'
  THEN
    RETURN NEW;
  END IF;

  -- Serialize ownership changes for this garage.
  PERFORM 1
  FROM public.garages AS g
  WHERE g.id = OLD.garage_id
  FOR UPDATE;

  -- Allow a trusted garage deletion to cascade through memberships.
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.garage_id = OLD.garage_id
      AND gm.role = 'owner'
      AND gm.user_id <> OLD.user_id
  ) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '23514',
        MESSAGE = 'A garage must retain at least one owner';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_final_garage_owner
  ON public.garage_members;

CREATE TRIGGER protect_final_garage_owner
BEFORE UPDATE OF garage_id, user_id, role OR DELETE
ON public.garage_members
FOR EACH ROW
EXECUTE FUNCTION public.protect_final_garage_owner();

-- Ensure that every newly inserted garage receives an owner membership.
CREATE OR REPLACE FUNCTION public.ensure_garage_creator_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.garage_members (
    garage_id,
    user_id,
    role
  )
  VALUES (
    NEW.id,
    NEW.created_by,
    'owner'
  )
  ON CONFLICT (garage_id, user_id)
  DO UPDATE SET role = 'owner';

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ensure_garage_creator_owner
  ON public.garages;

CREATE TRIGGER ensure_garage_creator_owner
AFTER INSERT
ON public.garages
FOR EACH ROW
EXECUTE FUNCTION public.ensure_garage_creator_owner();

-- Synchronize public profiles from Auth display_name metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles AS target_profile (
    id,
    email,
    full_name
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(
        btrim(NEW.raw_user_meta_data ->> 'display_name'),
        ''
      ),
      NULLIF(
        btrim(NEW.raw_user_meta_data ->> 'full_name'),
        ''
      )
    )
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(
      EXCLUDED.full_name,
      target_profile.full_name
    );

  RETURN NEW;
END;
$function$;

-- Preserve one existing correct Auth trigger, or create it if absent.
DO $signup_trigger$
DECLARE
  matching_trigger_count integer;
  expected_trigger_count integer;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (
      WHERE trigger_row.tgenabled <> 'D'
        AND ((trigger_row.tgtype::integer & 1) <> 0)
        AND ((trigger_row.tgtype::integer & 4) <> 0)
        AND ((trigger_row.tgtype::integer & 2) = 0)
        AND ((trigger_row.tgtype::integer & 64) = 0)
    )
  INTO
    matching_trigger_count,
    expected_trigger_count
  FROM pg_catalog.pg_trigger AS trigger_row
  JOIN pg_catalog.pg_class AS target_table
    ON target_table.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace AS target_schema
    ON target_schema.oid = target_table.relnamespace
  JOIN pg_catalog.pg_proc AS trigger_function
    ON trigger_function.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace AS function_schema
    ON function_schema.oid = trigger_function.pronamespace
  WHERE NOT trigger_row.tgisinternal
    AND target_schema.nspname = 'auth'
    AND target_table.relname = 'users'
    AND function_schema.nspname = 'public'
    AND trigger_function.proname = 'handle_new_user';

  IF matching_trigger_count = 0 THEN
    EXECUTE
      'CREATE TRIGGER on_auth_user_created
       AFTER INSERT ON auth.users
       FOR EACH ROW
       EXECUTE FUNCTION public.handle_new_user()';
  ELSIF matching_trigger_count <> 1
        OR expected_trigger_count <> 1
  THEN
    RAISE EXCEPTION
      'Unexpected handle_new_user Auth trigger structure';
  END IF;
END;
$signup_trigger$;

-- Fill only blank public names when existing Auth metadata has a value.
WITH auth_profile_names AS (
  SELECT
    u.id,
    COALESCE(
      NULLIF(
        btrim(u.raw_user_meta_data ->> 'display_name'),
        ''
      ),
      NULLIF(
        btrim(u.raw_user_meta_data ->> 'full_name'),
        ''
      )
    ) AS normalized_full_name
  FROM auth.users AS u
)
UPDATE public.profiles AS p
SET full_name = source.normalized_full_name
FROM auth_profile_names AS source
WHERE source.id = p.id
  AND NULLIF(btrim(p.full_name), '') IS NULL
  AND source.normalized_full_name IS NOT NULL;

-- Idempotent first-run profile, garage, and owner bootstrap.
CREATE OR REPLACE FUNCTION public.ensure_user_setup()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_user_id uuid;
  current_email text;
  current_metadata jsonb;
  normalized_full_name text;
  selected_garage_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE = 'Authentication required';
  END IF;

  -- Serialize concurrent bootstrap calls for this Auth user.
  SELECT
    u.email,
    u.raw_user_meta_data
  INTO
    current_email,
    current_metadata
  FROM auth.users AS u
  WHERE u.id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE = 'Authenticated user not found';
  END IF;

  normalized_full_name := COALESCE(
    NULLIF(
      btrim(current_metadata ->> 'display_name'),
      ''
    ),
    NULLIF(
      btrim(current_metadata ->> 'full_name'),
      ''
    )
  );

  INSERT INTO public.profiles AS target_profile (
    id,
    email,
    full_name
  )
  VALUES (
    current_user_id,
    current_email,
    normalized_full_name
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(
      EXCLUDED.full_name,
      target_profile.full_name
    );

  SELECT gm.garage_id
  INTO selected_garage_id
  FROM public.garage_members AS gm
  WHERE gm.user_id = current_user_id
  ORDER BY gm.created_at ASC, gm.garage_id ASC
  LIMIT 1;

  IF selected_garage_id IS NOT NULL THEN
    RETURN selected_garage_id;
  END IF;

  INSERT INTO public.garages (
    name,
    created_by
  )
  VALUES (
    'My Garage',
    current_user_id
  )
  RETURNING id INTO selected_garage_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.garage_members AS gm
    WHERE gm.garage_id = selected_garage_id
      AND gm.user_id = current_user_id
      AND gm.role = 'owner'
  ) THEN
    RAISE EXCEPTION
      'Garage bootstrap did not create an owner membership';
  END IF;

  RETURN selected_garage_id;
END;
$function$;

-- Replace membership upsert with existing-member-only operations.
DROP FUNCTION IF EXISTS public.add_garage_member(
  uuid,
  uuid,
  text
);

DROP FUNCTION IF EXISTS public.add_garage_member_by_email(
  uuid,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.set_garage_member_role(
  p_garage_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  affected_rows bigint;
BEGIN
  IF NOT public.is_garage_owner(p_garage_id) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE = 'Not authorized to manage this garage';
  END IF;

  IF p_role IS NULL
     OR p_role NOT IN ('owner', 'member')
  THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '23514',
        MESSAGE = 'Invalid garage role';
  END IF;

  UPDATE public.garage_members AS gm
  SET role = p_role
  WHERE gm.garage_id = p_garage_id
    AND gm.user_id = p_user_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'Garage member not found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_garage_member(
  p_garage_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  affected_rows bigint;
BEGIN
  IF NOT public.is_garage_owner(p_garage_id) THEN
    RAISE EXCEPTION
      USING
        ERRCODE = '42501',
        MESSAGE = 'Not authorized to manage this garage';
  END IF;

  DELETE FROM public.garage_members AS gm
  WHERE gm.garage_id = p_garage_id
    AND gm.user_id = p_user_id;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0002',
        MESSAGE = 'Garage member not found';
  END IF;
END;
$function$;

-- Remove hidden creator authorization and all direct membership writes.
DROP POLICY IF EXISTS garage_members_insert_creator
  ON public.garage_members;

DROP POLICY IF EXISTS garage_members_update_creator
  ON public.garage_members;

DROP POLICY IF EXISTS garage_members_delete_creator
  ON public.garage_members;

DROP POLICY IF EXISTS gm_insert_if_owner
  ON public.garage_members;

DROP POLICY IF EXISTS gm_update_if_owner
  ON public.garage_members;

DROP POLICY IF EXISTS gm_delete_if_owner
  ON public.garage_members;

-- Keep garage_members_select_self and gm_select_if_member.
-- There are intentionally no authenticated membership write policies.
REVOKE INSERT, UPDATE, DELETE
ON TABLE public.garage_members
FROM anon, authenticated;

GRANT SELECT
ON TABLE public.garage_members
TO authenticated;

-- Garage creation must go through ensure_user_setup.
DROP POLICY IF EXISTS garages_insert_self
  ON public.garages;

REVOKE INSERT
ON TABLE public.garages
FROM anon, authenticated;

-- Replace creator-only garage visibility with membership visibility.
DROP POLICY IF EXISTS garages_select_creator
  ON public.garages;

DROP POLICY IF EXISTS garages_select_if_member
  ON public.garages;

CREATE POLICY garages_select_if_member
ON public.garages
FOR SELECT
TO authenticated
USING (
  public.is_garage_member(id)
);

-- Profiles are visible only to the user and shared-garage members.
DROP POLICY IF EXISTS profiles_select_authenticated
  ON public.profiles;

DROP POLICY IF EXISTS profiles_select_self_or_shared_garage
  ON public.profiles;

CREATE POLICY profiles_select_self_or_shared_garage
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.garage_members AS profile_membership
    WHERE profile_membership.user_id = profiles.id
      AND public.is_garage_member(
        profile_membership.garage_id
      )
  )
);

-- Preserve garage provenance and prevent destructive Auth cascades.
ALTER TABLE ONLY public.garages
  DROP CONSTRAINT garages_created_by_fkey;

ALTER TABLE ONLY public.garages
  ADD CONSTRAINT garages_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE RESTRICT;

ALTER TABLE ONLY public.vehicles
  DROP CONSTRAINT vehicles_owner_id_fkey;

ALTER TABLE ONLY public.vehicles
  ADD CONSTRAINT vehicles_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Enforce maintenance/vehicle garage consistency.
ALTER TABLE ONLY public.vehicles
  ADD CONSTRAINT vehicles_id_garage_id_key
  UNIQUE (id, garage_id);

ALTER TABLE ONLY public.maintenance_items
  DROP CONSTRAINT maintenance_items_vehicle_id_fkey;

ALTER TABLE ONLY public.maintenance_items
  ADD CONSTRAINT maintenance_items_vehicle_garage_id_fkey
  FOREIGN KEY (vehicle_id, garage_id)
  REFERENCES public.vehicles(id, garage_id)
  ON DELETE CASCADE;

-- Trigger functions are not client-callable.
REVOKE ALL
ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.protect_final_garage_owner()
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.ensure_garage_creator_owner()
FROM PUBLIC, anon, authenticated;

-- RLS helpers and application RPCs are authenticated-only.
REVOKE ALL
ON FUNCTION public.is_garage_member(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.is_garage_member(uuid)
TO authenticated;

REVOKE ALL
ON FUNCTION public.is_garage_owner(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.is_garage_owner(uuid)
TO authenticated;

REVOKE ALL
ON FUNCTION public.ensure_user_setup()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.ensure_user_setup()
TO authenticated;

REVOKE ALL
ON FUNCTION public.set_garage_member_role(
  uuid,
  uuid,
  text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.set_garage_member_role(
  uuid,
  uuid,
  text
)
TO authenticated;

REVOKE ALL
ON FUNCTION public.remove_garage_member(
  uuid,
  uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.remove_garage_member(
  uuid,
  uuid
)
TO authenticated;

COMMIT;
