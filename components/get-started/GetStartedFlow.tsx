'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { QuizStep } from './QuizStep';
import { RevealStep } from './RevealStep';
import { EXPERIENCE_QUESTION, RISK_QUESTION, HORIZON_QUESTION, GOAL_QUESTION } from './quiz-questions';
import {
  clearQuizProgress,
  readQuizProgress,
  savePendingQuizAnswers,
  saveQuizProgress,
  type CompleteQuizAnswers,
  type QuizAnswers,
} from '@/lib/onboarding/pending-onboarding';

const TOTAL_QUESTIONS = 4;

export function GetStartedFlow() {
  // GetStartedFlow only ever mounts after GetStartedPage's isLoading gate
  // clears — it's never present in the SSR/initial-hydration tree, so
  // reading sessionStorage synchronously here (to resume an in-progress
  // quiz after a refresh) can't cause a hydration mismatch.
  const [step, setStep] = useState(() => readQuizProgress()?.step ?? 0);
  const [answers, setAnswers] = useState<QuizAnswers>(() => readQuizProgress()?.answers ?? {});

  useEffect(() => {
    saveQuizProgress(step, answers);
  }, [step, answers]);

  // Once all 4 answers exist and we've reached the reveal step, stage them
  // for the post-signup flush and clear the in-progress draft.
  useEffect(() => {
    if (step !== TOTAL_QUESTIONS) return;
    const complete = answers as Partial<CompleteQuizAnswers>;
    if (
      complete.experience_level &&
      complete.risk_profile &&
      complete.investment_horizon &&
      complete.investing_goal
    ) {
      savePendingQuizAnswers(complete as CompleteQuizAnswers);
      clearQuizProgress();
    }
  }, [step, answers]);

  return (
    <div style={{ padding: '80px 0' }}>
      <div className="wrap">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <QuizStep
              key="experience_level"
              question={EXPERIENCE_QUESTION}
              selectedValue={answers.experience_level}
              onSelect={(value) => {
                setAnswers((a) => ({ ...a, experience_level: value }));
                setStep(1);
              }}
              stepIndex={0}
              totalSteps={TOTAL_QUESTIONS}
            />
          )}
          {step === 1 && (
            <QuizStep
              key="risk_profile"
              question={RISK_QUESTION}
              selectedValue={answers.risk_profile}
              onSelect={(value) => {
                setAnswers((a) => ({ ...a, risk_profile: value }));
                setStep(2);
              }}
              onBack={() => setStep(0)}
              stepIndex={1}
              totalSteps={TOTAL_QUESTIONS}
            />
          )}
          {step === 2 && (
            <QuizStep
              key="investment_horizon"
              question={HORIZON_QUESTION}
              selectedValue={answers.investment_horizon}
              onSelect={(value) => {
                setAnswers((a) => ({ ...a, investment_horizon: value }));
                setStep(3);
              }}
              onBack={() => setStep(1)}
              stepIndex={2}
              totalSteps={TOTAL_QUESTIONS}
            />
          )}
          {step === 3 && (
            <QuizStep
              key="investing_goal"
              question={GOAL_QUESTION}
              selectedValue={answers.investing_goal}
              onSelect={(value) => {
                setAnswers((a) => ({ ...a, investing_goal: value }));
                setStep(4);
              }}
              onBack={() => setStep(2)}
              stepIndex={3}
              totalSteps={TOTAL_QUESTIONS}
            />
          )}
          {step === 4 &&
            answers.experience_level &&
            answers.risk_profile &&
            answers.investment_horizon &&
            answers.investing_goal && (
              <RevealStep
                key="reveal"
                answers={answers as CompleteQuizAnswers}
                onBack={() => setStep(3)}
              />
            )}
        </AnimatePresence>
      </div>
    </div>
  );
}
