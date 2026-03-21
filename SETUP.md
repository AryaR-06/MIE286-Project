# Setup Guide

## 1. Supabase (Database)

### Create account
1. Go to https://supabase.com → Sign Up (free)
2. Create a new project (choose any name, e.g. "mie286-experiment")
3. Wait ~2 minutes for the project to provision

### Create tables
Go to **SQL Editor** in the Supabase dashboard and run:

```sql
-- Session summary (one row per completed participant)
create table sessions (
  session_id uuid primary key,
  condition text not null check (condition in ('above', 'below')),
  esc195_grade text,
  manipulation_check integer check (manipulation_check between 1 and 5),
  completed_at timestamptz default now()
);

-- Per-question responses (many rows per session)
create table responses (
  id bigserial primary key,
  session_id uuid references sessions(session_id),
  condition text not null,
  question_id integer not null,
  acclimation boolean not null,
  time_seconds numeric not null,
  correct boolean not null
);

-- Allow anonymous inserts (participants write data without logging in)
alter table sessions enable row level security;
alter table responses enable row level security;

create policy "Allow anonymous insert on sessions"
  on sessions for insert to anon with check (true);

create policy "Allow anonymous insert on responses"
  on responses for insert to anon with check (true);

-- Allow reading sessions for condition assignment (needed for balancing)
create policy "Allow anonymous select on sessions"
  on sessions for select to anon using (true);
```

### Get your API keys
Go to **Project Settings → API**:
- Copy **Project URL** → this is your `REACT_APP_SUPABASE_URL`
- Copy **anon/public key** → this is your `REACT_APP_SUPABASE_ANON_KEY`

---

## 2. Local Development

```bash
cp .env.example .env.local
# Paste your Supabase URL and anon key into .env.local

npm install
npm start
```

---

## 3. Deploy to Vercel (shareable link)

1. Push this project to a GitHub repository
2. Go to https://vercel.com → Import your repo
3. In the Vercel project settings, add Environment Variables:
   - `REACT_APP_SUPABASE_URL` = your Supabase URL
   - `REACT_APP_SUPABASE_ANON_KEY` = your Supabase anon key
4. Deploy — Vercel gives you a link like `https://your-project.vercel.app`

That link is what you share with participants.

---

## 4. Viewing Your Data

Log in to Supabase → **Table Editor** to view raw data.
Export as CSV for import into R.

### Useful queries

```sql
-- All completed sessions
select * from sessions order by completed_at desc;

-- All responses for a specific session
select * from responses where session_id = 'uuid-here';

-- Condition counts
select condition, count(*) from sessions group by condition;
```

---

## 5. Adding / Editing Questions

Edit `src/questions.ts`. Each question object:

```ts
{
  id: number,           // unique integer
  acclimation: boolean, // true = shown first, in fixed order, no comparative feedback
  question: string,     // the question text shown to participants
  answer: number,       // correct numeric answer
  tolerance: number,    // acceptable error margin (0 for exact, 0.01 for decimals)
  explanation: string,  // shown on correctness screen
  pct_correct_above: number,  // fake % shown in above-average condition (suggest 55–75)
  pct_correct_below: number,  // fake % shown in below-average condition (suggest 80–95)
}
```

Set `acclimation: true` on your first N questions (default N=3 in `src/config.ts`).
The rest are randomized automatically.
