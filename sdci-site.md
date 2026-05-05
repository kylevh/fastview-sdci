# Fastview SDCI Viewer - Improved SDCI Permit Portal

## Overview

The **Seattle Services Portal** (`services.seattle.gov/Portal`) is operated by the Seattle Department of Construction & Inspections (SDCI). It tracks permits for construction, land use, and trade work across the city. I wanted an easy way to get a quick overview rather than needing to manually click through each dropdown to see the status on each specific review. Below is my understanding of how the data structure of the SDCI Permit Portal works and how I scraped the data.

Each permit record is organized in a **hierarchical, event-driven** structure that mirrors the real-world permit lifecycle:

1. High-level **Workflow Stages** — sequential phases from application to closure
2. **Review Cycles** — iterative plan review rounds nested inside the Reviews stage
3. **Discipline Reviews** — individual reviewer queues within each cycle

---

## Portal URLs

| Purpose | URL |
|---|---|
| Home / Search | `https://services.seattle.gov/Portal/Customization/SEATTLE/welcome.aspx` |
| Permit Detail | `https://services.seattle.gov/Portal/Cap/CapDetail.aspx?Module=DPDPermits&TabName=DPDPermits&capID1=<ID1>&capID2=<ID2>&capID3=<ID3>&agencyCode=SEATTLE` |

Permit IDs are three-part (`capID1` / `capID2` / `capID3`), e.g. `24SCI / 00000 / C3979`.
Record Number is typically a 7-digit number followed by a -CN or -DM indicating Construction or Demolition permit such as 7058372-CN

---

## Data Model

```
Permit Record
├── Metadata
│   ├── Record Number
│   ├── Address
│   ├── Record Type
│   ├── Overall Status
│   └── Other fields (project description, applicant, valuation, etc.)
│
├── Workflow Stages          ← sequential high-level phases
│   └── Stage[]
│       ├── name             ← see Stage Names below
│       ├── events[]         ← timeline of status changes (see Event schema)
│       └── additionalInfo   ← present only on the "Reviews" workflow stage
│
└── Review Cycles            ← extracted from Reviews → additionalInfo
    └── Cycle[]
        ├── name             ← e.g. "Review Cycle 1", "Review Cycle 5"
        └── disciplineReviews[]
            ├── discipline   ← see Discipline Names below
            └── events[]     ← status history for this discipline in this cycle
```

---

## Workflow Stage Names

Stages appear in this order:

1. Application
2. OS Screening
3. Zoning Screening
4. Tree Screening
5. Intake
6. Intake Fees
7. Reviews
8. Issuance Prep
9. Issuance
10. Inspections
11. Post-Occupancy Monitoring
12. Closed

---

## Discipline Names

Disciplines that may appear within a review cycle:

Addressing, Arborist, City Light, Conveyance, Drainage, ECA GeoTech, ECA Riparian, ECA Wetland, ECA Wildlife, Energy, Finance/Admin Services ADA, Fire, Floodplain, Geo Soils, Housing, Incentive Zoning, Land Use, Law, Mandatory Housing Affordability, Mechanical, Neighborhoods, Noise, Ordinance, Ordinance/Structural, Parks, Policy, Revegetation, Review Evaluation, Shoreline, Shoring - Private Property, Shoring - Right of Way, Side Sewer Conflict, Structural Engineer, Sustainability, Transportation, Transportation Management, Tree, Zoning

---

## Event Schema

Events appear on both **Workflow Stages** and **Discipline Reviews**. The fields differ slightly:

```typescript
interface Event {
  status: string;          // e.g. "In Review", "Corrections Submitted", "Approved"
  date: string | null;     // ISO date — when the status was set
  dueDate: string | null;  // ISO date — present on workflow stage events, null on discipline events
  assignedTo: string | null; // Reviewer name or "* Unassigned"
  raw: string;             // Original unparsed text from the portal
}
```

### Examples

**Workflow stage event** (has `dueDate`):
```json
{
  "status": "Corrections Submitted",
  "date": "2025-08-14",
  "dueDate": "2025-08-12",
  "assignedTo": "* Unassigned",
  "raw": "Due on 08/12/2025, Assigned to * Unassigned\nMarked as Corrections Submitted on 08/14/2025"
}
```

**Discipline review event** (no `dueDate`):
```json
{
  "status": "In Review",
  "date": "2025-06-26",
  "dueDate": null,
  "assignedTo": "John Smith",
  "raw": "Assigned to John Smith\nMarked as In Review on 06/26/2025"
}
```

---

## Notes

- The portal runs on **Accela Citizen Access**. Most record data (Status tab, Review Cycles) is rendered client-side via JavaScript, so scraping requires a headless browser or API interception rather than a static HTTP fetch.
- Review cycles are surfaced under the **Status** tab → Reviews stage → Additional Information section in the portal UI.
- A single permit may have multiple related records (e.g. east and west units filed under the same parent number).

---

## How it works (high level)

- **Input**: a record number like `7058372-CN` (or `3001672-EX`)
- **Fetch**: uses Playwright to load the permit detail page and capture the same Status/Review info you see in the portal UI
- **Parse**: converts the portal’s “workflow stages” and nested “reviews” UI into structured events (status, dates, due dates, assigned reviewer)
- **Export**: writes a JSON file to `output/<recordNumber>.json`

---

## JSON export format

Each run writes `output/<recordNumber>.json` with four top-level sections:

- **`recordNumber`**: the human-facing record number, e.g. `7140292-CN`
- **`capIds`**: `{ capID1, capID2, capID3 }` used to build the permit detail URL
- **`summary`**: quick “at a glance” fields (current stage, completed stages, current review cycle, pending disciplines)
- **`parsed`**: the full normalized event history
  - **`workflowStages[]`**: ordered portal stages (Application → Closed), each with `events[]`
  - **`disciplineReviews[]`**: per-discipline review timelines (optionally tied to a `reviewCycle`)
- **`calculatedMetrics`**: derived fields that reconcile portal UI quirks (e.g. inferred review cycle vs portal’s displayed cycle)

### Example (truncated)

```json
{
  "recordNumber": "7140292-CN",
  "capIds": { "capID1": "26SCI", "capID2": "00000", "capID3": "40670" },
  "summary": {
    "currentStage": "Reviews",
    "currentReviewCycle": 0,
    "pendingDisciplines": ["Review Selection"]
  },
  "parsed": {
    "workflowStages": [
      {
        "name": "Application",
        "isComplete": true,
        "events": [{ "status": "Submitted", "date": "2026-04-15", "dueDate": "2026-01-02", "assignedTo": null }]
      }
    ],
    "disciplineReviews": [
      { "discipline": "Review Selection", "reviewCycle": null, "events": [{ "status": "TBD", "date": null }] }
    ]
  }
}
```

## How to run

Run the script (it compiles to `dist/` and runs with plain Node):

```bash
npm run main -- 3001672-EX
```
