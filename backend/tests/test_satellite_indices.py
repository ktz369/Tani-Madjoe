"""Unit tests for satellite spectral indices and SAR backscatter calculations.

Verifies pure Python implementations of NDVI, NDRE, NDWI, SAVI, BSI, and SAR flood detection
against analytical equations and known reference test vectors.
"""

import unittest
from app.services.satellite_indices import (
    calc_bsi,
    calc_ndre,
    calc_ndvi,
    calc_ndwi,
    calc_savi,
    classify_vegetation_health,
    detect_sar_flooding,
)


class TestSatelliteIndices(unittest.TestCase):
    """Test suite for optical spectral indices and SAR waterlogging detection."""

    def test_calc_ndvi_normal(self):
        """Test NDVI calculation for healthy vegetation and water."""
        # Dense vegetation: NIR=0.8, Red=0.2 -> (0.8 - 0.2)/(0.8 + 0.2) = 0.6
        self.assertEqual(calc_ndvi(0.8, 0.2), 0.6)

        # High vigor: NIR=0.8, Red=0.1 -> 0.7 / 0.9 = 0.7778
        self.assertEqual(calc_ndvi(0.8, 0.1), 0.7778)

        # Open water / non-vegetation: NIR=0.1, Red=0.2 -> -0.1 / 0.3 = -0.3333
        self.assertEqual(calc_ndvi(0.1, 0.2), -0.3333)

    def test_calc_ndvi_edge_cases(self):
        """Test NDVI edge conditions such as zero denominator and None."""
        self.assertEqual(calc_ndvi(0.0, 0.0), 0.0)
        self.assertIsNone(calc_ndvi(None, 0.2))
        self.assertIsNone(calc_ndvi(0.8, None))
        self.assertIsNone(calc_ndvi(None, None))

    def test_calc_ndre(self):
        """Test Normalized Difference Red Edge index for canopy chlorophyll."""
        # NIR=0.8, RedEdge=0.3 -> 0.5 / 1.1 = 0.4545
        self.assertEqual(calc_ndre(0.8, 0.3), 0.4545)
        # Identical reflectance
        self.assertEqual(calc_ndre(0.5, 0.5), 0.0)
        # Edge cases
        self.assertEqual(calc_ndre(0.0, 0.0), 0.0)
        self.assertIsNone(calc_ndre(None, 0.3))

    def test_calc_ndwi(self):
        """Test NDWI (Gao) moisture index."""
        # Hydrated canopy: NIR=0.6, SWIR=0.2 -> 0.4 / 0.8 = 0.5
        self.assertEqual(calc_ndwi(0.6, 0.2), 0.5)

        # Moisture stressed: NIR=0.3, SWIR=0.4 -> -0.1 / 0.7 = -0.1429
        self.assertEqual(calc_ndwi(0.3, 0.4), -0.1429)

        # Edge cases
        self.assertEqual(calc_ndwi(0.0, 0.0), 0.0)
        self.assertIsNone(calc_ndwi(None, 0.2))

    def test_calc_savi(self):
        """Test Soil Adjusted Vegetation Index with default L=0.5 and custom L."""
        # NIR=0.7, Red=0.2, L=0.5 -> ((0.7 - 0.2) / (0.7 + 0.2 + 0.5)) * 1.5 = (0.5 / 1.4) * 1.5 = 0.5357
        self.assertEqual(calc_savi(0.7, 0.2, L=0.5), 0.5357)

        # Custom L=1.0: ((0.7 - 0.2) / (0.7 + 0.2 + 1.0)) * 2.0 = (0.5 / 1.9) * 2.0 = 0.5263
        self.assertEqual(calc_savi(0.7, 0.2, L=1.0), 0.5263)

        # Edge cases
        self.assertIsNone(calc_savi(None, 0.2))
        self.assertEqual(calc_savi(0.0, 0.0, L=0.0), 0.0)

    def test_calc_bsi(self):
        """Test Bare Soil Index for exposed land vs vegetative cover."""
        # Exposed bare soil: SWIR=0.5, Red=0.4, NIR=0.3, Blue=0.2
        # num = (0.5 + 0.4) - (0.3 + 0.2) = 0.4
        # den = (0.5 + 0.4) + (0.3 + 0.2) = 1.4
        # 0.4 / 1.4 = 0.2857
        self.assertEqual(calc_bsi(0.5, 0.4, 0.3, 0.2), 0.2857)

        # Dense vegetation: SWIR=0.2, Red=0.1, NIR=0.7, Blue=0.1 -> -0.5 / 1.1 = -0.4545
        self.assertEqual(calc_bsi(0.2, 0.1, 0.7, 0.1), -0.4545)

        # Edge cases
        self.assertEqual(calc_bsi(0.0, 0.0, 0.0, 0.0), 0.0)
        self.assertIsNone(calc_bsi(0.5, None, 0.3, 0.2))

    def test_detect_sar_flooding(self):
        """Test SAR flood/waterlogging detection thresholds (VV < -15 dB or VH < -22 dB)."""
        # Normal dry/moist vegetation
        self.assertFalse(detect_sar_flooding(-12.0, -18.0))
        self.assertFalse(detect_sar_flooding(-15.0, -22.0))

        # Flooding detected via VV backscatter drop
        self.assertTrue(detect_sar_flooding(-16.5, -19.0))

        # Flooding detected via VH backscatter drop
        self.assertTrue(detect_sar_flooding(-14.0, -23.0))

        # Flooding detected via both
        self.assertTrue(detect_sar_flooding(-19.0, -25.0))

        # None handling
        self.assertTrue(detect_sar_flooding(None, -23.5))
        self.assertTrue(detect_sar_flooding(-17.0, None))
        self.assertFalse(detect_sar_flooding(None, None))

    def test_classify_vegetation_health(self):
        """Test Indonesian classification labels for NDVI values."""
        self.assertIn("Belum Tersedia", classify_vegetation_health(None))
        self.assertIn("Lahan Terbuka", classify_vegetation_health(0.15))
        self.assertIn("Vegetasi Rendah", classify_vegetation_health(0.32))
        self.assertIn("Vegetasi Sedang", classify_vegetation_health(0.51))
        self.assertIn("Optimal", classify_vegetation_health(0.78))
