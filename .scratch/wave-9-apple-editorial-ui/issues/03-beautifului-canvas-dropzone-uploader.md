# 03: Beautiful UI Clean Canvas Dropzone & Spatial File Uploader

**What to build:**
Re-architect the KML/KMZ/GeoJSON file dropzone using Beautiful UI clean canvas patterns. A pure white canvas (`bg-white` to subtle gradient `bg-[#fcfdfd]`), delicate dashed perimeter border (`border-dashed border-black/[0.12] hover:border-[#059669]`), a circular sage avatar badge with soft pulse, and editorial microcopy. Provide smooth drag-and-drop feedback, loading spinner with Beautiful UI pixel shimmer feel, and an elegant file metadata card with reset interaction.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Implement pure white canvas dropzone with `rounded-[21px]` Fibonacci radius, subtle border transition, and soft hover state (`hover:bg-[#ecfdf5]/20`).
- [ ] Add circular pill avatar with sage icon (`size-[42px] rounded-full bg-[#ecfdf5] text-[#059669]`).
- [ ] Render elegant editorial typography instructions: "Tarik & lepas berkas KML / KMZ / GeoJSON" with subtle secondary label.
- [ ] Connect file upload handlers (`handleFileUpload` and `handleBatchFileUpload`) with loading state and smooth reset button.
