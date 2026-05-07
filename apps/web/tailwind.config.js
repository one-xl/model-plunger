/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', "Segoe UI", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
        display: ['"Instrument Sans"', "Segoe UI", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
