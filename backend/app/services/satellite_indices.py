"""Satellite spectral indices and SAR backscatter calculation service.

Provides pure Python mathematical formulations for vegetation, moisture, soil, and flood detection
indices using optical bands (Sentinel-2) and synthetic aperture radar (Sentinel-1).
"""

from typing import Optional


def calc_ndvi(nir: Optional[float], red: Optional[float]) -> Optional[float]:
    """Calculate Normalized Difference Vegetation Index (NDVI).

    NDVI = (NIR - RED) / (NIR + RED)
    Range: [-1.0, 1.0]. Indicates canopy greenness and photosynthetic activity.

    Parameters:
        nir: Near-infrared reflectance (Sentinel-2 Band 8)
        red: Red reflectance (Sentinel-2 Band 4)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid or denominator is zero.
    """
    if nir is None or red is None:
        return None

    denom = nir + red
    if abs(denom) < 1e-7:
        return 0.0

    val = (nir - red) / denom
    # Clamp to theoretical boundaries [-1.0, 1.0]
    val = max(-1.0, min(1.0, val))
    return round(val, 4)


def calc_ndre(nir: Optional[float], red_edge: Optional[float]) -> Optional[float]:
    """Calculate Normalized Difference Red Edge Index (NDRE).

    NDRE = (NIR - RedEdge) / (NIR + RedEdge)
    Sensitive to chlorophyll content in mid-to-late growth stages (canopy saturation resistant).

    Parameters:
        nir: Near-infrared reflectance (Sentinel-2 Band 8)
        red_edge: Red Edge reflectance (Sentinel-2 Band 5 / Band 6 / Band 7)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid or denominator is zero.
    """
    if nir is None or red_edge is None:
        return None

    denom = nir + red_edge
    if abs(denom) < 1e-7:
        return 0.0

    val = (nir - red_edge) / denom
    val = max(-1.0, min(1.0, val))
    return round(val, 4)


def calc_ndwi(nir: Optional[float], swir: Optional[float]) -> Optional[float]:
    """Calculate Normalized Difference Water / Moisture Index (NDWI - Gao).

    NDWI = (NIR - SWIR) / (NIR + SWIR)
    Reflects liquid water content in vegetation canopies and surface soil moisture.

    Parameters:
        nir: Near-infrared reflectance (Sentinel-2 Band 8)
        swir: Short-wave infrared reflectance (Sentinel-2 Band 11)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid or denominator is zero.
    """
    if nir is None or swir is None:
        return None

    denom = nir + swir
    if abs(denom) < 1e-7:
        return 0.0

    val = (nir - swir) / denom
    val = max(-1.0, min(1.0, val))
    return round(val, 4)


def calc_savi(nir: Optional[float], red: Optional[float], L: float = 0.5) -> Optional[float]:
    """Calculate Soil Adjusted Vegetation Index (SAVI).

    SAVI = ((NIR - RED) / (NIR + RED + L)) * (1.0 + L)
    Minimizes soil brightness influences in low canopy cover or early growth stages. Default L = 0.5.

    Parameters:
        nir: Near-infrared reflectance (Sentinel-2 Band 8)
        red: Red reflectance (Sentinel-2 Band 4)
        L: Soil brightness correction factor (default 0.5)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid or denominator is zero.
    """
    if nir is None or red is None:
        return None

    denom = nir + red + L
    if abs(denom) < 1e-7:
        return 0.0

    val = ((nir - red) / denom) * (1.0 + L)
    val = max(-1.0, min(1.0, val))
    return round(val, 4)


def calc_bsi(
    swir: Optional[float],
    red: Optional[float],
    nir: Optional[float],
    blue: Optional[float],
) -> Optional[float]:
    """Calculate Bare Soil Index (BSI).

    BSI = ((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))
    High values indicate exposed dry soil/fallow land, while dense vegetation yields negative values.

    Parameters:
        swir: Short-wave infrared reflectance (Sentinel-2 Band 11)
        red: Red reflectance (Sentinel-2 Band 4)
        nir: Near-infrared reflectance (Sentinel-2 Band 8)
        blue: Blue reflectance (Sentinel-2 Band 2)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid or denominator is zero.
    """
    if swir is None or red is None or nir is None or blue is None:
        return None

    numerator = (swir + red) - (nir + blue)
    denom = (swir + red) + (nir + blue)
    if abs(denom) < 1e-7:
        return 0.0

    val = numerator / denom
    val = max(-1.0, min(1.0, val))
    return round(val, 4)


def calc_sar_ratio(vh: Optional[float], vv: Optional[float]) -> Optional[float]:
    """Calculate Synthetic Aperture Radar (SAR) Polarization Ratio (VH / VV).

    Ratio of cross-polarization to co-polarization backscatter.
    Serves as an indicator of vegetation canopy structure, roughness, and biomass.

    Parameters:
        vh: Cross-polarization backscatter intensity (linear scale)
        vv: Co-polarization backscatter intensity (linear scale)

    Returns:
        float rounded to 4 decimals, or None if inputs are invalid, or 0.0 if denominator is zero.
    """
    if vh is None or vv is None:
        return None

    if abs(vv) < 1e-7:
        return 0.0

    val = vh / vv
    return round(val, 4)


def detect_sar_flooding(vv_db: Optional[float], vh_db: Optional[float]) -> bool:
    """Detect potential inundation or waterlogging via Sentinel-1 SAR backscatter threshold.

    Smooth water surfaces produce specular reflection away from the radar antenna,
    causing a severe drop in backscattering coefficient (dB).
    Threshold criteria: VV < -15.0 dB OR VH < -22.0 dB.

    Parameters:
        vv_db: Co-polarization backscatter in decibels (dB)
        vh_db: Cross-polarization backscatter in decibels (dB)

    Returns:
        True if flood / severe inundation is detected, False otherwise.
    """
    if vv_db is not None and vv_db < -15.0:
        return True
    if vh_db is not None and vh_db < -22.0:
        return True
    return False


def classify_vegetation_health(ndvi: Optional[float]) -> str:
    """Return Indonesian agronomic classification based on NDVI value."""
    if ndvi is None:
        return "Data Belum Tersedia"
    if ndvi < 0.2:
        return "Lahan Terbuka / Non-Vegetasi"
    if ndvi < 0.4:
        return "Vegetasi Rendah (Awal Tanam / Stres)"
    if ndvi < 0.6:
        return "Vegetasi Sedang (Pertumbuhan Aktif)"
    return "Vegetasi Rapat & Sehat Optimal"
