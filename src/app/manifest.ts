import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duelist Circle",
    short_name: "Duelist",
    description: "Private Yu-Gi-Oh! friends league",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
