import { EmptyState } from '@/components/EmptyState';
import type { IconName } from '@/components/Icon';
import { PageHeader, type Crumb } from '@/components/PageHeader';

export interface PlaceholderPageProps {
  title: string;
  breadcrumb?: Crumb[];
  icon?: IconName;
  /** What this screen will do, in one sentence. */
  description?: string;
}

/** Stand-in for a screen that is still being built. Feature agents replace the page that renders it. */
export function PlaceholderPage({ title, breadcrumb, icon = 'box', description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} breadcrumb={breadcrumb} />
      <EmptyState icon={icon} title={`${title} is on the way`} description={description ?? 'This screen is still being baked. Check back soon.'} />
    </>
  );
}
