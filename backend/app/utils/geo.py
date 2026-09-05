"""Geospatial helper utilities for PostGIS and GeoAlchemy2 integration."""
import json
import math
from typing import Any, Dict, List, Optional, Tuple, Union
try:
    from geoalchemy2 import Geography
    from geoalchemy2.elements import WKBElement, WKTElement
    from geoalchemy2.shape import to_shape
except ImportError:
    class Geography: pass  # type: ignore
    class WKTElement:  # type: ignore
        def __init__(self, data, srid=4326):
            self.data = data
            self.srid = srid
        def __str__(self): return str(self.data)
        def __repr__(self): return f"WKTElement('{self.data}', srid={self.srid})"
        def __eq__(self, other):
            if isinstance(other, WKTElement):
                return self.data == other.data and self.srid == other.srid
            return False
    class WKBElement:  # type: ignore
        def __init__(self, data, srid=4326):
            self.data = data
            self.srid = srid
    def to_shape(geom): return None  # type: ignore

try:
    from shapely.geometry import MultiPolygon, Point, Polygon, mapping, shape as shapely_shape
except ImportError:
    class Point: pass  # type: ignore
    class Polygon: pass  # type: ignore
    class MultiPolygon: pass  # type: ignore
    def mapping(geom): return {}  # type: ignore
    def shapely_shape(geom): return None  # type: ignore

try:
    from sqlalchemy import Numeric, cast, func
except ImportError:
    Numeric = Any  # type: ignore
    cast = Any  # type: ignore
    func = Any  # type: ignore


def point_from_coordinates(
    latitude: Optional[float], longitude: Optional[float]
) -> Optional[WKTElement]:
    """Convert (latitude, longitude) floats to PostGIS WKTElement (EPSG:4326).

    In WGS84 / EPSG:4326 standard, coordinate order is POINT(longitude latitude).
    """
    if latitude is None or longitude is None:
        return None
    try:
        lat = float(latitude)
        lng = float(longitude)
        # Validate latitude and longitude bounds
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            return None
        return WKTElement(f"POINT({lng} {lat})", srid=4326)
    except (ValueError, TypeError):
        return None


def coordinates_from_point(
    geom: Optional[Union[WKBElement, WKTElement]],
) -> Tuple[Optional[float], Optional[float]]:
    """Extract (latitude, longitude) tuple from PostGIS geometry element.

    Returns:
        (latitude, longitude) or (None, None)
    """
    if geom is None:
        return None, None

    try:
        if isinstance(geom, WKTElement):
            text = str(geom.data)
            if "POINT" in text.upper():
                coords = text.replace("POINT", "").replace("(", "").replace(")", "").strip().split()
                if len(coords) >= 2:
                    lng, lat = float(coords[0]), float(coords[1])
                    return lat, lng

        s = to_shape(geom)
        if isinstance(s, Point):
            return float(s.y), float(s.x)
    except Exception:
        pass

    return None, None


def _extract_rings_from_geojson(
    geojson_geometry: Union[Dict[str, Any], List[Any], str]
) -> List[List[List[float]]]:
    """Helper to normalize raw GeoJSON geometry / dict / list into a list of rings [[lng, lat], ...]."""
    if isinstance(geojson_geometry, str):
        geojson_geometry = json.loads(geojson_geometry)

    if isinstance(geojson_geometry, dict):
        if geojson_geometry.get("type") == "Feature":
            geojson_geometry = geojson_geometry.get("geometry", {})

        geom_type = geojson_geometry.get("type")
        coords = geojson_geometry.get("coordinates")

        if geom_type == "Polygon" and coords:
            return coords
        elif geom_type == "MultiPolygon" and coords and len(coords) > 0:
            return coords[0]  # Take primary polygon
        elif coords:
            return coords
        else:
            raise ValueError("Objek GeoJSON tidak memuat koordinat geometri yang valid.")

    elif isinstance(geojson_geometry, list):
        if len(geojson_geometry) == 0:
            raise ValueError("Daftar koordinat tidak boleh kosong.")
        # If passed [[[lng, lat], ...]] (rings)
        if isinstance(geojson_geometry[0], list) and len(geojson_geometry[0]) > 0:
            if isinstance(geojson_geometry[0][0], list):
                return geojson_geometry
            # If passed single ring [[lng, lat], ...]
            elif isinstance(geojson_geometry[0][0], (int, float)):
                return [geojson_geometry]

    raise ValueError("Format data geometri tidak dikenali.")


def polygon_from_geojson(
    geojson_geometry: Union[Dict[str, Any], List[Any], str, WKTElement, Polygon]
) -> WKTElement:
    """Convert GeoJSON polygon dict, coordinates list, or Shapely Polygon to PostGIS WKTElement (EPSG:4326).

    Coordinates order is [[longitude, latitude], ...].
    Validates coordinate bounds and ensures the polygon ring is properly closed.
    """
    if isinstance(geojson_geometry, WKTElement):
        return geojson_geometry

    if isinstance(geojson_geometry, Polygon):
        wkt = geojson_geometry.wkt
        return WKTElement(wkt, srid=4326)

    rings = _extract_rings_from_geojson(geojson_geometry)
    if not rings or len(rings) == 0:
        raise ValueError("Poligon harus memiliki minimal satu cincin luar (exterior ring).")

    cleaned_rings_wkt = []

    for ring_idx, ring in enumerate(rings):
        if not isinstance(ring, list) or len(ring) < 3:
            raise ValueError(
                f"Cincin poligon ke-{ring_idx + 1} harus memiliki minimal 3 koordinat sudut."
            )

        cleaned_pts = []
        for pt_idx, pt in enumerate(ring):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                raise ValueError(f"Koordinat ke-{pt_idx + 1} tidak valid: {pt}")
            lng, lat = float(pt[0]), float(pt[1])
            if not (-180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0):
                raise ValueError(
                    f"Koordinat ({lng}, {lat}) di luar batas koordinat bumi WGS84 (-180..180, -90..90)."
                )
            cleaned_pts.append((lng, lat))

        # Ensure ring is closed (first point equals last point)
        if cleaned_pts[0] != cleaned_pts[-1]:
            cleaned_pts.append(cleaned_pts[0])

        if len(cleaned_pts) < 4:
            raise ValueError("Cincin poligon tertutup harus memiliki minimal 4 titik (3 titik unik).")

        pts_str = ", ".join(f"{lng} {lat}" for lng, lat in cleaned_pts)
        cleaned_rings_wkt.append(f"({pts_str})")

    wkt = f"POLYGON({', '.join(cleaned_rings_wkt)})"
    return WKTElement(wkt, srid=4326)


def geojson_from_polygon(
    geom: Optional[Union[WKBElement, WKTElement, Polygon, MultiPolygon, Dict[str, Any]]]
) -> Optional[Dict[str, Any]]:
    """Convert PostGIS WKBElement / WKTElement / Shapely Polygon to GeoJSON Polygon dict.

    Returns:
        {"type": "Polygon", "coordinates": [[[lng, lat], ...], ...]} or None
    """
    if geom is None:
        return None

    if isinstance(geom, dict):
        if geom.get("type") == "Polygon" and "coordinates" in geom:
            return geom
        elif geom.get("type") == "Feature" and "geometry" in geom:
            return geom["geometry"]
        return geom

    try:
        if isinstance(geom, (WKBElement, WKTElement)):
            s = to_shape(geom)
        else:
            s = geom

        if isinstance(s, Polygon):
            exterior = [[round(float(c[0]), 7), round(float(c[1]), 7)] for c in s.exterior.coords]
            interiors = [
                [[round(float(c[0]), 7), round(float(c[1]), 7)] for c in interior.coords]
                for interior in s.interiors
            ]
            return {
                "type": "Polygon",
                "coordinates": [exterior, *interiors],
            }
        elif isinstance(s, MultiPolygon):
            # Return the largest polygon in case of MultiPolygon
            largest = max(s.geoms, key=lambda g: g.area)
            exterior = [[round(float(c[0]), 7), round(float(c[1]), 7)] for c in largest.exterior.coords]
            interiors = [
                [[round(float(c[0]), 7), round(float(c[1]), 7)] for c in interior.coords]
                for interior in largest.interiors
            ]
            return {
                "type": "Polygon",
                "coordinates": [exterior, *interiors],
            }
    except Exception:
        pass

    return None


def _ring_spherical_area(ring_coords: List[Any]) -> float:
    """Calculate the geodesic area of a single spherical polygon ring in square meters on WGS84 sphere.

    Uses the exact Chamberlain & Duquette (1995) spherical polygon area formula.
    """
    pts = (
        ring_coords[:-1]
        if (len(ring_coords) > 3 and ring_coords[0] == ring_coords[-1])
        else ring_coords
    )
    n = len(pts)
    if n < 3:
        return 0.0

    R = 6378137.0  # WGS84 equatorial radius in meters
    total = 0.0

    for i in range(n):
        prev_lng = math.radians(float(pts[(i - 1) % n][0]))
        next_lng = math.radians(float(pts[(i + 1) % n][0]))
        curr_lat = math.radians(float(pts[i][1]))
        total += (next_lng - prev_lng) * math.sin(curr_lat)

    area_m2 = abs(total) * (R * R) / 2.0
    return area_m2


def calculate_polygon_area_hectares(
    geometry_or_coords: Union[Dict[str, Any], List[Any], str, WKBElement, WKTElement, Polygon]
) -> float:
    """Calculate the accurate geodesic area of a polygon in hectares (1 ha = 10,000 m²).

    Accepts:
    - GeoJSON dict or Feature
    - List of coordinates [[[lng, lat], ...]] or [[lng, lat], ...]
    - WKBElement or WKTElement
    - Shapely Polygon

    Returns:
        Area in hectares rounded to 4 decimal places (e.g. 1.2540).
    """
    try:
        if isinstance(geometry_or_coords, (WKBElement, WKTElement)):
            shape_obj = to_shape(geometry_or_coords)
            geojson_data = mapping(shape_obj)
            rings = geojson_data.get("coordinates", [])
        elif isinstance(geometry_or_coords, Polygon):
            geojson_data = mapping(geometry_or_coords)
            rings = geojson_data.get("coordinates", [])
        else:
            rings = _extract_rings_from_geojson(geometry_or_coords)

        if not rings or len(rings) == 0:
            return 0.0

        exterior = rings[0]
        exterior_area_m2 = _ring_spherical_area(exterior)

        interior_area_m2 = 0.0
        if len(rings) > 1:
            for hole in rings[1:]:
                interior_area_m2 += _ring_spherical_area(hole)

        net_area_m2 = max(0.0, exterior_area_m2 - interior_area_m2)
        hectares = round(net_area_m2 / 10000.0, 4)
        return float(hectares)

    except Exception:
        return 0.0


def postgis_area_hectares_sql(geom_column):
    """SQLAlchemy expression to calculate area in hectares using PostGIS ST_Area on Geography."""
    return func.round(cast(func.ST_Area(cast(geom_column, Geography)) / 10000.0, Numeric(10, 4)), 4)
