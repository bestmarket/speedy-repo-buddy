import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/scheduled-videos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const match = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "");
        const token = match?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const config = await supabaseAdmin
          .from("cron_config")
          .select("token")
          .eq("name", "scheduler")
          .maybeSingle();

        const expected = config.data?.token;
        if (!expected || expected.length !== token.length) {
          return new Response("Unauthorized", { status: 401 });
        }
        let diff = 0;
        for (let i = 0; i < expected.length; i += 1) {
          diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
        }
        if (diff !== 0) return new Response("Unauthorized", { status: 401 });

        try {
          const { prepareDueVideos } = await import("@/lib/schedule.server");
          const result = await prepareDueVideos(3);
          return Response.json({ ok: true, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Scheduler failed";
          console.error("[scheduled-videos]", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
