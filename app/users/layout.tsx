import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Members",
  description: "Find investors with public profiles on BullPen.",
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
