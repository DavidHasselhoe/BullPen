import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools",
  description: "Stock screener, price alerts, portfolio builder, and more — professional-grade investing tools.",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
