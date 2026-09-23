-- Temperature unit preference — defaults to Fahrenheit for every existing
-- and new row; a user can switch to Celsius from Profile.

alter table public.profiles
  add column temp_unit text not null default 'F' check (temp_unit in ('F', 'C'));
