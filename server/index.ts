import express from "express";
import cors from "cors";

import type { PermitAddress } from "../functions/get-permit.js";
import { getPermitInfo } from "../functions/get-permit.js";
import { getProcessingDataHtml } from "../functions/get-processing-data.js";
import {
  parsePermitStatusHtml,
  summarizePermit,
} from "../functions/parse-processing-html.js";
import { calculatePermitMetrics } from "../functions/calculate-permit-metrics.js";
import { performance } from "node:perf_hooks";

import { getUserByToken, loginUser, registerUser } from "./auth-store.js";
import {
  addTrackedPermit,
  listTrackedPermits,
  removeTrackedPermit,
} from "./permit-tracking-store.js";

type PermitApiResponse = {
  recordNumber: string;
  capIds: { capID1: string; capID2: string; capID3: string };
  address: PermitAddress;
  summary: ReturnType<typeof summarizePermit>;
  parsed: ReturnType<typeof parsePermitStatusHtml>;
  calculatedMetrics: ReturnType<typeof calculatePermitMetrics>;
  fetchedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function getBearerToken(req: express.Request): string | null {
  const h = req.header("authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

async function auth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const token = getBearerToken(req);
  if (!token)
    return res.status(401).json({ error: "Missing Authorization: Bearer <token>" });
  const user = await getUserByToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  (req as any).user = user;
  next();
}

async function fetchPermit(recordNumber: string): Promise<PermitApiResponse> {
  const normalizedRecord = recordNumber.trim().toUpperCase();

  const t0 = performance.now();
  const permitInfo = await getPermitInfo(normalizedRecord);
  const t1 = performance.now();

  if (
    !permitInfo?.capIds?.capID1 ||
    !permitInfo?.capIds?.capID2 ||
    !permitInfo?.capIds?.capID3
  ) {
    throw Object.assign(new Error("Permit not found"), { statusCode: 404 });
  }

  const { capID1, capID2, capID3 } = permitInfo.capIds;
  const processingHtml = await getProcessingDataHtml({ capID1, capID2, capID3 });
  const t2 = performance.now();
  const parsed = parsePermitStatusHtml(processingHtml);
  const calculatedMetrics = calculatePermitMetrics(parsed);
  const t3 = performance.now();

  if (process.env.FASTVIEW_TIMINGS === "1") {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          recordNumber,
          ms: {
            permitLookup: Math.round(t1 - t0),
            portalFetchPlaywright: Math.round(t2 - t1),
            parseAndMetrics: Math.round(t3 - t2),
            total: Math.round(t3 - t0),
          },
        },
        null,
        2
      )
    );
  }

  const response: PermitApiResponse = {
    recordNumber: normalizedRecord,
    capIds: { capID1, capID2, capID3 },
    address: permitInfo.address,
    summary: summarizePermit(parsed),
    parsed,
    calculatedMetrics,
    fetchedAt: nowIso(),
  };

  return response;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS: permissive by default (fine for public data). Set FASTVIEW_CORS_ORIGIN to lock it down.
const corsOrigin = process.env.FASTVIEW_CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Auth (very lightweight) ---

app.post("/api/register", async (req, res) => {
  const { email, password } = (req.body ?? {}) as {
    email?: string;
    password?: string;
  };
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });
  if (password.length < 8)
    return res.status(400).json({ error: "password must be at least 8 characters" });

  try {
    const user = await registerUser(email, password);
    return res.json({
      token: user.token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as {
    email?: string;
    password?: string;
  };
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  try {
    const user = await loginUser(email, password);
    return res.json({
      token: user.token,
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
    });
  } catch (e: any) {
    return res.status(400).json({ error: String(e?.message ?? e) });
  }
});

// --- Permits: fetch parsed JSON ---

app.get("/api/permit/:recordNumber", async (req, res) => {
  const recordNumber = String(req.params.recordNumber ?? "").trim();
  if (!recordNumber) return res.status(400).json({ error: "recordNumber is required" });

  try {
    const data = await fetchPermit(recordNumber);
    return res.json(data);
  } catch (e: any) {
    const status = typeof e?.statusCode === "number" ? e.statusCode : 500;
    return res.status(status).json({ error: String(e?.message ?? e) });
  }
});

// --- Permit tracking (per user) ---

app.get("/api/me/permits", auth, async (req, res) => {
  const user = (req as any).user as { id: string };
  const recordNumbers = await listTrackedPermits(user.id);
  res.json({ recordNumbers });
});

app.post("/api/me/permits", auth, async (req, res) => {
  const user = (req as any).user as { id: string };
  const { recordNumber } = (req.body ?? {}) as { recordNumber?: string };
  if (!recordNumber) return res.status(400).json({ error: "recordNumber is required" });
  const recordNumbers = await addTrackedPermit(user.id, recordNumber);
  res.json({ recordNumbers });
});

app.delete("/api/me/permits/:recordNumber", auth, async (req, res) => {
  const user = (req as any).user as { id: string };
  const recordNumber = String(req.params.recordNumber ?? "");
  const recordNumbers = await removeTrackedPermit(user.id, recordNumber);
  res.json({ recordNumbers });
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`fastview-sdci API listening on http://localhost:${port}`);
});

// Keep process alive in shells that detach/unref listeners.
server.ref?.();
process.stdin.resume();

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

