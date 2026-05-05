import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext } from "playwright";

export type CapIds = { capID1: string; capID2: string; capID3: string };

let sharedBrowserPromise: Promise<Browser> | null = null;
let sharedContextPromise: Promise<BrowserContext> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch({
      // A few sane defaults for automation speed/stability.
      // (No need for extra args unless you hit env-specific issues.)
      headless: true,
    });
  }
  return sharedBrowserPromise;
}

async function getSharedContext(): Promise<BrowserContext> {
  if (!sharedContextPromise) {
    sharedContextPromise = (async () => {
      const browser = await getSharedBrowser();
      const context = await browser.newContext({
        viewport: { width: 800, height: 600 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      });

      // Speed up navigation by skipping non-essential resources (set ONCE).
      await context.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (
          type === "image" ||
          type === "font" ||
          type === "stylesheet" ||
          type === "media"
        ) {
          return route.abort();
        }
        return route.continue();
      });

      return context;
    })();
  }
  return sharedContextPromise;
}

/**
 * Uses Playwright to load the permit details page and captures the
 * `GetProcessingData` response (which contains the HTML snippet as `json.d`).
 */
export async function getProcessingDataHtml(capIds: CapIds): Promise<string> {
  const context = await getSharedContext();
  const page = await context.newPage();

  try {
    const url = `https://services.seattle.gov/Portal/Cap/CapDetail.aspx?Module=DPDPermits&TabName=DPDPermits&capID1=${encodeURIComponent(
      capIds.capID1
    )}&capID2=${encodeURIComponent(capIds.capID2)}&capID3=${encodeURIComponent(
      capIds.capID3
    )}&agencyCode=SEATTLE`;

    const timeoutMs = Number(process.env.FASTVIEW_PLAYWRIGHT_TIMEOUT_MS ?? 60_000);
    const processingResponsePromise = page.waitForResponse(
      (r) => r.url().includes("GetProcessingData"),
      { timeout: timeoutMs }
    );

    // Start navigation; don't wait for full load (unnecessary).
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    const resp = await processingResponsePromise;
    const json = (await resp.json()) as { d?: string };
    if (!json?.d) throw new Error("GetProcessingData response missing json.d");
    return json.d;
  } finally {
    await page.close().catch(() => {});
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