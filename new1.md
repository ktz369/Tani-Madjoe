```markdown
# TASK: UI/UX Refactoring — High-End Agritech GIS Console

## Context & Design Philosophy
Refactor the web application UI from a generic SaaS/AI-template "card soup" into a high-density, scientific agritech GIS workstation (Awwwards/high-end agency benchmark: Locomotive, Palantir Foundry, Sentinel Hub). 
Eliminate rounded container stacking, diffuse drop shadows, and horizontal header congestion. Enforce architectural structural lines, full-bleed spatial canvas, and a strict Fibonacci spatial system.

---

## 1. Design Tokens & Fibonacci Spatial System
Replace standard 4px/8px linear spacings with pure Fibonacci scaling:

```css
:root {
  /* Fibonacci Spatial Scale */
  --space-3: 3px;     /* Micro: border offsets, badge gap */
  --space-5: 5px;     /* Micro: icon padding, compact pills */
  --space-8: 8px;     /* Micro: tight element groups */
  --space-13: 13px;   /* Meso: input padding, table cell vertical padding */
  --space-21: 21px;   /* Meso: container internal padding, table column gap */
  --space-34: 34px;   /* Meso-Large: block spacing, section headers */
  --space-55: 55px;   /* Macro: component gutters, collapsed sidebar */
  --space-89: 89px;   /* Macro: major layout margins */
  --space-144: 144px; /* Macro: structural breathers */
  --space-233: 233px; /* Structural: expanded sidebar width */

  /* Golden Ratio Layout Partition */
  --split-major: 61.8%;
  --split-minor: 38.2%;

  /* Borders & Surfaces (Anti-AI Slop) */
  --border-hairline: 1px solid rgba(0, 0, 0, 0.08);
  --border-hairline-dark: 1px solid rgba(255, 255, 255, 0.12);
  --surface-canvas: #FAFAF9;
  --surface-panel: #FFFFFF;
  --surface-hud: rgba(255, 255, 255, 0.85);
  --hud-blur: blur(14px);
  --radius-structural: 0px; /* Zero radius on viewport edges */
  --radius-micro: 3px;      /* Maximum radius for pills/buttons */
}

```

---

## 2. Layout Architecture (Viewport & Grid)

* **Viewport Lock:** Enforce `height: 100vh; width: 100vw; overflow: hidden;`. No universal page scrolling.
* **Three-Column Spatial Engine:**

1. **Vertical Sidebar (Left):**

* Collapsed: `55px`, Expanded: `233px`.
* Right border: `var(--border-hairline)`.
* Group navigation items into 3 architectural clusters separated by `34px`: *Spatial GIS*, *Agronomy Telemetry*, *System/Organization*.
* Active indicator: 3px solid vertical hairline on the left edge (no chunky green pills).

1. **Full-Bleed Primary Substrate (Center / Major 61.8%):**

* Mapbox/Leaflet container fills the substrate `edge-to-edge` (zero margins, zero outer border radius).
* Spectral time-series charts bleed horizontally across this column boundary.
* Sits directly beneath a thin top Ambient Command Bar (`height: 34px` or `55px`) containing contextual breadcrumbs and live Sentinel sync telemetry.

1. **Docked Telemetry Rail (Right / Minor 38.2% or min `480px`):**

* Left border: `var(--border-hairline)`.
* Dedicated, independent vertical scroll (`overflow-y: auto`).
* Houses KPI telemetry, crop fenology status, and alert items.

---

## 3. Surface & Component Styling Rules

* **Kill the "Card Soup":**
* Strip all `box-shadow` properties, floating rounded white rectangles, and nested outer cards.
* Divide sections exclusively via single `1px hairline seams` (horizontal and vertical border lines).

* **Floating Micro-HUD (Over Map):**
* Weather, NDVI category legend, and map layers must be floating HUD overlays on the map, not static white cards above it.
* Position: `top: var(--space-21); left: var(--space-34);`.
* Background: `var(--surface-hud)` with `backdrop-filter: var(--hud-blur)`.

* **Theme Consistency:**
* Remove isolated dark widgets (e.g., dark navy weather block) from light dashboard canvas. Convert weather data into technical inline telemetry with matching monochromatic wire icons.

* **Micro-Typographic Precision:**
* Retain current brand typography.
* Force `font-variant-numeric: tabular-nums` for all telemetry values (NDVI numbers, coordinates, timestamps, hectare values).
* Telemetry value hierarchy: Labels `11px–13px`, Data displays `34px–55px` (Fibonacci scale).

* **Data Density Tables:**
* Table cell vertical padding fixed at `13px`; horizontal padding at `21px`.
* Align all numeric data right; align status flags and labels left.
* Bottom borders: `1px solid var(--border-hairline)`.

---

## 4. Implementation Target Structure (Pseudo-HTML)

```html
<div class="app-viewport flex h-screen w-screen overflow-hidden font-sans bg-[var(--surface-canvas)]">
  <!-- 1. Fibonacci Sidebar -->
  <aside class="w-[55px] hover:w-[233px] transition-all duration-300 border-r border-black/10 flex flex-col justify-between py-[21px] shrink-0 z-30 bg-white">
    <!-- Navigation clusters with 34px gap -->
  </aside>

  <div class="flex-1 flex flex-col min-w-0">
    <!-- Top Ambient Command Bar -->
    <header class="h-[34px] border-b border-black/10 px-[21px] flex items-center justify-between text-xs tabular-nums shrink-0">
      <div class="breadcrumbs text-neutral-500">Kebun Pacitan / Bengkok 1</div>
      <div class="telemetry-status flex items-center gap-[5px]">Sentinel-2 Live Engine</div>
    </header>

    <!-- Main Workspace (Golden Ratio Split) -->
    <main class="flex-1 grid grid-cols-[1fr_480px] overflow-hidden">
      <!-- Primary Canvas (Full-Bleed Map / Spectral Charts) -->
      <section class="relative w-full h-full overflow-hidden">
        <div id="map-container" class="absolute inset-0 w-full h-full"></div>
        <div class="hud-telemetry absolute top-[21px] left-[34px] p-[13px_21px] backdrop-blur-md bg-white/85 border border-black/10 rounded-[3px]">
          <!-- Micro HUD Metrics -->
        </div>
      </section>

      <!-- Right Telemetry Rail -->
      <aside class="border-l border-black/10 bg-neutral-50 overflow-y-auto p-[34px_21px] flex flex-col gap-[34px]">
        <!-- Telemetry modules separated by hairline rules, zero outer cards -->
      </aside>
    </main>
  </div>
</div>

```

```

```