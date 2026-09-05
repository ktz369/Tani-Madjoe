# 01: Pure Light Theme Purge, Apple Editorial Typography & Fibonacci Golden Grid

**What to build:**
Refactor the global layout structure of `/admin/petak-baru` to establish a 100% pure Light Mode architecture. Purge all legacy dark containers (such as `bg-slate-900` on the map wrapper), configure the golden ratio layout proportions ($w = 377\text{px}$ for single mode, $w = 550\text{px}$ to $610\text{px}$ for batch mode, leaving $\approx 61.8\%$ for the main map canvas), and establish the Apple Editorial typographic hierarchy (`font-serif text-[24px]` tracking-tight title paired with refined sans-serif subtitle and subtle breadcrumb).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove all legacy dark classes (`bg-slate-900`, dark border classes, inverted text colors) from the page layout and main wrapper.
- [ ] Apply Fibonacci grid dimensions: left panel width `w-[377px]` in Single Mode and dynamic expand to `w-[550px]` / `w-[610px]` in Batch Mode.
- [ ] Implement Fibonacci padding scale (`px-[21px] py-[34px]`) and hairline borders (`border-black/[0.06]`).
- [ ] Implement Apple Editorial header typography with modern serif title (`font-serif text-[24px] font-medium tracking-[-0.025em] text-[#09090b]`) and gentle subtitle (`text-[13px] text-[#71717a]`).
- [ ] Verify light theme navbar compatibility and seamless visual flow.
