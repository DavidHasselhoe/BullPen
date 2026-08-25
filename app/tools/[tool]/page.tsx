'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { TOOLS } from '@/lib/tools/tools-config';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';

export default function ToolPage() {
  const { t } = useTranslation('tools');
  const params = useParams();
  const router = useRouter();
  const toolId = params.tool as string;
  const tool = TOOLS.find((t) => t.id === toolId);
  const { hasAnimatedBackground } = useBackground();

  if (!tool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t('toolNotFound', 'Tool not found')}</h1>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/tools')}>
            {t('toolBackToTools', 'Back to Tools')}
          </Button>
        </div>
      </div>
    );
  }

  const Icon = tool.icon;

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-3xl py-10 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 -ml-2 group"
          onClick={() => router.push('/tools')}
        >
          <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          {t('toolBackToTools', 'Back to Tools')}
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-7 w-7 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">{tool.name}</CardTitle>
                <CardDescription className="mt-1">{tool.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed py-16 text-center">
              <p className="text-muted-foreground font-medium mb-4">
                {tool.status === 'coming-soon' ? t('toolComingSoon', 'Coming soon') : t('toolUnderConstruction', 'Tool under construction')}
              </p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t('toolFutureUpdateNote', 'This tool will be available in a future update. Check back soon for updates.')}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
