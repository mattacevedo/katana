-- Migration 006: Atomic grade quota rollback
--
-- The existing rollback in /api/grade uses absolute SET values read before
-- the Claude call. Under concurrent requests this can overwrite another
-- request's increment, resulting in an incorrect quota count.
--
-- This RPC uses relative updates (field ± 1) which are safe under concurrency.
-- Called only when Claude fails AFTER increment_grade_count_v2 already ran.
--
-- p_used_bonus = TRUE  → bonus grade was consumed; restore it (+1 bonus_grades)
-- p_used_bonus = FALSE → plan quota slot was consumed; restore it (-1 grades_this_period)

CREATE OR REPLACE FUNCTION rollback_grade_count_v2(
  p_user_id    UUID,
  p_used_bonus BOOLEAN
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET
    grades_this_period = CASE
      WHEN NOT p_used_bonus THEN GREATEST(grades_this_period - 1, 0)
      ELSE grades_this_period
    END,
    bonus_grades = CASE
      WHEN p_used_bonus THEN bonus_grades + 1
      ELSE bonus_grades
    END
  WHERE id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION rollback_grade_count_v2(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION rollback_grade_count_v2(uuid, boolean) TO service_role;
