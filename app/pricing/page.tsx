import { redirect } from 'next/navigation';

// The pricing/upgrade surface lives at /upgrade (where every in-app CTA points).
export default function PricingPage() {
  redirect('/upgrade');
}
