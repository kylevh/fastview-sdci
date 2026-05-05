import { readJsonFile, writeJsonFile } from "./file-store.js";

type PermitsDb = {
  byUserId: Record<string, { recordNumbers: string[]; updatedAt: string }>;
};

const PERMITS_FILE = "tracked-permits.json";

function nowIso() {
  return new Date().toISOString();
}

function normalizeRecordNumber(s: string) {
  return s.trim().toUpperCase();
}

export async function listTrackedPermits(userId: string): Promise<string[]> {
  const db = await readJsonFile<PermitsDb>(PERMITS_FILE, { byUserId: {} });
  return db.byUserId[userId]?.recordNumbers ?? [];
}

export async function addTrackedPermit(userId: string, recordNumber: string): Promise<string[]> {
  const db = await readJsonFile<PermitsDb>(PERMITS_FILE, { byUserId: {} });
  const rec = normalizeRecordNumber(recordNumber);

  const entry = db.byUserId[userId] ?? { recordNumbers: [], updatedAt: nowIso() };
  if (!entry.recordNumbers.includes(rec)) entry.recordNumbers.push(rec);
  entry.updatedAt = nowIso();
  db.byUserId[userId] = entry;

  await writeJsonFile(PERMITS_FILE, db);
  return entry.recordNumbers;
}

export async function removeTrackedPermit(userId: string, recordNumber: string): Promise<string[]> {
  const db = await readJsonFile<PermitsDb>(PERMITS_FILE, { byUserId: {} });
  const rec = normalizeRecordNumber(recordNumber);

  const entry = db.byUserId[userId];
  if (!entry) return [];

  entry.recordNumbers = entry.recordNumbers.filter((r) => r !== rec);
  entry.updatedAt = nowIso();
  db.byUserId[userId] = entry;

  await writeJsonFile(PERMITS_FILE, db);
  return entry.recordNumbers;
}

