'use client';

import * as Icons from 'lucide-react';

/** Resolves a course's `icon` column (a lucide-react component name string) to the actual icon, falling back to BookOpen. */
export function CourseIcon({ name, className }: { name: string; className?: string }) {
  const map = Icons as unknown as Record<string, React.FC<{ className?: string }>>;
  const Cmp = map[name] ?? Icons.BookOpen;
  return <Cmp className={className} />;
}
