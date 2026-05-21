import { useEffect, useMemo, useState } from "react";

import {
  Avatar,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  CssBaseline,
  Divider,
  Grid,
  IconButton,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  Tooltip,
  Chip,
  Pagination,
} from "@mui/material";
import { GitHub, Refresh, Launch, Cancel, ContentCopy } from "@mui/icons-material";

import { apiClient } from "./services/api";
import { loadPreference } from "./services/storage";
import { getTheme } from "./theme";
import { JobListResponse, JobSummary } from "./types/backend";
import { authService } from "./services/auth";
import { JobFindingsPanel } from "./components/JobFindingsPanel";
import { DEFAULT_JS_TS_ENABLED_AGENTS, normalizeEnabledAgents } from "./utils/agents";
import { CONFIG } from "./constants/config";

type JobRow = JobSummary & {
  prUrl?: string;
  pr_url?: string;
};

function getJobPrUrl(job: Partial<JobRow>): string {
  const url = job.pr_url ?? job.prUrl ?? "";
  return typeof url === "string" ? url : "";
}

function formatJobPrUrl(url: string): string {
  if (!url) {
    return "Pull request unavailable";
  }

  return url.replace(/https?:\/\//, "").replace(/\/pull\/.*/, "/pull/...");
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === "completed" ? "success" : status === "running" ? "info" : status === "failed" ? "error" : "default";
  return <Chip label={status} color={color as any} size="small" />;
}

export function App() {
  const [backendUrl, setBackendUrl] = useState<string>(CONFIG.API_BASE_URL);
  const [prUrl, setPrUrl] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [creating, setCreating] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsPageCount, setJobsPageCount] = useState(1);

  useEffect(() => {
    loadPreference("backendUrl").then((v) => setBackendUrl((v as string) || CONFIG.API_BASE_URL));
    loadPreference("theme").then((v) => { if (v === "light" || v === "dark") setMode(v); });
    refreshJobs();
    (async () => {
      try {
        const isAuth = await authService.isAuthenticated(backendUrl || CONFIG.API_BASE_URL);
        if (isAuth) {
          const u = await authService.getCurrentUser(backendUrl || CONFIG.API_BASE_URL);
          setUser(u);
        }
      } catch {
        setUser(null);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refreshJobs();
  }, [jobsPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const muiTheme = useMemo(() => getTheme(mode), [mode]);

  async function detectCurrentTabUrl() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (currentTab?.url) setPrUrl(currentTab.url);
    } catch (e) {
      console.warn("Failed to detect tab URL", e);
    }
  }

  async function createJob() {
    setCreating(true);
    try {
      const enabledAgents = normalizeEnabledAgents(await loadPreference("enabledAgents")) || DEFAULT_JS_TS_ENABLED_AGENTS;
      const agents = Object.entries(enabledAgents)
        .filter(([, v]) => v)
        .map(([k]) => k);

      await chrome.runtime.sendMessage({ type: "ANALYZE_PR", prUrl, agents });
      // Persist recent jobs in storage will be handled by background; just refresh view
      setTimeout(refreshJobs, 800);
    } catch (err) {
      console.error("createJob error", err);
    } finally {
      setCreating(false);
    }
  }

  async function refreshJobs() {
    setLoadingJobs(true);
    try {
      const base = backendUrl || CONFIG.API_BASE_URL;
      const data: JobListResponse = await apiClient.listJobs(base, jobsPage, 5);
      setJobs((data.data || []) as JobRow[]);
      // Calculate page count from total if available
      if (data.total !== undefined) {
        setJobsPageCount(Math.ceil(data.total / 5));
      }
    } catch (err) {
      console.warn("Failed to load jobs, falling back to recentJobs storage", err);
      const recent = (await loadPreference<any>("recentJobs")) || [];
      setJobs((Array.isArray(recent) ? recent : []).filter(Boolean) as JobRow[]);
      setJobsPageCount(1);
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadJobDetails(jobId: string) {
    setLoadingDetails(true);
    try {
      const base = backendUrl || CONFIG.API_BASE_URL;
      const detail = await apiClient.getJobStatus(jobId, base);
      setJobDetails(detail);
    } catch (err) {
      console.error("Failed to load job details", err);
    } finally {
      setLoadingDetails(false);
    }
  }

  function toggleJobExpanded(jobId: string) {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setJobDetails(null);
    } else {
      setExpandedJobId(jobId);
      loadJobDetails(jobId);
    }
  }

  async function cancelJob(jobId: string) {
    try {
      const base = backendUrl || CONFIG.API_BASE_URL;
      await apiClient.cancelJob(jobId, base);
      await refreshJobs();
    } catch (err) {
      console.error("cancelJob failed", err);
    }
  }

  function openPr(pr: string) {
    if (!pr) {
      return;
    }

    chrome.tabs.create({ url: pr });
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ minWidth: 360, p: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between">
            <Button size="small" onClick={() => chrome.runtime.openOptionsPage?.()}>Options</Button>
            <Button size="small" onClick={() => window.close()}>Close</Button>
          </Stack>

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack>
              <Typography variant="h6">PR Sentinel</Typography>
              <Typography variant="caption">Quickly analyze GitHub pull requests</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {user ? (
                <Tooltip title={user?.gh_login || user?.github_username || "User"}>
                  <Avatar sx={{ width: 32, height: 32 }}>{(user?.gh_login || "U")[0]}</Avatar>
                </Tooltip>
              ) : (
                <Button size="small" startIcon={<GitHub />} onClick={() => authService.initiateGitHubLogin(backendUrl || CONFIG.API_BASE_URL)}>Sign in</Button>
              )}
            </Stack>
          </Stack>

          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Analyze a PR</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    placeholder="https://github.com/owner/repo/pull/123"
                    value={prUrl}
                    size="small"
                    onChange={(e) => setPrUrl(e.target.value)}
                    aria-label="Pull request URL"
                  />
                  <Button variant="outlined" size="small" onClick={detectCurrentTabUrl} startIcon={<Refresh />} aria-label="Detect current tab URL">Detect</Button>
                  <Button variant="contained" size="small" onClick={createJob} disabled={!prUrl || creating} startIcon={creating ? <CircularProgress size={16} /> : undefined} aria-label={creating ? "Analyzing pull request..." : "Analyze pull request"}>Analyze</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1">Recent jobs</Typography>
            <IconButton size="small" onClick={refreshJobs} aria-label="Refresh jobs"><Refresh /></IconButton>
          </Stack>

          <Box sx={{ minHeight: 240, maxHeight: 420, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Grid container spacing={1} sx={{ p: 1 }}>
              {loadingJobs ? (
                <Grid item xs={12}>
                  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}><CircularProgress size={20} /></Box>
                </Grid>
              ) : jobs.length === 0 ? (
                <Grid item xs={12}>
                  <Typography variant="body2">No jobs found.</Typography>
                </Grid>
              ) : (
                jobs.map((job) => (
                  <Grid item xs={12} key={job.job_id}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 0,
                        transition: "all 0.2s",
                        ...(expandedJobId === job.job_id && { boxShadow: 2 }),
                      }}
                    >
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack>
                            <Typography fontWeight={700} sx={{ fontSize: 13 }}>{formatJobPrUrl(getJobPrUrl(job))}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(job.created_at).toLocaleDateString()} {new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <StatusChip status={job.status} />
                            <Typography variant="caption">{Math.round((job.progress || 0) * 100)}%</Typography>
                          </Stack>
                        </Stack>

                        {job.findings_count > 0 && (
                          <Box sx={{ mt: 1.5 }}>
                            {expandedJobId === job.job_id && loadingDetails ? (
                              <Box sx={{ py: 2, display: "flex", justifyContent: "center" }}>
                                <CircularProgress size={20} />
                              </Box>
                            ) : expandedJobId === job.job_id && jobDetails ? (
                              <JobFindingsPanel
                                findings={jobDetails.results_so_far || []}
                                expanded={true}
                                onToggle={() => toggleJobExpanded(job.job_id)}
                              />
                            ) : (
                              <Box
                                onClick={() => toggleJobExpanded(job.job_id)}
                                role="button"
                                tabIndex={0}
                                aria-expanded={false}
                                aria-label={`View ${job.findings_count} findings. Press Enter to expand`}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleJobExpanded(job.job_id); } }}
                                sx={{
                                  cursor: "pointer",
                                  p: 1,
                                  bgcolor: "action.hover",
                                  borderRadius: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  "&:hover": { bgcolor: "action.selected" },
                                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                                  transition: "all 0.2s ease-in-out",
                                }}
                              >
                                <Typography variant="body2">
                                  <strong>{job.findings_count}</strong> findings
                                </Typography>
                                <Typography variant="caption">Click to expand</Typography>
                              </Box>
                            )}
                          </Box>
                        )}
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<Launch />}
                          onClick={() => openPr(getJobPrUrl(job))}
                          disabled={!getJobPrUrl(job)}
                          aria-label={getJobPrUrl(job) ? `Open pull request: ${getJobPrUrl(job)}` : "Open pull request unavailable"}
                        >
                          Open PR
                        </Button>
                        {job.status === "running" && (
                          <Button size="small" startIcon={<Cancel />} onClick={() => cancelJob(job.job_id)} aria-label="Cancel job">Cancel</Button>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => {
                            const url = getJobPrUrl(job);
                            if (url) {
                              void navigator.clipboard?.writeText(url);
                            }
                          }}
                          disabled={!getJobPrUrl(job)}
                          aria-label={getJobPrUrl(job) ? "Copy pull request URL" : "Pull request URL unavailable"}
                        >
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </CardActions>
                    </Card>
                  </Grid>
                ))
              )}
            </Grid>
          </Box>

          {jobsPageCount > 1 && <Pagination count={jobsPageCount} page={jobsPage} onChange={(e, p) => { setJobsPage(p); setExpandedJobId(null); }} size="small" sx={{ display: "flex", justifyContent: "center" }} />}
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

