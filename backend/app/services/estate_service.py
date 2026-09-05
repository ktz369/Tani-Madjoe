"""Estate business logic service."""
import inspect
import logging
from typing import Any, List, Optional, Union
try:
    from sqlalchemy.ext.asyncio import AsyncSession
except ImportError:
    AsyncSession = Any  # type: ignore

try:
    from geoalchemy2.elements import WKBElement, WKTElement
    from geoalchemy2.shape import to_shape
except ImportError:
    class WKBElement: pass  # type: ignore
    class WKTElement:  # type: ignore
        def __init__(self, data, srid=4326):
            self.data = data
            self.srid = srid
        def __str__(self): return str(self.data)
    to_shape = None  # type: ignore

try:
    from shapely.geometry import MultiPolygon, Polygon
except ImportError:
    class MultiPolygon: pass  # type: ignore
    class Polygon: pass  # type: ignore

try:
    from app.models.estate import Estate
except Exception:
    class Estate:  # type: ignore
        def __init__(self, **kwargs):
            self.id = kwargs.get("id")
            self.company_id = kwargs.get("company_id")
            self.name = kwargs.get("name")
            self.location_point = kwargs.get("location_point")
            self.province = kwargs.get("province")
            self.kabupaten = kwargs.get("kabupaten")
            for k, v in kwargs.items():
                setattr(self, k, v)

from app.utils.geo import (
    _extract_rings_from_geojson,
    coordinates_from_point,
    point_from_coordinates,
)
from app.utils.kml_parser import compute_centroid

logger = logging.getLogger(__name__)



def extract_polygon_coords(polygon_geojson_or_coords: Any) -> Optional[List[List[float]]]:
    """Extract exterior ring coordinate list [[lng, lat], ...] from various polygon representations."""
    if polygon_geojson_or_coords is None:
        return None

    if isinstance(polygon_geojson_or_coords, (WKTElement, WKBElement)):
        try:
            shp = to_shape(polygon_geojson_or_coords)
            if isinstance(shp, Polygon):
                return [list(pt) for pt in shp.exterior.coords]
            elif isinstance(shp, MultiPolygon) and len(shp.geoms) > 0:
                return [list(pt) for pt in shp.geoms[0].exterior.coords]
        except Exception:
            pass

        try:
            wkt_text = str(
                polygon_geojson_or_coords.data
                if hasattr(polygon_geojson_or_coords, "data")
                else polygon_geojson_or_coords
            )
            from shapely import wkt
            shp = wkt.loads(wkt_text)
            if isinstance(shp, Polygon):
                return [list(pt) for pt in shp.exterior.coords]
        except Exception:
            pass

    if isinstance(polygon_geojson_or_coords, Polygon):
        return [list(pt) for pt in polygon_geojson_or_coords.exterior.coords]

    if isinstance(polygon_geojson_or_coords, MultiPolygon) and len(polygon_geojson_or_coords.geoms) > 0:
        return [list(pt) for pt in polygon_geojson_or_coords.geoms[0].exterior.coords]

    try:
        rings = _extract_rings_from_geojson(polygon_geojson_or_coords)
        if rings and len(rings) > 0 and len(rings[0]) > 0:
            return rings[0]
    except Exception:
        pass

    # Fallback if list of [lng, lat]
    if isinstance(polygon_geojson_or_coords, list) and len(polygon_geojson_or_coords) > 0:
        if isinstance(polygon_geojson_or_coords[0], list):
            if len(polygon_geojson_or_coords[0]) > 0 and isinstance(polygon_geojson_or_coords[0][0], (int, float)):
                return polygon_geojson_or_coords
            elif len(polygon_geojson_or_coords[0]) > 0 and isinstance(polygon_geojson_or_coords[0][0], list):
                return polygon_geojson_or_coords[0]

    return None


async def ensure_estate_centroid_from_polygon(
    db: AsyncSession,
    estate: Estate,
    polygon_geojson_or_coords: Any,
) -> bool:
    """Ensure an estate has GPS coordinates; if missing or (0,0), compute centroid from plot polygon.

    Args:
        db: Async database session.
        estate: Estate ORM instance.
        polygon_geojson_or_coords: GeoJSON polygon dict, coordinates list, or WKT.

    Returns:
        True if estate coordinates were updated, False if estate already had valid coordinates.
    """
    if estate is None:
        return False

    lat, lng = coordinates_from_point(estate.location_point)
    # Check if estate already has valid coordinates (not None and not (0,0))
    if lat is not None and lng is not None and not (lat == 0.0 and lng == 0.0):
        return False

    coords = extract_polygon_coords(polygon_geojson_or_coords)
    if not coords:
        logger.warning(
            "Could not extract polygon coordinates to compute centroid for Estate ID %s",
            getattr(estate, "id", None),
        )
        return False

    centroid = compute_centroid(coords)
    # centroid is [lng, lat]
    if not centroid or len(centroid) < 2 or (centroid[0] == 0.0 and centroid[1] == 0.0):
        logger.warning(
            "Computed invalid or zero centroid %s for Estate ID %s",
            centroid,
            getattr(estate, "id", None),
        )
        return False

    lng_val, lat_val = centroid[0], centroid[1]
    estate.location_point = point_from_coordinates(lat_val, lng_val)
    add_res = db.add(estate)
    if inspect.isawaitable(add_res):
        await add_res
    await db.commit()
    try:
        await db.refresh(estate)
    except Exception:
        pass

    logger.info(
        "Auto-assigned centroid GPS (lat=%s, lng=%s) to Estate ID %s (%s)",
        lat_val,
        lng_val,
        getattr(estate, "id", None),
        getattr(estate, "name", None),
    )
    return True


async def handle_plot_estate_weather_sync(
    db: AsyncSession,
    estate: Estate,
    polygon_geojson_or_coords: Any,
) -> bool:
    """Ensure estate coordinates exist from plot polygon and trigger weather sync.

    Used by plot registration endpoints to propagate centroid coordinates to parent estate
    and establish immediate weather telemetry sync.
    """
    if estate is None:
        return False

    estate_lat, estate_lng = coordinates_from_point(estate.location_point)
    if estate_lat is None or estate_lng is None or (estate_lat == 0.0 and estate_lng == 0.0):
        await ensure_estate_centroid_from_polygon(db, estate, polygon_geojson_or_coords)

    try:
        from app.services.weather_service import sync_weather_for_estate
        await sync_weather_for_estate(db, estate)
    except Exception as w_err:
        logger.warning(
            "Auto weather sync for estate %s failed: %s",
            getattr(estate, "id", None),
            w_err,
        )
    return True
