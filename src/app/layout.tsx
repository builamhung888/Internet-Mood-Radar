import type { Metadata } from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'Internet Mood Radar — What\'s happening & how people react',
  description: 'Real-time mood tracking from the internet. Aggregates news and social platforms to show what\'s happening and how people react.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
