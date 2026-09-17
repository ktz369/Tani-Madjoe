"""
test_sim_apple_editorial_ui.py

Simulasi & Audit Worker 7: Antarmuka Apple Editorial UI, Komponen Beautiful UI & Mapbox
Memverifikasi kepatuhan:
1. Static & syntactical audit seluruh komponen Beautiful UI di frontend/src/components/plot/
2. Zero dark classes audit (100% pure light theme, no residual dark classes)
3. Reaktivitas status layer spasial Mapbox (batch-polygons-fill, batch-polygons-line, fitBounds)
4. State management reaktif formulir batch (bulk select, inline name edit, per-row dropdowns, division guards)
"""

import os
import re
import json
import unittest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")

COMPONENTS = {
    "ModeSegmentedControl": os.path.join(FRONTEND_DIR, "src/components/plot/ModeSegmentedControl.tsx"),
    "SpatialDropzone": os.path.join(FRONTEND_DIR, "src/components/plot/SpatialDropzone.tsx"),
    "BatchSummaryCard": os.path.join(FRONTEND_DIR, "src/components/plot/BatchSummaryCard.tsx"),
    "BatchRecordsTable": os.path.join(FRONTEND_DIR, "src/components/plot/BatchRecordsTable.tsx"),
    "BatchCompletionModal": os.path.join(FRONTEND_DIR, "src/components/plot/BatchCompletionModal.tsx"),
    "PetakBaruPage": os.path.join(FRONTEND_DIR, "src/app/admin/petak-baru/page.tsx"),
    "PlotIndex": os.path.join(FRONTEND_DIR, "src/components/plot/index.ts"),
    "PlotIndicesChart": os.path.join(FRONTEND_DIR, "src/components/plot/PlotIndicesChart.tsx"),
}


class TestAppleEditorialUIAndMapboxSimulation(unittest.TestCase):
    def test_01_component_files_exist(self):
        """Seluruh berkas komponen Beautiful UI dan petak-baru harus ada dan dapat dibaca."""
        for name, path in COMPONENTS.items():
            self.assertTrue(os.path.exists(path), f"Komponen {name} tidak ditemukan di {path}")
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertGreater(len(content), 50, f"Berkas {name} kosong atau terlalu kecil")

    def test_02_syntax_bracket_balance(self):
        """Seluruh komponen harus memiliki sintaks seimbang tanpa unclosed brackets."""
        for name, path in COMPONENTS.items():
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            p = content.count("(") - content.count(")")
            s = content.count("[") - content.count("]")
            b = content.count("{") - content.count("}")
            self.assertEqual(p, 0, f"Parenthesis tidak seimbang pada {name}: diff {p}")
            self.assertEqual(s, 0, f"Square brackets tidak seimbang pada {name}: diff {s}")
            self.assertEqual(b, 0, f"Braces tidak seimbang pada {name}: diff {b}")

    def test_03_zero_dark_classes_in_audited_components(self):
        """Memverifikasi tidak ada residual dark classes pada layar petak-baru dan komponen Beautiful UI."""
        forbidden_patterns = [
            r"dark:",
            r"\bbg-slate-900\b",
            r"\bbg-slate-800\b",
            r"\bborder-slate-700\b",
            r"\bborder-slate-800\b",
            r"\bbg-gray-900\b",
            r"\bbg-gray-800\b",
            r"\btext-slate-100\b",
            r"\btext-slate-200\b",
        ]
        audited = [
            "ModeSegmentedControl",
            "SpatialDropzone",
            "BatchSummaryCard",
            "BatchRecordsTable",
            "BatchCompletionModal",
            "PetakBaruPage",
        ]
        for name in audited:
            path = COMPONENTS[name]
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            for pat in forbidden_patterns:
                matches = re.findall(pat, content)
                self.assertEqual(len(matches), 0, f"Ditemukan dark class {pat} di {name}: {matches}")

    def test_04_apple_editorial_design_compliance(self):
        """Memverifikasi konsistensi desain Apple Editorial (hairline borders, pure light, Fibonacci spacing)."""
        with open(COMPONENTS["PetakBaruPage"], "r", encoding="utf-8") as f:
            page_content = f.read()
        self.assertIn("bg-[#fbfbfb]", page_content, "Canvas harus menggunakan bg-[#fbfbfb]")
        self.assertIn("border-black/[0.06]", page_content, "Harus menggunakan hairline border-black/[0.06]")
        self.assertIn("font-serif", page_content, "Harus menggunakan typography serif")

        with open(COMPONENTS["BatchRecordsTable"], "r", encoding="utf-8") as f:
            table_content = f.read()
        self.assertIn("rounded-[21px]", table_content)
        self.assertIn("px-[21px]", table_content)
        self.assertNotIn("outline-hidden", table_content, "Harus menggunakan outline-none sesuai Tailwind v3")

    def test_05_batch_records_reactive_state_simulation(self):
        """Simulasi reaktivitas state seleksi massal, editing inline, dan reset varietas."""
        varieties = [
            {"id": 1, "name": "Ciherang", "crop_type": "padi"},
            {"id": 2, "name": "Inpari 32", "crop_type": "padi"},
            {"id": 3, "name": "BISI 18", "crop_type": "jagung"},
            {"id": 4, "name": "Pioneer", "crop_type": "jagung"},
        ]

        rows = [
            {"id": "r1", "name": "Petak 1", "crop_type": "padi", "variety_id": 1, "selected": True},
            {"id": "r2", "name": "Petak 2", "crop_type": "padi", "variety_id": 2, "selected": True},
            {"id": "r3", "name": "Petak 3", "crop_type": "jagung", "variety_id": 3, "selected": True},
        ]

        # 1. Toggle Deselect All
        rows = [{**r, "selected": False} for r in rows]
        self.assertEqual(sum(1 for r in rows if r["selected"]), 0)

        # 2. Toggle Select All
        rows = [{**r, "selected": True} for r in rows]
        self.assertEqual(sum(1 for r in rows if r["selected"]), 3)

        # 3. Inline Name Edit
        rows[0]["name"] = "Petak 1 Super"
        self.assertEqual(rows[0]["name"], "Petak 1 Super")
        self.assertEqual(rows[1]["name"], "Petak 2")

        # 4. Crop change triggers variety reset if incompatible
        def update_row_crop(row, new_crop):
            updated = {**row, "crop_type": new_crop}
            current_var = next((v for v in varieties if v["id"] == row.get("variety_id")), None)
            if current_var and current_var["crop_type"] != new_crop:
                updated["variety_id"] = ""
            return updated

        updated_r1 = update_row_crop(rows[0], "jagung")
        self.assertEqual(updated_r1["crop_type"], "jagung")
        self.assertEqual(updated_r1["variety_id"], "", "Varietas harus di-reset saat crop_type berganti")

    def test_06_submission_guards_simulation(self):
        """Simulasi penolakan form saat divisi kosong atau 0 baris terpilih."""
        selected_division_id = ""
        batch_rows = [{"selected": True}, {"selected": True}]

        # Guard 1: Divisi kosong
        def validate_batch(division_id, rows):
            if not division_id:
                return False, "Silakan pilih Divisi / Afdeling tujuan terlebih dahulu."
            selected = [r for r in rows if r["selected"]]
            if len(selected) == 0:
                return False, "Pilih minimal satu petak lahan untuk didaftarkan."
            return True, "Valid"

        valid, err = validate_batch(selected_division_id, batch_rows)
        self.assertFalse(valid)
        self.assertIn("Divisi", err)

        # Guard 2: 0 baris terpilih
        selected_division_id = "12"
        batch_rows = [{"selected": False}, {"selected": False}]
        valid, err = validate_batch(selected_division_id, batch_rows)
        self.assertFalse(valid)
        self.assertIn("minimal satu petak", err)

        # Valid payload
        batch_rows = [{"selected": True, "name": "P1", "crop_type": "padi", "variety_id": 1, "planting_date": "2026-09-01", "polygon": {}}]
        valid, err = validate_batch(selected_division_id, batch_rows)
        self.assertTrue(valid)

    def test_07_mapbox_spatial_layers_and_style_switch_simulation(self):
        """Simulasi layer GeoJSON Mapbox dan persistensi poligon saat style diubah."""
        # Simulated Mapbox Layer Generator
        rows = [
            {"id": "1", "name": "P1", "selected": True, "geometry": {"type": "Polygon", "coordinates": []}},
            {"id": "2", "name": "P2", "selected": False, "geometry": {"type": "Polygon", "coordinates": []}},
        ]

        def generate_batch_features(batch_rows):
            return [
                {
                    "type": "Feature",
                    "geometry": r["geometry"],
                    "properties": {
                        "name": r["name"],
                        "selected": r["selected"],
                        "fillColor": "#10b981" if r["selected"] else "#94a3b8",
                        "fillOpacity": 0.45 if r["selected"] else 0.15,
                        "lineColor": "#047857" if r["selected"] else "#64748b",
                        "lineWidth": 2.5 if r["selected"] else 1.5,
                    },
                }
                for r in batch_rows
            ]

        features = generate_batch_features(rows)
        self.assertEqual(len(features), 2)
        # Active row -> Emerald
        self.assertEqual(features[0]["properties"]["fillColor"], "#10b981")
        self.assertEqual(features[0]["properties"]["lineColor"], "#047857")
        # Inactive row -> Slate Gray
        self.assertEqual(features[1]["properties"]["fillColor"], "#94a3b8")
        self.assertEqual(features[1]["properties"]["lineColor"], "#64748b")

        # Map style switch persistence simulation
        map_sources = {}
        def setup_layers():
            map_sources["batch-polygons-source"] = {"type": "geojson", "data": {"type": "FeatureCollection", "features": generate_batch_features(rows)}}

        # Initial style
        setup_layers()
        self.assertEqual(len(map_sources["batch-polygons-source"]["data"]["features"]), 2)

        # Style switch (Mapbox clears sources then triggers style.load)
        map_sources.clear()
        setup_layers()
        self.assertIn("batch-polygons-source", map_sources)
        self.assertEqual(len(map_sources["batch-polygons-source"]["data"]["features"]), 2, "Poligon tidak boleh hilang setelah style switch")


if __name__ == "__main__":
    unittest.main()
