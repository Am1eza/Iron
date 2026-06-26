/**
 * Poladin UI system — the single import surface for the component library
 * (Phase 3 · UI Engineering). Built entirely on the design tokens; RTL-native;
 * every interactive piece defines hover/press/focus/disabled and respects
 * reduced-motion. See web/UI-SYSTEM.md.
 */

// Layout & spacing
export { Container, Section, Stack, Cluster, Grid, Divider, Spacer } from './Layout';
export { Show } from './Show';
export { VisuallyHidden } from '@/components/a11y/VisuallyHidden';

// Typography
export { Text, Heading, Overline, Num } from './Typography';

// Action & display
export { Badge, CountBadge } from './Badge';
export { Chip } from './Chip';
export { Card, CardHeader, CardBody, CardFooter } from './Card';
export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';
export { Switch } from './Switch';
export { Avatar, LogoFrame } from './Avatar';

// Domain display
export { MovementBadge, PriceTag, DeliveryBadge } from './PriceParts';

// Navigation
export { Tabs, TabPanel } from './Tabs';
export type { TabItem } from './Tabs';
export { Breadcrumbs } from './Breadcrumbs';
export type { Crumb } from './Breadcrumbs';
export { Pagination } from './Pagination';

// Feedback & overlay
export { Alert } from './Alert';
export { Tooltip } from './Tooltip';
export { Modal } from './Modal';
export { EmptyState } from './EmptyState';
export { emptyPresets } from './emptyPresets';

// Motion & loading
export { useSpark } from './Spark';
export { Reveal } from './Reveal';
export { Spinner } from './Spinner';
export { Skeleton, SkeletonText, TableSkeleton } from './Skeleton';
export { InfiniteScroll } from './InfiniteScroll';

// Theming
export { ThemeToggle } from './ThemeToggle';

// Re-export the existing primitives so `@/components/ui` is the one door.
export { Button } from '@/components/primitives/Button';
export type { ButtonProps } from '@/components/primitives/Button';
