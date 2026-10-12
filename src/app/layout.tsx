import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import { PwaRegister } from "@/components/pwa-register";

// Night Temple theme fonts (2.0). Exposed as CSS variables;
// globals.css uses --font-cinzel for h1/h2 (+ the font-display
// utility) and --font-inter for body text.
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  themeColor: "#05081a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Prevents Safari from starting a home-screen app already
  // pinch-zoomed on some iPhones, without disabling user zoom
  // (maximumScale/userScalable are intentionally NOT set here -
  // that would break pinch-zoom accessibility).
  interactiveWidget: "resizes-content",
};

// Runs before first paint: if Home's intro stagger already
// played this session, mark <html> so it doesn't replay on a
// reload (see components/home-intro-flag.tsx).
const homeIntroScript =
  "try{if(sessionStorage.getItem('dc-home-intro'))document.documentElement.dataset.homeSeen='1'}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${inter.variable}`} suppressHydrationWarning>
      {/* Browser extensions (e.g. Grammarly) add data-* attributes to
          <body> before React hydrates; don't treat that as an app error. */}
      <body suppressHydrationWarning>
        <Script id="dc-home-intro" strategy="beforeInteractive">
          {homeIntroScript}
        </Script>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
