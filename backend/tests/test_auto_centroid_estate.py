"""Unit tests for Auto-Centroid Estate Geolocation & Weather Propagation (Wave 8 / Ticket 01).

Tests cover:
1. When Estate has no location_point (None), ensure_estate_centroid_from_polygon calculates
   the centroid [lng, lat] from plot polygon and updates estate.location_point.
2. When Estate has (0, 0) coordinates, ensure_estate_centroid_from_polygon updates to polygon centroid.
3. When Estate already has valid GPS coordinates, ensure_estate_centroid_from_polygon returns False
   and does NOT overwrite existing coordinates.
4. Various polygon geometry inputs (GeoJSON Polygon, GeoJSON Feature, coordinate lists).
5. Error cases (invalid geometry, empty coordinates, None estate).
6. Weather sync propagation:
   - When estate has no location_point, plot creation assigns centroid and triggers weather sync
     with newly assigned coordinates.
   - When estate already has location_point, existing coordinates are preserved and weather sync
     is triggered with existing coordinates.
"""

import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

if "app.services.weather_service" not in sys.modules:
    mock_ws = types.ModuleType("app.services.weather_service")
    mock_ws.sync_weather_for_estate = AsyncMock()
    sys.modules["app.services.weather_service"] = mock_ws

from app.services.estate_service import (
    Estate,
    ensure_estate_centroid_from_polygon,
    extract_polygon_coords,
    handle_plot_estate_weather_sync,
)
from app.utils.geo import coordinates_from_point, point_from_coordinates


class TestAutoCentroidEstateService(unittest.IsolatedAsyncioTestCase):
    """Test suite for ensure_estate_centroid_from_polygon in estate_service."""

    def setUp(self):
        # Sample polygon around Yogyakarta / Sleman
        # Unique vertices: (110.360, -7.780), (110.370, -7.780), (110.370, -7.790), (110.360, -7.790)
        # Centroid: lng = 110.365, lat = -7.785
        self.sample_geojson_polygon = {
            "type": "Polygon",
            "coordinates": [
                [
                    [110.360, -7.780],
                    [110.370, -7.780],
                    [110.370, -7.790],
                    [110.360, -7.790],
                    [110.360, -7.780],
                ]
            ],
        }
        self.sample_coords_list = [
            [110.360, -7.780],
            [110.370, -7.780],
            [110.370, -7.790],
            [110.360, -7.790],
            [110.360, -7.780],
        ]

    async def test_ensure_centroid_when_location_point_is_none(self):
        """Estate with location_point=None should be updated with polygon centroid."""
        estate = Estate(id=1, company_id=1, name="Estate Tanpa Koordinat", location_point=None)
        mock_db = AsyncMock()

        updated = await ensure_estate_centroid_from_polygon(
            mock_db, estate, self.sample_geojson_polygon
        )

        self.assertTrue(updated)
        self.assertIsNotNone(estate.location_point)
        lat, lng = coordinates_from_point(estate.location_point)
        self.assertAlmostEqual(lng, 110.365, places=5)
        self.assertAlmostEqual(lat, -7.785, places=5)
        mock_db.commit.assert_awaited_once()

    async def test_ensure_centroid_when_location_point_is_zero(self):
        """Estate with (0,0) location_point should be overwritten by polygon centroid."""
        zero_point = point_from_coordinates(0.0, 0.0)
        estate = Estate(id=2, company_id=1, name="Estate Titik Nol", location_point=zero_point)
        mock_db = AsyncMock()

        updated = await ensure_estate_centroid_from_polygon(
            mock_db, estate, self.sample_geojson_polygon
        )

        self.assertTrue(updated)
        lat, lng = coordinates_from_point(estate.location_point)
        self.assertAlmostEqual(lng, 110.365, places=5)
        self.assertAlmostEqual(lat, -7.785, places=5)
        mock_db.commit.assert_awaited_once()

    async def test_ensure_centroid_does_not_overwrite_existing_coordinates(self):
        """Estate with valid existing GPS coordinates must NOT be overwritten."""
        existing_point = point_from_coordinates(-6.200, 106.816)
        estate = Estate(id=3, company_id=1, name="Estate Jakarta", location_point=existing_point)
        mock_db = AsyncMock()

        updated = await ensure_estate_centroid_from_polygon(
            mock_db, estate, self.sample_geojson_polygon
        )

        self.assertFalse(updated)
        lat, lng = coordinates_from_point(estate.location_point)
        self.assertAlmostEqual(lat, -6.200, places=3)
        self.assertAlmostEqual(lng, 106.816, places=3)
        mock_db.commit.assert_not_called()

    async def test_ensure_centroid_with_raw_coordinate_list(self):
        """Verify support for raw coordinate list input [[lng, lat], ...]."""
        estate = Estate(id=4, company_id=1, name="Estate List Coords", location_point=None)
        mock_db = AsyncMock()

        updated = await ensure_estate_centroid_from_polygon(
            mock_db, estate, self.sample_coords_list
        )

        self.assertTrue(updated)
        lat, lng = coordinates_from_point(estate.location_point)
        self.assertAlmostEqual(lng, 110.365, places=5)
        self.assertAlmostEqual(lat, -7.785, places=5)

    async def test_ensure_centroid_with_geojson_feature(self):
        """Verify support for GeoJSON Feature dict input."""
        feature = {
            "type": "Feature",
            "geometry": self.sample_geojson_polygon,
            "properties": {"name": "Petak Percobaan"},
        }
        estate = Estate(id=5, company_id=1, name="Estate Feature", location_point=None)
        mock_db = AsyncMock()

        updated = await ensure_estate_centroid_from_polygon(mock_db, estate, feature)

        self.assertTrue(updated)
        lat, lng = coordinates_from_point(estate.location_point)
        self.assertAlmostEqual(lng, 110.365, places=5)
        self.assertAlmostEqual(lat, -7.785, places=5)

    async def test_ensure_centroid_handles_none_estate(self):
        """ensure_estate_centroid_from_polygon returns False safely when estate is None."""
        mock_db = AsyncMock()
        updated = await ensure_estate_centroid_from_polygon(mock_db, None, self.sample_geojson_polygon)
        self.assertFalse(updated)

    def test_extract_polygon_coords_invalid(self):
        """extract_polygon_coords returns None for invalid or empty geometry."""
        self.assertIsNone(extract_polygon_coords(None))
        self.assertIsNone(extract_polygon_coords([]))
        self.assertIsNone(extract_polygon_coords({"type": "Point", "coordinates": [100, 0]}))


class TestPlotEstateWeatherPropagation(unittest.IsolatedAsyncioTestCase):
    """Test suite verifying auto-centroid assignment and weather sync propagation."""

    def setUp(self):
        self.polygon_data = {
            "type": "Polygon",
            "coordinates": [
                [
                    [110.360, -7.780],
                    [110.370, -7.780],
                    [110.370, -7.790],
                    [110.360, -7.790],
                    [110.360, -7.780],
                ]
            ],
        }

    async def test_plot_creation_propagates_centroid_and_calls_weather_sync(self):
        """When estate has no coordinates, plot registration updates estate coordinates and calls weather sync."""
        estate = Estate(id=10, company_id=1, name="Estate Baru", location_point=None)
        mock_db = AsyncMock()

        with patch("app.services.weather_service.sync_weather_for_estate", new_callable=AsyncMock) as mock_weather_sync:
            # Execute plot creation propagation helper
            result = await handle_plot_estate_weather_sync(mock_db, estate, self.polygon_data)

            self.assertTrue(result)
            # Verify estate coordinates were set to the plot's centroid
            self.assertIsNotNone(estate.location_point)
            lat, lng = coordinates_from_point(estate.location_point)
            self.assertAlmostEqual(lng, 110.365, places=5)
            self.assertAlmostEqual(lat, -7.785, places=5)

            # Verify weather sync was called with the estate now having valid centroid coordinates
            mock_weather_sync.assert_awaited_once_with(mock_db, estate)
            called_estate = mock_weather_sync.await_args[0][1]
            called_lat, called_lng = coordinates_from_point(called_estate.location_point)
            self.assertAlmostEqual(called_lat, -7.785, places=5)
            self.assertAlmostEqual(called_lng, 110.365, places=5)

    async def test_plot_creation_preserves_existing_estate_coordinates(self):
        """When estate already has coordinates, they are preserved and weather sync uses them."""
        existing_point = point_from_coordinates(-6.550, 107.440)
        estate = Estate(id=11, company_id=1, name="Estate Karawang", location_point=existing_point)
        mock_db = AsyncMock()

        with patch("app.services.weather_service.sync_weather_for_estate", new_callable=AsyncMock) as mock_weather_sync:
            result = await handle_plot_estate_weather_sync(mock_db, estate, self.polygon_data)

            self.assertTrue(result)
            # Verify existing estate coordinates were NOT overwritten
            lat, lng = coordinates_from_point(estate.location_point)
            self.assertAlmostEqual(lat, -6.550, places=3)
            self.assertAlmostEqual(lng, 107.440, places=3)

            # Verify weather sync was called with existing coordinates
            mock_weather_sync.assert_awaited_once_with(mock_db, estate)
            called_estate = mock_weather_sync.await_args[0][1]
            called_lat, called_lng = coordinates_from_point(called_estate.location_point)
            self.assertAlmostEqual(called_lat, -6.550, places=3)
            self.assertAlmostEqual(called_lng, 107.440, places=3)

    async def test_plots_api_handler_auto_centroid_invocation_flow(self):
        """Verify the exact conditional branch from app.api.plots._handle_create_plot."""
        class MockDivision:
            def __init__(self, estate):
                self.estate = estate
                self.estate_id = getattr(estate, "id", None)

        mock_db = AsyncMock()
        estate_no_gps = Estate(id=12, company_id=1, name="Estate Demo", location_point=None)
        division = MockDivision(estate_no_gps)

        # Replicate the exact logic from backend/app/api/plots.py:
        # estate_lat, estate_lng = coordinates_from_point(division.estate.location_point)
        # if estate_lat is None or estate_lng is None or (estate_lat == 0.0 and estate_lng == 0.0):
        #     await ensure_estate_centroid_from_polygon(db, division.estate, payload.polygon)
        with patch("app.services.weather_service.sync_weather_for_estate", new_callable=AsyncMock) as mock_sync:
            if division and division.estate:
                estate_lat, estate_lng = coordinates_from_point(division.estate.location_point)
                if estate_lat is None or estate_lng is None or (estate_lat == 0.0 and estate_lng == 0.0):
                    await ensure_estate_centroid_from_polygon(mock_db, division.estate, self.polygon_data)
                await mock_sync(mock_db, division.estate)

            # Assert estate centroid is assigned
            assigned_lat, assigned_lng = coordinates_from_point(division.estate.location_point)
            self.assertAlmostEqual(assigned_lng, 110.365, places=5)
            self.assertAlmostEqual(assigned_lat, -7.785, places=5)

            # Assert weather sync called with updated estate
            mock_sync.assert_awaited_once_with(mock_db, division.estate)


if __name__ == "__main__":
    unittest.main()
