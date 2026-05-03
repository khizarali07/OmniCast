import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "secondary": "#d6baff",
        "surface-container-low": "#171b28",
        "tertiary-container": "#6c7085",
        "surface-tint": "#edb1ff",
        "on-tertiary-fixed": "#161b2c",
        "on-error": "#690005",
        "on-tertiary-fixed-variant": "#414659",
        "surface-container-lowest": "#0a0e1a",
        "surface-container-high": "#262a37",
        "secondary-container": "#573092",
        "surface-variant": "#313442",
        "surface-dim": "#0f131f",
        "tertiary-fixed-dim": "#c1c5dd",
        "tertiary-fixed": "#dde1f9",
        "inverse-on-surface": "#2c303d",
        "primary-container": "#9d50bb",
        "primary-fixed-dim": "#edb1ff",
        "inverse-surface": "#dfe2f3",
        "on-secondary-fixed": "#270057",
        "on-primary-fixed-variant": "#6e208c",
        "surface-container-highest": "#313442",
        "outline": "#9a8c9b",
        "background": "#0f131f",
        "primary": "#edb1ff",
        "on-background": "#dfe2f3",
        "on-primary": "#520070",
        "on-error-container": "#ffdad6",
        "on-secondary-fixed-variant": "#573092",
        "on-secondary-container": "#c7a5ff",
        "on-surface": "#dfe2f3",
        "tertiary": "#c1c5dd",
        "on-primary-fixed": "#320046",
        "error": "#ffb4ab",
        "inverse-primary": "#883ca6",
        "on-secondary": "#40147a",
        "on-primary-container": "#fff3fd",
        "surface-bright": "#353946",
        "outline-variant": "#4e4350",
        "on-tertiary": "#2b3042",
        "on-surface-variant": "#d1c2d2",
        "secondary-fixed": "#ecdcff",
        "error-container": "#93000a",
        "on-tertiary-container": "#f7f6ff",
        "primary-fixed": "#f9d8ff",
        "surface": "#0f131f",
        "secondary-fixed-dim": "#d6baff",
        "surface-container": "#1b1f2c"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "xl": "48px",
        "sm": "8px",
        "unit": "4px",
        "xs": "4px",
        "gutter": "20px",
        "lg": "24px",
        "md": "16px",
        "container-margin": "32px"
      },
      fontFamily: {
        "body-sm": ["var(--font-inter)", "sans-serif"],
        "body-md": ["var(--font-inter)", "sans-serif"],
        "h1": ["var(--font-inter)", "sans-serif"],
        "body-lg": ["var(--font-inter)", "sans-serif"],
        "h2": ["var(--font-inter)", "sans-serif"],
        "label-caps": ["var(--font-inter)", "sans-serif"]
      },
      fontSize: {
        "body-sm": ["14px", { "lineHeight": "1.4", "fontWeight": "400" }],
        "body-md": ["16px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "h1": ["32px", { "lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }],
        "h2": ["24px", { "lineHeight": "1.3", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "label-caps": ["12px", { "lineHeight": "1.0", "letterSpacing": "0.05em", "fontWeight": "600" }]
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};
export default config;
