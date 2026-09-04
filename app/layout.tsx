import type { Metadata } from 'next';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/roboto-slab/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Taller 3D — Diseña tu camiseta',
  description: 'Editor 3D local para personalizar camisetas deportivas.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
