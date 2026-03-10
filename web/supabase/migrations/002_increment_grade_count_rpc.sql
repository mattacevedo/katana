-- Migration 002: Atomic grade quota increment
--
-- Replaces the read-then-write quota pattern in /api/grade with a single
-- atomic DB operation, eliminating the TOCTOU race condition that allowed
-- concurrent requests to exceed the per-period quota.
--
-- Usage (from API route):
--   const { data: allowed } = await supabase.rpc('increment_grade_count', {
--     p_user_id: user.id,
--     p_limit: limit,
--   });
--   if (!allowed) return quota-exceeded error;
--
-- Returns TRUE if the increment succeeded (user was under their limit),
-- FALSE if the user was already at or above their limit.

CREATE OR REPLACE FUNCTION increment_grade_count(p_user_id uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE profiles
  SET grades_this_period = grades_this_period + 1
  WHERE id = p_user_id
    AND grades_this_period < p_limit;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- Revoke public execute, grant only to service_role (used by the API)
REVOKE EXECUTE ON FUNCTION increment_grade_count(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_grade_count(uuid, integer) TO service_role;
