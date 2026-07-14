-- ============================================================
-- Doorline 0004 — Realtime publication + scheduled maintenance
-- ============================================================

-- Live collaboration channels (RLS still filters what each client receives).
alter publication supabase_realtime add table homes;
alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table location_tracks;

-- Scheduled jobs (requires pg_cron). On Supabase: enable the extension first.
create extension if not exists pg_cron;

-- Downsample today's firehose into daily routes every 3 minutes.
select cron.schedule('downsample-tracks', '*/3 * * * *', $$ select downsample_tracks(current_date) $$);

-- Refresh analytics matviews every 5 minutes.
select cron.schedule('refresh-analytics', '*/5 * * * *', $$ select refresh_analytics() $$);

-- Retention: drop raw location partitions older than 90 days (privacy + cost).
-- In production, pair with pg_partman to also pre-create next month's partition.
select cron.schedule('locations-retention', '17 3 * * *', $$
  do $inner$
  declare p text;
  begin
    for p in
      select inhrelid::regclass::text
      from pg_inherits where inhparent = 'locations'::regclass
        and inhrelid::regclass::text ~ '\d{4}_\d{2}$'
        and to_date(right(inhrelid::regclass::text, 7), 'YYYY_MM') < (current_date - interval '90 days')
    loop
      execute format('drop table if exists %s', p);
    end loop;
  end $inner$;
$$);

-- Expire stale geocode cache rows daily.
select cron.schedule('geocode-expire', '23 3 * * *', $$ delete from geocode_cache where expires_at < now() $$);
