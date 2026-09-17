import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Aspekta", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      spacing: {
        "3-fib": "3px",
        "5-fib": "5px",
        "8-fib": "8px",
        "13-fib": "13px",
        "21-fib": "21px",
        "34-fib": "34px",
        "55-fib": "55px",
        "89-fib": "89px",
        "144-fib": "144px",
        "233-fib": "233px",
      },
      colors: {
        primary: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        ink: { DEFAULT: "#0F172A", 2: "#475569", 3: "#94A3B8" },
        canvas: "#FAFAF9",
        accent: { DEFAULT: "#059669", dark: "#047857" },
      },
      borderRadius: {
        structural: "0px",
        micro: "3px",
        control: "6px",
        card: "10px",
        capsule: "9999px",
      },
    },
  },
  plugins: [],
};
export default config;

