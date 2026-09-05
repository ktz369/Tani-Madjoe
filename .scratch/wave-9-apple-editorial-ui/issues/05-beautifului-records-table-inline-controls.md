# 05: Beautiful UI Records Table & Inline Plot Controls

**What to build:**
Adopt the exact pure component pattern from [Beautiful UI #12 Records Table](https://www.beautifului.dev/#records-table) for the multi-plot interactive review grid. Features a clean white container with `rounded-[21px]`, hairline border `border-black/[0.06]`, table header with toggle-all checkbox, 13px Fibonacci cell padding, smooth row hover states (`hover:bg-[#fcfdfd]`), inline editable plot names, area badges, crop variety dropdowns, and an Apple-style focus icon that pans and zooms the Mapbox camera to that specific plot.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Implement Records Table shell and header with toggle-all checkbox (`rounded-[5px] border-black/[0.15] text-[#059669]`).
- [ ] Render scrollable row list with hairline dividers `divide-y divide-black/[0.04]` and `p-[13px]` Fibonacci padding.
- [ ] Implement inline text input for plot name with subtle border focus state.
- [ ] Add compact crop type and variety selects per row.
- [ ] Connect map focus button (`handleFocusBatchPlot`) with smooth camera transition.
- [ ] Integrate primary action button styled after Beautiful UI primitives: `rounded-full h-[42px] px-[21px] bg-[#059669] hover:bg-[#047857] text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.98]`.
