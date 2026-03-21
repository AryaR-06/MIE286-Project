# MIE286 Study

A web-based experiment built for MIE286 (Engineering and Society) at the University of Toronto. The study investigates how performance feedback framing affects calculus problem-solving behaviour.

## What it does

Participants work through a set of mental-math calculus questions under timed conditions. After each question they receive fabricated comparative feedback — randomly assigned to either an **above-average** or **below-average** framing — to test whether perceived relative standing influences subsequent performance. A manipulation check and a brief debrief are included at the end.

## Tech stack

- **React + TypeScript** (Create React App)
- **KaTeX** — renders LaTeX math in question text
- **Supabase** — anonymous data collection (responses and session summaries stored in a Postgres database)
- **Vercel** — hosting

## Project structure

```
src/
  App.tsx       — all UI screens and experiment logic
  config.ts     — question metadata (IDs, acclimation flags)
  supabase.ts   — database client and question fetching
  types.ts      — shared TypeScript types
  index.css     — styling
```

## Live link

> **Link will be added once data collection begins.**

## Data

Response data is stored in Supabase and can be exported as CSV from the Table Editor for analysis in R.
