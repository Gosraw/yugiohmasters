import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Duelist Circle",
  description: "Private Yu-Gi-Oh! friends league manager",
  applicationName: "Duelist Circle",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Duelist Circle",
    // "black-translucent" draws app content under the status
    // bar (dark app background already matches it) instead of
    // leaving a stock white/grey iOS status bar strip.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#090b10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Prevents Safari from starting a home-screen app already
  // pinch-zoomed on some iPhones, without disabling user zoom
  // (maximumScale/userScalable are intentionally NOT set here -
  // that would break pinch-zoom accessibility).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
