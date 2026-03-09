import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Katana — AI Grading Assistant for Canvas',
  description: 'Slice through your grading workload with AI-powered feedback for Canvas SpeedGrader.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
