import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Holdings",
  description: "Track your portfolio positions, performance, and risk in real time.",
};

export default function HoldingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
