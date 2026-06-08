# Phase 5 (Part 2) — Presentation Page, Simulated Demo Mode & Design Tournament

**Date:** 2026-06-08
**Status:** Approved
**Scope:** Turn `services/web` into a self-demonstrating, publicly-hostable presentation of the whole platform: a dual-mode (real/simulated) interactive demo, a teaching-oriented presentation page, thorough explanations, an architecture diagram, and a 3-direction design tournament to choose the visual style.

This is the second sub-project of Phase 5 (the interactive demo, Part 1, is complete). The repo README is a small follow-on that reuses this work.

---

## Goal

Make the project presentable, public, and self-explanatory. A visitor with no DevOps background should land on the page, understand what the project is and why it matters, watch the GitOps pipeline run interactively (even with no backend), and learn what each stage and tool does. Because the simulated mode needs no backend, `npm run build` produces a static site hostable for free (Vercel/GitHub Pages) — the public link.

---

## Dual-Mode Architecture

The existing `services/web` app auto-detects its mode once on load:

```
On load → GET /api/info (timeout ~1.5s)
  ├─ responds  → REAL mode      (Deploy commits via API, polls real /api/status)
  └─ no answer → SIMULATED mode (Deploy runs a scripted local timeline)
```

- **`useMode()`** — new hook; performs the detection once, returns `mode: 'real' | 'simulated'`.
- **DeployForm** — real mode: POST `/api/deploy` (unchanged). Simulated mode: calls `startSimulation(message)`. Identical appearance.
- **Status source** — real mode: existing `useStatus(sha)`. Simulated mode: new `useSimulatedStatus()` emitting the SAME `{stages, currentMessage, runUrl}` shape.
- **PipelineFlow / StageExplainer** — UNCHANGED. Pure prop-driven; mode-agnostic.

The single shared status shape means the entire visualization layer is reused; only the detection hook + simulation source are new.

---

## Simulated Pipeline Engine

`useSimulatedStatus()` plays a scripted timeline mirroring a real run — same 8 stages, same order, realistic durations observed from actual runs:

| Stage | Realistic duration (shown in label) |
|---|---|
| commit | ~2s |
| build | ~90s |
| test | ~15s |
| scan | ~20s |
| push | ~25s |
| cd | ~10s |
| argocd | ~40s |
| live | done |

Behavior:
- On Deploy, advances each stage `pending → running → done` in sequence; connectors fill; explainer follows the active stage.
- **Compressed clock by default:** whole run in ~20–30s so casual visitors see it complete. A "▶ real-time" toggle plays it at true pace. Stage labels show the *realistic* duration (e.g., "Build · ~90s") regardless of clock, so the real cost is honest.
- Final "✓ Live" shows the typed message — fully client-side, no commit.
- **Mode badge:** "Simulated" in simulated mode; "Live · connected to cluster" in real mode. Never misrepresent the simulation as live.

---

## Presentation Page Structure

Fixed content/structure (the tournament styles it, doesn't change it):

1. **Hero** — project name, one-line thesis, mode badge, CTA to the demo.
2. **Why this exists** — 2–3 sentences on the "touched pipelines vs understand pipelines" gap.
3. **Architecture diagram** — SVG of the full GitOps loop (see below).
4. **Interactive demo** (centerpiece) — deploy form + PipelineFlow + StageExplainer, in the auto-detected mode.
5. **The stack, explained** — one card per tool: Docker, GitHub Actions, Trivy, GHCR, Helm, k3s, ArgoCD.
6. **What I learned / what's next** — honest gotchas as lessons (the `%2F` URL bug, the test that broke its own pipeline, the k3s memory / runner / default-branch issues).
7. **Footer** — repo + blog links.

---

## Explanation Content (the teaching layer)

**Per-stage (demo `StageExplainer`):** existing copy gets a depth pass — each of the 8 stages explains *what the tool is doing*, *why the step exists*, and *what happens if it fails*. Beginner-readable. Failure framing included (it's a teaching moment).

**Per-tool ("stack, explained" cards):** one card each for Docker, GitHub Actions, Trivy, GHCR, Helm, k3s, ArgoCD. Format: **what it is** (1 line) · **its job here** (1 line) · **why it matters** (1 line). No assumed knowledge.

All copy drafted during the build; user reviews/tweaks.

---

## Architecture Diagram

- Hand-built **SVG** (not a raster image): crisp, themeable to the winning design, embeddable in both the page and the README.
- Shows the GitOps loop as connected, labeled nodes:
  `git push → GitHub Actions (build · test · scan) → GHCR → CD bumps Helm values → ArgoCD → k3s cluster → live`
- Labeled flow arrows so the sequence is legible at a glance.
- Built **after** the tournament so it matches the chosen aesthetic.

---

## The Design Tournament

Run on look-and-feel only (content/structure fixed), as full-page HTML mockups in the visual companion:

- **Direction 1 — "Clean docs":** light, whitespace, restrained palette; documentation feel; readability-first.
- **Direction 2 — "Terminal / ops":** dark, monospace accents, DevOps aesthetic; screenshot-friendly.
- **Direction 3 — "Bold modern landing":** strong hero, gradients, large type; product-launch energy.

Each mockup covers the full page (hero → diagram → demo → stack cards → lessons). User picks one outright OR mixes named elements across directions. The winner is then implemented as the real React/CSS styling over the working components.

---

## Sequencing

1. **Dual-mode engine:** `useMode()` detection + `useSimulatedStatus()` simulation source; branch `DeployForm`; mode badge. Functional with minimal/plain styling.
2. **Page structure:** add hero, why, demo, stack cards, lessons, footer sections (plain styling, real content copy).
3. **Tournament:** generate 3 full-page mockups in the visual companion; user picks/mixes.
4. **Implement winning design:** real CSS/styling over the components.
5. **Architecture diagram:** build the SVG to match the chosen aesthetic; place in page (and reuse later in README).
6. **Verify:** `npm run build` produces a static site that runs in simulated mode with no backend; same build against local k3s runs in real mode. Deploy the static build to a free host for the public link.

---

## Definition of Done

- [ ] `useMode()` auto-detects real vs simulated on load
- [ ] Simulated mode: Deploy runs the scripted 8-stage timeline (compressed by default, real-time toggle), no backend needed
- [ ] Real mode still works unchanged against the local cluster
- [ ] Mode badge clearly indicates simulated vs live
- [ ] Presentation page has all 7 sections with beginner-readable copy
- [ ] Per-stage and per-tool explanations are thorough (what / why / on-failure; what / job / why)
- [ ] 3 design directions mocked; winner chosen and implemented in React/CSS
- [ ] Architecture-diagram SVG built to match, embedded in the page
- [ ] `npm run build` yields a static site that works with no backend (the public link); deployed to a free host
