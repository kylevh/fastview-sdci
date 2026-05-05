/**
 * Fetches a Seattle permit portal link and extracts Accela cap IDs.
 *

 */
import path from "node:path";
import { fileURLToPath } from "node:url";
const PERMIT_API_URL = 'https://data.seattle.gov/resource/76t5-zqzr.json';
function extractAccelaInfo(originalUrl, finalUrl) {
    const u = new URL(finalUrl);
    const capIds = {
        capID1: u.searchParams.get("capID1") ?? undefined,
        capID2: u.searchParams.get("capID2") ?? undefined,
        capID3: u.searchParams.get("capID3") ?? undefined,
    };
    return { originalLink: originalUrl, permitLink: finalUrl, capIds };
}
async function resolveFinalUrl(url) {
    // Prefer HEAD to avoid downloading content; fall back to GET if blocked.
    try {
        const headResp = await fetch(url, { method: "HEAD", redirect: "follow" });
        return headResp.url || url;
    }
    catch {
        const getResp = await fetch(url, { method: "GET", redirect: "follow" });
        return getResp.url || url;
    }
}
export async function getPermitInfo(permitNumber) {
    const url = `${PERMIT_API_URL}?permitnum=${encodeURIComponent(permitNumber)}`;
    const response = await fetch(url);
    if (!response.ok)
        return null;
    const data = (await response.json());
    if (!data || data.length === 0)
        return null;
    const permit = data[0];
    if (!permit.link?.url)
        return null;
    const finalUrl = await resolveFinalUrl(permit.link.url);
    return extractAccelaInfo(permit.link.url, finalUrl);
}
async function main() {
    const permitNumber = process.argv[2];
    if (!permitNumber) {
        console.error("Usage: ts-node functions/get-permit.ts <permit-number>");
        console.error("Example: ts-node functions/get-permit.ts 3001672-EX");
        process.exit(1);
    }
    const info = await getPermitInfo(permitNumber);
    if (!info)
        process.exit(1);
    console.log(JSON.stringify(info, null, 2));
}
// Only run main() when executed directly (not when imported).
const thisFile = fileURLToPath(import.meta.url);
const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryFile && path.resolve(thisFile) === entryFile)
    void main();
//# sourceMappingURL=get-permit.js.map