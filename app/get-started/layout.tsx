import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get started",
};

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
