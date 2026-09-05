# 04: Beautiful UI Task Rows & Spatial Summary Metrics Cards

**What to build:**
Extract and implement the batch spatial summary and quick bulk settings into an isolated, lightweight component `frontend/src/components/plot/BatchSummaryCard.tsx` (~110 lines). Adopts the exact pure component structure from [Beautiful UI #06 Task Rows](https://www.beautifului.dev/#task-rows) (`rounded-[21px] bg-white border border-black/[0.06] shadow-card p-[13px]`) with emerald check icon, file name, tabular counts ("12 Petak"), pill badges for total hectares, and an Apple-style quick bulk controls bar (Komoditas, Varietas, Tanggal Tanam).

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Create isolated component `frontend/src/components/plot/BatchSummaryCard.tsx` with props: `summary`, `onReset`, `bulkCropType`, `onBulkCropTypeChange`, `bulkVarietyId`, `onBulkVarietyIdChange`, `bulkPlantingDate`, `onBulkPlantingDateChange`, `varieties`, `onApplyBulk`.
- [ ] Implement Task Row card structure directly from Beautiful UI #06: `self-stretch overflow-hidden rounded-[21px] bg-white border border-black/[0.06] shadow-card p-[13px]`.
- [ ] Display file metadata, total detected plots, and total hectares in monospace tabular figures (`font-mono text-[13px] tabular-nums`).
- [ ] Implement pill status badges: `inline-flex items-center rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-[10px] py-[3px] text-[11.5px] font-medium text-[#059669]`.
- [ ] Implement quick bulk controls card with refined Apple-style selects and "Terapkan ke Terpilih" action button.
- [ ] Mount in `frontend/src/app/admin/petak-baru/page.tsx`.
