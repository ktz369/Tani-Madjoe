# 02: Beautiful UI Segmented Pill Switcher & Mode Navigation

**What to build:**
Adopt the exact pure component markup and Tailwind classes from [Beautiful UI](https://www.beautifului.dev/) (`loading-state` & `selection-actions` pill switchers) for the mode navigation between "Petak Tunggal" and "Impor Massal (Batch KML)". Use the rounded-full pill container `bg-[#f4f4f5] rounded-full p-[3px] border border-black/[0.04]` with a crisp white sliding pill capsule `bg-white text-[#09090b] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]` and smooth micro-interactions.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Implement Beautiful UI pill segmented container: `relative inline-grid grid-cols-2 p-[3px] bg-[#f4f4f5] rounded-full border border-black/[0.04] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]`.
- [ ] Implement active sliding white pill with soft elevation shadow and subtle text ink color transitions (`text-[13px] font-medium text-[#09090b]`).
- [ ] Connect `activeTab` state ("single" vs "batch") with seamless mode switching and error clearing.
- [ ] Ensure full keyboard accessibility and touch responsiveness.
