"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
  Sprout,
  Layers,
  Coins,
} from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import {
  PlotDetailHeader,
  SeasonActionModals,
  SaprotanApplicationModal,
  PestScoutingModal,
  PostHarvestModal,
  TabIkhtisar,
  TabAgronomi,
  TabOperasional,
  TabKeuangan,
} from "@/components/plot";
import { api } from "@/lib/api";
import { CropVariety, PlantingSeason, Plot, PlotDetail } from "@/types";

type TabKey = "ikhtisar" | "agronomi" | "operasional" | "keuangan";

function DetailPetakContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const plotId = params?.id as string;

  // Active tab state from URL query parameter (?tab=ikhtisar|agronomi|operasional|keuangan)
  const rawTab = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey =
    rawTab === "agronomi" || rawTab === "operasional" || rawTab === "keuangan"
      ? rawTab
      : "ikhtisar";

  const handleTabChange = (newTab: TabKey) => {
    router.push(`/petak/${plotId}?tab=${newTab}`, { scroll: false });
  };

  // Data states
  const [plot, setPlot] = useState<Plot | null>(null);
  const [plotDetail, setPlotDetail] = useState<PlotDetail | null>(null);
  const [seasons, setSeasons] = useState<PlantingSeason[]>([]);
  const [varieties, setVarieties] = useState<CropVariety[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notification / Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals Visibility
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [showSaprotanModal, setShowSaprotanModal] = useState(false);
  const [showScoutingModal, setShowScoutingModal] = useState(false);
  const [showPostHarvestModal, setShowPostHarvestModal] = useState(false);
  const [refreshOpsTrigger, setRefreshOpsTrigger] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<PlantingSeason | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    if (!plotId) return;
    try {
      setLoading(true);
      setError(null);

      const [plotRes, detailRes, seasonsRes, varietiesRes] = await Promise.all([
        api.get<Plot>(`/plots/${plotId}`),
        api.get<PlotDetail>(`/plots/${plotId}/detail`).catch(() => null),
        api.get<PlantingSeason[]>(`/plots/${plotId}/seasons`),
        api.get<CropVariety[]>("/varieties"),
      ]);

      setPlot(plotRes.data);
      if (detailRes && detailRes.data) setPlotDetail(detailRes.data);
      setSeasons(Array.isArray(seasonsRes.data) ? seasonsRes.data : []);
      setVarieties(Array.isArray(varietiesRes.data) ? varietiesRes.data : []);
    } catch (err: any) {
      console.error("Gagal memuat data petak:", err);
      setError(err.response?.data?.detail || "Gagal memuat informasi petak dan musim tanam.");
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeSeason = seasons.find((s) => s.status === "active");
  const hasHarvestedSeason = seasons.some((s) => s.status === "harvested");

  const openHarvestModal = (season: PlantingSeason) => {
    setSelectedSeason(season);
    setShowHarvestModal(true);
  };

  const openFailModal = (season: PlantingSeason) => {
    setSelectedSeason(season);
    setShowFailModal(true);
  };

  const tabList: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "ikhtisar", label: "Ikhtisar", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "agronomi", label: "Agronomi", icon: <Sprout className="w-4 h-4" /> },
    { key: "operasional", label: "Operasional", icon: <Layers className="w-4 h-4" /> },
    { key: "keuangan", label: "Keuangan", icon: <Coins className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--canvas)] font-sans pt-[68px]">
      <Navbar />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 transition-all duration-200">
          <div
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-[3px] border text-[12px] font-mono font-medium shadow-lg ${
              toast.type === "success"
                ? "bg-white border-emerald-400 text-emerald-900"
                : "bg-white border-rose-400 text-rose-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-28 font-mono text-[var(--ink-3)]">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-[12px]">Memuat data telemetri petak & musim tanam...</p>
          </div>
        ) : error ? (
          <div className="border border-rose-200 bg-white rounded-[3px] p-[21px] text-center max-w-lg mx-auto my-12">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <h2 className="text-[14px] font-bold text-rose-900 mb-1">Terjadi Gangguan Data</h2>
            <p className="text-[12px] text-rose-700 font-mono mb-4">{error}</p>
            <button
              onClick={() => fetchData()}
              className="h-[34px] px-[21px] rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-medium transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : plot ? (
          <div className="space-y-4">
            {/* PERSISTENT ANCHOR HEADER */}
            <PlotDetailHeader
              plot={plot}
              plotDetail={plotDetail}
              activeSeason={activeSeason}
              onOpenScouting={() => setShowScoutingModal(true)}
              onOpenSaprotan={() => setShowSaprotanModal(true)}
              onOpenCreateSeason={() => setShowCreateModal(true)}
            />

            {/* SEGMENTED TAB BAR */}
            <div className="border-b border-black/[0.08] bg-white sticky top-[58px] z-20 shadow-sm rounded-t-[3px]">
              <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 no-scrollbar">
                {tabList.map((t) => {
                  const isActive = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => handleTabChange(t.key)}
                      className={`h-[36px] px-3.5 rounded-[3px] text-[12.5px] font-medium inline-flex items-center gap-2 whitespace-nowrap transition-colors flex-shrink-0 ${
                        isActive
                          ? "bg-[var(--accent)] text-white font-semibold shadow-xs"
                          : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-black/[0.04]"
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAB CONTENT CONDITIONAL ROUTING */}
            <div className="pt-1">
              {activeTab === "ikhtisar" && (
                <TabIkhtisar
                  plot={plot}
                  plotDetail={plotDetail}
                  activeSeason={activeSeason}
                  onOpenHarvestModal={openHarvestModal}
                  onOpenFailModal={openFailModal}
                  onOpenCreateModal={() => setShowCreateModal(true)}
                />
              )}

              {activeTab === "agronomi" && (
                <TabAgronomi
                  plot={plot}
                  currentHst={plotDetail?.current_hst ?? plot.current_hst ?? 0}
                />
              )}

              {activeTab === "operasional" && (
                <TabOperasional
                  plot={plot}
                  seasons={seasons}
                  onCostUpdated={() => {
                    setRefreshOpsTrigger((prev) => prev + 1);
                    fetchData();
                  }}
                  onOpenHarvestModal={openHarvestModal}
                  onOpenFailModal={openFailModal}
                  onOpenCreateModal={() => setShowCreateModal(true)}
                />
              )}

              {activeTab === "keuangan" && (
                <TabKeuangan
                  plot={plot}
                  plotDetail={plotDetail}
                  refreshTrigger={refreshOpsTrigger}
                  onOpenSaprotanModal={() => setShowSaprotanModal(true)}
                  onOpenPostHarvestModal={() => setShowPostHarvestModal(true)}
                  hasHarvestedSeason={hasHarvestedSeason}
                />
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* Season Action Modals */}
      {plot && (
        <SeasonActionModals
          plotId={plot.id}
          showCreateModal={showCreateModal}
          onCloseCreateModal={() => setShowCreateModal(false)}
          showHarvestModal={showHarvestModal}
          onCloseHarvestModal={() => setShowHarvestModal(false)}
          showFailModal={showFailModal}
          onCloseFailModal={() => setShowFailModal(false)}
          activeSeason={activeSeason}
          selectedSeason={selectedSeason}
          varieties={varieties}
          onSuccess={fetchData}
          showToast={showToast}
        />
      )}

      {/* Precision Operations Modals */}
      {plot && (
        <>
          <SaprotanApplicationModal
            isOpen={showSaprotanModal}
            onClose={() => setShowSaprotanModal(false)}
            plotId={plot.id}
            plotName={plot.name}
            targetHarvestDate={plotDetail?.predicted_harvest_date || undefined}
            onSuccess={() => {
              showToast("success", "Aplikasi saprotan berhasil dicatat!");
              setRefreshOpsTrigger((prev) => prev + 1);
              fetchData();
            }}
          />

          <PestScoutingModal
            isOpen={showScoutingModal}
            onClose={() => setShowScoutingModal(false)}
            plotId={plot.id}
            plotName={plot.name}
            defaultLat={plot.polygon?.coordinates?.[0]?.[0]?.[1] ?? -8.0843}
            defaultLng={plot.polygon?.coordinates?.[0]?.[0]?.[0] ?? 111.0636}
            onSuccess={() => {
              showToast("success", "Laporan pengamatan hama (OPT) berhasil dicatat!");
              setRefreshOpsTrigger((prev) => prev + 1);
              fetchData();
            }}
          />

          <PostHarvestModal
            isOpen={showPostHarvestModal}
            onClose={() => setShowPostHarvestModal(false)}
            plotId={plot.id}
            plotName={plot.name}
            projectedYieldKg={plot.area_hectares ? Math.round(plot.area_hectares * 6500) : 2405}
            onSuccess={(log) => {
              showToast(
                "success",
                `Musim panen ditutup! Bobot bersih 14% KA: ${log.net_yield_kg.toLocaleString("id-ID")} kg`
              );
              setRefreshOpsTrigger((prev) => prev + 1);
              fetchData();
            }}
          />
        </>
      )}
    </div>
  );
}

export default function DetailPetakPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center font-mono text-xs text-[var(--ink-3)]">
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mr-2" />
          Memuat halaman petak...
        </div>
      }
    >
      <DetailPetakContent />
    </Suspense>
  );
}
