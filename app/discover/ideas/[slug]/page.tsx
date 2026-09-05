import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { THEME_DISPLAY_ORDER, THEME_BY_SLUG } from '@/lib/discover/theme-config';
import { ThemeDetailClient } from '@/components/discover/v2/ThemeDetailClient';

const BASE_URL = 'https://bullpen.no';

export function generateStaticParams() {
  return THEME_DISPLAY_ORDER.map((theme) => ({ slug: theme.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const theme = THEME_BY_SLUG.get(slug);
  if (!theme) return {};

  return {
    title: theme.title,
    description: theme.description,
    alternates: { canonical: `${BASE_URL}/discover/ideas/${slug}` },
    openGraph: { title: theme.title, description: theme.description, url: `${BASE_URL}/discover/ideas/${slug}` },
  };
}

export default async function ThemeIdeaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!THEME_BY_SLUG.has(slug)) notFound();

  return <ThemeDetailClient slug={slug} />;
}
