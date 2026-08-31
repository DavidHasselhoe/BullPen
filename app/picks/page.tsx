export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import PicksClientPage from './PicksClientPage';

export const metadata: Metadata = {
  title: "Bull's Track Record — BullPen",
  description:
    "Every AI stock pick BullPen has made, priced at the next market open and tracked from there — winners and losers, against the S&P bought on the same days.",
  alternates: { canonical: '/picks' },
};

export default function PicksPage() {
  return <PicksClientPage />;
}
