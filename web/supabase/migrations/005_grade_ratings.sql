-- Migration 005: grade_ratings table
-- Stores thumbs-up / thumbs-down ratings submitted from the extension side panel.
-- grade_session_id is a client-generated UUID, unique per grading result shown.

CREATE TABLE IF NOT EXISTS grade_ratings (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade_session_id uuid        NOT NULL,
  rating           text        NOT NULL CHECK (rating IN ('up', 'down')),
  created_at       timestamptz DEFAULT now() NOT NULL,

  CONSTRAINT grade_ratings_session_unique UNIQUE (grade_session_id)
);

-- Index for per-user aggregation queries (admin dashboard)
CREATE INDEX IF NOT EXISTS grade_ratings_user_id_idx ON grade_ratings (user_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS grade_ratings_created_at_idx ON grade_ratings (created_at);

-- RLS: enabled but no user-readable policies — all access is via service role (admin client)
ALTER TABLE grade_ratings ENABLE ROW LEVEL SECURITY;
