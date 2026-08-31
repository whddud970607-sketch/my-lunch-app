-- 020_delivery_workdays_grants_harden.sql
-- Purpose: Ensure authenticated cannot DELETE/TRUNCATE workday history.

REVOKE ALL ON public.delivery_workdays FROM authenticated;
REVOKE ALL ON public.delivery_workday_jobs FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_workdays TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_workday_jobs TO authenticated;

REVOKE ALL ON public.delivery_workdays FROM anon;
REVOKE ALL ON public.delivery_workday_jobs FROM anon;
