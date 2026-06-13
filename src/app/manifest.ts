import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Songbook",
    short_name: "Songbook",
    description: "ChordPro songbook for performance",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1014",
    theme_color: "#0e1014",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
