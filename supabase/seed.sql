-- Optional starter data. Safe to run once after 0001_init_schema.sql.
-- Adjust prices to your office's real rates before going live.

insert into public.meal_prices (breakfast_price, lunch_price, dinner_price, effective_from)
select 30, 50, 40, current_date
where not exists (select 1 from public.meal_prices);
