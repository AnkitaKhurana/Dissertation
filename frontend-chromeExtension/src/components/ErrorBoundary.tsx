import { Component, ErrorInfo, ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";
import { ErrorOutline, Refresh } from "@mui/icons-material";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component to catch React errors and display fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console (could also send to error tracking service like Sentry)
    console.error("ErrorBoundary caught error:", error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReportError = (): void => {
    const { error, errorInfo } = this.state;

    // Create error report
    const errorReport = {
      error: error?.toString(),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    // Copy to clipboard
    navigator.clipboard
      .writeText(JSON.stringify(errorReport, null, 2))
      .then(() => {
        alert("Error report copied to clipboard");
      })
      .catch((err) => {
        console.error("Failed to copy error report:", err);
        alert("Failed to copy error report. Check console for details.");
      });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            bgcolor: "background.default",
          }}
        >
          <Card sx={{ maxWidth: 600, width: "100%" }}>
            <CardContent>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <ErrorOutline color="error" sx={{ fontSize: 48 }} />
                  <Box>
                    <Typography variant="h5" color="error" gutterBottom>
                      Something went wrong
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      An unexpected error occurred. You can try reloading the extension or report this
                      issue.
                    </Typography>
                  </Box>
                </Stack>

                {error && (
                  <Alert severity="error" sx={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
                    <strong>Error:</strong> {error.toString()}
                  </Alert>
                )}

                {errorInfo && process.env.NODE_ENV === "development" && (
                  <Box
                    sx={{
                      maxHeight: 200,
                      overflow: "auto",
                      bgcolor: "grey.100",
                      p: 2,
                      borderRadius: 1,
                      fontFamily: "monospace",
                      fontSize: "0.75rem",
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {errorInfo.componentStack}
                    </pre>
                  </Box>
                )}

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<Refresh />}
                    onClick={this.handleReset}
                    fullWidth
                    aria-label="Retry loading the application"
                  >
                    Retry
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={this.handleReportError}
                    fullWidth
                    aria-label="Copy error report to clipboard"
                  >
                    Copy Error Report
                  </Button>
                </Stack>

                <Typography variant="caption" color="text.secondary" align="center">
                  If the problem persists, please contact support or check the extension settings.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return children;
  }
}
