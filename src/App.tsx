import React, { useState, useEffect, useRef, useCallback } from "react";
import { InlineMath, BlockMath } from "react-katex";
import { supabase, fetchQuestionDisplay, fetchQuestionResult } from "./supabase";
import { Condition, QuestionDisplay, QuestionResult, QuestionResponse, SessionSummary } from "./types";
import { QUESTION_METAS } from "./config";
import "katex/dist/katex.min.css";
import "./index.css";

// ── LaTeX renderer ───────────────────────────────────────────────────────────

function renderMath(str: string): React.ReactNode {
  const parts = str.split(/(\$\$[\s\S]+?\$\$|\$[^$]+\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("$$")) return <BlockMath key={i} math={part.slice(2, -2)} />;
    if (part.startsWith("$"))  return <InlineMath key={i} math={part.slice(1, -1)} />;
    return part;
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionOrder(metas: typeof QUESTION_METAS): typeof QUESTION_METAS {
  const acclimation = shuffle(metas.filter((q) => q.acclimation));
  const rest = shuffle(metas.filter((q) => !q.acclimation));
  return [...acclimation, ...rest];
}

function fakeAvgTime(realTime: number, condition: Condition): number | null {
  if (condition === "above") {
    // suppress if user took too long — avg would be unbelievably high
    if (realTime > 300) return null;
    // you are faster → avg is higher (120–150% of your time)
    const fraction = 1.2 + Math.random() * 0.3;
    return parseFloat((realTime * fraction).toFixed(2));
  } else {
    // you are slower → avg is lower
    // lower bound: max(0.9/realTime, 0.5) ensures avg >= 0.9s while never going below 50%
    const lowerBound = Math.max(0.9 / realTime, 0.5);
    // if even the upper bound (80%) can't keep avg >= 0.9s, don't show time feedback
    if (lowerBound > 0.8) return null;
    const fraction = lowerBound + Math.random() * (0.8 - lowerBound);
    return parseFloat((realTime * fraction).toFixed(2));
  }
}

function pctDiff(real: number, avg: number): string {
  const diff = Math.round(((avg - real) / avg) * 100);
  if (diff > 0) return `${diff}% faster than average`;
  if (diff < 0) return `${Math.abs(diff)}% slower than average`;
  return "exactly average";
}

// ── screen types ─────────────────────────────────────────────────────────────

type Screen =
  | "already_done"
  | "consent"
  | "instructions"
  | "question"
  | "correctness"
  | "feedback"
  | "grade"
  | "debrief"
  | "manipulation"
  | "done";

// ── main component ────────────────────────────────────────────────────────────

const COMPLETED_KEY = "mie286_completed";

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    localStorage.getItem(COMPLETED_KEY) ? "already_done" : "consent"
  );
  const [sessionId] = useState(generateSessionId);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [orderedMetas] = useState(() => buildQuestionOrder(QUESTION_METAS));
  const [variantMap] = useState<Record<number, number>>(() =>
    Object.fromEntries(QUESTION_METAS.map((m) => [m.id, Math.floor(Math.random() * 3) + 1]))
  );
  const [currentDisplay, setCurrentDisplay] = useState<QuestionDisplay | null>(null);
  const [currentResult, setCurrentResult] = useState<QuestionResult | null>(null);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [responses, setResponses] = useState<QuestionResponse[]>([]);
  const [answer, setAnswer] = useState("");
  const startTimeRef = useRef<number>(0);
  const lastScreenChangeRef = useRef<number>(0);
  const [lastResponse, setLastResponse] = useState<QuestionResponse | null>(null);
  const [lastFakeAvg, setLastFakeAvg] = useState<number | null>(null);
  const [grade, setGrade] = useState("");
  const [showGradeTable, setShowGradeTable] = useState(false);
  const [manipCheck, setManipCheck] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMeta = orderedMetas[qIndex];

  // Assign condition on mount
  useEffect(() => {
    async function init() {
      try {
        const { data, error } = await supabase.from("sessions").select("condition");
        if (error) throw error;
        const countA = (data ?? []).filter((r: any) => r.condition === "above").length;
        const countB = (data ?? []).filter((r: any) => r.condition === "below").length;
        setCondition(countA <= countB ? "above" : "below");
      } catch {
        setCondition(Math.random() < 0.5 ? "above" : "below");
      }
    }
    init();
  }, []);

  // Fetch question display when question screen shows
  useEffect(() => {
    if (screen !== "question") return;
    setCurrentDisplay(null);
    setCurrentResult(null);
    setAnswer("");
    startTimeRef.current = Date.now();
    fetchQuestionDisplay(currentMeta.id, variantMap[currentMeta.id])
      .then(setCurrentDisplay)
      .catch(() => setLoadError("Failed to load question. Please refresh the page."));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [screen, qIndex]);

  const submitAnswer = useCallback(async () => {
    if (!answer.trim() || condition === null || checkingAnswer) return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const parsed = parseFloat(answer.trim());
    setCheckingAnswer(true);
    try {
      const result = await fetchQuestionResult(currentMeta.id, variantMap[currentMeta.id]);
      setCurrentResult(result);
      const correct = Math.abs(parsed - result.answer) <= result.tolerance;
      const resp: QuestionResponse = {
        session_id: sessionId,
        condition,
        question_id: currentMeta.id,
        variant: variantMap[currentMeta.id],
        acclimation: currentMeta.acclimation,
        time_seconds: parseFloat(elapsed.toFixed(2)),
        correct,
        answer: isNaN(parsed) ? null : parsed,
      };
      setLastResponse(resp);
      setLastFakeAvg(fakeAvgTime(elapsed, condition));
      setResponses((prev) => [...prev, resp]);
      setScreen("correctness");
    } catch {
      setError("Failed to check answer. Please try again.");
    } finally {
      setCheckingAnswer(false);
    }
  }, [answer, condition, currentMeta, sessionId, checkingAnswer]);

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submitAnswer();
  };

  const goToNext = () => {
    if (qIndex + 1 < orderedMetas.length) {
      setQIndex((i) => i + 1);
      setScreen("question");
    } else {
      setScreen("debrief");
    }
  };

  const handleSubmitAll = async () => {
    if (!grade.trim() || manipCheck === null || condition === null) return;
    setSubmitting(true);
    setError("");
    try {
      const session: SessionSummary = {
        session_id: sessionId,
        condition,
        esc195_grade: grade.trim(),
        manipulation_check: manipCheck,
        completed_at: new Date().toISOString(),
      };
      const { error: sessError } = await supabase
        .from("sessions")
        .insert(session);
      if (sessError) throw sessError;

      const { error: respError } = await supabase
        .from("responses")
        .insert(responses);
      if (respError) throw respError;

      localStorage.setItem(COMPLETED_KEY, "1");
      setScreen("done");
    } catch (e: any) {
      setError("Submission failed. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Track screen changes for Enter cooldown
  useEffect(() => {
    lastScreenChangeRef.current = Date.now();
  }, [screen]);

  // Global Enter handler for non-input screens
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (Date.now() - lastScreenChangeRef.current < 300) return;
      if (screen === "consent") setScreen("instructions");
      else if (screen === "instructions") setScreen("question");
      else if (screen === "correctness") setScreen("feedback");
      else if (screen === "feedback") goToNext();
      else if (screen === "debrief") setScreen("grade");
      else if (screen === "grade" && grade) setScreen("manipulation");
      else if (screen === "manipulation" && manipCheck !== null && !submitting) handleSubmitAll();
    };
    window.addEventListener("keyup", handler);
    return () => window.removeEventListener("keyup", handler);
  }, [screen, grade, manipCheck, submitting, goToNext, handleSubmitAll]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="screen center">
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (condition === null) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  if (screen === "consent") {
    return (
      <div className="screen">
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Consent</div>
            <h1>Before You Begin</h1>
            <p>
              This is a short study on how feedback affects performance. It takes about <strong>15 minutes</strong>.
            </p>
            <p>
              Participation is voluntary and all responses are anonymous. You can stop at any time.
            </p>
            <button className="btn-primary" onClick={() => setScreen("instructions")}>
              I Agree
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "instructions") {
    return (
      <div className="screen">
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Instructions</div>
            <h1>How It Works</h1>
            <ul className="instruction-list">
              <li>Answer each question by typing a number and pressing <kbd>Enter</kbd>.</li>
              <li>Work as <strong>quickly and accurately</strong> as possible.</li>
              <li>No calculator - do the math in your head.</li>
              <li>You will get feedback after each question.</li>
            </ul>
            <button className="btn-primary" onClick={() => setScreen("question")}>
              Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "question") {
    return (
      <div className="screen">
        <div className="app-frame">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
            <span className="app-header-right">{qIndex + 1} / {orderedMetas.length}</span>
          </div>
          <div className="header-progress">
            <div
              className="progress-fill"
              style={{ width: `${(qIndex / orderedMetas.length) * 100}%` }}
            />
          </div>
          <div className="app-body">
            <div className="tag">Question {qIndex + 1}</div>
            <div className="question-text">{currentDisplay ? renderMath(currentDisplay.question) : <div className="spinner" />}</div>
            <div className="input-area">
              <div className="input-row">
                <input
                  ref={inputRef}
                  type="number"
                  className="answer-input"
                  placeholder="Your answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyUp={handleKeyUp}
                />
                <button
                  className="btn-primary"
                  onClick={submitAnswer}
                  disabled={!answer.trim() || checkingAnswer || !currentDisplay}
                >
                  Submit →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "correctness" && lastResponse) {
    const correct = lastResponse.correct;
    return (
      <div className="screen">
        <div className="app-frame">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="question-text">{currentDisplay && renderMath(currentDisplay.question)}</div>
            <div className={`result-badge ${correct ? "correct" : "incorrect"}`}>
              {correct ? "✓ Correct" : "✗ Incorrect"}
            </div>
            <p className="answer-reveal">
              Your answer: <strong>{answer}</strong> &nbsp;·&nbsp; Correct answer: <strong>{currentResult?.answer}</strong>
            </p>
            <div className="explanation">{currentResult && renderMath(currentResult.explanation)}</div>
            <button
              className="btn-primary"
              onClick={() => setScreen("feedback")}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "feedback" && lastResponse) {
    const real = lastResponse.time_seconds;
    const avg = lastFakeAvg;
    const showTime = avg !== null;
    const pct = showTime ? pctDiff(real, avg!) : null;
    const pctCorrect =
      condition === "above"
        ? currentDisplay?.pct_correct_above
        : currentDisplay?.pct_correct_below;

    return (
      <div className="screen">
        <div className="app-frame">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Performance Feedback</div>
            <h2>Your Results</h2>
            <div className="feedback-grid">
              {showTime && (
                <>
                  <div className="feedback-stat">
                    <span className="stat-label">Your Time</span>
                    <span className="stat-value">{real.toFixed(2)}s</span>
                  </div>
                  <div className="feedback-stat">
                    <span className="stat-label">Average Time</span>
                    <span className="stat-value">{avg!.toFixed(2)}s</span>
                  </div>
                  <div className={`feedback-comparison ${condition === "above" ? "above" : "below"}`}>
                    {pct}
                  </div>
                </>
              )}
              <div className={`feedback-stat ${showTime ? "full-width" : ""}`}>
                <span className="stat-label">Students who got this right</span>
                <span className="stat-value">{pctCorrect}%</span>
              </div>
            </div>
            <button className="btn-primary" onClick={goToNext}>
              Next Question →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "grade") {
    const gradeScale = [
      ["90-100", "A+"], ["85-89", "A"], ["80-84", "A-"],
      ["77-79", "B+"], ["73-76", "B"], ["70-72", "B-"],
      ["67-69", "C+"], ["63-66", "C"], ["60-62", "C-"],
      ["57-59", "D+"], ["53-56", "D"], ["50-52", "D-"],
      ["0-49",  "F"],
    ];
    const letterGrades = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F"];
    return (
      <div className="screen">
        {showGradeTable && (
          <div className="modal-overlay" onClick={() => setShowGradeTable(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <span>Grade Scale</span>
                <button className="modal-close" onClick={() => setShowGradeTable(false)}>✕</button>
              </div>
              <table className="grade-table">
                <thead>
                  <tr><th>Mark (%)</th><th>Letter Grade</th></tr>
                </thead>
                <tbody>
                  {gradeScale.map(([range, letter]) => (
                    <tr key={letter}><td>{range}</td><td>{letter}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Additional Info</div>
            <h1>Calculus II Grade</h1>
            <p>What was your final grade in Calculus II? <button className="link-btn" onClick={() => setShowGradeTable(true)}>View percent to letter grade conversion</button></p>
            <p className="subtext">Your response is anonymous and cannot be linked to you individually.</p>
            <div className="grade-grid">
              {letterGrades.map((g) => (
                <button
                  key={g}
                  className={`grade-btn ${grade === g ? "selected" : ""}`}
                  onClick={() => setGrade(g)}
                >
                  {g}
                </button>
              ))}
              <button
                className={`grade-btn grade-btn-text ${grade === "prefer-not-to-say" ? "selected" : ""}`}
                onClick={() => setGrade("prefer-not-to-say")}
              >
                Took it, prefer not to say
              </button>
              <button
                className={`grade-btn grade-btn-text ${grade === "did-not-take" ? "selected" : ""}`}
                onClick={() => setGrade("did-not-take")}
              >
                Did not take this course
              </button>
            </div>
            <button
              className="btn-primary"
              onClick={() => setScreen("manipulation")}
              disabled={!grade}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "debrief") {
    return (
      <div className="screen">
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Debrief</div>
            <h1>Study Debrief</h1>
            <p>
  The feedback you received was <strong>not real</strong>. You were randomly assigned to see either above-average or below-average results, regardless of your actual performance. This was essential to isolate the effect of feedback framing on performance.
</p>
<p>
  There are two more questions that will be used for additional analysis.
</p>
            <button className="btn-primary" onClick={() => setScreen("grade")}>
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "manipulation") {
    return (
      <div className="screen">
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body">
            <div className="tag">Quick Check</div>
            <h1>Believability Check</h1>
            <p>
              How believable did the performance feedback seem at the time?
            </p>
            <div className="likert-group">
              <span className="likert-label">Not at all believable</span>
              <div className="likert-row">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    className={`likert-btn ${manipCheck === v ? "selected" : ""}`}
                    onClick={() => setManipCheck(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <span className="likert-label">Completely believable</span>
            </div>
            {error && <p className="error">{error}</p>}
            <button
              className="btn-primary"
              onClick={handleSubmitAll}
              disabled={manipCheck === null || submitting}
            >
              {submitting ? "Submitting…" : "Submit & Finish"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "already_done") {
    return (
      <div className="screen">
        <div className="app-frame">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div className="done-icon">✓</div>
            <h1>Already Submitted</h1>
            <p>It looks like you have already completed this study. Your responses have been recorded.</p>
            <p className="subtext">
              If you believe this is a mistake,{" "}
              <button
                className="link-btn"
                onClick={() => {
                  localStorage.removeItem(COMPLETED_KEY);
                  setScreen("consent");
                }}
              >
                click here to start over
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "done") {
    return (
      <div className="screen">
        <div className="app-frame wide">
          <div className="app-header">
            <span className="app-header-title">MIE286 Study</span>
          </div>
          <div className="app-body" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
            <div className="done-icon">✓</div>
            <h1>All Done!</h1>
            <p>
              Your responses have been saved. Thank you for participating in this
              study.
            </p>
            <p className="subtext">You may now close this tab.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
