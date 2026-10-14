-- Tamaño opcional de las tarjetas meteorológicas en computadoras.
-- NULL conserva el aspecto original del carrusel; móvil no usa estos valores.
alter table public.gdv_home_weather_position
  add column if not exists card_width_px smallint
    constraint gdv_home_weather_card_width_range check (card_width_px between 195 and 440),
  add column if not exists card_height_px smallint
    constraint gdv_home_weather_card_height_range check (card_height_px between 60 and 150);
