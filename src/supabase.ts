import { createClient } from "@supabase/supabase-js";
import { QuestionDisplay, QuestionResult } from "./types";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchQuestionDisplay(id: number, variant: number): Promise<QuestionDisplay> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, variant, acclimation, question, pct_correct_above, pct_correct_below")
    .eq("id", id)
    .eq("variant", variant)
    .single();
  if (error) throw error;
  return data as QuestionDisplay;
}

export async function fetchQuestionResult(id: number, variant: number): Promise<QuestionResult> {
  const { data, error } = await supabase
    .from("questions")
    .select("answer, tolerance, explanation")
    .eq("id", id)
    .eq("variant", variant)
    .single();
  if (error) throw error;
  return data as QuestionResult;
}
