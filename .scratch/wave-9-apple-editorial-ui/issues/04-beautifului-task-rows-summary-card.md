# 04: Beautiful UI Task Rows & Spatial Summary Metrics Cards

**What to build:**
Adopt the exact pure component structure from [Beautiful UI #06 Task Rows](https://www.beautifului.dev/#task-rows) for the batch spatial summary card and quick bulk controls. When a multi-placemark file is loaded, render the summary as a sleek Task Row card (`rounded-[21px] bg-white border border-black/[0.06] shadow-card p-[13px]`) featuring an emerald check icon, file name, tabular counts ("12 Petak"), and pill badges for total area in hectares. Pair with an Apple-style collapsible or segmented quick bulk controls bar (Komoditas: Padi/Jagung, Varietas Benih, Tanggal Tanam).

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Implement Task Row card structure directly from Beautiful UI #06: `self-stretch overflow-hidden rounded-[21px] bg-white border border-black/[0.06] shadow-card p-[13px]`.
- [ ] Display file metadata, total detected plots, and total hectares in monospace tabular figures (`font-mono text-[13px] tabular-nums`).
- [ ] Implement pill status badges: `inline-flex items-center rounded-full bg-[#ecfdf5] border border-[#a7f3d0] px-[10px] py-[3px] text-[11.5px] font-medium text-[#059669]`.
- [ ] Implement quick bulk controls card with refined Apple-style selects and "Terapkan ke Terpilih" action button.
