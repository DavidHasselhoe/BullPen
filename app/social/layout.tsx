import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Feed",
  description: "Portfolio activity from investors you follow.",
};

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
