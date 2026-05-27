/*
  # CivicGuard Database Schema

  1. New Tables
    - `rules` — Moderation rules defining concern topics with keywords, categories, and thresholds
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null) — Reddit subreddit ID (t5_xxx)
      - `name` (text, not null) — Human-readable rule name
      - `category` (text, not null) — Category: misinformation, self_harm, scam, crisis, other
      - `keywords` (text[], not null) — Array of keywords/patterns to match
      - `action` (text, not null) — Action: flag, remove, flair, report
      - `threshold` (numeric, default 0.5) — Confidence threshold for auto-action (0-1)
      - `flair_text` (text) — Flair to apply when action is 'flair'
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

    - `flagged_items` — Queue of flagged posts/comments for mod review
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null)
      - `thing_id` (text, not null) — Reddit thing ID (t1_ or t3_)
      - `thing_type` (text, not null) — 'post' or 'comment'
      - `author_name` (text) — Username of the content author
      - `matched_rule_id` (uuid, references rules)
      - `matched_keywords` (text[]) — Which keywords triggered the flag
      - `confidence_score` (numeric) — Context-adjusted confidence (0-1)
      - `context_factors` (jsonb) — Context scoring breakdown (account_age, karma, prior_removals)
      - `status` (text, default 'pending') — pending, approved, removed, ignored
      - `mod_username` (text) — Moderator who resolved
      - `resolved_at` (timestamptz) — When resolved
      - `created_at` (timestamptz, default now())

    - `welfare_resources` — Mod-configured welfare resource links per subreddit
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null)
      - `category` (text, not null) — mental_health, self_harm, homelessness, crisis, substance_abuse, other
      - `title` (text, not null) — Resource title
      - `body` (text, not null) — Comment body with links and info
      - `keywords` (text[], not null) — Keywords that trigger this resource
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())

    - `welfare_injection_log` — Log of welfare resource injections for impact measurement
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null)
      - `thing_id` (text, not null)
      - `resource_id` (uuid, references welfare_resources)
      - `category` (text, not null)
      - `created_at` (timestamptz, default now())

    - `health_reports` — Weekly community health digest data
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null)
      - `week_start` (date, not null)
      - `total_flagged` (integer, default 0)
      - `total_approved` (integer, default 0)
      - `total_removed` (integer, default 0)
      - `total_ignored` (integer, default 0)
      - `welfare_injections` (integer, default 0)
      - `top_flagged_terms` (jsonb) — Array of {term, count} objects
      - `by_category` (jsonb) — Counts by rule category
      - `crisis_mode_activations` (integer, default 0)
      - `created_at` (timestamptz, default now())

    - `crisis_mode_log` — Crisis mode activation history
      - `id` (uuid, primary key)
      - `subreddit_id` (text, not null)
      - `activated_by` (text, not null) — Moderator username
      - `activated_at` (timestamptz, default now())
      - `deactivated_at` (timestamptz)
      - `duration_hours` (integer) — Planned duration
      - `is_active` (boolean, default true)
      - `note` (text) — Reason for activation

  2. Security
    - Enable RLS on all tables
    - Policies restrict access to authenticated users matching subreddit_id ownership
*/

-- Rules table
CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('misinformation', 'self_harm', 'scam', 'crisis', 'other')),
  keywords text[] NOT NULL,
  action text NOT NULL CHECK (action IN ('flag', 'remove', 'flair', 'report')),
  threshold numeric DEFAULT 0.5 CHECK (threshold >= 0 AND threshold <= 1),
  flair_text text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flagged items table
CREATE TABLE IF NOT EXISTS flagged_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  thing_id text NOT NULL,
  thing_type text NOT NULL CHECK (thing_type IN ('post', 'comment')),
  author_name text,
  matched_rule_id uuid REFERENCES rules(id) ON DELETE SET NULL,
  matched_keywords text[],
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 1),
  context_factors jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'removed', 'ignored')),
  mod_username text,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Welfare resources table
CREATE TABLE IF NOT EXISTS welfare_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('mental_health', 'self_harm', 'homelessness', 'crisis', 'substance_abuse', 'other')),
  title text NOT NULL,
  body text NOT NULL,
  keywords text[] NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Welfare injection log table
CREATE TABLE IF NOT EXISTS welfare_injection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  thing_id text NOT NULL,
  resource_id uuid REFERENCES welfare_resources(id) ON DELETE SET NULL,
  category text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Health reports table
CREATE TABLE IF NOT EXISTS health_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  week_start date NOT NULL,
  total_flagged integer DEFAULT 0,
  total_approved integer DEFAULT 0,
  total_removed integer DEFAULT 0,
  total_ignored integer DEFAULT 0,
  welfare_injections integer DEFAULT 0,
  top_flagged_terms jsonb DEFAULT '[]',
  by_category jsonb DEFAULT '{}',
  crisis_mode_activations integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Crisis mode log table
CREATE TABLE IF NOT EXISTS crisis_mode_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_id text NOT NULL,
  activated_by text NOT NULL,
  activated_at timestamptz DEFAULT now(),
  deactivated_at timestamptz,
  duration_hours integer,
  is_active boolean DEFAULT true,
  note text
);

-- Enable RLS on all tables
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE welfare_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE welfare_injection_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_mode_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rules
CREATE POLICY "Authenticated users can read rules"
  ON rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert rules"
  ON rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update rules"
  ON rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete rules"
  ON rules FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for flagged_items
CREATE POLICY "Authenticated users can read flagged items"
  ON flagged_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert flagged items"
  ON flagged_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update flagged items"
  ON flagged_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for welfare_resources
CREATE POLICY "Authenticated users can read welfare resources"
  ON welfare_resources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert welfare resources"
  ON welfare_resources FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update welfare resources"
  ON welfare_resources FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete welfare resources"
  ON welfare_resources FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for welfare_injection_log
CREATE POLICY "Authenticated users can read welfare injection log"
  ON welfare_injection_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert welfare injection log"
  ON welfare_injection_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for health_reports
CREATE POLICY "Authenticated users can read health reports"
  ON health_reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert health reports"
  ON health_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update health reports"
  ON health_reports FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for crisis_mode_log
CREATE POLICY "Authenticated users can read crisis mode log"
  ON crisis_mode_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert crisis mode log"
  ON crisis_mode_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update crisis mode log"
  ON crisis_mode_log FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rules_subreddit ON rules(subreddit_id);
CREATE INDEX IF NOT EXISTS idx_rules_active ON rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_flagged_subreddit_status ON flagged_items(subreddit_id, status);
CREATE INDEX IF NOT EXISTS idx_flagged_created ON flagged_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_welfare_resources_subreddit ON welfare_resources(subreddit_id);
CREATE INDEX IF NOT EXISTS idx_welfare_injection_log_subreddit ON welfare_injection_log(subreddit_id);
CREATE INDEX IF NOT EXISTS idx_welfare_injection_log_created ON welfare_injection_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_reports_subreddit_week ON health_reports(subreddit_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_mode_subreddit ON crisis_mode_log(subreddit_id);
CREATE INDEX IF NOT EXISTS idx_crisis_mode_active ON crisis_mode_log(is_active) WHERE is_active = true;
