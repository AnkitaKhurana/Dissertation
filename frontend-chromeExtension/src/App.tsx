import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Backdrop,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  CssBaseline,
  Divider,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  Stack,
  Switch,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { Brightness4, Brightness7, ErrorOutline, WifiOff } from "@mui/icons-material";

import { StatusBadge } from "./components/StatusBadge";
import { FindingsListSkeleton } from "./components/Skeleton";
import { apiClient } from "./services/api";
import { loadPreference, savePreference } from "./services/storage";
import { getTheme, severityPalette } from "./theme";

interface Finding {
  title: string;
  severity: string;
  file_path: string;
  line?: number;
  recommendation?: string;
}

export function App() {
  const [status, setStatus] = useState<"pending" | "running" | "completed" | "failed">("pending");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPreference("autoAnalyze").then((value) => {
      if (typeof value === "boolean") setAutoAnalyze(value);
    });
    loadPreference("theme").then((value) => {
      if (value === "light" || value === "dark") setMode(value);
    });

    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const muiTheme = useMemo(() => getTheme(mode), [mode]);

  const triggerAnalyze = async () => {
    setStatus("running");
    setBackendError(null);
    setIsLoading(true);
    try {
      if (!isOnline) {
        setBackendError("No internet connection. Please check your network.");
        setStatus("failed");
        return;
      }

      const result = await apiClient.createJob("https://github.com/org/repo/pull/1");
      setStatus(result.status as typeof status);
      setFindings((result.results_so_far || []) as Finding[]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to analyze PR. Check backend configuration in Options.";
      console.error("Analysis error:", err);
      setBackendError(errorMsg);
      setStatus("failed");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutoAnalyze = async () => {
    const next = !autoAnalyze;
    setAutoAnalyze(next);
    await savePreference("autoAnalyze", next);
  };

  const toggleMode = async () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    await savePreference("theme", next);
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ minWidth: 320, p: 2, bgcolor: "background.default", color: "text.primary" }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="h6">PR Sentinel</Typography>
              <Typography variant="body2">Review PRs with LLM agents</Typography>
            </Box>
            <StatusBadge status={status} />
          </Stack>

          <Card>
            <CardHeader
              title={<Typography variant="subtitle1">Preferences</Typography>}
              action={
                <FormControlLabel
                  control={
                    <Switch 
                      checked={mode === "dark"} 
                      onChange={toggleMode}
                      inputProps={{
                        'aria-label': 'Toggle dark mode'
                      }}
                    />
                  }
                  label={mode === "dark" ? <Brightness4 fontSize="small" /> : <Brightness7 fontSize="small" />}
                />
              }
            />
            <CardContent>
              <Stack spacing={1}>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={autoAnalyze} 
                      onChange={toggleAutoAnalyze}
                      inputProps={{
                        'aria-label': 'Auto-analyze GitHub PRs'
                      }}
                    />
                  }
                  label="Auto-analyze GitHub PRs"
                />
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title={<Typography variant="subtitle1">Latest findings</Typography>} />
            <CardContent>
              <Stack spacing={2}>
                {!isOnline && (
                  <Alert severity="warning" icon={<WifiOff fontSize="inherit" />}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">You appear to be offline</Typography>
                      <Link href={chrome.runtime.getURL("src/options.html")} target="_blank" underline="hover">
                        Settings
                      </Link>
                    </Stack>
                  </Alert>
                )}
                {backendError && (
                  <Alert severity="error" icon={<ErrorOutline fontSize="inherit" />} id="backend-error-message">
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2">{backendError}</Typography>
                      <Link href={chrome.runtime.getURL("src/options.html")} target="_blank" underline="hover">
                        Settings
                      </Link>
                    </Stack>
                  </Alert>
                )}
                {isLoading ? (
                  <FindingsListSkeleton count={3} />
                ) : findings.length === 0 ? (
                  <Typography variant="body2">No findings yet.</Typography>
                ) : (
                  <List dense sx={{ p: 0 }} aria-label="List of findings">
                    {findings.map((finding, idx) => (
                      <ListItem
                        key={`${finding.file_path}-${idx}`}
                        sx={{
                          border: `1px solid rgba(255,255,255,0.06)`,
                          borderColor: "divider",
                          borderRadius: 1,
                          mb: 1,
                        }}
                        aria-label={`Finding ${idx + 1}: ${finding.title || finding.file_path}, severity ${finding.severity || 'info'}`}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography fontWeight={700}>{finding.title || finding.file_path}</Typography>
                              <Box
                                component="span"
                                sx={{
                                  px: 1,
                                  py: 0.3,
                                  borderRadius: 1,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  bgcolor: `${severityPalette[(finding.severity || "info") as keyof typeof severityPalette]}22`,
                                  color: severityPalette[(finding.severity || "info") as keyof typeof severityPalette],
                                }}
                              >
                                {(finding.severity || "info").toUpperCase()}
                              </Box>
                            </Stack>
                          }
                          secondary={
                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                              {finding.file_path}
                              {finding.line ? `:${finding.line}` : ""}
                              {finding.recommendation ? ` — ${finding.recommendation}` : ""}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Stack>
            </CardContent>
            <Divider />
            <CardContent>
              <Button 
                fullWidth 
                variant="contained" 
                color="primary" 
                onClick={triggerAnalyze} 
                disabled={!isOnline || backendError !== null || isLoading}
                aria-label="Analyze current pull request"
                aria-describedby={backendError ? "backend-error-message" : undefined}
              >
                {isLoading ? "Analyzing..." : "Analyze Current PR"}
              </Button>
            </CardContent>
          </Card>
        </Stack>

        {/* Backdrop with spinner for long-running operations */}
        <Backdrop
          sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
          open={isLoading && status === "running"}
          role="status"
          aria-label="Analysis in progress"
        >
          <Stack spacing={2} alignItems="center">
            <CircularProgress color="inherit" />
            <Typography variant="body1">Analyzing PR...</Typography>
          </Stack>
        </Backdrop>
      </Box>
    </ThemeProvider>
  );
}
