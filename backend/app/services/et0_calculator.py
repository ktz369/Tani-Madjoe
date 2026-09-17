"""FAO-56 Penman-Monteith Reference Evapotranspiration (ET₀) Calculator.

Implements the standard FAO Irrigation and Drainage Paper No. 56
guidelines for computing daily reference crop evapotranspiration (ET₀).
Reference:
    Allen, R.G., Pereira, L.S., Raes, D., Smith, M., 1998.
    Crop evapotranspiration: Guidelines for computing crop water requirements.
    FAO Irrigation and Drainage Paper No. 56, Rome, Italy.
"""

from datetime import date, datetime
import math
from typing import Optional, Union


# Solar constant in MJ m-2 min-1
G_SC: float = 0.0820

# Stefan-Boltzmann constant in MJ K-4 m-2 day-1
STEFAN_BOLTZMANN: float = 4.903e-9

# Reference grass albedo
ALBEDO: float = 0.23


def atmospheric_pressure(elevation_m: float = 0.0) -> float:
    """Calculate atmospheric pressure (kPa) based on elevation (m).

    FAO-56 Eq. 7: P = 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26
    """
    if elevation_m < 0.0:
        elevation_m = 0.0
    term = (293.0 - 0.0065 * elevation_m) / 293.0
    if term <= 0.0:
        return 0.0
    return 101.3 * math.pow(term, 5.26)


def psychrometric_constant(pressure_kpa: float) -> float:
    """Calculate psychrometric constant gamma (kPa / °C).

    FAO-56 Eq. 8: gamma = 0.000665 * P
    """
    return 0.000665 * pressure_kpa


def saturation_vapor_pressure(temp_c: float) -> float:
    """Calculate saturation vapor pressure e°(T) in kPa at temperature T (°C).

    FAO-56 Eq. 11: e°(T) = 0.6108 * exp((17.27 * T) / (T + 237.3))
    """
    denom = temp_c + 237.3
    if abs(denom) < 1e-6:
        return 0.0
    try:
        exponent = (17.27 * temp_c) / denom
        if exponent > 700.0:
            return 1e6
        if exponent < -700.0:
            return 0.0
        return 0.6108 * math.exp(exponent)
    except (OverflowError, ValueError):
        return 0.0


def mean_saturation_vapor_pressure(temp_max_c: float, temp_min_c: float) -> float:
    """Calculate mean saturation vapor pressure es (kPa).

    FAO-56 Eq. 12: es = (e°(Tmax) + e°(Tmin)) / 2
    """
    return (saturation_vapor_pressure(temp_max_c) + saturation_vapor_pressure(temp_min_c)) / 2.0


def slope_vapor_pressure_curve(temp_c: float) -> float:
    """Calculate slope of saturation vapor pressure curve delta (kPa / °C).

    FAO-56 Eq. 13: delta = (4098 * (0.6108 * exp((17.27 * T) / (T + 237.3)))) / ((T + 237.3) ** 2)
    """
    denom = math.pow(temp_c + 237.3, 2)
    if denom <= 0.0:
        return 0.0
    e_t = saturation_vapor_pressure(temp_c)
    return (4098.0 * e_t) / denom


def actual_vapor_pressure(
    rh_pct: float,
    es_kpa: float,
    rh_min_pct: Optional[float] = None,
    rh_max_pct: Optional[float] = None,
    temp_max_c: Optional[float] = None,
    temp_min_c: Optional[float] = None,
) -> float:
    """Calculate actual vapor pressure ea (kPa).

    If rh_min_pct and rh_max_pct are provided:
        FAO-56 Eq. 17: ea = (e°(Tmin)*(RHmax/100) + e°(Tmax)*(RHmin/100)) / 2
    Else if only mean RH is provided:
        FAO-56 Eq. 19: ea = (RHmean / 100) * es
    """
    if (
        rh_max_pct is not None
        and rh_min_pct is not None
        and temp_max_c is not None
        and temp_min_c is not None
    ):
        e_tmin = saturation_vapor_pressure(temp_min_c)
        e_tmax = saturation_vapor_pressure(temp_max_c)
        return (e_tmin * (rh_max_pct / 100.0) + e_tmax * (rh_min_pct / 100.0)) / 2.0

    # Ensure humidity clamped between 0% and 100%
    clamped_rh = max(0.0, min(100.0, rh_pct))
    return (clamped_rh / 100.0) * es_kpa


def wind_speed_at_2m(wind_speed_ms: float, height_m: float = 2.0) -> float:
    """Convert wind speed measured at height_m to wind speed at 2 m (u2).

    FAO-56 Eq. 47: u2 = uz * (4.87 / ln(67.8 * zw - 5.42))
    """
    if abs(height_m - 2.0) < 1e-4:
        return max(0.0, wind_speed_ms)
    if height_m <= 0.08:
        return max(0.0, wind_speed_ms)

    factor = 4.87 / math.log(67.8 * height_m - 5.42)
    return max(0.0, wind_speed_ms * factor)


def extraterrestrial_radiation(latitude_deg: float, day_of_year: int) -> float:
    """Calculate extraterrestrial daily solar radiation Ra (MJ m-2 day-1).

    FAO-56 Eq. 21 to 25:
    phi = latitude in radians
    dr = 1 + 0.033 * cos(2 * pi * J / 365)
    delta = 0.409 * sin(2 * pi * J / 365 - 1.39)
    ws = arccos(-tan(phi) * tan(delta))
    Ra = (24 * 60 / pi) * G_sc * dr * (ws*sin(phi)*sin(delta) + cos(phi)*cos(delta)*sin(ws))
    """
    # Clamp latitude to avoid tan(90 deg) singularity
    clamped_lat = max(-89.9, min(89.9, latitude_deg))
    phi = math.radians(clamped_lat)
    dr = 1.0 + 0.033 * math.cos(2.0 * math.pi * day_of_year / 365.0)
    solar_dec = 0.409 * math.sin((2.0 * math.pi * day_of_year / 365.0) - 1.39)

    x = -math.tan(phi) * math.tan(solar_dec)
    # Clamp x to [-1.0, 1.0] to handle polar day/night cases
    x = max(-1.0, min(1.0, x))
    ws = math.acos(x)

    coef = (24.0 * 60.0 / math.pi) * G_SC * dr
    radiation = coef * (
        ws * math.sin(phi) * math.sin(solar_dec)
        + math.cos(phi) * math.cos(solar_dec) * math.sin(ws)
    )
    return max(0.0, radiation)


def clear_sky_solar_radiation(ra_mjm2: float, elevation_m: float = 0.0) -> float:
    """Calculate clear-sky solar radiation Rso (MJ m-2 day-1).

    FAO-56 Eq. 37: Rso = (0.75 + 2e-5 * z) * Ra
    """
    return (0.75 + 2e-5 * max(0.0, elevation_m)) * max(0.0, ra_mjm2)


def net_solar_radiation(rs_mjm2: float, albedo: float = ALBEDO) -> float:
    """Calculate net solar (shortwave) radiation Rns (MJ m-2 day-1).

    FAO-56 Eq. 38: Rns = (1 - albedo) * Rs
    """
    return (1.0 - albedo) * max(0.0, rs_mjm2)


def net_longwave_radiation(
    temp_max_c: float,
    temp_min_c: float,
    ea_kpa: float,
    rs_mjm2: float,
    rso_mjm2: float,
) -> float:
    """Calculate net longwave radiation Rnl (MJ m-2 day-1).

    FAO-56 Eq. 39:
    Rnl = sigma * ((Tmax_K^4 + Tmin_K^4) / 2) * (0.34 - 0.14*sqrt(ea)) * (1.35*(Rs/Rso) - 0.35)
    """
    t_max_k4 = math.pow(temp_max_c + 273.16, 4)
    t_min_k4 = math.pow(temp_min_c + 273.16, 4)
    thermal_term = STEFAN_BOLTZMANN * ((t_max_k4 + t_min_k4) / 2.0)

    # Actual vapor pressure effect
    ea_term = 0.34 - 0.14 * math.sqrt(max(0.0, ea_kpa))

    # Cloudiness factor: Rs / Rso capped at 1.0 and minimum 0.3
    rel_solar = rs_mjm2 / rso_mjm2 if rso_mjm2 > 0 else 0.5
    rel_solar = max(0.3, min(1.0, rel_solar))
    cloud_term = 1.35 * rel_solar - 0.35

    return max(0.0, thermal_term * ea_term * cloud_term)


def net_radiation(
    rs_mjm2: float,
    temp_max_c: float,
    temp_min_c: float,
    ea_kpa: float,
    latitude_deg: float,
    day_of_year: int,
    elevation_m: float = 0.0,
    albedo: float = ALBEDO,
) -> float:
    """Calculate net radiation Rn (MJ m-2 day-1).

    FAO-56 Eq. 40: Rn = Rns - Rnl
    """
    ra = extraterrestrial_radiation(latitude_deg, day_of_year)
    rso = clear_sky_solar_radiation(ra, elevation_m)
    rns = net_solar_radiation(rs_mjm2, albedo)
    rnl = net_longwave_radiation(temp_max_c, temp_min_c, ea_kpa, rs_mjm2, rso)
    return rns - rnl


def penman_monteith_fao56(
    net_radiation_mjm2: float,
    t_mean_c: float,
    wind_speed_2m_ms: float,
    es_kpa: float,
    ea_kpa: float,
    delta_kpa_c: float,
    gamma_kpa_c: float,
    soil_heat_flux_mjm2: float = 0.0,
) -> float:
    """Compute daily ET₀ (mm/day) using FAO-56 Penman-Monteith equation (Eq. 6).

    ET0 = [0.408 * delta * (Rn - G) + gamma * (900 / (T + 273)) * u2 * (es - ea)] /
          [delta + gamma * (1 + 0.34 * u2)]

    Returns:
        float: Reference evapotranspiration ET₀ in mm/day.
    """
    u2 = max(0.0, wind_speed_2m_ms)
    vpd = max(0.0, es_kpa - ea_kpa)
    rn_minus_g = net_radiation_mjm2 - soil_heat_flux_mjm2

    temp_k = t_mean_c + 273.0
    if temp_k <= 0.0:
        temp_k = 273.0

    radiation_term = 0.408 * delta_kpa_c * rn_minus_g
    aerodynamic_term = gamma_kpa_c * (900.0 / temp_k) * u2 * vpd
    denominator = delta_kpa_c + gamma_kpa_c * (1.0 + 0.34 * u2)

    if (
        denominator <= 0.0
        or math.isnan(denominator)
        or math.isinf(denominator)
    ):
        return 0.0

    et0 = (radiation_term + aerodynamic_term) / denominator
    if math.isnan(et0) or math.isinf(et0):
        return 0.0
    return max(0.0, et0)


def calculate_daily_et0(
    temp_max_c: Optional[float],
    temp_min_c: Optional[float],
    humidity_pct: Optional[float],
    wind_speed_ms: Optional[float],
    solar_radiation_mjm2: Optional[float],
    latitude_deg: Optional[float] = None,
    elevation_m: float = 0.0,
    observation_date: Optional[Union[date, str]] = None,
    day_of_year: Optional[int] = None,
    wind_height_m: float = 10.0,
    net_radiation_mjm2: Optional[float] = None,
    fallback_et0: Optional[float] = None,
) -> Optional[float]:
    """Calculate daily FAO-56 Penman-Monteith ET₀ with fallback.

    Args:
        temp_max_c: Maximum temperature in °C.
        temp_min_c: Minimum temperature in °C.
        humidity_pct: Mean relative humidity in %.
        wind_speed_ms: Wind speed in m/s (default measured at 10m).
        solar_radiation_mjm2: Solar shortwave radiation in MJ m-2 day-1.
        latitude_deg: Estate latitude in degrees (positive North, negative South).
        elevation_m: Elevation above sea level in meters.
        observation_date: Observation date (used to compute day_of_year if omitted).
        day_of_year: Day of year (1-366).
        wind_height_m: Height of wind speed measurement in meters (Open-Meteo = 10m).
        net_radiation_mjm2: Direct Rn value if precomputed, otherwise calculated from Rs.
        fallback_et0: Fallback ET₀ provided by Open-Meteo or external provider.

    Returns:
        float: Calculated ET₀ in mm/day (rounded to 2 decimal places), or fallback_et0.
    """
    try:
        # Check required meteorological inputs
        if (
            temp_max_c is None
            or temp_min_c is None
            or humidity_pct is None
            or wind_speed_ms is None
            or (solar_radiation_mjm2 is None and net_radiation_mjm2 is None)
        ):
            if fallback_et0 is not None:
                return round(float(fallback_et0), 2)
            return None

        # Guard against NaN or Inf values in inputs
        for val in (temp_max_c, temp_min_c, humidity_pct, wind_speed_ms, solar_radiation_mjm2, net_radiation_mjm2):
            if val is not None and (math.isnan(val) or math.isinf(val)):
                if fallback_et0 is not None and not (math.isnan(fallback_et0) or math.isinf(fallback_et0)):
                    return round(float(fallback_et0), 2)
                return None

        # Resolve day of year
        doy = day_of_year
        if doy is None and observation_date is not None:
            if isinstance(observation_date, str):
                d = datetime.strptime(observation_date, "%Y-%m-%d").date()
            else:
                d = observation_date
            doy = d.timetuple().tm_yday
        if doy is None:
            doy = 180  # Mid-year fallback if date is missing

        # Calculate basic parameters
        t_mean = (temp_max_c + temp_min_c) / 2.0
        p_kpa = atmospheric_pressure(elevation_m)
        gamma = psychrometric_constant(p_kpa)
        delta = slope_vapor_pressure_curve(t_mean)
        es = mean_saturation_vapor_pressure(temp_max_c, temp_min_c)
        ea = actual_vapor_pressure(humidity_pct, es)
        u2 = wind_speed_at_2m(wind_speed_ms, height_m=wind_height_m)

        # Net radiation Rn
        if net_radiation_mjm2 is not None:
            rn = net_radiation_mjm2
        else:
            lat = latitude_deg if latitude_deg is not None else 0.0
            rn = net_radiation(
                rs_mjm2=solar_radiation_mjm2 or 0.0,
                temp_max_c=temp_max_c,
                temp_min_c=temp_min_c,
                ea_kpa=ea,
                latitude_deg=lat,
                day_of_year=doy,
                elevation_m=elevation_m,
            )

        et0 = penman_monteith_fao56(
            net_radiation_mjm2=rn,
            t_mean_c=t_mean,
            wind_speed_2m_ms=u2,
            es_kpa=es,
            ea_kpa=ea,
            delta_kpa_c=delta,
            gamma_kpa_c=gamma,
            soil_heat_flux_mjm2=0.0,
        )

        if math.isnan(et0) or math.isinf(et0):
            if fallback_et0 is not None and not (math.isnan(fallback_et0) or math.isinf(fallback_et0)):
                return round(float(fallback_et0), 2)
            return None

        return round(et0, 2)

    except Exception:
        if fallback_et0 is not None:
            return round(float(fallback_et0), 2)
        return None
