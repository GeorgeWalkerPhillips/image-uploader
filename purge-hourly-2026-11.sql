-- ============================================================================
-- purge-expired-events: run hourly instead of daily (Nov 2026)
--
-- The Edge Function now archives ONE event per invocation (oldest first),
-- because several large events in one run exhausted the worker's memory
-- (WORKER_RESOURCE_LIMIT, and before that "Array buffer allocation failed" every
-- night since October). An hourly run clears a backlog within hours; with nothing
-- due a run is a cheap no-op. Archives are also split into ~40 MB zip parts.
--
-- Idempotent. Apply as one statement (find the job by name, not by id).
-- ROLLBACK: same statement with schedule := '0 3 * * *'.
-- ============================================================================

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname ilike '%purge%' limit 1),
  schedule := '15 * * * *'
);
