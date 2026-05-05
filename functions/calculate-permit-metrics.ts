import type { ParsedPermitStatus, PermitEvent } from "./parse-processing-html.js";

export type CalculatedPermitMetrics = {
  /**
   * "Real" cycle count calculated from the Reviews stage event history.
   *
   * Heuristic:
   * - If there are no Reviews stage events, returns null.
   * - Starts at 1 on the first observed event (initial submission / in-process).
   * - Increments by 1 each time the record is marked "Corrections Required"
   *   (i.e., sent back for changes).
   *
   * This matches: in process (1) → corrections required (2) → submitted/accepted (still 2)
   * → corrections required (3) → ... etc.
   */
  realReviewCycleFromEvents: number | null;

  /** The portal-reported cycle, if present in "Additional Information". */
  portalCurrentReviewCycle: number | null;
};

function getReviewsStageEvents(parsed: ParsedPermitStatus): PermitEvent[] {
  return parsed.workflowStages.find((s) => s.name === "Reviews")?.events ?? [];
}

export function calculateRealReviewCycleFromReviewsEvents(
  events: PermitEvent[]
): number | null {
  if (events.length === 0) return null;

  let cycle = 1;
  for (const e of events) {
    if (e.status.trim() === "Corrections Required") cycle += 1;
  }

  return cycle;
}

export function calculatePermitMetrics(
  parsed: ParsedPermitStatus
): CalculatedPermitMetrics {
  const reviewsStage = parsed.workflowStages.find((s) => s.name === "Reviews");
  const reviewsEvents = getReviewsStageEvents(parsed);

  return {
    realReviewCycleFromEvents: calculateRealReviewCycleFromReviewsEvents(reviewsEvents),
    portalCurrentReviewCycle: reviewsStage?.currentReviewCycle ?? null,
  };
}

