"""KML, KMZ, and GeoJSON parser and spatial validator for Tani Precision Agriculture platform.

Extracts Placemark geometries, coordinates, bounding box, centroid, and computes
geodesic area in square meters and hectares without external C-library dependencies.
"""
from __future__ import annotations

import io
import json
import math
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Dict, List, Optional, Tuple, Union


class SpatialParseError(ValueError):
    """Exception raised when spatial file parsing or validation fails."""
    pass


def _strip_tag_namespace(tag: str) -> str:
    """Return local XML tag name without namespace prefix."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _parse_coordinates_text(coord_text: str) -> List[List[float]]:
    """Parse KML coordinates text string into a list of [lng, lat] coordinate pairs.

    Handles 2D (lng,lat) and 3D (lng,lat,alt) coordinates delimited by spaces,
    tabs, or newlines. Strips altitude to preserve standard 2D WGS84 coordinates.
    """
    if not coord_text or not coord_text.strip():
        raise SpatialParseError("Elemen <coordinates> kosong atau tidak memuat data titik koordinat.")

    raw_tokens = coord_text.strip().split()
    points: List[List[float]] = []

    for token in raw_tokens:
        clean_tok = token.strip()
        if not clean_tok:
            continue
        parts = clean_tok.split(",")
        if len(parts) < 2:
            continue
        try:
            lng = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            raise SpatialParseError(f"Format koordinat tidak valid pada token '{clean_tok}'.")

        points.append([lng, lat])

    if len(points) < 3:
        raise SpatialParseError(f"Jumlah titik koordinat ({len(points)}) kurang dari syarat minimal poligon (3 titik).")

    return points


def calculate_spherical_polygon_area(ring_coords: List[List[float]]) -> float:
    """Calculate the geodesic area of a spherical polygon ring in square meters on WGS84 sphere.

    Uses the exact Chamberlain & Duquette (1995) spherical polygon area formula.
    Radius = 6,378,137.0 meters.
    """
    if not ring_coords or len(ring_coords) < 3:
        return 0.0

    # Ensure we operate on unique vertices (excluding duplicate closing point)
    pts = (
        ring_coords[:-1]
        if (len(ring_coords) > 3 and ring_coords[0][0] == ring_coords[-1][0] and ring_coords[0][1] == ring_coords[-1][1])
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


def compute_bounding_box(coords: List[List[float]]) -> List[float]:
    """Compute bounding box [min_lng, min_lat, max_lng, max_lat] for a list of coordinates."""
    if not coords:
        return [0.0, 0.0, 0.0, 0.0]
    lngs = [pt[0] for pt in coords]
    lats = [pt[1] for pt in coords]
    return [
        round(min(lngs), 7),
        round(min(lats), 7),
        round(max(lngs), 7),
        round(max(lats), 7),
    ]


def compute_centroid(coords: List[List[float]]) -> List[float]:
    """Compute centroid [lng, lat] as average of unique vertices."""
    if not coords:
        return [0.0, 0.0]
    pts = (
        coords[:-1]
        if (len(coords) > 3 and coords[0][0] == coords[-1][0] and coords[0][1] == coords[-1][1])
        else coords
    )
    if not pts:
        return [0.0, 0.0]
    avg_lng = sum(pt[0] for pt in pts) / len(pts)
    avg_lat = sum(pt[1] for pt in pts) / len(pts)
    return [round(avg_lng, 7), round(avg_lat, 7)]


def validate_and_normalize_polygon(
    raw_rings: List[List[List[float]]],
) -> Dict[str, Any]:
    """Validate polygon topology, coordinate bounds, and compute accurate geodesic area.

    Validations:
    - Ring has minimum 3 unique points.
    - Closed ring (auto-closes if first != last).
    - Longitude in range [-180, 180], Latitude in range [-90, 90].

    Returns a dictionary with:
    - is_valid (bool)
    - errors (list of str)
    - warnings (list of str)
    - geometry (GeoJSON Polygon dict)
    - vertex_count (int)
    - area_m2 (float)
    - area_hectares (float)
    - bounding_box ([min_lng, min_lat, max_lng, max_lat])
    - centroid ([lng, lat])
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not raw_rings or not isinstance(raw_rings, list):
        return {
            "is_valid": False,
            "errors": ["Data cincin poligon tidak ditemukan atau kosong."],
            "warnings": [],
            "geometry": {"type": "Polygon", "coordinates": []},
            "vertex_count": 0,
            "area_m2": 0.0,
            "area_hectares": 0.0,
            "bounding_box": [0.0, 0.0, 0.0, 0.0],
            "centroid": [0.0, 0.0],
        }

    normalized_rings: List[List[List[float]]] = []
    total_m2 = 0.0

    for ring_idx, ring in enumerate(raw_rings):
        if not isinstance(ring, list) or len(ring) < 3:
            errors.append(f"Cincin poligon ke-{ring_idx + 1} harus memiliki minimal 3 titik koordinat.")
            continue

        clean_ring: List[List[float]] = []
        for pt_idx, pt in enumerate(ring):
            if not isinstance(pt, (list, tuple)) or len(pt) < 2:
                errors.append(f"Titik ke-{pt_idx + 1} pada cincin ke-{ring_idx + 1} tidak valid.")
                continue
            lng, lat = float(pt[0]), float(pt[1])

            if not (-180.0 <= lng <= 180.0 and -90.0 <= lat <= 90.0):
                errors.append(
                    f"Koordinat ({lng}, {lat}) di luar batas WGS84 valid (-180..180 lon, -90..90 lat)."
                )
            clean_ring.append([round(lng, 7), round(lat, 7)])

        if not clean_ring:
            continue

        # Count unique points
        unique_pts = set((p[0], p[1]) for p in clean_ring)
        if len(unique_pts) < 3:
            errors.append(f"Cincin ke-{ring_idx + 1} harus memiliki minimal 3 titik koordinat unik.")

        # Ensure ring is closed
        if clean_ring[0] != clean_ring[-1]:
            clean_ring.append(clean_ring[0])
            warnings.append(f"Cincin ke-{ring_idx + 1} tidak tertutup, ditutup otomatis dengan menyambung ke titik awal.")

        ring_area = calculate_spherical_polygon_area(clean_ring)
        if ring_idx == 0:
            total_m2 += ring_area
        else:
            # Interior ring (hole)
            total_m2 -= ring_area

        normalized_rings.append(clean_ring)

    if errors:
        return {
            "is_valid": False,
            "errors": errors,
            "warnings": warnings,
            "geometry": {"type": "Polygon", "coordinates": normalized_rings},
            "vertex_count": len(normalized_rings[0]) if normalized_rings else 0,
            "area_m2": 0.0,
            "area_hectares": 0.0,
            "bounding_box": [0.0, 0.0, 0.0, 0.0],
            "centroid": [0.0, 0.0],
        }

    net_area_m2 = max(0.0, total_m2)
    area_ha = round(net_area_m2 / 10000.0, 4)
    exterior_ring = normalized_rings[0]
    bbox = compute_bounding_box(exterior_ring)
    centroid = compute_centroid(exterior_ring)

    return {
        "is_valid": True,
        "errors": [],
        "warnings": warnings,
        "geometry": {"type": "Polygon", "coordinates": normalized_rings},
        "vertex_count": len(exterior_ring),
        "area_m2": round(net_area_m2, 2),
        "area_hectares": area_ha,
        "bounding_box": bbox,
        "centroid": centroid,
    }


def parse_kml_content(
    xml_content: Union[str, bytes], default_name: str = "Petak Baru"
) -> Dict[str, Any]:
    """Parse KML XML content into standard GeoJSON Polygon geometry and metadata.

    Supports:
    - Elements: <Placemark>, <Polygon>, <LinearRing>, <coordinates>, <name>
    - Multiple namespace variations (KML 2.0, 2.1, 2.2, Google Earth gx, atom)
    - 2D and 3D coordinates
    - Exterior and interior rings
    """
    if isinstance(xml_content, str):
        xml_bytes = xml_content.encode("utf-8")
    else:
        xml_bytes = xml_content

    if not xml_bytes or not xml_bytes.strip():
        raise SpatialParseError("Berkas KML kosong atau tidak memuat data.")

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as pe:
        raise SpatialParseError(f"Format XML KML tidak valid atau rusak: {str(pe)}")

    placemark_name: Optional[str] = None
    doc_name: Optional[str] = None
    exterior_coords: Optional[List[List[float]]] = None
    interior_rings: List[List[List[float]]] = []

    for elem in root.iter():
        tag = _strip_tag_namespace(elem.tag)
        if tag == "Document" and not doc_name:
            for child in elem:
                if _strip_tag_namespace(child.tag) == "name" and child.text and child.text.strip():
                    doc_name = child.text.strip()
                    break

        elif tag == "Placemark":
            current_name = None
            for child in elem:
                if _strip_tag_namespace(child.tag) == "name" and child.text and child.text.strip():
                    current_name = child.text.strip()
                    break

            for sub in elem.iter():
                sub_tag = _strip_tag_namespace(sub.tag)
                if sub_tag == "outerBoundaryIs":
                    for coord_elem in sub.iter():
                        if _strip_tag_namespace(coord_elem.tag) == "coordinates" and coord_elem.text:
                            exterior_coords = _parse_coordinates_text(coord_elem.text)
                            break
                elif sub_tag == "innerBoundaryIs":
                    for coord_elem in sub.iter():
                        if _strip_tag_namespace(coord_elem.tag) == "coordinates" and coord_elem.text:
                            hole = _parse_coordinates_text(coord_elem.text)
                            interior_rings.append(hole)
                            break
                elif sub_tag == "coordinates" and not exterior_coords and elem.find(f".//{sub.tag}") is not None:
                    if sub.text:
                        exterior_coords = _parse_coordinates_text(sub.text)

            if exterior_coords:
                if current_name:
                    placemark_name = current_name
                break

    if not exterior_coords:
        for elem in root.iter():
            tag = _strip_tag_namespace(elem.tag)
            if tag == "coordinates" and elem.text:
                exterior_coords = _parse_coordinates_text(elem.text)
                break

    if not placemark_name:
        for elem in root.iter():
            tag = _strip_tag_namespace(elem.tag)
            if tag == "name" and elem.text and elem.text.strip():
                placemark_name = elem.text.strip()
                break

    if not exterior_coords:
        raise SpatialParseError("Berkas KML tidak memuat elemen poligon atau koordinat yang dapat diproses.")

    resolved_name = placemark_name or doc_name or default_name
    all_rings = [exterior_coords, *interior_rings]
    validation = validate_and_normalize_polygon(all_rings)

    if not validation["is_valid"]:
        raise SpatialParseError("; ".join(validation["errors"]))

    return {
        "name": resolved_name,
        "format": "KML",
        **validation,
    }


def parse_kmz_content(kmz_bytes: bytes, default_name: str = "Petak Baru") -> Dict[str, Any]:
    """Extract and parse KML from a KMZ (zip) archive."""
    if not zipfile.is_zipfile(io.BytesIO(kmz_bytes)):
        raise SpatialParseError("Berkas KMZ tidak berformat arsip ZIP yang valid.")

    try:
        with zipfile.ZipFile(io.BytesIO(kmz_bytes), "r") as zf:
            namelist = zf.namelist()
            kml_files = [n for n in namelist if n.lower().endswith(".kml")]
            if not kml_files:
                raise SpatialParseError("Arsip KMZ tidak memuat berkas .kml di dalamnya.")

            chosen = "doc.kml" if "doc.kml" in kml_files else kml_files[0]
            kml_bytes = zf.read(chosen)
            res = parse_kml_content(kml_bytes, default_name=default_name)
            res["format"] = "KMZ"
            return res
    except zipfile.BadZipFile as bzf:
        raise SpatialParseError(f"Arsip KMZ rusak: {str(bzf)}")


def parse_geojson_content(
    raw_content: Union[str, bytes, dict], default_name: str = "Petak Baru"
) -> Dict[str, Any]:
    """Parse GeoJSON FeatureCollection, Feature, or Polygon geometry."""
    if isinstance(raw_content, (str, bytes)):
        try:
            data = json.loads(raw_content)
        except json.JSONDecodeError as jde:
            raise SpatialParseError(f"Format berkas GeoJSON tidak valid: {str(jde)}")
    elif isinstance(raw_content, dict):
        data = raw_content
    else:
        raise SpatialParseError("Tipe konten GeoJSON tidak didukung.")

    extracted_name: Optional[str] = None
    rings: Optional[List[List[List[float]]]] = None

    if data.get("type") == "FeatureCollection":
        features = data.get("features", [])
        if not features:
            raise SpatialParseError("GeoJSON FeatureCollection kosong tanpa fitur.")
        feat = features[0]
        extracted_name = feat.get("properties", {}).get("name") or feat.get("properties", {}).get("title")
        geom = feat.get("geometry", {})
        if geom.get("type") == "Polygon":
            rings = geom.get("coordinates", [])
        elif geom.get("type") == "MultiPolygon":
            multi_coords = geom.get("coordinates", [])
            rings = multi_coords[0] if multi_coords else []

    elif data.get("type") == "Feature":
        extracted_name = data.get("properties", {}).get("name") or data.get("properties", {}).get("title")
        geom = data.get("geometry", {})
        if geom.get("type") == "Polygon":
            rings = geom.get("coordinates", [])
        elif geom.get("type") == "MultiPolygon":
            multi_coords = geom.get("coordinates", [])
            rings = multi_coords[0] if multi_coords else []

    elif data.get("type") == "Polygon":
        extracted_name = data.get("name")
        rings = data.get("coordinates", [])

    elif data.get("type") == "MultiPolygon":
        extracted_name = data.get("name")
        multi_coords = data.get("coordinates", [])
        rings = multi_coords[0] if multi_coords else []

    elif isinstance(data, list):
        if len(data) > 0 and isinstance(data[0], list):
            if isinstance(data[0][0], list):
                rings = data
            elif isinstance(data[0][0], (int, float)):
                rings = [data]

    if not rings:
        raise SpatialParseError("Objek GeoJSON tidak memuat koordinat poligon yang valid.")

    validation = validate_and_normalize_polygon(rings)
    if not validation["is_valid"]:
        raise SpatialParseError("; ".join(validation["errors"]))

    return {
        "name": extracted_name or default_name,
        "format": "GeoJSON",
        **validation,
    }


def parse_spatial_file(
    content: Union[str, bytes],
    filename: Optional[str] = None,
    default_name: str = "Petak Baru",
) -> Dict[str, Any]:
    """Auto-detect format (KMZ, KML, or GeoJSON) and return parsed spatial metadata."""
    if isinstance(content, str):
        content_bytes = content.encode("utf-8")
    else:
        content_bytes = content

    name_from_file = None
    if filename:
        clean_fn = filename.split("/")[-1].split("\\")[-1]
        name_from_file = clean_fn.rsplit(".", 1)[0]

    chosen_default = name_from_file or default_name

    if content_bytes.startswith(b"PK\x03\x04") or (filename and filename.lower().endswith(".kmz")):
        return parse_kmz_content(content_bytes, default_name=chosen_default)

    stripped = content_bytes.strip()
    if stripped.startswith(b"{") or (filename and filename.lower().endswith((".geojson", ".json"))):
        return parse_geojson_content(content_bytes, default_name=chosen_default)

    return parse_kml_content(content_bytes, default_name=chosen_default)
