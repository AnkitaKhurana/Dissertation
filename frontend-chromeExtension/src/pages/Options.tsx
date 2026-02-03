import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CssBaseline,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { CheckCircle, GitHub, Key, Cloud, Computer } from "@mui/icons-material";

import { authService } from "../services/auth";
import { loadPreference, loadSessionValue, savePreference, saveSessionValue } from "../services/storage";
import { getTheme } from "../theme";
import { CONFIG } from "../constants/config";

type ThemeMode = "light" | "dark";
type LLMProvider = "local" | "api_key" | "hosted";

function OptionsApp() {
  // Backend & Auth
  const backendUrl = CONFIG.API_BASE_URL;
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // LLM Configuration
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("api_key");
  const [localLlmUrl, setLocalLlmUrl] = useState("http://localhost:11434");
  const [apiKey, setApiKey] = useState("");
  const [apiModel, setApiModel] = useState("gpt-4");
  const [persistApiKey, setPersistApiKey] = useState(false);

  // Agent Configuration
  const [enabledAgents, setEnabledAgents] = useState({
    code_review: true,
    security: true,
    tests: true,
    maintainability: true,
  });

  // UI Preferences
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [severityDisplay, setSeverityDisplay] = useState<"icons" | "text" | "both">("both");
  const [jobRetentionDays, setJobRetentionDays] = useState<number>(1);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    async function load() {
      // Backend & Auth
      await savePreference("backendUrl", CONFIG.API_BASE_URL); // Always use production URL
      const savedAuth = await loadSessionValue<boolean>("isAuthenticated");
      const savedEmail = await loadSessionValue<string>("userEmail");

      // LLM Config
      const savedProvider = await loadPreference<LLMProvider>("llmProvider");
      const savedLocalUrl = await loadPreference<string>("localLlmUrl");
      const savedApiKey = await loadSessionValue<string>("apiKey");
      const savedModel = await loadPreference<string>("apiModel");
      const savedPersist = await loadPreference<boolean>("persistApiKey");

      // Agents
      const savedAgents = await loadPreference<typeof enabledAgents>("enabledAgents");

      // UI
      const savedTheme = await loadPreference<ThemeMode>("theme");
      const savedAutoAnalyze = await loadPreference<boolean>("autoAnalyze");
      const savedSuggestions = await loadPreference<boolean>("showSuggestions");
      const savedSeverityDisplay = await loadPreference<"icons" | "text" | "both">("severityDisplay");
      const savedRetentionDays = await loadPreference<number>("jobRetentionDays");

      if (savedAuth !== undefined) setIsAuthenticated(savedAuth);
      if (savedEmail) setUserEmail(savedEmail);

      if (savedProvider) setLlmProvider(savedProvider);
      if (savedLocalUrl) setLocalLlmUrl(savedLocalUrl);
      if (savedApiKey) setApiKey(savedApiKey);
      if (savedModel) setApiModel(savedModel);
      if (savedPersist !== undefined) setPersistApiKey(savedPersist);

      if (savedAgents) setEnabledAgents(savedAgents);

      if (savedTheme) setMode(savedTheme);
      if (savedSeverityDisplay) setSeverityDisplay(savedSeverityDisplay);
      if (savedRetentionDays) setJobRetentionDays(savedRetentionDays);
      if (savedAutoAnalyze !== undefined) setAutoAnalyze(savedAutoAnalyze);
      if (savedSuggestions !== undefined) setShowSuggestions(savedSuggestions);
    }
    load();
  }, []);

  const muiTheme = useMemo(() => getTheme(mode), [mode]);

  // Check auth status on mount and handle OAuth callback
  useEffect(() => {
    async function checkAuth() {
      try {
        // Check for OAuth callback token in URL
        const params = new URLSearchParams(window.location.search);
        const callbackToken = params.get("token");
        
        console.log("[Options] URL search params:", window.location.search);
        console.log("[Options] Extracted token:", callbackToken ? "✓ Found" : "✗ Not found");

        if (callbackToken) {
          console.log("[Options] Processing OAuth callback with token");
          // Complete OAuth callback with token
          await authService.completeOAuthCallback(backendUrl, callbackToken);
          // Clear the URL parameters
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsAuthenticated(true);
          // Fetch user details
          const user = await authService.getCurrentUser(backendUrl);
          setUserEmail(user.email || user.github_username);
          console.log("[Options] OAuth callback completed, user:", user.github_username);
          return;
        }

        // Regular auth check
        const authenticated = await authService.isAuthenticated(backendUrl);
        if (authenticated) {
          const user = await authService.getCurrentUser(backendUrl);
          setIsAuthenticated(true);
          setUserEmail(user.email || user.github_username);
        }
      } catch (error) {
        console.error("[Options] Auth check failed:", error);
      }
    }
    checkAuth();
  }, [backendUrl]);

  const handleLogin = async () => {
    try {
      await authService.initiateGitHubLogin(backendUrl);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout(backendUrl);
      setIsAuthenticated(false);
      setUserEmail("");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const persist = async () => {
    setSaveStatus("saving");

    // Backend & Auth (backend URL persisted, auth in session)
    await savePreference("backendUrl", backendUrl);

    // LLM Config (API key in session by default, local URL persisted)
    await savePreference("llmProvider", llmProvider);
    await savePreference("localLlmUrl", localLlmUrl);
    await savePreference("apiModel", apiModel);
    await savePreference("persistApiKey", persistApiKey);

    if (persistApiKey) {
      await savePreference("apiKey", apiKey);
    } else {
      await saveSessionValue("apiKey", apiKey);
    }

    // Agents
    await savePreference("enabledAgents", enabledAgents);

    // UI
    await savePreference("theme", mode);
    await savePreference("severityDisplay", severityDisplay);
    await savePreference("jobRetentionDays", jobRetentionDays);
    await savePreference("autoAnalyze", autoAnalyze);
    await savePreference("showSuggestions", showSuggestions);

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const toggleAgent = (agent: keyof typeof enabledAgents) => {
    setEnabledAgents((prev) => ({ ...prev, [agent]: !prev[agent] }));
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary", p: 3 }}>
        <Stack spacing={3} sx={{ maxWidth: 800, mx: "auto" }}>
          <Box>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              PR Sentinel Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure agents and preferences
            </Typography>
          </Box>

          {/* Authentication */}
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={700}>
                  Authentication
                </Typography>

                {isAuthenticated ? (
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckCircle color="success" />
                      <Typography>Logged in as: {userEmail || "User"}</Typography>
                    </Stack>
                    <Button variant="outlined" color="error" onClick={handleLogout}>
                      Logout
                    </Button>
                  </Stack>
                ) : (
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      Login with GitHub to access your analysis history and Pro features
                    </Typography>
                    <Button variant="contained" startIcon={<GitHub />} onClick={handleLogin} sx={{ alignSelf: "flex-start" }}>
                      Login with GitHub
                    </Button>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* LLM Provider Configuration */}
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={700}>
                  LLM Provider
                </Typography>

                <FormControl component="fieldset">
                  <FormLabel>Select LLM Provider (Priority Order)</FormLabel>
                  <RadioGroup value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}>
                    <FormControlLabel
                      value="local"
                      control={<Radio />}
                      label={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Computer fontSize="small" />
                          <Typography>Local LLM (e.g., Ollama, LM Studio)</Typography>
                        </Stack>
                      }
                    />
                    <FormControlLabel
                      value="api_key"
                      control={<Radio />}
                      label={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Key fontSize="small" />
                          <Typography>API Key (OpenAI, Anthropic, etc.)</Typography>
                        </Stack>
                      }
                    />
                    <FormControlLabel
                      value="hosted"
                      control={<Radio />}
                      label={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Cloud fontSize="small" />
                          <Typography>Hosted LLM (Pro tier only)</Typography>
                          <Chip label="Pro" size="small" color="primary" />
                        </Stack>
                      }
                    />
                  </RadioGroup>
                </FormControl>

                {llmProvider === "local" && (
                  <TextField
                    label="Local LLM URL"
                    value={localLlmUrl}
                    onChange={(e) => setLocalLlmUrl(e.target.value)}
                    fullWidth
                    helperText="e.g., http://localhost:11434 (Ollama) or http://localhost:1234 (LM Studio)"
                  />
                )}

                {llmProvider === "api_key" && (
                  <>
                    <TextField
                      label="API Key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      fullWidth
                      type="password"
                      helperText="Your OpenAI, Anthropic, or other provider API key"
                    />
                    <TextField
                      label="Model Name"
                      value={apiModel}
                      onChange={(e) => setApiModel(e.target.value)}
                      fullWidth
                      helperText="e.g., gpt-4, gpt-3.5-turbo, claude-3-opus-20240229"
                    />
                    <FormControlLabel
                      control={<Checkbox checked={persistApiKey} onChange={(e) => setPersistApiKey(e.target.checked)} />}
                      label={
                        <Typography variant="body2">
                          Persist API key (stored locally; otherwise session-only)
                          <Typography variant="caption" display="block" color="text.secondary">
                            ⚠️ Session-only is more secure but requires re-entry after browser restart
                          </Typography>
                        </Typography>
                      }
                    />
                  </>
                )}

                {llmProvider === "hosted" && (
                  <Alert severity="info">
                    Hosted LLM keys are managed by the backend for Pro users. Login with GitHub to access.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Agent Configuration */}
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={700}>
                  Analysis Agents
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Select which agents to run during PR analysis
                </Typography>

                <FormGroup>
                  <FormControlLabel
                    control={<Checkbox checked={enabledAgents.code_review} onChange={() => toggleAgent("code_review")} />}
                    label={
                      <Stack>
                        <Typography fontWeight={600}>Code Review</Typography>
                        <Typography variant="caption" color="text.secondary">
                          General code quality, best practices, and idioms
                        </Typography>
                      </Stack>
                    }
                  />
                  <FormControlLabel
                    control={<Checkbox checked={enabledAgents.security} onChange={() => toggleAgent("security")} />}
                    label={
                      <Stack>
                        <Typography fontWeight={600}>Security</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Security vulnerabilities, injection risks, and attack vectors
                        </Typography>
                      </Stack>
                    }
                  />
                  <FormControlLabel
                    control={<Checkbox checked={enabledAgents.tests} onChange={() => toggleAgent("tests")} />}
                    label={
                      <Stack>
                        <Typography fontWeight={600}>Tests</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Test coverage, quality, and missing test cases
                        </Typography>
                      </Stack>
                    }
                  />
                  <FormControlLabel
                    control={<Checkbox checked={enabledAgents.maintainability} onChange={() => toggleAgent("maintainability")} />}
                    label={
                      <Stack>
                        <Typography fontWeight={600}>Maintainability</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Code complexity, readability, and documentation
                        </Typography>
                      </Stack>
                    }
                  />
                </FormGroup>
              </Stack>
            </CardContent>
          </Card>

          {/* UI Preferences */}
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={700}>
                  UI Preferences
                </Typography>

                <FormControl fullWidth>
                  <InputLabel id="theme-select">Theme</InputLabel>
                  <Select
                    labelId="theme-select"
                    label="Theme"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ThemeMode)}
                  >
                    <MenuItem value="dark">Dark</MenuItem>
                    <MenuItem value="light">Light</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel id="severity-display-select">Severity Display Mode</InputLabel>
                  <Select
                    labelId="severity-display-select"
                    label="Severity Display Mode"
                    value={severityDisplay}
                    onChange={(e) => setSeverityDisplay(e.target.value as "icons" | "text" | "both")}
                  >
                    <MenuItem value="icons">Icons only</MenuItem>
                    <MenuItem value="text">Text only</MenuItem>
                    <MenuItem value="both">Icons + Text</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Job Retention (days)"
                  type="number"
                  value={jobRetentionDays}
                  onChange={(e) => setJobRetentionDays(parseInt(e.target.value) || 1)}
                  fullWidth
                  helperText="Override default retention policy (1 day free, 5 days pro). Admin/Pro users only."
                  inputProps={{ min: 1, max: 30 }}
                />

                <FormGroup>
                  <FormControlLabel
                    control={<Checkbox checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />}
                    label="Auto-analyze PRs when opening GitHub PR pages"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={showSuggestions} onChange={(e) => setShowSuggestions(e.target.checked)} />}
                    label="Show code suggestions inline on PR diff"
                  />
                </FormGroup>
              </Stack>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            variant="contained"
            size="large"
            onClick={persist}
            disabled={saveStatus === "saving"}
            sx={{ alignSelf: "flex-start" }}
          >
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save Settings"}
          </Button>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <OptionsApp />
    </React.StrictMode>
  );
}
