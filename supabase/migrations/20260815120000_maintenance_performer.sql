alter table public.maintenance_items
  add column service_provider text null,
  add column self_performed boolean not null default false;

alter table public.maintenance_items
  add constraint maintenance_items_performer_consistency
  check (
    (service_provider is null or btrim(service_provider) <> '')
    and (not self_performed or service_provider is null)
  );
