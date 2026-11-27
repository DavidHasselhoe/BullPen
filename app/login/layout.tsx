import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  // Crawlable (see app/robots.ts) so Google can follow bullpen.no/login's redirect, never indexed.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
