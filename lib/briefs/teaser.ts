/**
 * The free layer of the Daily Brief: the title plus the `## TL;DR` section
 * only. No TL;DR section means no body at all. Shared by /api/briefs/today
 * and Ask Bull so the chat can never show a free account more than Home does.
 */
export function toTeaser<T extends { content: string }>(brief: T): T {
  const match = brief.content.match(/^##\s*TL;DR\s*\n([\s\S]*?)(?=\n##\s|$)/m);
  return { ...brief, content: match ? `## TL;DR\n\n${match[1].trim()}` : '', sources: [] };
}
