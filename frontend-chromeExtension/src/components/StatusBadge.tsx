import { Chip, useTheme } from "@mui/material";

type Status = "pending" | "running" | "completed" | "failed";

const statusColors: Record<Status, string> = {
  pending: "warning",
  running: "info",
  completed: "success",
  failed: "error",
};

interface StatusBadgeProps {
  status: Status;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const theme = useTheme();
  return (
    <Chip
      size="small"
      label={status}
      color={(statusColors[status] as any) ?? "default"}
      sx={{
        textTransform: "uppercase",
        fontWeight: 700,
        letterSpacing: 0.5,
        color: theme.palette.getContrastText(theme.palette.background.paper),
      }}
    />
  );
}
