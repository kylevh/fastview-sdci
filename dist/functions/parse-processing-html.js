import { parse } from "node-html-parser";
// ─── Known stage names ────────────────────────────────────────────────────────
const WORKFLOW_STAGE_NAMES = new Set([
    "Application",
    "OS Screening",
    "Zoning Screening",
    "Tree Screening",
    "Intake",
    "Intake Fees",
    "Reviews",
    "Issuance Prep",
    "Issuance",
    "Inspections",
    "Post-Occupancy Monitoring",
    "Closed",
]);
// ─── Event parser ─────────────────────────────────────────────────────────────
function parseEvent(rawText) {
    const raw = rawText.trim();
    const dueDateMatch = raw.match(/Due on\s+(?:<[^>]+>)?([^<,\n]+)/);
    const rawDueDate = dueDateMatch?.[1]?.trim() ?? null;
    const dueDate = rawDueDate && rawDueDate !== "TBD" ? parseDateStr(rawDueDate) : null;
    const assignedMatch = raw.match(/Assigned to\s+(?:<[^>]+>)?([^<\n]+?)(?:<\/|$)/);
    const assignedTo = assignedMatch?.[1]?.trim() ?? null;
    const statusMatch = raw.match(/Marked as\s+(?:<[^>]+>)?([^<]+?)(?:<\/[^>]+>)?\s+on\s+(?:<[^>]+>)?([^<\n]+)/);
    const status = statusMatch?.[1]?.trim() ?? "Unknown";
    const rawEventDate = statusMatch?.[2]?.trim() ?? null;
    const date = rawEventDate && rawEventDate !== "TBD" ? parseDateStr(rawEventDate) : null;
    return { status, date, dueDate, assignedTo, raw };
}
function parseDateStr(mmddyyyy) {
    const match = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match)
        return null;
    return `${match[3]}-${match[1]}-${match[2]}`;
}
// ─── Event extraction ─────────────────────────────────────────────────────────
function parseEventsFromDetailRow(detailRow, isReviewsStage) {
    const events = [];
    if (isReviewsStage) {
        // The Reviews stage detail row nests all discipline sub-rows inside it.
        // Stage-level events live only in the FIRST table inside the outer td,
        // before any discipline sub-rows appear.
        const firstTable = detailRow.querySelector("td > table");
        if (!firstTable)
            return events;
        const eventTds = firstTable.querySelectorAll("td[width='715px;']");
        for (const td of eventTds) {
            if (td.text.includes("Marked as")) {
                events.push(parseEvent(td.text));
            }
        }
    }
    else {
        const eventTds = detailRow.querySelectorAll("td[width='715px;']");
        for (const td of eventTds) {
            if (td.querySelector("table table"))
                continue;
            if (td.text.includes("Marked as")) {
                events.push(parseEvent(td.text));
            }
        }
    }
    return events;
}
// ─── Additional Information (review cycle number) ─────────────────────────────
function parseAdditionalInfo(detailRow) {
    const infoTables = detailRow.querySelectorAll("table");
    for (const table of infoTables) {
        const cells = table.querySelectorAll("td");
        for (let i = 0; i < cells.length - 1; i++) {
            if (cells[i].text.trim() === "Review Cycle") {
                const val = parseInt(cells[i + 1].text.trim(), 10);
                if (!isNaN(val))
                    return val;
            }
        }
    }
    return null;
}
// ─── Core parser ──────────────────────────────────────────────────────────────
export function parsePermitStatusHtml(html) {
    const cleaned = html.startsWith('"') ? JSON.parse(html) : html;
    const root = parse(cleaned);
    const workflowStages = [];
    const disciplineReviews = [];
    const allRows = root.querySelectorAll("tr");
    for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const id = row.getAttribute("id");
        if (!id || !id.match(/^[0-9a-f]{8}-/))
            continue;
        const prevRow = allRows[i - 1];
        if (!prevRow)
            continue;
        const nameTd = prevRow.querySelectorAll("td")[1];
        if (!nameTd)
            continue;
        const name = nameTd.text.trim();
        const statusImg = prevRow.querySelector("img[alt='Complete'], img[alt='active']");
        const isComplete = statusImg?.getAttribute("alt") === "Complete" || false;
        const isActive = statusImg?.getAttribute("alt") === "active" || false;
        const isReviewsStage = name === "Reviews";
        const events = parseEventsFromDetailRow(row, isReviewsStage);
        const reviewCycle = parseAdditionalInfo(row);
        if (WORKFLOW_STAGE_NAMES.has(name)) {
            const stage = { name, isComplete, isActive, events };
            if (isReviewsStage && reviewCycle !== null) {
                stage.currentReviewCycle = reviewCycle;
            }
            workflowStages.push(stage);
        }
        else if (name && events.length > 0) {
            disciplineReviews.push({ discipline: name, reviewCycle, events });
        }
    }
    return { workflowStages, disciplineReviews };
}
// ─── Convenience helpers ──────────────────────────────────────────────────────
/** Get the latest event for a named workflow stage */
export function getStageStatus(parsed, stageName) {
    const stage = parsed.workflowStages.find((s) => s.name === stageName);
    if (!stage || stage.events.length === 0)
        return null;
    return stage.events[stage.events.length - 1];
}
/** Get disciplines whose latest event is not Approved or Not Required */
export function getPendingDisciplines(parsed) {
    const TERMINAL = new Set(["Approved", "Not Required"]);
    return parsed.disciplineReviews.filter((d) => {
        const last = d.events.at(-1);
        return !last || !TERMINAL.has(last.status);
    });
}
/** High-level summary of current permit state */
export function summarizePermit(parsed) {
    const active = parsed.workflowStages.find((s) => s.isActive);
    const complete = parsed.workflowStages.filter((s) => s.isComplete);
    const reviewsStage = parsed.workflowStages.find((s) => s.name === "Reviews");
    const pending = getPendingDisciplines(parsed);
    return {
        currentStage: active?.name ?? "Unknown",
        completedStages: complete.map((s) => s.name),
        currentReviewCycle: reviewsStage?.currentReviewCycle ?? null,
        pendingDisciplines: pending.map((d) => d.discipline),
        totalDisciplines: parsed.disciplineReviews.length,
    };
}
//# sourceMappingURL=parse-processing-html.js.map