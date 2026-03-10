-- Migration 003: Email-based profile lookup for the email agent
--
-- Joins auth.users with public.profiles to return account info for a given
-- email address. Used by /api/email/inbound to give Claude context about
-- whether the sender has a Katana account and what plan they're on.
--
-- Usage (from API route):
--   const { data } = await supabase.rpc('lookup_profile_by_email', {
--     p_email: 'user@example.com',
--   });
--   // data: { id, plan, grades_this_period, period_start, member_since } | null

CREATE OR REPLACE FUNCTION lookup_profile_by_email(p_email text)
RETURNS TABLE (
  id                  uuid,
  plan                text,
  grades_this_period  integer,
  period_start        timestamptz,
  member_since        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    COALESCE(p.plan, 'free')        AS plan,
    COALESCE(p.grades_this_period, 0) AS grades_this_period,
    p.period_start,
    u.created_at                    AS member_since
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
END;
$$;

-- Only the service role (API) should be able to call this
REVOKE EXECUTE ON FUNCTION lookup_profile_by_email(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION lookup_profile_by_email(text) TO service_role;
