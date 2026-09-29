-- The guest guard trigger from 0015 doesn't need to run as its owner: whose
-- meal a guest count is comes from private.get_meal_period, which already
-- does. As SECURITY INVOKER, and with no one allowed to call it directly
-- (a trigger function can't be called outside its trigger anyway), it no
-- longer shows up in the Supabase security advisor. Behaviour is unchanged.
alter function public.guard_guest_meal_owner() security invoker;
revoke all on function public.guard_guest_meal_owner() from public, anon, authenticated;
