-- Fix subscriptions that were assigned 'muslimWorldLeague' by the migration 0003
-- default, but should have kept the original Singapore method.
--
-- Background: before calc_method support was added (PR #9, 2026-06-22 01:16:19 UTC),
-- the worker hardcoded CalculationMethod.Singapore() for all subscriptions. Migration
-- 0003 added the calc_method column with DEFAULT 'muslimWorldLeague', silently changing
-- the effective method for every pre-existing subscription.
--
-- This migration restores 'singapore' for those old subscriptions. Subscriptions
-- created after PR #9 (created_at >= '2026-06-22 01:16:19') are left untouched
-- because they were created when the API already accepted an explicit calcMethod.
UPDATE subscriptions
SET calc_method = 'singapore'
WHERE calc_method = 'muslimWorldLeague'
  AND (created_at IS NULL OR created_at < '2026-06-22 01:16:19');
