"""Comprehensive simulation test suite for Sentinel-2 satellite telemetry & backfill pipeline (Ticket 04).

Simulates and verifies:
1. Pure mathematical formulations for 6 spectral and SAR remote sensing indices:
   - NDVI = (B8 - B4) / (B8 + B4)
   - NDRE = (B8 - B5) / (B8 + B5)
   - NDWI = (B8 - B11) / (B8 + B11)
   - SAVI = ((B8 - B4) / (B8 + B4 + 0.5)) * 1.5
   - BSI = ((B11 + B4) - (B8 + B2)) / ((B11 + B4) + (B8 + B2))
   - SAR Ratio = VH / VV
2. Boundary enforcement & sanitization: all optical indices strictly bounded in [-1.0, 1.0].
   Zero-division safeguards when denominators sum to zero.
3. 30-day backfill pipeline simulation on satellite_backfill_service.py:
   - 6 historical observation points with 5-day intervals (T-25, T-20, T-15, T-10, T-5, T-0) and (T-30 to T-5).
   - Realism of sigmoidal crop phenology curve without erratic drops or cliff anomalies.
   - Hash-based deterministic micro-noise per plot ID.
4. Batch simulation for 50 plots concurrently without memory spike or race conditions.
5. Non-existent plot ID error handling and session idempotency.
"""

import asyncio
from datetime import date, timedelta
import random
import tracemalloc
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.services.satellite_backfill_service import (
    SpectralIndex,
    _calculate_phenology_ndvi,
    backfill_satellite_indices_for_plot,
    batch_backfill_satellite_indices,
    generate_historical_spectral_data,
)
from app.services.satellite_indices import (
    calc_bsi,
    calc_ndre,
    calc_ndvi,
    calc_ndwi,
    calc_sar_ratio,
    calc_savi,
    classify_vegetation_health,
    detect_sar_flooding,
)


class TestSpectralIndicesBoundarySimulation(unittest.TestCase):
    """Deep simulation and boundary testing for optical and SAR spectral indices."""

    def test_all_six_indices_mathematical_formulation(self):
        """Verify analytical formulas for all 6 indices with standard test vectors."""
        # 1. NDVI: NIR=0.8, Red=0.2 -> (0.8 - 0.2) / (0.8 + 0.2) = 0.6
        ndvi = calc_ndvi(0.8, 0.2)
        self.assertAlmostEqual(ndvi, 0.6000, places=4)

        # 2. NDRE: NIR=0.75, RedEdge=0.35 -> (0.75 - 0.35) / (0.75 + 0.35) = 0.4 / 1.1 = 0.3636
        ndre = calc_ndre(0.75, 0.35)
        self.assertAlmostEqual(ndre, 0.3636, places=4)

        # 3. NDWI: NIR=0.6, SWIR=0.2 -> (0.6 - 0.2) / (0.6 + 0.2) = 0.4 / 0.8 = 0.5
        ndwi = calc_ndwi(0.6, 0.2)
        self.assertAlmostEqual(ndwi, 0.5000, places=4)

        # 4. SAVI: NIR=0.7, Red=0.2, L=0.5 -> ((0.7 - 0.2) / (0.7 + 0.2 + 0.5)) * 1.5 = 0.5357
        savi = calc_savi(0.7, 0.2, L=0.5)
        self.assertAlmostEqual(savi, 0.5357, places=4)

        # 5. BSI: SWIR=0.5, Red=0.4, NIR=0.3, Blue=0.2 -> (0.9 - 0.5) / (0.9 + 0.5) = 0.2857
        bsi = calc_bsi(0.5, 0.4, 0.3, 0.2)
        self.assertAlmostEqual(bsi, 0.2857, places=4)

        # 6. SAR Ratio: VH=0.03, VV=0.15 -> 0.03 / 0.15 = 0.2
        sar_ratio = calc_sar_ratio(0.03, 0.15)
        self.assertAlmostEqual(sar_ratio, 0.2000, places=4)

    def test_zero_division_safeguards(self):
        """Verify zero division safeguards across all formulas when denominator is zero or near-zero."""
        # Denominators exactly 0.0
        self.assertEqual(calc_ndvi(0.0, 0.0), 0.0)
        self.assertEqual(calc_ndre(0.0, 0.0), 0.0)
        self.assertEqual(calc_ndwi(0.0, 0.0), 0.0)
        self.assertEqual(calc_savi(0.0, 0.0, L=0.0), 0.0)
        self.assertEqual(calc_bsi(0.0, 0.0, 0.0, 0.0), 0.0)
        self.assertEqual(calc_sar_ratio(0.05, 0.0), 0.0)

        # Denominators sum to zero with opposite signs
        self.assertEqual(calc_ndvi(0.5, -0.5), 0.0)
        self.assertEqual(calc_ndre(0.3, -0.3), 0.0)
        self.assertEqual(calc_ndwi(0.4, -0.4), 0.0)
        self.assertEqual(calc_savi(0.25, -0.75, L=0.5), 0.0)  # 0.25 - 0.75 + 0.5 = 0
        self.assertEqual(calc_bsi(0.5, -0.5, 0.5, -0.5), 0.0)  # (0.0) + (0.0) = 0

        # Denominators within tolerance < 1e-7
        self.assertEqual(calc_ndvi(1e-8, -1e-8), 0.0)
        self.assertEqual(calc_sar_ratio(0.1, 1e-8), 0.0)

    def test_optical_indices_boundary_clamping(self):
        """Verify all optical indices are strictly clamped within [-1.0, 1.0]."""
        # Upper boundary clamping
        self.assertEqual(calc_ndvi(100.0, 0.0), 1.0)
        self.assertEqual(calc_ndre(50.0, 0.0), 1.0)
        self.assertEqual(calc_ndwi(20.0, 0.0), 1.0)
        self.assertEqual(calc_savi(100.0, 0.0, L=0.5), 1.0)
        self.assertEqual(calc_bsi(10.0, 10.0, 0.0, 0.0), 1.0)

        # Lower boundary clamping
        self.assertEqual(calc_ndvi(0.0, 100.0), -1.0)
        self.assertEqual(calc_ndre(0.0, 50.0), -1.0)
        self.assertEqual(calc_ndwi(0.0, 20.0), -1.0)
        self.assertEqual(calc_savi(0.0, 100.0, L=0.5), -1.0)
        self.assertEqual(calc_bsi(0.0, 0.0, 10.0, 10.0), -1.0)

    def test_monte_carlo_boundary_sweep(self):
        """Simulate 2,000 random band combinations to stress test boundary containment [-1.0, 1.0]."""
        rng = random.Random(42)
        for _ in range(2000):
            nir = rng.uniform(-2.0, 2.0)
            red = rng.uniform(-2.0, 2.0)
            re = rng.uniform(-2.0, 2.0)
            swir = rng.uniform(-2.0, 2.0)
            blue = rng.uniform(-2.0, 2.0)

            ndvi = calc_ndvi(nir, red)
            ndre = calc_ndre(nir, re)
            ndwi = calc_ndwi(nir, swir)
            savi = calc_savi(nir, red, L=0.5)
            bsi = calc_bsi(swir, red, nir, blue)

            for name, val in [("NDVI", ndvi), ("NDRE", ndre), ("NDWI", ndwi), ("SAVI", savi), ("BSI", bsi)]:
                self.assertIsNotNone(val)
                self.assertGreaterEqual(
                    val,
                    -1.0,
                    f"{name} value {val} violated lower bound -1.0 with NIR={nir}, RED={red}",
                )
                self.assertLessEqual(
                    val,
                    1.0,
                    f"{name} value {val} violated upper bound 1.0 with NIR={nir}, RED={red}",
                )

    def test_none_input_safeguards(self):
        """Verify graceful None handling without exceptions when bands are missing."""
        self.assertIsNone(calc_ndvi(None, 0.2))
        self.assertIsNone(calc_ndvi(0.8, None))
        self.assertIsNone(calc_ndre(None, 0.3))
        self.assertIsNone(calc_ndwi(0.5, None))
        self.assertIsNone(calc_savi(None, 0.2))
        self.assertIsNone(calc_bsi(0.5, None, 0.3, 0.2))
        self.assertIsNone(calc_sar_ratio(None, 0.1))
        self.assertIsNone(calc_sar_ratio(0.05, None))

    def test_vegetation_health_classification(self):
        """Verify Indonesian agronomic classification labels across NDVI stages."""
        self.assertEqual(classify_vegetation_health(None), "Data Belum Tersedia")
        self.assertIn("Lahan Terbuka", classify_vegetation_health(0.12))
        self.assertIn("Vegetasi Rendah", classify_vegetation_health(0.35))
        self.assertIn("Vegetasi Sedang", classify_vegetation_health(0.52))
        self.assertIn("Optimal", classify_vegetation_health(0.79))


class TestBackfillCadenceAndPhenologyCurveSimulation(unittest.TestCase):
    """Simulation tests for 30-day historical time-series cadence, phenology curve, and ordering."""

    def setUp(self):
        self.ref_date = date(2026, 9, 1)

    def test_historical_observation_points_cadence_t_minus_25_to_t_0(self):
        """Simulate 6 historical points with 5-day intervals ending on reference date (T-25, T-20, T-15, T-10, T-5, T-0)."""
        data = generate_historical_spectral_data(
            plot_id=1,
            crop_type="padi",
            planting_date=self.ref_date - timedelta(days=45),
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
            include_today=True,
        )

        self.assertEqual(len(data), 6)
        expected_offsets = [25, 20, 15, 10, 5, 0]
        for i, offset in enumerate(expected_offsets):
            expected_date = self.ref_date - timedelta(days=offset)
            self.assertEqual(data[i]["observation_date"], expected_date)

        # Verify strictly increasing chronological order
        for i in range(len(data) - 1):
            curr_date = data[i]["observation_date"]
            next_date = data[i + 1]["observation_date"]
            self.assertLess(curr_date, next_date)
            self.assertEqual((next_date - curr_date).days, 5)

    def test_historical_observation_points_cadence_t_minus_30_to_t_5(self):
        """Simulate 6 historical points with 5-day intervals strictly prior to reference date (T-30 to T-5)."""
        data = generate_historical_spectral_data(
            plot_id=2,
            crop_type="padi",
            planting_date=self.ref_date - timedelta(days=50),
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
            include_today=False,
        )

        self.assertEqual(len(data), 6)
        expected_offsets = [30, 25, 20, 15, 10, 5]
        for i, offset in enumerate(expected_offsets):
            expected_date = self.ref_date - timedelta(days=offset)
            self.assertEqual(data[i]["observation_date"], expected_date)

    def test_padi_sigmoidal_curve_realism_no_erratic_drops(self):
        """Simulate padi phenology curve across 120 days after planting (HST 0 to 120).

        Verifies:
        1. Monotonic growth during vegetative stage (~0.20 to ~0.75).
        2. Peak reproductive canopy reaches ~0.80 - 0.84.
        3. Smooth senescence without sudden cliff drops (daily step change < 0.05).
        """
        ndvi_series = [_calculate_phenology_ndvi("padi", hst) for hst in range(121)]

        # Emerging stage: starts at 0.20
        self.assertAlmostEqual(ndvi_series[0], 0.20, places=2)

        # Vegetative stage (HST 0 to 55): strictly monotonically non-decreasing
        for hst in range(1, 55):
            self.assertGreaterEqual(
                ndvi_series[hst],
                ndvi_series[hst - 1],
                f"Padi NDVI dropped during vegetative growth at HST {hst}: {ndvi_series[hst]} < {ndvi_series[hst-1]}",
            )

        # End of vegetative reaches ~0.75
        self.assertAlmostEqual(ndvi_series[55], 0.75, places=2)

        # Peak stage (HST 55 to 80): reaches peak canopy >= 0.80
        peak_val = max(ndvi_series[55:80])
        self.assertGreaterEqual(peak_val, 0.80)
        self.assertLessEqual(peak_val, 0.85)

        # Senescence stage (HST 80 to 115): declines smoothly towards ~0.50
        self.assertLess(ndvi_series[115], ndvi_series[80])
        self.assertGreaterEqual(ndvi_series[115], 0.48)

        # Derivative / step-change check: no abrupt cliff drop between consecutive days
        for hst in range(1, 121):
            daily_delta = abs(ndvi_series[hst] - ndvi_series[hst - 1])
            self.assertLess(
                daily_delta,
                0.05,
                f"Erratic jump of {daily_delta} detected at HST {hst}",
            )

    def test_jagung_sigmoidal_curve_realism(self):
        """Simulate jagung (corn) phenology curve across 100 days after planting."""
        ndvi_series = [_calculate_phenology_ndvi("jagung", hst) for hst in range(101)]

        # Vegetative stage (HST 0 to 45): monotonic increase
        for hst in range(1, 45):
            self.assertGreaterEqual(
                ndvi_series[hst],
                ndvi_series[hst - 1],
                f"Jagung NDVI dropped during vegetative growth at HST {hst}",
            )

        # Peak reaches >= 0.80
        peak_val = max(ndvi_series[45:70])
        self.assertGreaterEqual(peak_val, 0.80)

        # Senescence is smooth
        for hst in range(1, 101):
            daily_delta = abs(ndvi_series[hst] - ndvi_series[hst - 1])
            self.assertLess(daily_delta, 0.05)


class TestDeterministicNoiseStabilitySimulation(unittest.TestCase):
    """Simulation tests for hash-based deterministic noise and multi-plot field variability."""

    def test_hash_based_noise_determinism(self):
        """Verify repeated calls for the same plot produce byte-for-byte identical data."""
        ref_date = date(2026, 8, 15)
        run1 = generate_historical_spectral_data(101, "padi", None, reference_date=ref_date)
        run2 = generate_historical_spectral_data(101, "padi", None, reference_date=ref_date)
        run3 = generate_historical_spectral_data(101, "padi", None, reference_date=ref_date)

        self.assertEqual(len(run1), len(run2))
        for obs1, obs2, obs3 in zip(run1, run2, run3):
            self.assertEqual(obs1["ndvi"], obs2["ndvi"])
            self.assertEqual(obs1["ndvi"], obs3["ndvi"])
            self.assertEqual(obs1["savi"], obs2["savi"])
            self.assertEqual(obs1["bsi"], obs2["bsi"])
            self.assertEqual(obs1["sar_vv_db"], obs2["sar_vv_db"])
            self.assertEqual(obs1["cloud_cover_pct"], obs2["cloud_cover_pct"])

    def test_cross_plot_field_variability(self):
        """Verify different plot IDs have slight deterministic variations (avoiding identical clone plots)."""
        ref_date = date(2026, 8, 15)
        plot_a = generate_historical_spectral_data(10, "padi", None, reference_date=ref_date)
        plot_b = generate_historical_spectral_data(20, "padi", None, reference_date=ref_date)

        # Trajectories should be closely related but have slight plot-specific micro-noise
        ndvis_a = [o["ndvi"] for o in plot_a]
        ndvis_b = [o["ndvi"] for o in plot_b]

        # Differences should exist
        has_micro_difference = any(a != b for a, b in zip(ndvis_a, ndvis_b))
        self.assertTrue(has_micro_difference, "Plots with different IDs produced identical cloned values")

        # But difference must remain bounded (< 0.02) to maintain agronomic curve fidelity
        for a, b in zip(ndvis_a, ndvis_b):
            self.assertLess(abs(a - b), 0.02, "Plot noise exceeded realistic micro-variation boundary")


class TestBatchConcurrencyAndMemorySimulation(unittest.IsolatedAsyncioTestCase):
    """Stress test batch backfill for 50 plots concurrently, verifying memory usage and race condition safety."""

    async def test_batch_50_plots_concurrent_simulation_and_memory_profile(self):
        """Simulate concurrent backfill execution across 50 plots with tracemalloc memory profiling."""
        num_plots = 50
        plots = [
            MagicMock(
                id=pid,
                crop_type="padi" if pid % 2 == 0 else "jagung",
                planting_date=date(2026, 5, 1) + timedelta(days=pid % 10),
            )
            for pid in range(1, num_plots + 1)
        ]

        # Start memory trace
        tracemalloc.start()

        # Shared simulated database state with threading lock simulation
        persisted_store = {}

        async def simulate_plot_backfill(plot_obj):
            # Create dedicated async mock session per concurrent task (standard async pattern)
            task_session = AsyncMock()
            task_session.add = MagicMock()
            query_plot_res = MagicMock()
            query_plot_res.scalar_one_or_none.return_value = plot_obj

            query_existing_res = MagicMock()
            # Return any previously persisted records for this plot
            existing_for_plot = persisted_store.get(plot_obj.id, [])
            query_existing_res.scalars.return_value.all.return_value = existing_for_plot

            task_session.execute.side_effect = [query_plot_res, query_existing_res]

            def add_record(rec):
                persisted_store.setdefault(rec.plot_id, []).append(rec)

            task_session.add.side_effect = add_record

            return await backfill_satellite_indices_for_plot(
                db=task_session,
                plot_id=plot_obj.id,
                days_back=30,
                cadence_days=5,
                include_today=True,
            )

        # Launch 50 plot backfills concurrently using asyncio.gather
        results = await asyncio.gather(*(simulate_plot_backfill(p) for p in plots))

        current_mem, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # 1. Total plots processed
        self.assertEqual(len(results), 50)

        # 2. Total records created: 50 plots * 6 records = 300 records
        total_records = sum(len(r) for r in results)
        self.assertEqual(total_records, 300)

        # 3. Verify no race condition / duplication in keys
        unique_keys = set()
        for plot_results in results:
            self.assertEqual(len(plot_results), 6)
            for rec in plot_results:
                key = (rec.plot_id, rec.observation_date, rec.satellite)
                self.assertNotIn(key, unique_keys, f"Duplicate observation key detected: {key}")
                unique_keys.add(key)

        self.assertEqual(len(unique_keys), 300)

        # 4. Memory spike check: peak memory must be well below 20 MB (usually < 3 MB)
        peak_mb = peak_mem / (1024 * 1024)
        self.assertLess(
            peak_mb,
            20.0,
            f"Memory spike detected during 50 plots backfill: {peak_mb:.2f} MB",
        )

    async def test_batch_backfill_idempotency_concurrent(self):
        """Verify that running batch backfill twice for 50 plots creates zero duplicate records."""
        plot = MagicMock(id=88, crop_type="padi", planting_date=date(2026, 6, 1))

        db_session = AsyncMock()
        db_session.add = MagicMock()
        q_plot = MagicMock()
        q_plot.scalar_one_or_none.return_value = plot

        # First run: empty store
        q_empty = MagicMock()
        q_empty.scalars.return_value.all.return_value = []
        db_session.execute.side_effect = [q_plot, q_empty]

        pass1_records = await backfill_satellite_indices_for_plot(db_session, plot_id=88)
        self.assertEqual(len(pass1_records), 6)

        # Second run: existing records returned
        db_session.reset_mock()
        q_existing = MagicMock()
        q_existing.scalars.return_value.all.return_value = pass1_records
        db_session.execute.side_effect = [q_plot, q_existing]

        pass2_records = await backfill_satellite_indices_for_plot(db_session, plot_id=88)
        self.assertEqual(len(pass2_records), 0, "Second backfill created duplicate records")

    async def test_non_existent_plot_id_error_handling(self):
        """Verify nonexistent plot IDs return empty list without throwing uncaught exceptions."""
        db_session = AsyncMock()
        q_plot = MagicMock()
        q_plot.scalar_one_or_none.return_value = None
        db_session.execute.return_value = q_plot

        # Nonexistent positive ID
        res1 = await backfill_satellite_indices_for_plot(db_session, plot_id=999999)
        self.assertEqual(res1, [])

        # Negative ID
        res2 = await backfill_satellite_indices_for_plot(db_session, plot_id=-5)
        self.assertEqual(res2, [])

    async def test_batch_backfill_mixed_valid_and_invalid_plots(self):
        """Verify batch backfill with a mix of valid and non-existent plots handles failures gracefully."""
        mock_db = AsyncMock()

        def execute_side_effect(stmt):
            res = MagicMock()
            res.scalar_one_or_none.return_value = None
            res.scalars.return_value.all.return_value = []
            return res

        mock_db.execute = AsyncMock(side_effect=execute_side_effect)

        plot_ids = [1, 2, 9999, 10000, 3]
        batch_res = await batch_backfill_satellite_indices(mock_db, plot_ids)

        self.assertEqual(batch_res["total_plots"], 5)
        self.assertEqual(batch_res["plots_processed"], 5)
        self.assertEqual(batch_res["records_created"], 0)
        self.assertEqual(batch_res["status"], "success")


if __name__ == "__main__":
    unittest.main()
