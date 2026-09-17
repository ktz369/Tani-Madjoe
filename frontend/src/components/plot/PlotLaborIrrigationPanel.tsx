"use client";

import React, { useState, useEffect } from "react";
import { Users, Droplets, Plus, Fuel, Clock, Calendar, Check, X } from "lucide-react";
import {
  LaborLog,
  IrrigationLog,
  TaskType,
  WaterSource,
  CreateLaborLogPayload,
  CreateIrrigationLogPayload,
} from "@/types/operations";
import { operationsApi } from "@/lib/operationsApi";

interface Props {
  plotId: number;
  plotName: string;
  onCostUpdated?: () => void;
}

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  olah_tanah: "Olah Tanah I (Bajak Singkal Traktor)",
  perbaikan_galengan: "Perbaikan Galengan & Pematang Terasiring",
  pelumpuran: "Pelumpuran (Puddling) & Perataan Tanah II",
  semai: "Persemaian Bibit",
  tandur: "Tanam / Tandur",
  penyiangan: "Penyiangan Gulma (Matun)",
  pemupukan: "Pemupukan",
  penyemprotan: "Penyemprotan / Proteksi",
  panen: "Panen",
};

const WATER_SOURCE_LABELS: Record<string, string> = {
  irigasi_tersier: "Irigasi Tersier (Gravitasi)",
  pompa_diesel: "Pompa Diesel Alkon",
  sumur_dalam: "Sumur Bor Dalam (Submersible)",
};

export default function PlotLaborIrrigationPanel({ plotId, plotName, onCostUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<"labor" | "irrigation">("labor");
  const [laborLogs, setLaborLogs] = useState<LaborLog[]>([]);
  const [irrigationLogs, setIrrigationLogs] = useState<IrrigationLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddIrrigation, setShowAddIrrigation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Labor Form State
  const [taskType, setTaskType] = useState<TaskType>("olah_tanah");
  const [activityDate, setActivityDate] = useState(new Date().toISOString().split("T")[0]);
  const [laborCount, setLaborCount] = useState("2");
  const [hoursWorked, setHoursWorked] = useState("7.0");
  const [wageRate, setWageRate] = useState("90000");
  const [isContract, setIsContract] = useState(false);
  const [laborNotes, setLaborNotes] = useState("");

  // Irrigation Form State
  const [waterSource, setWaterSource] = useState<WaterSource>("pompa_diesel");
  const [waterVolume, setWaterVolume] = useState("");
  const [pumpDuration, setPumpDuration] = useState("3.0");
  const [fuelLiters, setFuelLiters] = useState("6.0");
  const [fuelCost, setFuelCost] = useState("90000");
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 16));
  const [endedAt, setEndedAt] = useState(new Date().toISOString().slice(0, 16));

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lLogs, iLogs] = await Promise.all([
        operationsApi.getLaborLogs(plotId),
        operationsApi.getIrrigationLogs(plotId),
      ]);
      setLaborLogs(lLogs);
      setIrrigationLogs(iLogs);
    } catch (err) {
      console.error("Failed to load operations logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [plotId]);

  const totalLaborCost = laborLogs.reduce((acc, curr) => acc + (curr.total_cost || 0), 0);
  const totalFuelCost = irrigationLogs.reduce((acc, curr) => acc + (curr.fuel_cost || 0), 0);
  const totalFuelLiters = irrigationLogs.reduce((acc, curr) => acc + (curr.fuel_liters || 0), 0);

  const handleAddLabor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const count = parseInt(laborCount, 10) || 1;
      const hours = parseFloat(hoursWorked) || 7.0;
      const wage = parseFloat(wageRate) || 90000;
      const total = isContract ? wage : wage * count;

      const payload: CreateLaborLogPayload = {
        activity_date: activityDate,
        task_type: taskType,
        labor_count: count,
        hours_worked: hours,
        wage_rate_per_day: wage,
        is_contract: isContract,
        total_cost: total,
        notes: laborNotes.trim() || undefined,
      };

      await operationsApi.createLaborLog(plotId, payload);
      await fetchData();
      onCostUpdated?.();
      setShowAddLabor(false);
      setLaborNotes("");
    } catch (err) {
      console.error("Error adding labor log:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddIrrigation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: CreateIrrigationLogPayload = {
        water_source: waterSource,
        water_volume_m3: waterVolume ? parseFloat(waterVolume) : undefined,
        pump_duration_hours: parseFloat(pumpDuration) || 0,
        fuel_liters: parseFloat(fuelLiters) || 0,
        fuel_cost: parseFloat(fuelCost) || 0,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
      };

      await operationsApi.createIrrigationLog(plotId, payload);
      await fetchData();
      onCostUpdated?.();
      setShowAddIrrigation(false);
    } catch (err) {
      console.error("Error adding irrigation log:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-black/[0.08] py-[21px]">
      {/* Header & Telemetry Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#1b4332]" />
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              Operasional Lapangan & Tenaga Kerja (HOK)
            </h3>
          </div>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            Pencatatan upah riil HOK per fase agronomis dan konsumsi solar pompa irigasi
          </p>
        </div>

        {/* Tab switcher + Action button */}
        <div className="flex items-center gap-3">
          <div className="inline-flex p-0.5 bg-[var(--surface)] border border-black/[0.08] rounded-[4px]">
            <button
              onClick={() => setActiveTab("labor")}
              className={`px-3 py-1 text-xs font-medium rounded-[3px] transition-colors ${
                activeTab === "labor"
                  ? "bg-white text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              HOK ({laborLogs.length})
            </button>
            <button
              onClick={() => setActiveTab("irrigation")}
              className={`px-3 py-1 text-xs font-medium rounded-[3px] transition-colors ${
                activeTab === "irrigation"
                  ? "bg-white text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              Irigasi & BBM ({irrigationLogs.length})
            </button>
          </div>

          {activeTab === "labor" ? (
            <button
              onClick={() => setShowAddLabor(true)}
              className="h-[30px] px-3 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium flex items-center gap-1.5 hover:bg-[#143225] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Catat HOK
            </button>
          ) : (
            <button
              onClick={() => setShowAddIrrigation(true)}
              className="h-[30px] px-3 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium flex items-center gap-1.5 hover:bg-[#143225] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Catat Irigasi
            </button>
          )}
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[var(--surface)] rounded-[3px] border border-black/[0.06] mb-4">
        <div>
          <span className="text-[11px] text-[var(--ink-muted)] block">Total Upah HOK</span>
          <span className="text-sm font-mono tabular-nums font-bold text-[var(--ink)]">
            Rp {totalLaborCost.toLocaleString("id-ID")}
          </span>
        </div>
        <div>
          <span className="text-[11px] text-[var(--ink-muted)] block">Total Tenaga Kerja (HOK)</span>
          <span className="text-sm font-mono tabular-nums font-semibold text-[var(--ink)]">
            {laborLogs.reduce((acc, curr) => acc + (curr.labor_count || 1), 0)} HOK ({laborLogs.reduce((acc, curr) => acc + (curr.hours_worked || 0), 0)} Jam)
          </span>
        </div>
        <div>
          <span className="text-[11px] text-[var(--ink-muted)] block">Total Solar Irigasi</span>
          <span className="text-sm font-mono tabular-nums font-semibold text-[var(--ink)]">
            {totalFuelLiters.toFixed(1)} Liter
          </span>
        </div>
        <div>
          <span className="text-[11px] text-[var(--ink-muted)] block">Biaya Solar / BBM</span>
          <span className="text-sm font-mono tabular-nums font-bold text-[var(--ink)]">
            Rp {totalFuelCost.toLocaleString("id-ID")}
          </span>
        </div>
      </div>

      {/* Content Tables */}
      {loading ? (
        <div className="py-8 text-center text-xs text-[var(--ink-muted)]">Memuat log operasional...</div>
      ) : activeTab === "labor" ? (
        laborLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--ink-muted)] bg-neutral-50 rounded-[3px] border border-dashed border-black/[0.08]">
            Belum ada catatan tenaga kerja (HOK) untuk petak ini. Klik "Catat HOK" untuk memulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black/[0.08] text-[var(--ink-muted)]">
                  <th className="py-2.5 font-medium">Tanggal</th>
                  <th className="py-2.5 font-medium">Aktivitas / Tugas</th>
                  <th className="py-2.5 font-medium text-center">Pekerja</th>
                  <th className="py-2.5 font-medium text-right">Jam Kerja</th>
                  <th className="py-2.5 font-medium text-right">Tarif Harian</th>
                  <th className="py-2.5 font-medium text-center">Sistem</th>
                  <th className="py-2.5 font-medium text-right">Total Upah</th>
                  <th className="py-2.5 font-medium pl-4">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {laborLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-black/[0.015]">
                    <td className="py-2.5 font-mono tabular-nums text-[var(--ink-muted)]">{log.activity_date}</td>
                    <td className="py-2.5 font-medium text-[var(--ink)]">
                      {TASK_TYPE_LABELS[log.task_type] || log.task_type}
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-center text-[var(--ink)]">
                      {log.labor_count} Orang
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-[var(--ink-muted)]">
                      {log.hours_worked} Jam
                    </td>
                    <td className="py-2.5 font-mono tabular-nums text-right text-[var(--ink-muted)]">
                      Rp {log.wage_rate_per_day.toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded-[2px] text-[10px] font-medium ${
                          log.is_contract ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {log.is_contract ? "Borongan" : "Harian"}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono tabular-nums font-semibold text-right text-[var(--ink)]">
                      Rp {log.total_cost.toLocaleString("id-ID")}
                    </td>
                    <td className="py-2.5 pl-4 text-[var(--ink-muted)] max-w-[200px] truncate">
                      {log.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : irrigationLogs.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--ink-muted)] bg-neutral-50 rounded-[3px] border border-dashed border-black/[0.08]">
          Belum ada catatan irigasi atau pemompaan BBM. Klik "Catat Irigasi" untuk menambahkan.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-black/[0.08] text-[var(--ink-muted)]">
                <th className="py-2.5 font-medium">Waktu Selesai</th>
                <th className="py-2.5 font-medium">Sumber Air</th>
                <th className="py-2.5 font-medium text-right">Durasi Pompa</th>
                <th className="py-2.5 font-medium text-right">Estimasi Volume</th>
                <th className="py-2.5 font-medium text-right">Solar (Liter)</th>
                <th className="py-2.5 font-medium text-right">Biaya BBM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {irrigationLogs.map((log) => (
                <tr key={log.id} className="hover:bg-black/[0.015]">
                  <td className="py-2.5 font-mono tabular-nums text-[var(--ink-muted)]">
                    {new Date(log.ended_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2.5 font-medium text-[var(--ink)]">
                    {WATER_SOURCE_LABELS[log.water_source] || log.water_source}
                  </td>
                  <td className="py-2.5 font-mono tabular-nums text-right text-[var(--ink-muted)]">
                    {log.pump_duration_hours} Jam
                  </td>
                  <td className="py-2.5 font-mono tabular-nums text-right text-[var(--ink-muted)]">
                    {log.water_volume_m3 ? `${log.water_volume_m3} m³` : "-"}
                  </td>
                  <td className="py-2.5 font-mono tabular-nums text-right text-[var(--ink-muted)]">
                    {log.fuel_liters > 0 ? `${log.fuel_liters} L` : "-"}
                  </td>
                  <td className="py-2.5 font-mono tabular-nums font-semibold text-right text-[var(--ink)]">
                    {log.fuel_cost > 0 ? `Rp ${log.fuel_cost.toLocaleString("id-ID")}` : "Rp 0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Add Labor */}
      {showAddLabor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[480px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Catat HOK Tenaga Kerja</h3>
              <button
                onClick={() => setShowAddLabor(false)}
                className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddLabor} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Aktivitas</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                >
                  {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Tanggal</label>
                  <input
                    type="date"
                    value={activityDate}
                    onChange={(e) => setActivityDate(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Jumlah Pekerja</label>
                  <input
                    type="number"
                    min="1"
                    value={laborCount}
                    onChange={(e) => setLaborCount(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Jam Kerja</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">
                    {isContract ? "Total Upah Borongan" : "Upah Harian per Orang"}
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={wageRate}
                    onChange={(e) => setWageRate(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isContractCheck"
                  checked={isContract}
                  onChange={(e) => setIsContract(e.target.checked)}
                  className="rounded-[2px] border-black/[0.2] text-[#1b4332] focus:ring-[#1b4332]"
                />
                <label htmlFor="isContractCheck" className="text-xs text-[var(--ink)] select-none">
                  Sistem Borongan (Bukan Harian per Orang)
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Catatan</label>
                <input
                  type="text"
                  value={laborNotes}
                  onChange={(e) => setLaborNotes(e.target.value)}
                  placeholder="Contoh: Pembersihan pematang, petak blok utara..."
                  className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddLabor(false)}
                  className="h-[34px] px-4 rounded-[3px] border border-black/[0.08] text-xs font-medium text-[var(--ink-muted)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-[34px] px-5 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium hover:bg-[#143225]"
                >
                  {submitting ? "Menyimpan..." : "Simpan HOK"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Irrigation */}
      {showAddIrrigation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-black/[0.08] rounded-[6px] shadow-xl w-full max-w-[480px] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08] bg-[var(--surface)]">
              <h3 className="text-sm font-semibold text-[var(--ink)]">Catat Operasional Irigasi & Pompa</h3>
              <button
                onClick={() => setShowAddIrrigation(false)}
                className="p-1 rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddIrrigation} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Tanggal Irigasi</label>
                  <input
                    type="date"
                    value={startedAt.slice(0, 10)}
                    onChange={(e) => {
                      const d = e.target.value;
                      setStartedAt(`${d}T08:00`);
                      setEndedAt(`${d}T11:00`);
                    }}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Sumber Air</label>
                  <select
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value as WaterSource)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                  >
                    {Object.entries(WATER_SOURCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Durasi Pompa (Jam)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={pumpDuration}
                    onChange={(e) => setPumpDuration(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Estimasi Volume (m³)</label>
                  <input
                    type="number"
                    min="0"
                    value={waterVolume}
                    onChange={(e) => setWaterVolume(e.target.value)}
                    placeholder="Contoh: 150"
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Solar Digunakan (Liter)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={fuelLiters}
                    onChange={(e) => setFuelLiters(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ink-muted)] mb-1">Biaya Solar / BBM (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={fuelCost}
                    onChange={(e) => setFuelCost(e.target.value)}
                    className="w-full h-[34px] px-3 rounded-[3px] border border-black/[0.08] text-xs font-mono tabular-nums text-[var(--ink)] bg-white focus:outline-none focus:border-[#1b4332]"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddIrrigation(false)}
                  className="h-[34px] px-4 rounded-[3px] border border-black/[0.08] text-xs font-medium text-[var(--ink-muted)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-[34px] px-5 rounded-[3px] bg-[#1b4332] text-white text-xs font-medium hover:bg-[#143225]"
                >
                  {submitting ? "Menyimpan..." : "Simpan Irigasi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
