import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Track your favourite stocks with live prices, sparklines, and earnings countdowns.",
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
