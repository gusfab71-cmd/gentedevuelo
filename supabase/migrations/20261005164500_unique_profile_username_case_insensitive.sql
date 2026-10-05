create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));
