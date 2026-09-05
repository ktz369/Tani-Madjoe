# 06: Apple-Style Glassmorphism Map Controls, Telemetry Success Modal & Full Verification

**What to build:**
Extract and implement the post-registration completion state into `frontend/src/components/plot/BatchCompletionModal.tsx` (~80 lines) adapting Beautiful UI's Approval Card / Prompt Bar patterns. Refactor Mapbox floating top and bottom overlays into Apple-style frosted glassmorphism pills (`backdrop-blur-xl bg-white/80 border border-black/[0.06] text-[#09090b] shadow-sm`). Verify all single, batch, and map interactions, and run the backend test suite (123 unit tests).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Create isolated component `frontend/src/components/plot/BatchCompletionModal.tsx` with props: `result: PlotBatchCreateResponse | null`, `onClose: () => void`.
- [ ] Implement Beautiful UI-style Completion Modal: centered with soft blur backdrop, `rounded-[24px]` card, circular check avatar, tabular metrics, and primary action button.
- [ ] Transform Mapbox floating top badge and style toggle into frosted glassmorphism pills (`bg-white/85 backdrop-blur-xl border border-black/[0.06] shadow-sm rounded-full`).
- [ ] Refactor bottom map helper into a light glassmorphism capsule.
- [ ] Mount modal in `frontend/src/app/admin/petak-baru/page.tsx`.
- [ ] Run backend test suite (`python -m unittest discover -s tests -p "test_*.py"`) and verify all 123 tests pass.
