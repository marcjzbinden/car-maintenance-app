--
-- PostgreSQL database dump
--

-- \restrict C6xlWRHGGGM1DFgiXr936yWfstDNReDu3ANdA3Y9OLNhcSOhzfIhOA7DcKKVTTB

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: add_garage_member("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Only the garage creator can add members
  if not exists (
    select 1 from public.garages g
    where g.id = p_garage_id
      and g.created_by = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.garage_members (garage_id, user_id, role)
  values (p_garage_id, p_user_id, p_role)
  on conflict (garage_id, user_id) do update set role = excluded.role;
end;
$$;


ALTER FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: is_garage_member("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_garage_member"("p_garage_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.garage_members gm
    where gm.garage_id = p_garage_id
      and gm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_garage_member"("p_garage_id" "uuid") OWNER TO "postgres";

--
-- Name: is_garage_owner("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_garage_owner"("p_garage_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.garage_members gm
    where gm.garage_id = p_garage_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_garage_owner"("p_garage_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: garage_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."garage_members" (
    "garage_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "garage_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."garage_members" OWNER TO "postgres";

--
-- Name: garages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."garages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."garages" OWNER TO "postgres";

--
-- Name: ideas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "garage_id" "uuid",
    "priority" "text",
    "category" "text"
);


ALTER TABLE "public"."ideas" OWNER TO "postgres";

--
-- Name: maintenance_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."maintenance_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "vehicle_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "due_date" "date",
    "completed_at" timestamp with time zone,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."maintenance_items" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."vehicles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "nickname" "text" NOT NULL,
    "year" "text",
    "make" "text",
    "model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "garage_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."vehicles" OWNER TO "postgres";

--
-- Name: garage_members garage_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."garage_members"
    ADD CONSTRAINT "garage_members_pkey" PRIMARY KEY ("garage_id", "user_id");


--
-- Name: garages garages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."garages"
    ADD CONSTRAINT "garages_pkey" PRIMARY KEY ("id");


--
-- Name: ideas ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");


--
-- Name: maintenance_items maintenance_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_items"
    ADD CONSTRAINT "maintenance_items_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id");


--
-- Name: garage_members garage_members_garage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."garage_members"
    ADD CONSTRAINT "garage_members_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;


--
-- Name: garage_members garage_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."garage_members"
    ADD CONSTRAINT "garage_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: garages garages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."garages"
    ADD CONSTRAINT "garages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ideas ideas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ideas ideas_garage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id");


--
-- Name: maintenance_items maintenance_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_items"
    ADD CONSTRAINT "maintenance_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: maintenance_items maintenance_items_garage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_items"
    ADD CONSTRAINT "maintenance_items_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;


--
-- Name: maintenance_items maintenance_items_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."maintenance_items"
    ADD CONSTRAINT "maintenance_items_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: vehicles vehicles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: vehicles vehicles_garage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "public"."garages"("id") ON DELETE CASCADE;


--
-- Name: vehicles vehicles_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vehicles"
    ADD CONSTRAINT "vehicles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: garage_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."garage_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: garage_members garage_members_delete_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garage_members_delete_creator" ON "public"."garage_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."garages" "g"
  WHERE (("g"."id" = "garage_members"."garage_id") AND ("g"."created_by" = "auth"."uid"())))));


--
-- Name: garage_members garage_members_insert_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garage_members_insert_creator" ON "public"."garage_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."garages" "g"
  WHERE (("g"."id" = "garage_members"."garage_id") AND ("g"."created_by" = "auth"."uid"())))));


--
-- Name: garage_members garage_members_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garage_members_select_self" ON "public"."garage_members" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: garage_members garage_members_update_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garage_members_update_creator" ON "public"."garage_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."garages" "g"
  WHERE (("g"."id" = "garage_members"."garage_id") AND ("g"."created_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."garages" "g"
  WHERE (("g"."id" = "garage_members"."garage_id") AND ("g"."created_by" = "auth"."uid"())))));


--
-- Name: garages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."garages" ENABLE ROW LEVEL SECURITY;

--
-- Name: garages garages_insert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garages_insert_self" ON "public"."garages" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));


--
-- Name: garages garages_select_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "garages_select_creator" ON "public"."garages" FOR SELECT USING (("created_by" = "auth"."uid"()));


--
-- Name: garage_members gm_delete_if_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gm_delete_if_owner" ON "public"."garage_members" FOR DELETE TO "authenticated" USING ("public"."is_garage_owner"("garage_id"));


--
-- Name: garage_members gm_insert_if_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gm_insert_if_owner" ON "public"."garage_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_garage_owner"("garage_id"));


--
-- Name: garage_members gm_select_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gm_select_if_member" ON "public"."garage_members" FOR SELECT TO "authenticated" USING ("public"."is_garage_member"("garage_id"));


--
-- Name: garage_members gm_update_if_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gm_update_if_owner" ON "public"."garage_members" FOR UPDATE TO "authenticated" USING ("public"."is_garage_owner"("garage_id")) WITH CHECK ("public"."is_garage_owner"("garage_id"));


--
-- Name: ideas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ideas" ENABLE ROW LEVEL SECURITY;

--
-- Name: ideas ideas_by_garage_members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ideas_by_garage_members" ON "public"."ideas" USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."user_id" = "auth"."uid"()) AND ("gm"."garage_id" = "ideas"."garage_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."user_id" = "auth"."uid"()) AND ("gm"."garage_id" = "ideas"."garage_id")))));


--
-- Name: maintenance_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."maintenance_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_items mi_delete_if_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mi_delete_if_owner" ON "public"."maintenance_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "maintenance_items"."garage_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'owner'::"text")))));


--
-- Name: maintenance_items mi_insert_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mi_insert_if_member" ON "public"."maintenance_items" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "maintenance_items"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))) AND ("created_by" = "auth"."uid"())));


--
-- Name: maintenance_items mi_select_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mi_select_if_member" ON "public"."maintenance_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "maintenance_items"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))));


--
-- Name: maintenance_items mi_update_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mi_update_if_member" ON "public"."maintenance_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "maintenance_items"."garage_id") AND ("gm"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "maintenance_items"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicles vehicles_delete_if_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vehicles_delete_if_owner" ON "public"."vehicles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "vehicles"."garage_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'owner'::"text")))));


--
-- Name: vehicles vehicles_insert_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vehicles_insert_if_member" ON "public"."vehicles" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "vehicles"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))) AND ("created_by" = "auth"."uid"())));


--
-- Name: vehicles vehicles_select_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vehicles_select_if_member" ON "public"."vehicles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "vehicles"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))));


--
-- Name: vehicles vehicles_update_if_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vehicles_update_if_member" ON "public"."vehicles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "vehicles"."garage_id") AND ("gm"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."garage_members" "gm"
  WHERE (("gm"."garage_id" = "vehicles"."garage_id") AND ("gm"."user_id" = "auth"."uid"())))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_garage_member"("p_garage_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "is_garage_member"("p_garage_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_garage_member"("p_garage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_garage_member"("p_garage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_garage_member"("p_garage_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_garage_owner"("p_garage_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_garage_owner"("p_garage_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_garage_owner"("p_garage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_garage_owner"("p_garage_id" "uuid") TO "service_role";


--
-- Name: TABLE "garage_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."garage_members" TO "anon";
GRANT ALL ON TABLE "public"."garage_members" TO "authenticated";
GRANT ALL ON TABLE "public"."garage_members" TO "service_role";


--
-- Name: TABLE "garages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."garages" TO "anon";
GRANT ALL ON TABLE "public"."garages" TO "authenticated";
GRANT ALL ON TABLE "public"."garages" TO "service_role";


--
-- Name: TABLE "ideas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ideas" TO "anon";
GRANT ALL ON TABLE "public"."ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas" TO "service_role";


--
-- Name: TABLE "maintenance_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."maintenance_items" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_items" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_items" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "vehicles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vehicles" TO "anon";
GRANT ALL ON TABLE "public"."vehicles" TO "authenticated";
GRANT ALL ON TABLE "public"."vehicles" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict C6xlWRHGGGM1DFgiXr936yWfstDNReDu3ANdA3Y9OLNhcSOhzfIhOA7DcKKVTTB

