import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPermitInfo } from "./functions/get-permit.js";
import { getProcessingDataHtml } from "./functions/get-processing-data.js";
import { parsePermitStatusHtml, summarizePermit } from "./functions/parse-processing-html.js";
import { calculatePermitMetrics } from "./functions/calculate-permit-metrics.js";

async function main() {
  const recordNumber = process.argv[2];
  if (!recordNumber) {
    console.error("Usage: ts-node main.ts <record-number>");
    console.error("Example: ts-node main.ts 3001672-EX");
    process.exit(1);
  }

  const permitInfo = await getPermitInfo(recordNumber);
  if (!permitInfo) {
    console.error(`No permit found for record number: ${recordNumber}`);
    process.exit(1);
  }

  const { capID1, capID2, capID3 } = permitInfo.capIds;
  if (!capID1 || !capID2 || !capID3) {
    console.error("Missing capIDs from permit link.");
    console.error(JSON.stringify(permitInfo, null, 2));
    process.exit(1);
  }

  const processingHtml = await getProcessingDataHtml({ capID1, capID2, capID3 });
  const parsed = parsePermitStatusHtml(processingHtml);
  const calculatedMetrics = calculatePermitMetrics(parsed);

  const output = {
    recordNumber,
    capIds: { capID1, capID2, capID3 },
    address: permitInfo.address,
    summary: summarizePermit(parsed),
    parsed,
    calculatedMetrics,
  };

  // Print both a quick summary and the full parsed structure.
  // console.log(JSON.stringify(output, null, 2));

  // Also export as JSON (simple smoke-test artifact).
  const outDir = path.resolve("output");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${recordNumber}.json`);
  await writeFile(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.error(`Wrote ${outPath}`);
}

void main();
