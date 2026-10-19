import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed",
  description: "New filings, trades and positions from the funds, members of Congress and investors you follow.",
};

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
