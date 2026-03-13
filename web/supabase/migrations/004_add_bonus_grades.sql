-- Migration 004: Bonus grade packs
--
-- Adds a bonus_grades column to profiles to track purchased grade packs.
-- Bonus grades are permanent — they persist across monthly resets and
-- are only consumed when a user has exhausted their plan quota.
--
-- Two new RPCs:
--   increment_grade_count_v2  — replaces increment_grade_count in /api/grade;
--                               drains plan quota first, bonus grades second.
--   add_bonus_grades          — atomically credits purchased packs (called by webhook).

-- ── Column ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_grades INTEGER NOT NULL DEFAULT 0;

-- ── RPC: increment_grade_count_v2 ─────────────────────────────────────────
-- Atomically claims one grade slot. Returns TRUE if allowed, FALSE if quota
-- exhausted. Plan quota is consumed first; bonus grades are the fallback.
-- Both paths use conditional UPDATEs to be safe under concurrent requests.

CREATE OR REPLACE FUNCTION increment_grade_count_v2(
  p_user_id    UUID,
  p_plan_limit INTEGER
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grades     INTEGER;
  v_bonus      INTEGER;
  rows_updated INTEGER;
BEGIN
  SELECT grades_this_period, bonus_grades
  INTO   v_grades, v_bonus
  FROM   profiles
  WHERE  id = p_user_id;

  -- Try plan quota first
  IF v_grades < p_plan_limit THEN
    UPDATE profiles
    SET    grades_this_period = grades_this_period + 1
    WHERE  id = p_user_id
      AND  grades_this_period < p_plan_limit;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
  END IF;

  -- Fall back to bonus grades
  IF v_bonus > 0 THEN
    UPDATE profiles
    SET    bonus_grades = bonus_grades - 1
    WHERE  id = p_user_id
      AND  bonus_grades > 0;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RETURN rows_updated > 0;
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_grade_count_v2(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_grade_count_v2(uuid, integer) TO service_role;

-- ── RPC: add_bonus_grades ─────────────────────────────────────────────────
-- Atomically adds p_amount bonus grades to a user's profile.
-- Called by the Stripe webhook after a successful one-time pack purchase.

CREATE OR REPLACE FUNCTION add_bonus_grades(
  p_user_id UUID,
  p_amount  INTEGER
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET    bonus_grades = bonus_grades + p_amount
  WHERE  id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION add_bonus_grades(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION add_bonus_grades(uuid, integer) TO service_role;
