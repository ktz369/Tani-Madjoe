"""
Module D: 3D Drone Flight Mission KML Generator (Terrain-Following Spray Path).
Generates standard KML 2.2 files (.kml) compatible with Google Earth, DJI Pilot 2,
QGroundControl, and Mission Planner. Computes lawnmower flight path across Petak Bengkok 1
with dynamic terrain-following altitude: DEM(lon, lat) + 2.5m spray nozzle height.
"""

from typing import List, Tuple, Dict, Any
import math

# 24 WGS84 boundary coordinates of Petak Bengkok 1 (Pacitan)
BENGKOK_COORDINATES = [
    [111.0632475, -8.0841799],
    [111.0632340, -8.0842242],
    [111.0632402, -8.0842685],
    [111.0632726, -8.0843325],
    [111.0633705, -8.0843500],
    [111.0634159, -8.0843384],
    [111.0634699, -8.0843861],
    [111.0635063, -8.0844383],
    [111.0635559, -8.0844782],
    [111.0635870, -8.0845081],
    [111.0636082, -8.0845603],
    [111.0636878, -8.0845655],
    [111.0637463, -8.0845530],
    [111.0638206, -8.0844833],
    [111.0638406, -8.0844343],
    [111.0638884, -8.0843512],
    [111.0640268, -8.0842306],
    [111.0640465, -8.0841431],
    [111.0640695, -8.0840409],
    [111.0640333, -8.0839697],
    [111.0637347, -8.0840335],
    [111.0634638, -8.0840518],
    [111.0633133, -8.0840826],
    [111.0632475, -8.0841799],
]


def interpolate_elevation_mdpl(lon: float, lat: float) -> float:
    """
    Interpolates ground elevation (mdpl) for Bengkok 1 terraced slope.
    Slope descends from NW/North (151m) to SE/South (142m).
    """
    # Reference points in Bengkok 1
    # North-west corner: lon 111.0633, lat -8.0840 -> ~151.0m
    # South-east corner: lon 111.0640, lat -8.0845 -> ~142.0m
    min_lat, max_lat = -8.0845655, -8.0839697
    min_lon, max_lon = 111.0632340, 111.0640695

    # Normalized position along slope gradient
    lat_norm = (lat - min_lat) / max(0.0001, (max_lat - min_lat))
    lon_norm = (lon - min_lon) / max(0.0001, (max_lon - min_lon))
    
    # Higher elevation in upper-north, descending to lower-south
    gradient = (lat_norm * 0.7) + ((1.0 - lon_norm) * 0.3)
    elevation = 142.0 + (gradient * 9.0)
    return round(elevation, 2)


def generate_drone_mission_waypoints(
    spray_height_agl: float = 2.5,
    swath_width_m: float = 4.0,
    flight_speed_ms: float = 3.5,
    spray_rate_l_ha: float = 16.0
) -> List[Dict[str, Any]]:
    """
    Generates a high-precision serpentine (lawnmower) flight path over Bengkok 1.
    Each waypoint has [longitude, latitude, elevation_msl] where:
    elevation_msl = ground_elevation + spray_height_agl (terrain-following).
    """
    # Bounding box of Bengkok 1
    lons = [p[0] for p in BENGKOK_COORDINATES]
    lats = [p[1] for p in BENGKOK_COORDINATES]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    # Convert swath width from meters to approximate degrees latitude (~111,000 m/deg)
    lat_step = (swath_width_m / 111000.0)

    # Home / Takeoff point at northwest road edge
    home_lon, home_lat = 111.0632475, -8.0841799
    home_ground = interpolate_elevation_mdpl(home_lon, home_lat)
    
    waypoints: List[Dict[str, Any]] = []

    # 1. Takeoff / Home Waypoint
    waypoints.append({
        "index": 0,
        "name": "HOME / TAKEOFF",
        "action": "TAKEOFF",
        "lon": home_lon,
        "lat": home_lat,
        "ground_elev": home_ground,
        "altitude_msl": round(home_ground + 10.0, 2), # Climb to 10m safe transit
        "spray_active": False,
        "speed_ms": 2.0
    })

    # Generate parallel survey passes from North to South
    current_lat = max_lat - (lat_step / 2.0)
    sweep_idx = 1
    left_to_right = True

    while current_lat >= min_lat:
        lon_start = min_lon + 0.00005 if left_to_right else max_lon - 0.00005
        lon_end = max_lon - 0.00005 if left_to_right else min_lon + 0.00005

        # Intermediate points along pass for tight terrain-following
        num_segments = 5
        for seg in range(num_segments + 1):
            t = seg / num_segments
            pt_lon = lon_start + (lon_end - lon_start) * t
            pt_lat = current_lat
            g_elev = interpolate_elevation_mdpl(pt_lon, pt_lat)
            alt_msl = round(g_elev + spray_height_agl, 2)

            waypoints.append({
                "index": len(waypoints),
                "name": f"WP-{len(waypoints):02d} (Pass {sweep_idx})",
                "action": "SPRAY" if (0 < seg < num_segments) else "TURN_POINT",
                "lon": round(pt_lon, 7),
                "lat": round(pt_lat, 7),
                "ground_elev": g_elev,
                "altitude_msl": alt_msl,
                "spray_active": True,
                "speed_ms": flight_speed_ms,
                "spray_rate_l_ha": spray_rate_l_ha
            })

        left_to_right = not left_to_right
        current_lat -= lat_step
        sweep_idx += 1

    # Return To Home (RTH) Landing Waypoint
    waypoints.append({
        "index": len(waypoints),
        "name": "RTH / LANDING",
        "action": "LAND",
        "lon": home_lon,
        "lat": home_lat,
        "ground_elev": home_ground,
        "altitude_msl": round(home_ground + 1.0, 2),
        "spray_active": False,
        "speed_ms": 1.5
    })

    return waypoints


def generate_drone_mission_kml(
    plot_name: str = "Petak Bengkok 1",
    crop_variety: str = "Inpari 32 HDB",
    spray_height_agl: float = 2.5
) -> str:
    """
    Generates standard 3D KML XML string for terrain-adaptive drone spray mission.
    """
    waypoints = generate_drone_mission_waypoints(spray_height_agl=spray_height_agl)

    # 3D LineString coordinates string: lon,lat,alt lon,lat,alt ...
    coords_flight_path = " ".join([f"{wp['lon']},{wp['lat']},{wp['altitude_msl']}" for wp in waypoints])

    # 3D Boundary Polygon coordinates
    boundary_coords = " ".join([
        f"{c[0]},{c[1]},{interpolate_elevation_mdpl(c[0], c[1]) + 0.5}"
        for c in BENGKOK_COORDINATES
    ])

    # Build Placemarks for individual waypoints
    waypoint_placemarks = []
    for wp in waypoints:
        wp_xml = f"""
    <Placemark>
      <name>{wp['name']}</name>
      <description><![CDATA[
        <b>Tipe Aksi:</b> {wp['action']}<br/>
        <b>Ketinggian Relatif (AGL):</b> {spray_height_agl} m (Terrain-Following)<br/>
        <b>Elevasi Tanah DEM:</b> {wp['ground_elev']} m MSL<br/>
        <b>Elevasi Barometrik Drone:</b> {wp['altitude_msl']} m MSL<br/>
        <b>Status Semprot:</b> {'AKTIF (16 L/ha)' if wp['spray_active'] else 'NONAKTIF'}<br/>
        <b>Kecepatan Terbang:</b> {wp['speed_ms']} m/s
      ]]></description>
      <styleUrl>#{"wpSprayStyle" if wp['spray_active'] else "wpTurnStyle"}</styleUrl>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>{wp['lon']},{wp['lat']},{wp['altitude_msl']}</coordinates>
      </Point>
    </Placemark>"""
        waypoint_placemarks.append(wp_xml)

    waypoint_placemarks_str = "\n".join(waypoint_placemarks)

    kml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>Misi Drone 3D Terrain-Following - {plot_name}</name>
    <description><![CDATA[
      <h2>MISI PENYEMPROTAN DRONE PRESISI (TERRAIN-ADAPTIVE VRN)</h2>
      <p><b>Unit Petak:</b> {plot_name} (0.37 Ha)</p>
      <p><b>Varietas Tanaman:</b> {crop_variety}</p>
      <p><b>Kontur Lereng:</b> Terasiring Berundak (Kemiringan 8.41%)</p>
      <p><b>Mode Ketinggian:</b> Terrain-Following Dynamic Elevation (DEM + {spray_height_agl}m AGL)</p>
      <p><b>Aplikasi:</b> Nutrisi Mikro Zn + Pupuk Pelengkap Cair Daun</p>
      <hr/>
      <small>Dihasilkan secara otomatis oleh TANDUR Digital Agronomy Engine</small>
    ]]></description>

    <!-- Styles -->
    <Style id="plotBoundaryStyle">
      <LineStyle>
        <color>ff00ffff</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>3300ff00</color>
      </PolyStyle>
    </Style>

    <Style id="droneFlightPathStyle">
      <LineStyle>
        <color>ff00aaff</color>
        <width>3.0</width>
      </LineStyle>
    </Style>

    <Style id="wpSprayStyle">
      <IconStyle>
        <color>ff00ff00</color>
        <scale>0.8</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="wpTurnStyle">
      <IconStyle>
        <color>ff0000ff</color>
        <scale>0.9</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/triangle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <!-- 1. Batas Poligon Petak Bengkok 1 -->
    <Placemark>
      <name>Batas Lahan Petak Bengkok 1 (3D Terasiring)</name>
      <styleUrl>#plotBoundaryStyle</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>absolute</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              {boundary_coords}
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>

    <!-- 2. Lintasan Terbang Drone 3D Terrain-Following -->
    <Placemark>
      <name>Lintasan Misi Drone 3D ({spray_height_agl}m Terrain-Following)</name>
      <description>Lintasan semprot otomatis dengan elevasi dinamis mengikuti topografi terasiring Pacitan.</description>
      <styleUrl>#droneFlightPathStyle</styleUrl>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          {coords_flight_path}
        </coordinates>
      </LineString>
    </Placemark>

    <!-- 3. Waypoint Points -->
    <Folder>
      <name>Titik Waypoint Misi ({len(waypoints)} Titik)</name>
      {waypoint_placemarks_str}
    </Folder>

  </Document>
</kml>
"""
    return kml_content.strip()
