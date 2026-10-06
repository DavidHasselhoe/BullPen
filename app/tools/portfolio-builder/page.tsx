import { Suspense } from 'react';
import { Sparkles } from 'lucide-react';
import { ToolPage, ToolHeader } from '@/components/tools/ToolHeader';
import { PortfolioBuilderClient } from '@/components/tools/portfolio-builder/PortfolioBuilderClient';
import { getRequestLocale, getRequestPathname, getServerT } from '@/lib/i18n/server';

export const metadata = {
  title: 'Portfolio Builder',
  description: 'Type an investment thesis. Get a high-conviction thematic portfolio.',
};

export default async function PortfolioBuilderPage() {
  const [locale, pathname] = await Promise.all([getRequestLocale(), getRequestPathname()]);
  const t = await getServerT(locale, pathname);

  return (
    <ToolPage>
      <ToolHeader
        icon={<Sparkles />}
        title={t('tools:portfolioBuilderTitle', 'Portfolio Builder')}
        description={t('tools:portfolioBuilderDescription', 'Type an investment thesis. Get a high-conviction thematic portfolio.')}
      />
      <Suspense fallback={null}>
        <PortfolioBuilderClient />
      </Suspense>
    </ToolPage>
  );
}
