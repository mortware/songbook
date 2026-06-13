import type { Metadata, Viewport } from "next";
import OfflineBanner from "@/components/OfflineBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SyncProvider from "@/components/SyncProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Songbook",
  description: "ChordPro songbook for performance",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Songbook",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e1014",
  width: "device-width",
  initialScale: 1,
  // Font size is controlled in-app; accidental pinch-zoom mid-song is worse.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Apply saved theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('songbook:theme')||'auto';if(t==='auto')t=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.dataset.theme=t;})();` }} />
        <ThemeProvider>
          <SyncProvider>
            <OfflineBanner />
            {children}
          </SyncProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
