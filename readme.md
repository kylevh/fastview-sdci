# fastview-sdci

A small Node/TypeScript CLI that fetches a Seattle SDCI (Accela Citizen Access) permit record and **exports the portal “Status → Workflow + Reviews” UI** into a normalized JSON structure.

This project was built by scraping/reverse‑engineering the SDCI portal behavior documented in `sdci-site.md`.

## What it does

- **Input**: a record number like `7058372-CN` or `3001672-EX`
- **Resolve**: looks up that record via Seattle Open Data, follows the permit link, and extracts the Accela `capID1/capID2/capID3`
- **Fetch**: uses Playwright to open the permit details page and intercept the `GetProcessingData` response
- **Parse**: converts the returned HTML snippet into structured workflow stages + discipline reviews + event timelines
- **Export**: writes `output/<recordNumber>.json`

## Requirements

- **Node.js**: recent Node recommended (Node 20+ is a good baseline)
- **npm**

## Install

```bash
npm install
```

Playwright also needs its browser binaries installed:

```bash
npx playwright install
```

## Run

This repo compiles TypeScript to `dist/` and runs with Node:

```bash
npm run main -- 3001672-EX
```

On success it writes:

- `output/3001672-EX.json`

## Run as an API server

If you want to call Fastview from a React app (e.g. hosted on Vercel), run Fastview as a server and call it over HTTP.

Start the API locally:

```bash
npm run server
```

The server listens on:

- `http://localhost:3000`

### Endpoints

- **`GET /health`**: `{ ok: true }`
- **`GET /api/permit/:recordNumber`**: returns the parsed permit JSON
- **`POST /api/register`**: `{ email, password }` → `{ token, user }`
- **`POST /api/login`**: `{ email, password }` → `{ token, user }`
- **`GET /api/me/permits`** (auth): list tracked permits
- **`POST /api/me/permits`** (auth): `{ recordNumber }` add tracked permit
- **`DELETE /api/me/permits/:recordNumber`** (auth): remove tracked permit

Auth uses a simple bearer token:

- `Authorization: Bearer <token>`

### Local state

The API stores simple data (users + tracked permits) in a local folder:

- `data/` (ignored by git)

You can change this location by setting:

- `FASTVIEW_DATA_DIR=/some/path`

## Output: JSON structure

Each run writes `output/<recordNumber>.json` with these top-level keys:

- **`recordNumber`**: the record number you passed on the CLI
- **`capIds`**: `{ capID1, capID2, capID3 }` used to build the SDCI permit detail URL
- **`summary`**: quick “at a glance” fields derived from the parsed structure
- **`parsed`**: normalized workflow stages + discipline review timelines extracted from the portal HTML
- **`calculatedMetrics`**: derived metrics that reconcile portal quirks (currently review-cycle heuristics)
 - **`fetchedAt`** (API only): ISO timestamp of when the server fetched the portal data

### `summary`

`summary` is produced by `summarizePermit()` and has:

- **`currentStage`**: the currently active workflow stage name (or `"Unknown"`)
- **`completedStages`**: list of completed workflow stage names
- **`currentReviewCycle`**: portal-reported “Review Cycle” number from “Additional Information” (or `null`)
- **`pendingDisciplines`**: disciplines whose latest status is not terminal
- **`totalDisciplines`**: total number of discipline review rows found

### `parsed`

`parsed` matches the TypeScript types in `functions/parse-processing-html.ts`:

```ts
export interface PermitEvent {
  status: string;
  date: string | null;      // ISO-ish "YYYY-MM-DD" when parseable
  dueDate: string | null;   // ISO-ish "YYYY-MM-DD" when present/parseable
  assignedTo: string | null;
  raw: string;              // original unparsed event text from the portal
}

export interface WorkflowStage {
  name: string;
  isComplete: boolean;
  isActive: boolean;
  events: PermitEvent[];
  currentReviewCycle?: number; // only present on the "Reviews" stage when available
}

export interface DisciplineReview {
  discipline: string;
  reviewCycle: number | null;  // extracted from "Additional Information" when present
  events: PermitEvent[];
}

export interface ParsedPermitStatus {
  workflowStages: WorkflowStage[];
  disciplineReviews: DisciplineReview[];
}
```

### `calculatedMetrics`

Currently:

- **`portalCurrentReviewCycle`**: the portal-reported cycle number from “Additional Information” (or `null`)
- **`realReviewCycleFromEvents`**: a heuristic cycle counter derived from **Reviews stage** events:
  - starts at 1 on the first observed Reviews-stage event
  - increments each time a Reviews-stage event status is exactly `"Corrections Required"`

## How the data is fetched

- **Record lookup**: the script queries Seattle Open Data for the record number:
  - `https://data.seattle.gov/resource/76t5-zqzr.json?permitnum=<recordNumber>`
- **Portal data**: the SDCI portal is a customized Accela Citizen Access instance. The “Status” content is rendered dynamically; this project captures the `GetProcessingData` response and parses the returned HTML snippet.

## Troubleshooting

- **Playwright fails to launch**: run `npx playwright install` (and re-run `npm install` if needed).
- **“No permit found for record number”**: the Open Data lookup didn’t return a record for that `permitnum`.
- **Empty/missing `events`**: the portal HTML can vary by record type; parsing relies on current DOM structure. If SDCI changes markup, `functions/parse-processing-html.ts` likely needs updates.

## Reference

- `sdci-site.md`: notes on the SDCI portal hierarchy and event model that informed this scraper/parser.