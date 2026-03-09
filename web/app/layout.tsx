import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta',
});

const siteUrl = 'https://www.gradewithkatana.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Katana — AI Grading Assistant for Canvas SpeedGrader',
    template: '%s | Katana',
  },
  description:
    'A Google Chrome extension that grades student essays and reports in Canvas SpeedGrader with AI. One click fills in the score, rubric ratings, and written feedback automatically.',
  keywords: [
    'AI grading',
    'Canvas SpeedGrader',
    'rubric grading',
    'essay grading',
    'teacher grading tool',
    'Chrome extension for teachers',
    'Canvas LMS',
    'AI feedback',
    'automated grading',
    'Instructure Canvas',
  ],
  authors: [{ name: 'Torabashiri, LLC', url: siteUrl }],
  creator: 'Torabashiri, LLC',
  publisher: 'Torabashiri, LLC',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Katana',
    title: 'Katana — AI Grading Assistant for Canvas SpeedGrader',
    description:
      'Grade essays and reports in Canvas SpeedGrader with one click. AI fills in the score, rubric ratings, and written feedback automatically. Built by university professors.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Katana — AI Grading Assistant for Canvas SpeedGrader',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Katana — AI Grading Assistant for Canvas SpeedGrader',
    description:
      'One click. AI grades the essay, fills in Canvas. You review and submit.',
    images: ['/og-image.png'],
    creator: '@gradewithkatana',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚔️</text></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
