import type { MetadataRoute } from "next";

// Slice 6 PWA (OI-49): installable app shell. Icons are generated from the TIET logo already in the
// repository (public/brand/tiet-logo.png).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thapar SNS",
    short_name: "Thapar SNS",
    description: "A unified campus networking and services platform for TIET students. Unofficial student project.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#8c0828",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
