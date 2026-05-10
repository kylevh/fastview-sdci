import type { ParsedPermitStatus, PermitEvent } from "./parse-processing-html.js";

export type CalculatedPermitMetrics = {
  /**
   * Review cycle inferred from the Reviews stage event history (see
   * {@link calculateRealReviewCycleFromReviewsEvents}).
   */
  realReviewCycleFromEvents: number | null;

  /** The portal-reported cycle, if present in "Additional Information". */
  portalCurrentReviewCycle: number | null;
};

function getReviewsStageEvents(parsed: ParsedPermitStatus): PermitEvent[] {
  return parsed.workflowStages.find((s) => s.name === "Reviews")?.events ?? [];
}

/**
 * Infer the review cycle number from Reviews-stage events.
 *
 * Model (aligned with SDCI workflow language):
 * - Entering Reviews is review cycle **1** (initial plan review).
 * - Each time the permit is sent back for **Corrections Required** again — after the
 *   previous correction round has finished — you move to the next cycle (rarely,
 *   cycle 1 completes without ever hitting Corrections Required).
 * - Submitted / in-flight correction work does not advance the cycle; only a new
 *   Corrections Required does (after the prior round was accepted or otherwise closed).
 *
 * Robustness:
 * - Events are processed in chronological order (missing dates sort last; same-date
 *   ties keep HTML order).
 * - Repeated **Corrections Required** rows without an intervening acceptance (duplicate
 *   logging or data quirks) only advance the cycle once — we only increment when
 *   entering a new correction round, not while already awaiting correction acceptance.
 *
 * Note: The portal’s “Review Cycle” in Additional Information may still disagree
 * occasionally (different definition or stale UI); this value is purely event-derived.
 */
export function calculateRealReviewCycleFromReviewsEvents(
  events: PermitEvent[]
): number | null {
  if (events.length === 0) return null;

  const sorted = [...events]
    .map((e, index) => ({ e, index }))
    .sort((a, b) => {
      if (a.e.date === null && b.e.date === null) return a.index - b.index;
      if (a.e.date === null) return 1;
      if (b.e.date === null) return -1;
      const byDate = a.e.date.localeCompare(b.e.date);
      return byDate !== 0 ? byDate : a.index - b.index;
    })
    .map(({ e }) => e);

  let cycle = 1;
  /** True after Corrections Required until Corrections Accepted or stage Completed. */
  let awaitingCorrectionAcceptance = false;

  for (const e of sorted) {
    const status = e.status.trim();

    if (status === "Corrections Required") {
      if (!awaitingCorrectionAcceptance) {
        cycle += 1;
        awaitingCorrectionAcceptance = true;
      }
      continue;
    }

    if (status === "Corrections Accepted" || status === "Completed") {
      awaitingCorrectionAcceptance = false;
    }
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

