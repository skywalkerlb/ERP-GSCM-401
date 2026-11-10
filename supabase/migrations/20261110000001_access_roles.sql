-- Commit enum additions before subsequent migrations use the values.
alter type public.app_role add value if not exists 'owner';
alter type public.app_role add value if not exists 'admin';
