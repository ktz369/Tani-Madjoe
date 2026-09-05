# 02: Beautiful UI Segmented Pill Switcher & Mode Navigation

**What to build:**
Extract and implement the mode switcher into an isolated, lightweight component in `frontend/src/components/plot/ModeSegmentedControl.tsx` (~60 lines) using exact pure component markup from [Beautiful UI](https://www.beautifului.dev/) (`loading-state` & `selection-actions` pill switchers). Features a rounded-full pill container `bg-[#f4f4f5] rounded-full p-[3px] border border-black/[0.04]` with a crisp white sliding capsule `bg-white text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]`.

**Blocked by:** 01

**Status:** closed

- [x] Create isolated component `frontend/src/components/plot/ModeSegmentedControl.tsx` with props `activeTab: 'single' | 'batch'` and `onChange: (tab: 'single' | 'batch') => void`.
- [x] Implement Beautiful UI pill container: `relative inline-grid grid-cols-2 p-[3px] bg-[#f4f4f5] rounded-full border border-black/[0.04] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]`.
- [x] Implement active sliding white pill with soft elevation shadow and subtle text ink color transitions (`text-[13px] font-medium text-[#09090b]`).
- [x] Mount in `frontend/src/app/admin/petak-baru/page.tsx` replacing inline tabs.
- [x] Ensure full keyboard accessibility and touch responsiveness.
