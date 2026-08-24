/** Global route loading — calm skeleton (no blank flash; empty-states anti-flash §6). */
import { Container, Section, Stack, Grid, Skeleton, TableSkeleton } from '@/components/ui';

/**
 * `SiteChromeTop`/`SiteChromeBottom` render the header AND footer outside
 * this component's own Suspense boundary (see SiteChrome.tsx) — they paint
 * immediately regardless of how long the route's data takes. This skeleton
 * used to be a couple of text lines plus a 6×5 table: on a cold load short
 * enough for that gap to be visible, the real footer sat right underneath it,
 * inside the first viewport, and then the actual page (any real route here
 * is several thousand pixels tall) flooded in underneath — a jarring
 * "half-empty page suddenly fills up" jump (design/UX audit).
 *
 * Reserving a hero block + a card grid + the table below (a shape close to
 * what most routes actually open on — a hero/summary section, then a grid or
 * a table) is not pixel-exact for any one route, but it is tall enough that
 * the footer no longer paints inside the first viewport on common screen
 * heights, which is the actual, testable version of the complaint.
 */
export default function Loading() {
  return (
    <Container>
      <Section space={16}>
        <span className="visually-hidden" role="status" aria-live="polite">
          در حال بارگذاری…
        </span>
        <Stack gap={8}>
          <Skeleton variant="block" height={320} />
          <Stack gap={4}>
            <Skeleton variant="text" width="40%" height={28} />
            <Skeleton variant="text" width="65%" />
          </Stack>
          <Grid cols={4} gap={4}>
            <Skeleton variant="block" height={160} />
            <Skeleton variant="block" height={160} />
            <Skeleton variant="block" height={160} />
            <Skeleton variant="block" height={160} />
          </Grid>
          <TableSkeleton rows={6} cols={5} />
        </Stack>
      </Section>
    </Container>
  );
}
