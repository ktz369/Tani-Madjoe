"use client";

import React from "react";
import { CheckCircle2, XCircle, Layers, Plus } from "lucide-react";
import { PlotLaborIrrigationPanel } from "@/components/plot";
import { PlotAlertList } from "@/components/alerts";
import { PlantingSeason, Plot } from "@/types";

export interface TabOperasionalProps {
  plot: Plot;
  seasons: PlantingSeason[];
  onCostUpdated: () => void;
  onOpenHarvestModal: (season: PlantingSeason) => void;
  onOpenFailModal: (season: PlantingSeason) => void;
  onOpenCreateModal: () => void;
  getStatusBadge?: (status: string) => React.ReactNode;
}

function defaultStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
        Aktif
      </span>
    );
  }
  if (s === "harvested") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200">
        <CheckCircle2 className="w-3 h-3" />
        Dipanen
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-mono font-semibold bg-rose-50 text-rose-800 border border-rose-200">
        <XCircle className="w-3 h-3" />
        Gagal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-mono text-[var(--ink-3)] border border-black/[0.08]">
      {status}
    </span>
  );
}

export default function TabOperasional({
  plot,
  seasons,
  onCostUpdated,
  onOpenHarvestModal,
  onOpenFailModal,
  onOpenCreateModal,
  getStatusBadge = defaultStatusBadge,
}: TabOperasionalProps) {
  return (
    <div className="divide-y divide-black/[0.08] space-y-[21px]">
      {/* Field Operations & Labor HOK Ledger (OPS-07) */}
      <section className="pt-2">
        <PlotLaborIrrigationPanel
          plotId={plot.id}
          plotName={plot.name}
          onCostUpdated={onCostUpdated}
        />
      </section>

      {/* Alert List: Beautiful UI Task Row Pattern */}
      <section className="py-[21px]">
        <PlotAlertList plotId={plot.id} plotName={plot.name} />
      </section>

      {/* Riwayat Musim Tanam (Planting Seasons History - Hairline Table) */}
      <section className="py-[21px]">
        <div className="border border-black/[0.08] bg-white rounded-[3px] overflow-hidden">
          <div className="p-[21px] border-b border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="label-telemetry block">LOG AKTIVITAS SIKLUS</span>
              <h3 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight mt-0.5">
                Riwayat Musim Tanam Petak
              </h3>
              <p className="text-[12px] text-[var(--ink-2)] mt-0.5">
                Histori siklus tanam, varietas bibit, produktivitas panen, dan status siklus
              </p>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="text-[11px] font-mono text-[var(--ink-3)] border border-black/[0.08] px-2.5 py-1 rounded-[2px] tabular-nums">
                TOTAL SIKLUS: {seasons.length}
              </div>
              <button
                onClick={onOpenCreateModal}
                className="h-[30px] px-3 rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Mulai Musim</span>
              </button>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--field)] text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider border-b border-black/[0.08]">
                <tr>
                  <th scope="col" className="py-[13px] px-[21px]">
                    Tanggal Tanam
                  </th>
                  <th scope="col" className="py-[13px] px-[21px]">
                    Komoditas & Varietas
                  </th>
                  <th scope="col" className="py-[13px] px-[21px]">
                    Status
                  </th>
                  <th scope="col" className="py-[13px] px-[21px]">
                    Tanggal Panen
                  </th>
                  <th scope="col" className="py-[13px] px-[21px] text-right font-mono">
                    Realisasi / Est.
                  </th>
                  <th scope="col" className="py-[13px] px-[21px]">
                    Catatan
                  </th>
                  <th scope="col" className="py-[13px] px-[21px] text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {seasons.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 px-[21px] text-center text-[var(--ink-3)] font-mono">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-[var(--ink-3)]" />
                      <p className="font-semibold text-[var(--ink-2)] text-[13px]">
                        Belum ada riwayat musim tanam untuk petak ini.
                      </p>
                      <p className="text-[11px] text-[var(--ink-3)] mt-1">
                        Klik tombol &ldquo;Mulai Musim Baru&rdquo; untuk memulai siklus tanam perdana.
                      </p>
                    </td>
                  </tr>
                ) : (
                  seasons.map((season) => (
                    <tr
                      key={season.id}
                      className={`hover:bg-black/[0.02] transition-colors ${
                        season.status === "active" ? "bg-emerald-50/20" : ""
                      }`}
                    >
                      <td className="py-[13px] px-[21px] font-mono tabular-nums font-semibold text-[var(--ink)]">
                        {season.planting_date}
                      </td>
                      <td className="py-[13px] px-[21px]">
                        <div className="flex items-center gap-2">
                          <span className="capitalize px-1.5 py-0.5 text-[10px] font-mono rounded-[2px] bg-black/[0.04] text-[var(--ink-2)] border border-black/[0.08]">
                            {season.crop_type || plot.crop_type}
                          </span>
                          <span className="font-medium text-[var(--ink)]">
                            {season.variety_name || "-"}
                          </span>
                        </div>
                      </td>
                      <td className="py-[13px] px-[21px]">
                        {getStatusBadge(season.status)}
                      </td>
                      <td className="py-[13px] px-[21px] font-mono tabular-nums text-[var(--ink-2)]">
                        {season.harvest_date || "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right font-mono tabular-nums text-[12px]">
                        {season.yield_estimate_ton_per_ha !== null &&
                        season.yield_estimate_ton_per_ha !== undefined ? (
                          <span className="font-bold text-[var(--ink)]">
                            {season.yield_estimate_ton_per_ha} ton/ha
                          </span>
                        ) : (
                          <span className="text-[var(--ink-3)]">-</span>
                        )}
                      </td>
                      <td className="py-[13px] px-[21px] text-[12px] text-[var(--ink-2)] max-w-xs truncate" title={season.notes || ""}>
                        {season.notes || "-"}
                      </td>
                      <td className="py-[13px] px-[21px] text-right">
                        {season.status === "active" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onOpenHarvestModal(season)}
                              className="h-[28px] px-[13px] rounded-[3px] bg-[var(--accent)] hover:bg-emerald-700 text-white text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                              title="Selesaikan musim tanam & catat panen"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Panen
                            </button>
                            <button
                              onClick={() => onOpenFailModal(season)}
                              className="h-[28px] px-[13px] rounded-[3px] border border-black/[0.08] bg-transparent text-rose-600 hover:bg-rose-50 text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                              title="Tandai musim tanam gagal"
                            >
                              <XCircle className="w-3 h-3" />
                              Gagal
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-[var(--ink-3)]">Arsip</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
