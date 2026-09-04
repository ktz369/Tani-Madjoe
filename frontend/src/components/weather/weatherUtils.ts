import React from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Wind,
  Droplets,
  SunMedium,
  LucideIcon,
} from "lucide-react";

export interface WeatherConditionInfo {
  label: string;
  icon: LucideIcon;
  textColor: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
}

export function getWeatherConditionInfo(
  conditionText?: string | null,
  rainfallMm?: number | null,
  solarMjm2?: number | null,
  windSpeedMs?: number | null
): WeatherConditionInfo {
  const rain = rainfallMm ?? 0;
  const solar = solarMjm2 ?? 0;
  const wind = windSpeedMs ?? 0;
  const text = (conditionText || "").toLowerCase();

  if (text.includes("sangat lebat") || rain >= 50) {
    return {
      label: conditionText || "Hujan Sangat Lebat",
      icon: CloudLightning,
      textColor: "text-purple-900",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      iconColor: "text-purple-600",
    };
  }

  if (text.includes("lebat") || rain >= 20) {
    return {
      label: conditionText || "Hujan Lebat",
      icon: CloudRain,
      textColor: "text-blue-900",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-300",
      iconColor: "text-blue-600",
    };
  }

  if (text.includes("sedang") || rain >= 5) {
    return {
      label: conditionText || "Hujan Sedang",
      icon: CloudRain,
      textColor: "text-sky-900",
      bgColor: "bg-sky-50",
      borderColor: "border-sky-200",
      iconColor: "text-sky-600",
    };
  }

  if (text.includes("ringan") || (rain > 0.5 && rain < 5)) {
    return {
      label: conditionText || "Hujan Ringan",
      icon: CloudDrizzle,
      textColor: "text-cyan-900",
      bgColor: "bg-cyan-50",
      borderColor: "border-cyan-200",
      iconColor: "text-cyan-600",
    };
  }

  if (text.includes("gerimis") || rain > 0) {
    return {
      label: conditionText || "Gerimis / Berawan",
      icon: CloudDrizzle,
      textColor: "text-slate-800",
      bgColor: "bg-slate-100",
      borderColor: "border-slate-200",
      iconColor: "text-slate-600",
    };
  }

  if (wind >= 10) {
    return {
      label: "Angin Kencang",
      icon: Wind,
      textColor: "text-teal-900",
      bgColor: "bg-teal-50",
      borderColor: "border-teal-200",
      iconColor: "text-teal-600",
    };
  }

  if (text.includes("cerah terik") || solar >= 18) {
    return {
      label: conditionText || "Cerah Terik",
      icon: Sun,
      textColor: "text-amber-900",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-200",
      iconColor: "text-amber-500",
    };
  }

  if (text.includes("berawan") && text.includes("cerah")) {
    return {
      label: conditionText || "Cerah Berawan",
      icon: CloudSun,
      textColor: "text-amber-800",
      bgColor: "bg-amber-50/70",
      borderColor: "border-amber-200",
      iconColor: "text-amber-500",
    };
  }

  if (text.includes("berawan") || solar < 12) {
    return {
      label: conditionText || "Berawan",
      icon: Cloud,
      textColor: "text-slate-800",
      bgColor: "bg-slate-100",
      borderColor: "border-slate-200",
      iconColor: "text-slate-500",
    };
  }

  return {
    label: conditionText || "Cerah Berawan",
    icon: CloudSun,
    textColor: "text-amber-900",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    iconColor: "text-amber-500",
  };
}

export function formatIndonesianDate(
  dateStr: string,
  options?: { short?: boolean; includeDay?: boolean }
): string {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);

      const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const dayNamesShort = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      const monthNames = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
      ];
      const monthNamesShort = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "Mei",
        "Jun",
        "Jul",
        "Agu",
        "Sep",
        "Okt",
        "Nov",
        "Des",
      ];

      const dayName = options?.short ? dayNamesShort[d.getDay()] : dayNames[d.getDay()];
      const monthName = options?.short ? monthNamesShort[d.getMonth()] : monthNames[d.getMonth()];

      if (options?.includeDay !== false) {
        return `${dayName}, ${day} ${monthName}${options?.short ? "" : ` ${year}`}`;
      }
      return `${day} ${monthName} ${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}
