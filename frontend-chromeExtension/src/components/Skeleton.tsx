import { Box, Skeleton, Stack } from "@mui/material";

/**
 * Skeleton loader for findings list.
 *
 * Usage:
 * ```tsx
 * {isLoading ? <FindingsListSkeleton count={5} /> : <FindingsList findings={findings} />}
 * ```
 */
export function FindingsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Stack spacing={2}>
      {Array.from({ length: count }).map((_, index) => (
        <Box key={index}>
          <Stack direction="row" spacing={2} alignItems="center" mb={1}>
            <Skeleton variant="circular" width={24} height={24} />
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
          </Stack>
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="85%" />
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Skeleton loader for job status card.
 *
 * Usage:
 * ```tsx
 * {isLoading ? <JobStatusSkeleton /> : <JobStatusCard job={job} />}
 * ```
 */
export function JobStatusSkeleton() {
  return (
    <Box>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Skeleton variant="text" width="40%" height={32} />
          <Skeleton variant="rectangular" width={100} height={28} sx={{ borderRadius: 2 }} />
        </Stack>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="rectangular" width="100%" height={8} sx={{ borderRadius: 1 }} />
        <Stack direction="row" spacing={2} mt={2}>
          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" width={80} height={24} sx={{ borderRadius: 1 }} />
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Full-page skeleton loader.
 *
 * Usage:
 * ```tsx
 * {isLoading ? <PageSkeleton /> : <PageContent />}
 * ```
 */
export function PageSkeleton() {
  return (
    <Stack spacing={3} p={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Skeleton variant="text" width={200} height={40} />
        <Skeleton variant="circular" width={40} height={40} />
      </Stack>
      <Skeleton variant="rectangular" width="100%" height={120} sx={{ borderRadius: 2 }} />
      <JobStatusSkeleton />
      <FindingsListSkeleton count={4} />
    </Stack>
  );
}
