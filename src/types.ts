export type Condition = "above" | "below";

// Fetched when a question screen is shown (no answer/explanation)
export interface QuestionDisplay {
  id: number;
  variant: number;
  acclimation: boolean;
  question: string;
  pct_correct_above: number;
  pct_correct_below: number;
}

// Fetched after the participant submits their answer
export interface QuestionResult {
  answer: number;
  tolerance: number;
  explanation: string;
}

export interface QuestionResponse {
  session_id: string;
  condition: Condition;
  question_id: number;
  variant: number;
  acclimation: boolean;
  time_seconds: number;
  correct: boolean;
  answer: number | null;
}

export interface SessionSummary {
  session_id: string;
  condition: Condition;
  esc195_grade: string;
  manipulation_check: number;
  completed_at: string;
}
