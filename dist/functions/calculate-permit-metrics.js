function getReviewsStageEvents(parsed) {
    return parsed.workflowStages.find((s) => s.name === "Reviews")?.events ?? [];
}
export function calculateRealReviewCycleFromReviewsEvents(events) {
    if (events.length === 0)
        return null;
    let cycle = 1;
    for (const e of events) {
        if (e.status.trim() === "Corrections Required")
            cycle += 1;
    }
    return cycle;
}
export function calculatePermitMetrics(parsed) {
    const reviewsStage = parsed.workflowStages.find((s) => s.name === "Reviews");
    const reviewsEvents = getReviewsStageEvents(parsed);
    return {
        realReviewCycleFromEvents: calculateRealReviewCycleFromReviewsEvents(reviewsEvents),
        portalCurrentReviewCycle: reviewsStage?.currentReviewCycle ?? null,
    };
}
//# sourceMappingURL=calculate-permit-metrics.js.map