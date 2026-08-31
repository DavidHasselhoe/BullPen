import type { Metadata } from 'next';
import { AcademyHomeClient } from './AcademyHomeClient';

export const metadata: Metadata = {
  title: 'Academy',
  description: 'Learn to invest with free, bite-sized lessons on reading financial statements, valuation, portfolio risk, and more.',
  alternates: { canonical: '/academy' },
};

export default function AcademyHomePage() {
  return <AcademyHomeClient />;
}
