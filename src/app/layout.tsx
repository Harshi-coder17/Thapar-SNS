import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { ServiceWorker } from "@/shared/layout/service-worker";
import { StyleNonce } from "@/shared/security/style-nonce";

import "./globals.css";

// Inter via next/font: downloaded at build time and self-hosted (no runtime request to Google).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Thapar SNS", template: "%s | Thapar SNS" },
  description: "A unified campus networking and services platform for TIET students. Unofficial student project.",
};

// Pinch zoom stays enabled (no maximumScale or userScalable). viewportFit is left at the browser
// default ("auto"), so iOS and Android keep all content inside the safe area around notches and
// home indicators. Edge-to-edge ("cover") with safe-area insets is deferred to the PWA work (OI-49).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#8c0828",
};

// Every page renders per request so Next.js can apply the CSP nonce from src/proxy.ts.
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <StyleNonce nonce={nonce} />
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
