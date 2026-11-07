import type { Transition } from "framer-motion";
import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";

export function transitionWithDelay(
  transition: Transition | undefined,
  delaySeconds: number,
  fallback: Transition = DEFAULT_CHART_ENTER_TRANSITION
): Transition {
  const base = transition ?? fallback;
  return { ...base, delay: delaySeconds };
}

export interface SpringOptions {
  stiffness: number;
  damping: number;
  mass?: number;
}
