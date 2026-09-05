# 05: Beautiful UI Records Table & Inline Plot Controls

**What to build:**
Extract and implement the multi-plot interactive review grid into an isolated, lightweight component `frontend/src/components/plot/BatchRecordsTable.tsx` (~130 lines). Adopts the exact pure component pattern from [Beautiful UI #12 Records Table](https://www.beautifului.dev/#records-table) with a clean white container `rounded-[21px]`, hairline border `border-black/[0.06]`, toggle-all checkbox, 13px Fibonacci cell padding, smooth row hover states (`hover:bg-[#fcfdfd]`), inline editable plot names, area badges, crop/variety dropdowns, map focus trigger, and the Beautiful UI primary button.

**Blocked by:** 04

**Status:** closed

- [x] Create isolated component `frontend/src/components/plot/BatchRecordsTable.tsx` with props: `rows`, `varieties`, `onToggleSelectAll`, `onToggleRowSelect`, `onUpdateField`, `onFocusPlot`, `onSubmit`, `loading`, `disabled`.
- [x] Implement Records Table shell and header with toggle-all checkbox (`rounded-[5px] border-black/[0.15] text-[#059669]`).
- [x] Render scrollable row list with hairline dividers `divide-y divide-black/[0.04]` and `p-[13px]` Fibonacci padding.
- [x] Implement inline text input for plot name with subtle border focus state.
- [x] Add compact crop type and variety selects per row.
- [x] Connect map focus button with smooth camera transition.
- [x] Integrate primary action button styled after Beautiful UI primitives: `rounded-full h-[42px] px-[21px] bg-[#059669] hover:bg-[#047857] text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.98]`.
- [x] Mount in `frontend/src/app/admin/petak-baru/page.tsx`.
