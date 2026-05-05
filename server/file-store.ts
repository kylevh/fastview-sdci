import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function dataDir(): string {
  // Keep state outside dist/ and committed source.
  return path.resolve(process.env.FASTVIEW_DATA_DIR ?? "data");
}

async function ensureDir(p: string) {
  await mkdir(p, { recursive: true });
}

export async function readJsonFile<T>(filename: string, fallback: T): Promise<T> {
  const dir = dataDir();
  await ensureDir(dir);
  const full = path.join(dir, filename);
  try {
    const raw = await readFile(full, "utf8");
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (e?.code === "ENOENT") return fallback;
    // If file exists but is invalid, don't crash the server.
    return fallback;
  }
}

export async function writeJsonFile<T>(filename: string, value: T): Promise<void> {
  const dir = dataDir();
  await ensureDir(dir);
  const full = path.join(dir, filename);

  // Atomic-ish write (write temp then rename) to avoid torn writes.
  const tmp = `${full}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, full);
}

