import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Response } from "playwright";

export type CapIds = { capID1: string; capID2: string; capID3: string };

/**
 * Uses Playwright to load the permit details page and captures the
 * `GetProcessingData` response (which contains the HTML snippet as `json.d`).
 */
export async function getProcessingDataHtml(capIds: CapIds): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    return await new Promise<string>((resolve, reject) => {
      const onResponse = async (response: Response) => {
        try {
          if (!response.url().includes("GetProcessingData")) return;
          const json = (await response.json()) as { d?: string };
          if (!json?.d) return;
          page.off("response", onResponse);
          resolve(json.d);
        } catch (e) {
          reject(e);
        }
      };

      page.on("response", onResponse);

      page
        .goto(
          `https://services.seattle.gov/Portal/Cap/CapDetail.aspx?Module=DPDPermits&TabName=DPDPermits&capID1=${encodeURIComponent(
            capIds.capID1
          )}&capID2=${encodeURIComponent(capIds.capID2)}&capID3=${encodeURIComponent(
            capIds.capID3
          )}&agencyCode=SEATTLE`
        )
        .catch(reject);
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const [capID1, capID2, capID3] = process.argv.slice(2);
  if (!capID1 || !capID2 || !capID3) {
    console.error("Usage: ts-node functions/get-processing-data.ts <capID1> <capID2> <capID3>");
    console.error("Example: ts-node functions/get-processing-data.ts 24SCI 00000 C3979");
    process.exit(1);
  }

  const html = await getProcessingDataHtml({ capID1, capID2, capID3 });
  console.log(html);
}

// Only run main() when executed directly (not when imported).
const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryFile && path.resolve(thisFile) === entryFile) void main();