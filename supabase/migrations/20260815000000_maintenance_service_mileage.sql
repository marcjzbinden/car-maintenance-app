BEGIN;

ALTER TABLE ONLY public.maintenance_items
  ADD COLUMN service_mileage integer,
  ADD CONSTRAINT maintenance_items_service_mileage_nonnegative
    CHECK (
      service_mileage IS NULL
      OR service_mileage >= 0
    );

COMMIT;
