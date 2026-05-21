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
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      h6: { fontWeight: 800, letterSpacing: "-0.02em" },
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
            backgroundImage: "none",
            boxShadow: mode === "dark" ? "0 4px 12px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.08)",
            border: mode === "dark" ? "1px solid rgba(255,255,255,0.06)" : "1px solid #e2e8f0",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              boxShadow: mode === "dark" ? "0 8px 24px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.12)",
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:focus-visible": {
              outline: `2px solid ${mode === "dark" ? "#22c55e" : "#16a34a"}`,
              outlineOffset: "2px",
            },
          },
          contained: {
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            "&:hover": {
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: "all 0.2s ease-in-out",
            "&:focus-visible": {
              outline: `2px solid ${mode === "dark" ? "#22c55e" : "#16a34a"}`,
              outlineOffset: "2px",
            },
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              transition: "all 0.2s ease-in-out",
              "&:focus-within": {
                boxShadow: `0 0 0 3px ${mode === "dark" ? "rgba(34, 197, 94, 0.1)" : "rgba(22, 163, 74, 0.1)"}`,
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 700,
            fontSize: "0.75rem",
            transition: "all 0.2s ease-in-out",
          },
        },
      },
      MuiTable: {
        styleOverrides: {
          root: {
            "& tbody tr": {
              transition: "background-color 0.15s ease-in-out",
              "&:hover": {
                backgroundColor: mode === "dark" ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
              },
            },
          },
        },
      },
    },
  };

  return createTheme(common);
}
