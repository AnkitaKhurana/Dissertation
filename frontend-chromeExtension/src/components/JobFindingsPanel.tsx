import React from "react";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { ExpandMore, ContentCopy, Check } from "@mui/icons-material";
import { Finding } from "../types/backend";
import { severityPalette } from "../theme";

interface JobFindingsPanelProps {
  findings: Finding[];
  expanded: boolean;
  onToggle: () => void;
}

export function JobFindingsPanel({ findings, expanded, onToggle }: JobFindingsPanelProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!findings || findings.length === 0) {
    return null;
  }

  const handleCopyCode = (code: string, id: string) => {
    Promise.resolve(navigator.clipboard?.writeText(code)).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <Box>
      <Box
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Findings: ${findings.length} issues. Press Enter to ${expanded ? "collapse" : "expand"}`}
        sx={{
          cursor: "pointer",
          p: 1.5,
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
        <Typography variant="body2" fontWeight={600}>
          Findings ({findings.length})
        </Typography>
        <IconButton
          size="small"
          tabIndex={-1}
          aria-hidden="true"
          sx={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <ExpandMore />
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <TableContainer sx={{ mt: 1 }}>
          <Table size="small" sx={{ border: "1px solid", borderColor: "divider" }} aria-label="Findings details">
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell align="left" sx={{ fontSize: 11, fontWeight: 700 }}>
                  File
                </TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 700, width: 60 }}>
                  Line
                </TableCell>
                <TableCell align="left" sx={{ fontSize: 11, fontWeight: 700, width: 80 }}>
                  Severity
                </TableCell>
                <TableCell align="left" sx={{ fontSize: 11, fontWeight: 700 }}>
                  Message
                </TableCell>
                <TableCell align="center" sx={{ fontSize: 11, fontWeight: 700, width: 40 }}>
                  Fix
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {findings.map((f, idx) => (
                <TableRow
                  key={f.id}
                  sx={{
                    "&:hover": { bgcolor: "action.hover" },
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                  aria-label={`Finding ${idx + 1}: ${f.message}`}
                >
                  <TableCell align="left" sx={{ fontSize: 12 }}>
                    <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                      {f.file_path}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: 12 }}>
                    <Typography variant="caption">{f.line_number || "-"}</Typography>
                  </TableCell>
                  <TableCell align="left">
                    <Chip
                      label={f.severity.toUpperCase()}
                      size="small"
                      sx={{
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: `${severityPalette[f.severity as keyof typeof severityPalette]}22`,
                        color: severityPalette[f.severity as keyof typeof severityPalette],
                      }}
                      aria-label={`Severity: ${f.severity}`}
                    />
                  </TableCell>
                  <TableCell align="left">
                    <Typography variant="caption" sx={{ display: "block", mb: 0.5 }}>
                      {f.message}
                    </Typography>
                    {f.suggested_code && (
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{
                          bgcolor: "action.hover",
                          p: 0.5,
                          borderRadius: 0.5,
                          fontFamily: "monospace",
                          fontSize: 10,
                          maxHeight: 60,
                          overflow: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {f.suggested_code}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {f.suggested_code && (
                      <Tooltip title={copiedId === f.id ? "Copied!" : "Copy fix"}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyCode(f.suggested_code!, f.id)}
                          sx={{ color: copiedId === f.id ? "success.main" : "inherit" }}
                          aria-label={`Copy suggested code for: ${f.message}`}
                        >
                          {copiedId === f.id ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Box>
  );
}
