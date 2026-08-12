import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Запасы",
    short_name: "Запасы",
    description: "Приложение для учёта запасов по категориям",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#22c55e",
    icons: [
      {
        src: "/icons/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}