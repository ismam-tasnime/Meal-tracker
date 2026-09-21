-- Supabase ships default privileges that grant EXECUTE on new functions in
-- `public` to anon/authenticated/service_role. A plain
-- `revoke all ... from public` does not remove those role-specific grants,
-- so `anon` silently kept EXECUTE on functions meant for signed-in users.
--
-- Nothing was exploitable: public.claim_first_admin is SECURITY INVOKER and
-- delegates to private.claim_first_admin, which anon has never been able to
-- execute; and get_monthly_report, also SECURITY INVOKER, returns zeroed
-- amounts for anon because RLS hides meal_prices from them. This makes the
-- grants match the intent explicitly rather than relying on that.
--
-- The trigger functions (set_updated_at, lock_meal_record_identity) keep
-- their grants on purpose: they fire on anonymous meal toggles, and calling
-- them directly over the API just errors out.

revoke execute on function public.claim_first_admin(text) from anon;
revoke execute on function public.get_monthly_report(int, int) from anon;

-- admin_setup_completed intentionally stays callable by anon: the signup
-- page must be able to ask whether registration is still open, and it
-- returns a single boolean.
