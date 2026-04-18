create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raw_text text not null,
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists task_profiles (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  task_type text not null,
  complexity text not null,
  ambiguity text not null,
  dependencies text not null,
  review_load text not null,
  research_load text not null,
  ai_leverage text not null,
  expected_output_size text not null,
  required_seniority text not null,
  iteration_risk text not null,
  coordination_load text not null,
  blocker_probability text not null,
  created_at timestamptz default now()
);

create table if not exists estimations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  without_ai_min_hours numeric not null,
  without_ai_max_hours numeric not null,
  with_ai_min_hours numeric not null,
  with_ai_max_hours numeric not null,
  time_saved_percent numeric not null,
  confidence_score numeric not null,
  created_at timestamptz default now()
);

create table if not exists clarifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  question text not null,
  answer text,
  created_at timestamptz default now()
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null,
  fields text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists saved_results (
  id uuid primary key,
  title text not null,
  task_type text not null,
  confidence_score numeric not null,
  time_saved_percent numeric not null,
  payload jsonb not null,
  created_at timestamptz default now()
);
