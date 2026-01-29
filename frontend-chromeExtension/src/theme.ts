import { PaletteMode, ThemeOptions, createTheme } from "@mui/material";

export const severityPalette = {
  critical: "#D32F2F",
  high: "#F57C00",
  medium: "#FBC02D",
  low: "#1976D2",
  info: "#616161",
};

export function getTheme(mode: PaletteMode = "dark") {
  const common: ThemeOptions = {
    palette: {
      mode,
      primary: { main: mode === "dark" ? "#22c55e" : "#16a34a" },
      secondary: { main: "#38bdf8" },
      background: {
        default: mode === "dark" ? "#0f172a" : "#f5f7fb",
        paper: mode === "dark" ? "#111827" : "#ffffff",
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      h6: { fontWeight: 800 },
      body2: { color: mode === "dark" ? "#cbd5e1" : "#475569" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: mode === "dark" ? "#0f172a" : "#f5f7fb",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            border: mode === "dark" ? "1px solid #1f2937" : "1px solid #e2e8f0",
          },
        },
      },
    },
  };

  return createTheme(common);
}
