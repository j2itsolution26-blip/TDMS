import type { Metadata } from 'next';
import './globals.css';

/**
 * Root layout.
 *
 * Replaces layouts/app.blade.php and layouts/auth-branded.blade.php at the
 * document level; the two page shells below it supply their own chrome.
 *
 * The Inter webfont is still loaded from Bunny Fonts, the same host the
 * Blade layout used — swapping to a different provider would change the
 * rendering, and this is a migration.
 */
export const metadata: Metadata = {
  title: 'TDMS',
  description: 'TVET Diploma Management System',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link
          href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-surface text-navy-900">{children}</body>
    </html>
  );
}
