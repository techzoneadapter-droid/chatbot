import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18212f",
        muted: "#677385",
        line: "#dce3ec",
        canvas: "#f6f8fb",
        brand: "#146c94",
        coral: "#da6b48",
        leaf: "#2f8c68"
      },
      boxShadow: {
        soft: "0 16px 50px rgba(24, 33, 47, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
