import { createClient } from "@supabase/supabase-js";
import { QuestionDisplay, QuestionResult } from "./types";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchQuestionDisplay(id: number): Promise<QuestionDisplay> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, acclimation, question, pct_correct_above, pct_correct_below")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as QuestionDisplay;
}

export async function fetchQuestionResult(id: number): Promise<QuestionResult> {
  const { data, error } = await supabase
    .from("questions")
    .select("answer, tolerance, explanation")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as QuestionResult;
}
