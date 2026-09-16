import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Channel Studio — YouTube content strategy, ideas to scripts" },
      {
        name: "description",
        content:
          "Clone a channel's style, generate video ideas, and turn them into scripts and videos with a guided AI strategist.",
      },
      { property: "og:title", content: "Channel Studio" },
      {
        property: "og:description",
        content:
          "Clone a channel's style, generate video ideas, and turn them into scripts and videos with a guided AI strategist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/app/sources" });
  },
});
