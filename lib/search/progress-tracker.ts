/**
 * Progress Tracker for Ingestion Pipeline
 * Provides clean, simple progress messages with percentages
 */

export interface ProgressStep {
  name: string;
  weight: number; // Relative weight for percentage calculation
}

export class IngestionProgressTracker {
  private steps: ProgressStep[];
  private currentStepIndex: number = 0;
  private stepProgress: number = 0; // 0-1 within current step
  private onProgress?: (message: string, percent: number) => void;
  private lastMessage: string = '';
  private lastPercent: number = 0; // Track last percent to prevent backwards movement

  constructor(
    steps: ProgressStep[],
    onProgress?: (message: string, percent: number) => void
  ) {
    this.steps = steps;
    this.onProgress = onProgress;
  }

  /**
   * Start a new step (only if moving forward)
   */
  startStep(stepName: string, details?: any) {
    const stepIndex = this.steps.findIndex(s => s.name === stepName);
    if (stepIndex >= 0 && stepIndex >= this.currentStepIndex) {
      // Only move forward, never backwards
      this.currentStepIndex = stepIndex;
      this.stepProgress = 0;
    }
    this.update(stepName, details);
  }

  /**
   * Update progress within current step
   */
  updateStep(progress: number, details?: any) {
    this.stepProgress = Math.max(0, Math.min(1, progress));
    const currentStep = this.steps[this.currentStepIndex];
    if (currentStep) {
      this.update(currentStep.name, details);
    }
  }

  /**
   * Complete current step and move to next
   */
  completeStep(stepName?: string, details?: any) {
    this.stepProgress = 1;
    if (stepName) {
      this.update(stepName, details);
    } else {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep) {
        this.update(currentStep.name, details);
      }
    }
    this.currentStepIndex++;
    this.stepProgress = 0;
  }

  /**
   * Update with custom message
   */
  update(message: string, details?: any) {
    // Avoid repeating the same message
    if (message === this.lastMessage && !details) {
      return;
    }

    const percent = this.calculatePercent();
    const cleanMessage = this.cleanMessage(message, details);
    
    this.onProgress?.(cleanMessage, percent);
    this.lastMessage = message;
  }

  /**
   * Calculate overall progress percentage (never goes backwards)
   */
  private calculatePercent(): number {
    let totalWeight = 0;
    let completedWeight = 0;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      totalWeight += step.weight;

      if (i < this.currentStepIndex) {
        // Step is complete
        completedWeight += step.weight;
      } else if (i === this.currentStepIndex) {
        // Current step - add partial progress
        completedWeight += step.weight * this.stepProgress;
      }
    }

    const calculatedPercent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
    
    // Never go backwards - always use the higher of calculated or last percent
    const finalPercent = Math.max(calculatedPercent, this.lastPercent);
    this.lastPercent = finalPercent;
    
    return finalPercent;
  }

  /**
   * Clean up message to be simple and readable
   */
  private cleanMessage(message: string, details?: any): string {
    // Remove verbose prefixes
    let clean = message
      .replace(/^\[.*?\]\s*/, '') // Remove [Filing-First Pipeline] etc
      .replace(/^\[.*?\]\s*/, '') // Remove filing type prefixes
      .replace(/^Using canonical pipeline \(primary\) for /, 'Extracting ')
      .replace(/^Trying XBRL \(fallback\) for /, 'Extracting ')
      .replace(/^Canonical pipeline did not extract quarterly /, 'No quarterly data found for ')
      .replace(/^Canonical pipeline failed for /, 'Extraction failed for ')
      .replace(/^Extracted /, 'Extracted ')
      .replace(/ from filing table$/, '')
      .replace(/^Filing-First Pipeline\] /, '')
      .replace(/^\[/, '')
      .replace(/\]$/, '');

    // Capitalize first letter
    if (clean.length > 0) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    // Add context from details if helpful
    if (details) {
      if (details.metricType) {
        clean = `Extracting ${details.metricType}`;
      } else if (details.count !== undefined) {
        clean = `${clean} (${details.count})`;
      } else if (details.filingType) {
        clean = `${clean} - ${details.filingType}`;
      }
    }

    return clean;
  }
}

/**
 * Standard progress steps for lazy ingestion
 */
export const LAZY_INGESTION_STEPS: ProgressStep[] = [
  { name: 'Looking up company', weight: 2 },
  { name: 'Downloading reports', weight: 15 },
  { name: 'Extracting metrics', weight: 30 },
  { name: 'Analyzing with AI', weight: 20 },
  { name: 'Generating insights', weight: 15 },
  { name: 'Analyzing trends', weight: 10 },
  { name: 'Finalizing', weight: 8 },
];

/**
 * Create a progress tracker for lazy ingestion
 */
export function createLazyIngestionTracker(
  onProgress?: (message: string, percent: number) => void
): IngestionProgressTracker {
  return new IngestionProgressTracker(LAZY_INGESTION_STEPS, onProgress);
}
