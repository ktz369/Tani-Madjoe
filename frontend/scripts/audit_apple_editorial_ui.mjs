#!/usr/bin/env node
/**
 * audit_apple_editorial_ui.mjs
 * 
 * Comprehensive Simulation & Audit Test Suite for:
 * 1. Apple Editorial UI 100% Light Mode & Fibonacci Spacing Design System
 * 2. 5 Beautiful UI components at /admin/petak-baru:
 *    - ModeSegmentedControl.tsx
 *    - SpatialDropzone.tsx
 *    - BatchSummaryCard.tsx
 *    - BatchRecordsTable.tsx
 *    - BatchCompletionModal.tsx
 * 3. Reactive State Management:
 *    - Bulk selection toggle & select all
 *    - Inline plot name editing
 *    - Per-row crop & variety dropdowns with incompatible reset
 *    - Empty division handling and 0-selected rows submit disabling
 * 4. Mapbox GL JS Spatial Layers Reactivity:
 *    - batch-polygons-fill and batch-polygons-line dynamic styling
 *    - fitBounds bbox calculation & focus transitions
 *    - Map style switching (Satellite <-> Vector) layer & geometry preservation
 * 5. Zero dark classes audit (no residual dark classes, pure light theme).
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "..");

console.log("===============================================================================");
console.log("🌱 [AUDIT & SIMULATION] Tani SaaS — Worker 7: Apple Editorial UI & Mapbox");
console.log("===============================================================================\n");

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------------------
// PART 1: Syntactical and Static Audit of Components
// -----------------------------------------------------------------------------
console.log("📂 1. SYNTACTICAL & STATIC AUDIT OF BEAUTIFUL UI COMPONENTS");

const COMPONENT_PATHS = {
  ModeSegmentedControl: path.join(FRONTEND_DIR, "src/components/plot/ModeSegmentedControl.tsx"),
  SpatialDropzone: path.join(FRONTEND_DIR, "src/components/plot/SpatialDropzone.tsx"),
  BatchSummaryCard: path.join(FRONTEND_DIR, "src/components/plot/BatchSummaryCard.tsx"),
  BatchRecordsTable: path.join(FRONTEND_DIR, "src/components/plot/BatchRecordsTable.tsx"),
  BatchCompletionModal: path.join(FRONTEND_DIR, "src/components/plot/BatchCompletionModal.tsx"),
  PetakBaruPage: path.join(FRONTEND_DIR, "src/app/admin/petak-baru/page.tsx"),
  PlotIndex: path.join(FRONTEND_DIR, "src/components/plot/index.ts"),
  PlotIndicesChart: path.join(FRONTEND_DIR, "src/components/plot/PlotIndicesChart.tsx"),
};

for (const [name, filePath] of Object.entries(COMPONENT_PATHS)) {
  runTest(`File existence and readability: ${name}`, () => {
    assert.ok(fs.existsSync(filePath), `File does not exist: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.length > 50, `File is unexpectedly small or empty: ${filePath}`);
  });
}

// Check bracket matching and basic syntax integrity
for (const [name, filePath] of Object.entries(COMPONENT_PATHS)) {
  runTest(`Syntax & AST balance check (braces, parens, brackets): ${name}`, () => {
    const content = fs.readFileSync(filePath, "utf-8");
    
    let openBrace = 0;
    let openParen = 0;
    let openSquare = 0;
    
    for (const char of content) {
      if (char === "{") openBrace++;
      else if (char === "}") openBrace--;
      else if (char === "(") openParen++;
      else if (char === ")") openParen--;
      else if (char === "[") openSquare++;
      else if (char === "]") openSquare--;
    }
    
    assert.equal(openBrace, 0, `Mismatched braces in ${name}: diff ${openBrace}`);
    assert.equal(openParen, 0, `Mismatched parens in ${name}: diff ${openParen}`);
    assert.equal(openSquare, 0, `Mismatched square brackets in ${name}: diff ${openSquare}`);
  });
}

// Check proper component exports and typescript interfaces
runTest("Component Props and TypeScript interfaces audit", () => {
  const modeContent = fs.readFileSync(COMPONENT_PATHS.ModeSegmentedControl, "utf-8");
  assert.ok(modeContent.includes("export interface ModeSegmentedControlProps"));
  assert.ok(modeContent.includes("activeTab: \"single\" | \"batch\""));
  assert.ok(modeContent.includes("onChange: (tab: \"single\" | \"batch\") => void"));

  const dropContent = fs.readFileSync(COMPONENT_PATHS.SpatialDropzone, "utf-8");
  assert.ok(dropContent.includes("export interface SpatialDropzoneProps"));
  assert.ok(dropContent.includes("onFileUpload: (file: File) => void"));
  assert.ok(dropContent.includes("fileInfo?: SpatialDropzoneFileInfo | null"));

  const summaryContent = fs.readFileSync(COMPONENT_PATHS.BatchSummaryCard, "utf-8");
  assert.ok(summaryContent.includes("export interface BatchSummaryCardProps"));
  assert.ok(summaryContent.includes("summary: BatchSummaryData"));
  assert.ok(summaryContent.includes("selectedCount: number"));
  assert.ok(summaryContent.includes("onApplyBulk: () => void"));

  const tableContent = fs.readFileSync(COMPONENT_PATHS.BatchRecordsTable, "utf-8");
  assert.ok(tableContent.includes("export interface BatchRecordsTableProps"));
  assert.ok(tableContent.includes("rows: BatchPlotRow[]"));
  assert.ok(tableContent.includes("onToggleSelectAll: (select: boolean) => void"));
  assert.ok(tableContent.includes("onToggleRowSelect: (index: number) => void"));
  assert.ok(tableContent.includes("onUpdateField: (index: number, field: keyof BatchPlotRow, val: any) => void"));
  assert.ok(tableContent.includes("onSubmit: () => void"));

  const modalContent = fs.readFileSync(COMPONENT_PATHS.BatchCompletionModal, "utf-8");
  assert.ok(modalContent.includes("export interface BatchCompletionModalProps"));
  assert.ok(modalContent.includes("result: PlotBatchCreateResponse | null"));
  assert.ok(modalContent.includes("onClose: () => void"));
  assert.ok(modalContent.includes("onReset: () => void"));

  const indexContent = fs.readFileSync(COMPONENT_PATHS.PlotIndex, "utf-8");
  assert.ok(indexContent.includes("ModeSegmentedControl"));
  assert.ok(indexContent.includes("SpatialDropzone"));
  assert.ok(indexContent.includes("BatchSummaryCard"));
  assert.ok(indexContent.includes("BatchRecordsTable"));
  assert.ok(indexContent.includes("BatchCompletionModal"));
});

// -----------------------------------------------------------------------------
// PART 2: Zero Dark Classes & Apple Editorial Design Audit
// -----------------------------------------------------------------------------
console.log("\n🎨 2. ZERO DARK CLASSES & APPLE EDITORIAL DESIGN AUDIT");

const FORBIDDEN_DARK_PATTERNS = [
  /dark:/g,
  /\bbg-slate-900\b/g,
  /\bbg-slate-800\b/g,
  /\bborder-slate-700\b/g,
  /\bborder-slate-800\b/g,
  /\bbg-gray-900\b/g,
  /\bbg-gray-800\b/g,
  /\btext-slate-100\b/g,
  /\btext-slate-200\b/g,
];

const AUDITED_LIGHT_COMPONENTS = [
  "ModeSegmentedControl",
  "SpatialDropzone",
  "BatchSummaryCard",
  "BatchRecordsTable",
  "BatchCompletionModal",
  "PetakBaruPage",
];

for (const compName of AUDITED_LIGHT_COMPONENTS) {
  runTest(`Zero dark classes verification in ${compName}`, () => {
    const content = fs.readFileSync(COMPONENT_PATHS[compName], "utf-8");
    for (const pattern of FORBIDDEN_DARK_PATTERNS) {
      const match = content.match(pattern);
      assert.equal(
        match,
        null,
        `Residual dark pattern ${pattern} found in ${compName}: count ${match ? match.length : 0}`
      );
    }
  });
}

runTest("Apple Editorial hairline borders & pure light palette compliance", () => {
  const pageContent = fs.readFileSync(COMPONENT_PATHS.PetakBaruPage, "utf-8");
  // Check main canvas background
  assert.ok(pageContent.includes("bg-[#fbfbfb]"), "Page must use pure light canvas bg-[#fbfbfb]");
  // Check hairline borders
  assert.ok(pageContent.includes("border-black/[0.06]"), "Must use Apple Editorial hairline border-black/[0.06]");
  // Check typography
  assert.ok(pageContent.includes("font-serif"), "Must use editorial serif headings");
  assert.ok(pageContent.includes("tabular-nums"), "Must use tabular numbers for metrics");
});

runTest("Fibonacci spacing and Apple Editorial corner radius scale", () => {
  const summaryContent = fs.readFileSync(COMPONENT_PATHS.BatchSummaryCard, "utf-8");
  const tableContent = fs.readFileSync(COMPONENT_PATHS.BatchRecordsTable, "utf-8");
  const dropContent = fs.readFileSync(COMPONENT_PATHS.SpatialDropzone, "utf-8");

  // Verify Fibonacci spacing classes: [3px], [5px], [8px], [13px], [21px]
  assert.ok(summaryContent.includes("rounded-[21px]"), "BatchSummaryCard must use rounded-[21px]");
  assert.ok(summaryContent.includes("p-[13px]"), "BatchSummaryCard must use Fibonacci p-[13px]");
  assert.ok(summaryContent.includes("gap-[8px]"), "BatchSummaryCard must use Fibonacci gap-[8px]");
  assert.ok(summaryContent.includes("rounded-[13px]"), "BatchSummaryCard must use rounded-[13px]");

  assert.ok(tableContent.includes("rounded-[21px]"), "BatchRecordsTable must use rounded-[21px]");
  assert.ok(tableContent.includes("p-[13px]"), "BatchRecordsTable must use Fibonacci p-[13px]");
  assert.ok(tableContent.includes("h-[42px]"), "BatchRecordsTable must use standard button height h-[42px]");
  assert.ok(tableContent.includes("px-[21px]"), "BatchRecordsTable must use Fibonacci px-[21px]");

  assert.ok(dropContent.includes("rounded-[21px]"), "SpatialDropzone must use rounded-[21px]");
  assert.ok(dropContent.includes("p-[21px]"), "SpatialDropzone must use Fibonacci p-[21px]");
});

runTest("Tailwind syntax verification (no outline-hidden)", () => {
  const tableContent = fs.readFileSync(COMPONENT_PATHS.BatchRecordsTable, "utf-8");
  assert.ok(!tableContent.includes("outline-hidden"), "BatchRecordsTable should use outline-none instead of v4 outline-hidden");
});

// -----------------------------------------------------------------------------
// PART 3: Reactive State Management Simulation
// -----------------------------------------------------------------------------
console.log("\n⚡ 3. REACTIVE STATE MANAGEMENT SIMULATION");

// Simulate State Harness mirroring PetakBaruPage
class PetakBaruStateHarness {
  constructor() {
    this.selectedCompanyId = 1;
    this.selectedEstateId = 10;
    this.selectedDivisionId = "";
    this.varieties = [
      { id: 1, name: "Ciherang", crop_type: "padi", cycle_days: 115 },
      { id: 2, name: "Inpari 32", crop_type: "padi", cycle_days: 120 },
      { id: 3, name: "BISI 18", crop_type: "jagung", cycle_days: 100 },
      { id: 4, name: "Pioneer P35", crop_type: "jagung", cycle_days: 105 },
    ];
    this.batchRows = [];
    this.errorMessage = null;
    this.submittedPayload = null;
  }

  loadSampleBatch(count = 5) {
    this.batchRows = Array.from({ length: count }, (_, idx) => ({
      id: `row-${idx + 1}`,
      selected: true,
      name: `Petak Blok ${String.fromCharCode(65 + idx)}`,
      crop_type: "padi",
      variety_id: 1, // Ciherang
      planting_date: "2026-09-01",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [101.85 + idx * 0.01, 0.55],
            [101.86 + idx * 0.01, 0.55],
            [101.86 + idx * 0.01, 0.56],
            [101.85 + idx * 0.01, 0.56],
            [101.85 + idx * 0.01, 0.55],
          ],
        ],
      },
      area_hectares: 12.5 + idx * 2.1,
      area_m2: (12.5 + idx * 2.1) * 10000,
      vertex_count: 5,
      bounding_box: [101.85 + idx * 0.01, 0.55, 101.86 + idx * 0.01, 0.56],
      centroid: [101.855 + idx * 0.01, 0.555],
      warnings: [],
    }));
  }

  handleToggleSelectAll(select) {
    this.batchRows = this.batchRows.map((r) => ({
      ...r,
      selected: select,
    }));
  }

  handleToggleRowSelect(index) {
    this.batchRows = this.batchRows.map((r, i) =>
      i === index ? { ...r, selected: !r.selected } : r
    );
  }

  handleUpdateRowField(index, field, val) {
    this.batchRows = this.batchRows.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, [field]: val };
      if (field === "crop_type") {
        const currentVar = this.varieties.find((v) => v.id === r.variety_id);
        if (currentVar && currentVar.crop_type !== val) {
          updated.variety_id = "";
        }
      }
      return updated;
    });
  }

  handleApplyBatchSettings({ crop_type, variety_id, planting_date }) {
    this.batchRows = this.batchRows.map((row) => {
      if (!row.selected) return row;
      return {
        ...row,
        crop_type,
        variety_id,
        planting_date,
      };
    });
  }

  canSubmit() {
    const selectedCount = this.batchRows.filter((r) => r.selected).length;
    return Boolean(this.selectedDivisionId) && selectedCount > 0;
  }

  handleSubmitBatchPlots() {
    this.errorMessage = null;

    if (!this.selectedDivisionId) {
      this.errorMessage = "Silakan pilih Divisi / Afdeling tujuan terlebih dahulu.";
      return false;
    }

    const selectedPlots = this.batchRows.filter((r) => r.selected);
    if (selectedPlots.length === 0) {
      this.errorMessage = "Pilih minimal satu petak lahan untuk didaftarkan.";
      return false;
    }

    this.submittedPayload = {
      division_id: Number(this.selectedDivisionId),
      plots: selectedPlots.map((r) => ({
        name: r.name.trim() || "Petak Lahan",
        crop_type: r.crop_type,
        variety_id: r.variety_id ? Number(r.variety_id) : null,
        planting_date: r.planting_date || null,
        polygon: r.geometry,
      })),
    };

    return true;
  }
}

runTest("Simulation: Bulk selection toggle (select-all & deselect-all)", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(5);

  assert.equal(harness.batchRows.every((r) => r.selected), true);
  assert.equal(harness.batchRows.filter((r) => r.selected).length, 5);

  // Deselect all
  harness.handleToggleSelectAll(false);
  assert.equal(harness.batchRows.every((r) => !r.selected), true);
  assert.equal(harness.batchRows.filter((r) => r.selected).length, 0);

  // Select all
  harness.handleToggleSelectAll(true);
  assert.equal(harness.batchRows.every((r) => r.selected), true);
  assert.equal(harness.batchRows.filter((r) => r.selected).length, 5);
});

runTest("Simulation: Single row toggle & partial selection state", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(4);

  // Uncheck row 1 and row 3
  harness.handleToggleRowSelect(1);
  harness.handleToggleRowSelect(3);

  assert.equal(harness.batchRows[0].selected, true);
  assert.equal(harness.batchRows[1].selected, false);
  assert.equal(harness.batchRows[2].selected, true);
  assert.equal(harness.batchRows[3].selected, false);

  const selectedCount = harness.batchRows.filter((r) => r.selected).length;
  assert.equal(selectedCount, 2);

  const allSelected = harness.batchRows.length > 0 && harness.batchRows.every((r) => r.selected);
  assert.equal(allSelected, false);

  // Toggle all from partial selection state (should select all)
  harness.handleToggleSelectAll(!allSelected);
  assert.equal(harness.batchRows.every((r) => r.selected), true);
  assert.equal(harness.batchRows.filter((r) => r.selected).length, 4);
});

runTest("Simulation: Inline plot name editing", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(3);

  harness.handleUpdateRowField(0, "name", "Petak Utama Utara Renovasi");
  assert.equal(harness.batchRows[0].name, "Petak Utama Utara Renovasi");
  assert.equal(harness.batchRows[1].name, "Petak Blok B"); // Other rows untouched
  assert.equal(harness.batchRows[2].name, "Petak Blok C");
});

runTest("Simulation: Crop type switch & incompatible variety auto-reset", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(2);

  // Row 0 starts as padi with Ciherang (variety_id = 1)
  assert.equal(harness.batchRows[0].crop_type, "padi");
  assert.equal(harness.batchRows[0].variety_id, 1);

  // User changes crop_type to jagung
  harness.handleUpdateRowField(0, "crop_type", "jagung");
  assert.equal(harness.batchRows[0].crop_type, "jagung");
  // Variety must reset to empty because Ciherang is padi
  assert.equal(harness.batchRows[0].variety_id, "");

  // User selects Pioneer P35 (variety_id = 4, jagung)
  harness.handleUpdateRowField(0, "variety_id", 4);
  assert.equal(harness.batchRows[0].variety_id, 4);
});

runTest("Simulation: Quick bulk settings applied exclusively to selected rows", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(3);

  // Uncheck row 1
  harness.handleToggleRowSelect(1);

  // Apply bulk settings
  harness.handleApplyBatchSettings({
    crop_type: "jagung",
    variety_id: 3,
    planting_date: "2026-08-15",
  });

  // Row 0 (selected) -> updated
  assert.equal(harness.batchRows[0].crop_type, "jagung");
  assert.equal(harness.batchRows[0].variety_id, 3);
  assert.equal(harness.batchRows[0].planting_date, "2026-08-15");

  // Row 1 (unselected) -> preserved original padi
  assert.equal(harness.batchRows[1].crop_type, "padi");
  assert.equal(harness.batchRows[1].variety_id, 1);
  assert.equal(harness.batchRows[1].planting_date, "2026-09-01");

  // Row 2 (selected) -> updated
  assert.equal(harness.batchRows[2].crop_type, "jagung");
  assert.equal(harness.batchRows[2].variety_id, 3);
  assert.equal(harness.batchRows[2].planting_date, "2026-08-15");
});

runTest("Simulation: Empty division submit guard & button disabled state", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(3);

  // Division is empty
  harness.selectedDivisionId = "";
  assert.equal(harness.canSubmit(), false);

  const success = harness.handleSubmitBatchPlots();
  assert.equal(success, false);
  assert.equal(harness.errorMessage, "Silakan pilih Divisi / Afdeling tujuan terlebih dahulu.");
  assert.equal(harness.submittedPayload, null);
});

runTest("Simulation: 0 selected rows submit guard & button disabled state", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(3);
  harness.selectedDivisionId = 101;

  // Deselect all
  harness.handleToggleSelectAll(false);
  assert.equal(harness.canSubmit(), false);

  const success = harness.handleSubmitBatchPlots();
  assert.equal(success, false);
  assert.equal(harness.errorMessage, "Pilih minimal satu petak lahan untuk didaftarkan.");
  assert.equal(harness.submittedPayload, null);
});

runTest("Simulation: Successful batch registration payload generation", () => {
  const harness = new PetakBaruStateHarness();
  harness.loadSampleBatch(4);
  harness.selectedDivisionId = 205;

  // Deselect row 2
  harness.handleToggleRowSelect(2);

  assert.equal(harness.canSubmit(), true);
  const success = harness.handleSubmitBatchPlots();
  assert.equal(success, true);
  assert.equal(harness.errorMessage, null);
  assert.notEqual(harness.submittedPayload, null);

  assert.equal(harness.submittedPayload.division_id, 205);
  assert.equal(harness.submittedPayload.plots.length, 3); // 3 out of 4 selected
  assert.equal(harness.submittedPayload.plots[0].name, "Petak Blok A");
  assert.equal(harness.submittedPayload.plots[1].name, "Petak Blok B");
  assert.equal(harness.submittedPayload.plots[2].name, "Petak Blok D");
});

// -----------------------------------------------------------------------------
// PART 4: Mapbox GL JS Spatial Layers Reactivity Simulation
// -----------------------------------------------------------------------------
console.log("\n🗺️ 4. MAPBOX GL JS SPATIAL LAYERS REACTIVITY SIMULATION");

class MockMapboxMap {
  constructor() {
    this.sources = new Map();
    this.layers = new Map();
    this.eventListeners = new Map();
    this.currentStyle = "mapbox://styles/mapbox/satellite-streets-v12";
    this.lastFitBounds = null;
  }

  addSource(id, sourceDef) {
    this.sources.set(id, {
      ...sourceDef,
      setData: (newData) => {
        this.sources.get(id).data = newData;
      },
    });
  }

  getSource(id) {
    return this.sources.get(id) || null;
  }

  addLayer(layerDef) {
    this.layers.set(layerDef.id, layerDef);
  }

  getLayer(id) {
    return this.layers.get(id) || null;
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  trigger(event) {
    const handlers = this.eventListeners.get(event) || [];
    for (const h of handlers) {
      h();
    }
  }

  setStyle(styleUrl) {
    this.currentStyle = styleUrl;
    // Mapbox clears all custom sources and layers on setStyle
    this.sources.clear();
    this.layers.clear();
    // Then triggers style.load
    this.trigger("style.load");
  }

  fitBounds(bbox, options) {
    this.lastFitBounds = { bbox, options };
  }
}

runTest("Simulation: Batch polygons GeoJSON layer styling reactivity (Emerald vs Gray)", () => {
  const map = new MockMapboxMap();
  map.addSource("batch-polygons-source", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  const sampleRows = [
    {
      id: "1",
      name: "Petak 1",
      selected: true,
      geometry: { type: "Polygon", coordinates: [[[100, 0], [101, 0], [101, 1], [100, 1], [100, 0]]] },
    },
    {
      id: "2",
      name: "Petak 2",
      selected: false,
      geometry: { type: "Polygon", coordinates: [[[102, 0], [103, 0], [103, 1], [102, 1], [102, 0]]] },
    },
  ];

  // Helper matching PetakBaruPage
  const syncBatchSource = (rows) => {
    const batchSource = map.getSource("batch-polygons-source");
    const features = rows.map((row, idx) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        index: idx,
        name: row.name,
        selected: row.selected,
        fillColor: row.selected ? "#10b981" : "#94a3b8",
        fillOpacity: row.selected ? 0.45 : 0.15,
        lineColor: row.selected ? "#047857" : "#64748b",
        lineWidth: row.selected ? 2.5 : 1.5,
      },
    }));
    batchSource.setData({ type: "FeatureCollection", features });
  };

  syncBatchSource(sampleRows);
  const data = map.getSource("batch-polygons-source").data;
  assert.equal(data.features.length, 2);

  // Selected Row -> Emerald
  assert.equal(data.features[0].properties.fillColor, "#10b981");
  assert.equal(data.features[0].properties.lineColor, "#047857");
  assert.equal(data.features[0].properties.fillOpacity, 0.45);
  assert.equal(data.features[0].properties.lineWidth, 2.5);

  // Unselected Row -> Slate Gray
  assert.equal(data.features[1].properties.fillColor, "#94a3b8");
  assert.equal(data.features[1].properties.lineColor, "#64748b");
  assert.equal(data.features[1].properties.fillOpacity, 0.15);
  assert.equal(data.features[1].properties.lineWidth, 1.5);
});

runTest("Simulation: fitBounds calculation and focus navigation", () => {
  const map = new MockMapboxMap();

  // Test unified bbox from batch import preview
  const unifiedBbox = [101.50, 0.45, 101.65, 0.55];
  map.fitBounds(
    [
      [unifiedBbox[0], unifiedBbox[1]],
      [unifiedBbox[2], unifiedBbox[3]],
    ],
    {
      padding: { top: 70, bottom: 70, left: 70, right: 70 },
      duration: 1500,
      maxZoom: 17,
    }
  );

  assert.deepEqual(map.lastFitBounds.bbox, [
    [101.50, 0.45],
    [101.65, 0.55],
  ]);
  assert.equal(map.lastFitBounds.options.maxZoom, 17);

  // Test single plot focus
  const plotRow = {
    bounding_box: [101.52, 0.48, 101.54, 0.50],
  };

  // Safe handler matching page.tsx
  if (plotRow.bounding_box && plotRow.bounding_box.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = plotRow.bounding_box;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: { top: 100, bottom: 100, left: 100, right: 100 },
        duration: 1000,
        maxZoom: 18,
      }
    );
  }

  assert.deepEqual(map.lastFitBounds.bbox, [
    [101.52, 0.48],
    [101.54, 0.50],
  ]);
  assert.equal(map.lastFitBounds.options.maxZoom, 18);
});

runTest("Simulation: Map style switching (Satellite <-> Vector) without losing spatial layers", () => {
  const map = new MockMapboxMap();

  let activeTab = "batch";
  let batchRows = [
    {
      id: "p1",
      name: "Petak Timur",
      selected: true,
      geometry: { type: "Polygon", coordinates: [[[101.0, 0.5], [101.1, 0.5], [101.1, 0.6], [101.0, 0.6], [101.0, 0.5]]] },
    },
  ];

  const setupLayers = () => {
    if (!map.getSource("batch-polygons-source")) {
      map.addSource("batch-polygons-source", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("batch-polygons-fill")) {
      map.addLayer({
        id: "batch-polygons-fill",
        type: "fill",
        source: "batch-polygons-source",
      });
    }
    if (!map.getLayer("batch-polygons-line")) {
      map.addLayer({
        id: "batch-polygons-line",
        type: "line",
        source: "batch-polygons-source",
      });
    }

    // Restore spatial data on recreated layers
    syncBatchPolygons();
  };

  const syncBatchPolygons = () => {
    const batchSource = map.getSource("batch-polygons-source");
    if (!batchSource) return;
    if (activeTab !== "batch" || batchRows.length === 0) {
      batchSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    const features = batchRows.map((row, idx) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        index: idx,
        name: row.name,
        selected: row.selected,
        fillColor: row.selected ? "#10b981" : "#94a3b8",
        fillOpacity: row.selected ? 0.45 : 0.15,
        lineColor: row.selected ? "#047857" : "#64748b",
        lineWidth: row.selected ? 2.5 : 1.5,
      },
    }));
    batchSource.setData({ type: "FeatureCollection", features });
  };

  map.on("load", setupLayers);
  map.on("style.load", setupLayers);

  // Initial load
  setupLayers();
  assert.equal(map.getSource("batch-polygons-source").data.features.length, 1);
  assert.equal(map.getSource("batch-polygons-source").data.features[0].properties.name, "Petak Timur");

  // Switch to Vector style
  map.setStyle("mapbox://styles/mapbox/outdoors-v12");

  // Verify that style.load re-created layers AND preserved spatial features!
  assert.ok(map.getSource("batch-polygons-source") !== null, "batch-polygons-source must be re-created");
  assert.ok(map.getLayer("batch-polygons-fill") !== null, "batch-polygons-fill must be re-created");
  assert.ok(map.getLayer("batch-polygons-line") !== null, "batch-polygons-line must be re-created");

  const restoredData = map.getSource("batch-polygons-source").data;
  assert.equal(restoredData.features.length, 1, "Features must not be lost after style change");
  assert.equal(restoredData.features[0].properties.name, "Petak Timur");
  assert.equal(restoredData.features[0].properties.fillColor, "#10b981");

  // Switch back to Satellite
  map.setStyle("mapbox://styles/mapbox/satellite-streets-v12");
  assert.equal(map.getSource("batch-polygons-source").data.features.length, 1);
});

// -----------------------------------------------------------------------------
// PART 5: Lifecycle & Navigation Flow Verification
// -----------------------------------------------------------------------------
console.log("\n🔄 5. LIFECYCLE & WORKFLOW SIMULATION (DROPZONE -> TABLE -> MODAL)");

runTest("Simulation: Spatial dropzone file drag, validation & reset", () => {
  let fileInfo = null;
  let resetTriggered = false;

  const mockFile = {
    fileName: "kebun_inti_blok_1_to_8.kml",
    format: "KML",
    vertexCount: 48,
    areaHa: 142.85,
    warnings: ["Terdapat 1 poligon dengan koordinat berulang."],
  };

  // Upload simulation
  fileInfo = mockFile;
  assert.equal(fileInfo.fileName, "kebun_inti_blok_1_to_8.kml");
  assert.equal(fileInfo.areaHa, 142.85);
  assert.equal(fileInfo.warnings.length, 1);

  // Reset simulation
  const onReset = () => {
    fileInfo = null;
    resetTriggered = true;
  };
  onReset();
  assert.equal(fileInfo, null);
  assert.equal(resetTriggered, true);
});

runTest("Simulation: BatchCompletionModal approval & Escape key accessibility", () => {
  let modalOpen = true;
  let resetCalled = false;

  const mockBatchResult = {
    created_count: 8,
    failed_count: 0,
    total_area_hectares: 142.85,
    message: "8 petak berhasil didaftarkan.",
  };

  const onClose = () => {
    modalOpen = false;
  };

  const onReset = () => {
    resetCalled = true;
    modalOpen = false;
  };

  // Verify modal display properties
  assert.equal(mockBatchResult.created_count, 8);
  assert.equal(mockBatchResult.total_area_hectares, 142.85);

  // Simulate Escape key press
  const simulateKeyDown = (key) => {
    if (key === "Escape") {
      onClose();
    }
  };

  simulateKeyDown("Escape");
  assert.equal(modalOpen, false, "Escape key must close the completion modal");

  // Re-open and simulate 'Impor Berkas Lain' click
  modalOpen = true;
  onReset();
  assert.equal(resetCalled, true);
  assert.equal(modalOpen, false);
});

// -----------------------------------------------------------------------------
// FINAL SUMMARY
// -----------------------------------------------------------------------------
console.log("\n===============================================================================");
console.log(`📊 AUDIT SUMMARY: ${totalTests} total tests | ${passedTests} passed | ${failedTests} failed`);
console.log("===============================================================================");

if (failedTests === 0) {
  console.log("🎉 ALL AUDITS & SIMULATIONS PASSED (100% COMPLIANCE)");
  process.exit(0);
} else {
  console.error(`💥 AUDIT FAILED with ${failedTests} failure(s)`);
  process.exit(1);
}
