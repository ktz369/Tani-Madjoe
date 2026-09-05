# 06: Apple-Style Glassmorphism Map Controls, Telemetry Success Modal & Full Verification

**What to build:**
Refactor the right-side Mapbox map presentation and the post-registration success modal. Replace all dark floating bars with Apple-style frosted glassmorphism pills (`bg-white/80 backdrop-blur-xl border border-black/[0.06] text-[#09090b] shadow-sm`). The completion modal adapts Beautiful UI's Approval Card / Prompt Bar patterns with an animated green check avatar, clear summary metrics (created plots, total hectares, 30-day telemetry backfilled points, weather/GDD status), and sleek action buttons. Verify all 123 backend unit tests pass with zero regression.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Transform Mapbox floating top badge and style toggle into frosted glassmorphism pills (`bg-white/85 backdrop-blur-xl border border-black/[0.06] shadow-sm rounded-full`).
- [ ] Refactor bottom map helper into a light glassmorphism capsule.
- [ ] Implement Beautiful UI-style Completion Modal: centered with soft blur backdrop, `rounded-[24px]` card, circular check avatar, tabular metrics, and primary button.
- [ ] Ensure single plot registration flow, batch import flow, and Mapbox multi-polygon rendering work seamlessly.
- [ ] Run backend test suite (`python -m unittest discover -s tests -p "test_*.py"`) and verify all 123 tests pass.
