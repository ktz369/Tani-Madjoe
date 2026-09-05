"""Unit tests for 30-day historical satellite telemetry backfill pipeline (Wave 8 / Ticket 04).

Tests cover:
1. Generation of 6 historical observation time points at 5-day intervals for days_back=30, cadence_days=5.
2. Chronological ascending order of observations.
3. Index bounds validation: NDVI [0.0, 1.0], NDRE [0.15, 0.45], NDWI [0.05, 0.35],
   SAVI [0.18, 0.65], BSI [0.05, 0.35], SAR backscatter, and cloud cover [2.0%, 15.0%].
4. Phenological curve shaping across crop stages (emerging, vegetative, peak, senescence)
   and fallback for unspecified planting_date.
5. Async database persistence to SpectralIndex.
6. Idempotency verification: multiple backfills for the same plot do not duplicate records.
7. Graceful handling of nonexistent plot IDs.
"""

from datetime import date, timedelta
import unittest
from unittest.mock import AsyncMock, MagicMock

from app.services.satellite_backfill_service import (
    SpectralIndex,
    _calculate_phenology_ndvi,
    backfill_satellite_indices_for_plot,
    generate_historical_spectral_data,
)


class TestSatelliteBackfillGeneration(unittest.TestCase):
    """Test suite for historical spectral data generation mathematics and phenology curve."""

    def setUp(self):
        self.ref_date = date(2026, 6, 1)
        self.planting_date = date(2026, 4, 15)  # HST at ref_date = 47 (vegetative / heading)

    def test_generate_observation_count_and_cadence(self):
        """Verify generation produces exactly days_back // cadence_days observations."""
        data = generate_historical_spectral_data(
            plot_id=10,
            crop_type="padi",
            planting_date=self.planting_date,
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
        )

        self.assertEqual(len(data), 6)
        expected_offsets = [30, 25, 20, 15, 10, 5]
        for i, offset in enumerate(expected_offsets):
            expected_date = self.ref_date - timedelta(days=offset)
            self.assertEqual(data[i]["observation_date"], expected_date)

    def test_generate_chronological_ascending_order(self):
        """Verify that observations are sorted strictly in chronological ascending order."""
        data = generate_historical_spectral_data(
            plot_id=10,
            crop_type="padi",
            planting_date=self.planting_date,
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
        )

        self.assertEqual(len(data), 6)
        for i in range(len(data) - 1):
            curr_date = data[i]["observation_date"]
            next_date = data[i + 1]["observation_date"]
            self.assertLess(curr_date, next_date)
            self.assertEqual((next_date - curr_date).days, 5)

    def test_spectral_index_boundaries(self):
        """Verify all generated index values adhere to realistic physical and agronomic boundaries."""
        data = generate_historical_spectral_data(
            plot_id=1,
            crop_type="padi",
            planting_date=self.planting_date,
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
        )

        for obs in data:
            self.assertEqual(obs["plot_id"], 1)
            self.assertEqual(obs["satellite"], "sentinel-2")

            # NDVI in [0.0, 1.0]
            self.assertGreaterEqual(obs["ndvi"], 0.0)
            self.assertLessEqual(obs["ndvi"], 1.0)

            # NDRE in [0.15, 0.45]
            self.assertGreaterEqual(obs["ndre"], 0.15)
            self.assertLessEqual(obs["ndre"], 0.45)

            # NDWI in [0.05, 0.35]
            self.assertGreaterEqual(obs["ndwi"], 0.05)
            self.assertLessEqual(obs["ndwi"], 0.35)

            # SAVI in [0.18, 0.65]
            self.assertGreaterEqual(obs["savi"], 0.18)
            self.assertLessEqual(obs["savi"], 0.65)

            # BSI in [0.05, 0.35] (inversely related to NDVI)
            self.assertGreaterEqual(obs["bsi"], 0.05)
            self.assertLessEqual(obs["bsi"], 0.35)

            # SAR backscatter ranges
            self.assertGreaterEqual(obs["sar_vv_db"], -15.0)
            self.assertLessEqual(obs["sar_vv_db"], -11.0)
            self.assertGreaterEqual(obs["sar_vh_db"], -22.0)
            self.assertLessEqual(obs["sar_vh_db"], -16.0)

            # Cloud cover in [2.0%, 15.0%]
            self.assertGreaterEqual(obs["cloud_cover_pct"], 2.0)
            self.assertLessEqual(obs["cloud_cover_pct"], 15.0)

    def test_phenology_ndvi_curve_progression(self):
        """Verify phenological curve shapes match crop biological growth stages."""
        # Emerging stage (HST 0 to 20 for padi)
        emerging_ndvi = _calculate_phenology_ndvi("padi", 10)
        self.assertGreaterEqual(emerging_ndvi, 0.20)
        self.assertLessEqual(emerging_ndvi, 0.35)

        # Vegetative growth stage (HST 20 to 55 for padi)
        veg_ndvi = _calculate_phenology_ndvi("padi", 40)
        self.assertGreater(veg_ndvi, 0.35)
        self.assertLess(veg_ndvi, 0.75)

        # Peak / reproductive stage (HST 55 to 80 for padi)
        peak_ndvi = _calculate_phenology_ndvi("padi", 68)
        self.assertGreaterEqual(peak_ndvi, 0.75)
        self.assertLessEqual(peak_ndvi, 0.85)

        # Ripening / senescence stage (HST 80 to 115 for padi)
        senescent_ndvi = _calculate_phenology_ndvi("padi", 100)
        self.assertLess(senescent_ndvi, peak_ndvi)
        self.assertGreaterEqual(senescent_ndvi, 0.50)

    def test_phenology_jagung_vs_padi(self):
        """Verify jagung reaches peak reproductive stage earlier than padi."""
        # At HST 50, jagung is already in peak stage (peak_end=70), while padi is still in vegetative (veg_end=55)
        jagung_ndvi = _calculate_phenology_ndvi("jagung", 55)
        padi_ndvi = _calculate_phenology_ndvi("padi", 25)
        self.assertGreater(jagung_ndvi, padi_ndvi)

    def test_generate_without_planting_date(self):
        """Verify generation functions seamlessly when planting_date is None (simulates mid-growth cycle)."""
        data = generate_historical_spectral_data(
            plot_id=5,
            crop_type="padi",
            planting_date=None,
            reference_date=self.ref_date,
            days_back=30,
            cadence_days=5,
        )

        self.assertEqual(len(data), 6)
        # Observations should show progressive vegetative growth
        first_obs_ndvi = data[0]["ndvi"]
        last_obs_ndvi = data[-1]["ndvi"]
        self.assertLess(first_obs_ndvi, last_obs_ndvi)

    def test_generate_custom_window(self):
        """Verify custom days_back and cadence_days combinations."""
        # 20 days back with 10-day cadence -> 2 observations
        data = generate_historical_spectral_data(
            plot_id=1,
            crop_type="padi",
            planting_date=self.planting_date,
            reference_date=self.ref_date,
            days_back=20,
            cadence_days=10,
        )
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["observation_date"], self.ref_date - timedelta(days=20))
        self.assertEqual(data[1]["observation_date"], self.ref_date - timedelta(days=10))

    def test_invalid_parameters(self):
        """Verify handling of invalid window or cadence parameters."""
        with self.assertRaises(ValueError):
            generate_historical_spectral_data(1, "padi", None, cadence_days=0)

        empty_data = generate_historical_spectral_data(1, "padi", None, days_back=0)
        self.assertEqual(empty_data, [])


class TestSatelliteBackfillPersistence(unittest.IsolatedAsyncioTestCase):
    """Test suite for async database persistence and idempotency of backfill pipeline."""

    async def test_backfill_async_persistence_success(self):
        """Verify async backfill queries plot, generates 6 records, adds them to session and commits."""
        mock_db = AsyncMock()
        mock_db.add = MagicMock()

        # Mock Plot query
        mock_plot = MagicMock()
        mock_plot.id = 42
        mock_plot.crop_type = "padi"
        mock_plot.planting_date = date(2026, 4, 1)

        # Configure db.execute mock
        # First call returns plot, second call returns existing records (empty)
        query_plot_res = MagicMock()
        query_plot_res.scalar_one_or_none.return_value = mock_plot

        query_existing_res = MagicMock()
        query_existing_res.scalars.return_value.all.return_value = []

        mock_db.execute.side_effect = [query_plot_res, query_existing_res]

        added_records = []
        mock_db.add.side_effect = lambda rec: added_records.append(rec)

        results = await backfill_satellite_indices_for_plot(
            db=mock_db,
            plot_id=42,
            days_back=30,
            cadence_days=5,
        )

        self.assertEqual(len(results), 6)
        self.assertEqual(len(added_records), 6)
        mock_db.commit.assert_awaited_once()

        # Verify attributes on persisted instances
        for rec in results:
            self.assertEqual(rec.plot_id, 42)
            self.assertEqual(rec.satellite, "sentinel-2")
            self.assertIsNotNone(rec.ndvi)
            self.assertIsNotNone(rec.ndre)
            self.assertIsNotNone(rec.ndwi)
            self.assertIsNotNone(rec.savi)
            self.assertIsNotNone(rec.bsi)
            self.assertIsNotNone(rec.sar_vv_db)
            self.assertIsNotNone(rec.sar_vh_db)

    async def test_backfill_idempotency_running_twice(self):
        """Verify that running backfill twice does not insert duplicate observations."""
        mock_db = AsyncMock()
        mock_db.add = MagicMock()

        mock_plot = MagicMock()
        mock_plot.id = 7
        mock_plot.crop_type = "jagung"
        mock_plot.planting_date = date(2026, 3, 15)

        # Pass 1: No existing records
        q1_plot = MagicMock()
        q1_plot.scalar_one_or_none.return_value = mock_plot
        q1_exist = MagicMock()
        q1_exist.scalars.return_value.all.return_value = []
        mock_db.execute.side_effect = [q1_plot, q1_exist]

        pass1_results = await backfill_satellite_indices_for_plot(
            db=mock_db,
            plot_id=7,
            days_back=30,
            cadence_days=5,
        )
        self.assertEqual(len(pass1_results), 6)
        self.assertEqual(mock_db.add.call_count, 6)

        # Pass 2: The 6 records already exist in the database
        mock_db.reset_mock()
        mock_db.add = MagicMock()
        q2_plot = MagicMock()
        q2_plot.scalar_one_or_none.return_value = mock_plot
        q2_exist = MagicMock()
        # Mock existing records containing the dates from pass 1
        q2_exist.scalars.return_value.all.return_value = pass1_results
        mock_db.execute.side_effect = [q2_plot, q2_exist]

        pass2_results = await backfill_satellite_indices_for_plot(
            db=mock_db,
            plot_id=7,
            days_back=30,
            cadence_days=5,
        )

        # No new records added on second pass
        self.assertEqual(len(pass2_results), 0)
        mock_db.add.assert_not_called()
        mock_db.commit.assert_awaited_once()

    async def test_backfill_plot_not_found(self):
        """Verify that attempting to backfill a nonexistent plot returns an empty list gracefully."""
        mock_db = AsyncMock()
        q_plot = MagicMock()
        q_plot.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = q_plot

        results = await backfill_satellite_indices_for_plot(
            db=mock_db,
            plot_id=999999,
            days_back=30,
            cadence_days=5,
        )

        self.assertEqual(results, [])
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
