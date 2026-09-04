# 04: Frontend Dropzone and Form Auto-Fill

**What to build:**
A user-friendly drag-and-drop file upload zone in the plot registration page (`/admin/petak-baru`) supporting `.kml`, `.kmz`, and `.geojson`. When `Bengkoxxx1.kml` is dropped or selected, it parses the file (via client/preview API), automatically populates the "Nama Petak" field with "Bengkok 1", populates the calculated area in hectares (0.3688 Ha), and updates the form coordinate state.

**Blocked by:** 03: Import Preview API Endpoint

**Status:** completed

- [x] Add an intuitive drag-and-drop file zone in `/admin/petak-baru` with file selector supporting `.kml`, `.kmz`, `.geojson`, `.json`.
- [x] Connect file upload to preview endpoint (or client-side DOMParser fallback).
- [x] Auto-fill the "Nama Petak" input field with the extracted name from the file.
- [x] Auto-populate the calculated area badge/input in hectares.
- [x] Update form's `drawnCoords` state with the extracted polygon ring.
- [x] Show clear warning/error alert if file is invalid or lacks polygon geometry.
- [x] Provide a "Reset Berkas" button to allow clearing and choosing another file without refreshing the page.
