# 03: Beautiful UI Clean Canvas Dropzone & Spatial File Uploader

**What to build:**
Extract and implement the spatial file dropzone into an isolated, lightweight component `frontend/src/components/plot/SpatialDropzone.tsx` (~90 lines) using Beautiful UI clean canvas patterns. Features a pure white canvas (`bg-white` to subtle gradient `bg-[#fcfdfd]`), delicate dashed perimeter border (`border-dashed border-black/[0.12] hover:border-[#059669]`), a circular sage avatar badge with soft pulse, and editorial microcopy.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Create isolated component `frontend/src/components/plot/SpatialDropzone.tsx` with props: `onFileUpload: (file: File) => void`, `loading: boolean`, `label: string`, `acceptedFormats?: string`, `compact?: boolean`.
- [ ] Implement pure white canvas dropzone with `rounded-[21px]` Fibonacci radius, subtle border transition, and soft hover state (`hover:bg-[#ecfdf5]/20`).
- [ ] Add circular pill avatar with sage icon (`size-[42px] rounded-full bg-[#ecfdf5] text-[#059669]`).
- [ ] Render elegant editorial typography instructions: "Tarik & lepas berkas KML / KMZ / GeoJSON" with subtle secondary label.
- [ ] Mount in `frontend/src/app/admin/petak-baru/page.tsx` for both Single and Batch mode.
