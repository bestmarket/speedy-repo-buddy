import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Channel Studio" },
      {
        name: "description",
        content: "Sign in to clone a channel, generate ideas and turn them into scripts.",
      },
      { property: "og:title", content: "Sign in — Channel Studio" },
      {
        property: "og:description",
        content: "Sign in to clone a channel, generate ideas and turn them into scripts.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app/sources" });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setNeedsConfirm(false);
    try {
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/app/sources` },
            });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) {
        setMessage({
          kind: "info",
          text: "Almost there — check your inbox and click the confirmation link, then sign in.",
        });
        toast.success("Check your inbox to confirm your email.");
        return;
      }
      navigate({ to: "/app/sources" });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Could not sign you in";
      const unconfirmed = /not confirmed|confirm/i.test(raw);
      const text = unconfirmed
        ? "This email hasn't been confirmed yet. Check your inbox for the confirmation link."
        : /invalid login/i.test(raw)
          ? "That email and password don't match an account."
          : raw;
      setNeedsConfirm(unconfirmed);
      setMessage({ kind: "error", text });
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/app/sources` },
      });
      if (error) throw error;
      setMessage({ kind: "info", text: "Confirmation email sent — check your inbox." });
      toast.success("Confirmation email sent");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not send the email";
      setMessage({ kind: "error", text });
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Channel Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clone a channel, generate ideas, turn them into scripts.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {message ? (
            <p
              role="status"
              className={
                message.kind === "error"
                  ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  : "rounded-md bg-accent p-3 text-sm text-foreground"
              }
            >
              {message.text}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          {needsConfirm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || !email}
              onClick={resendConfirmation}
            >
              Resend confirmation email
            </Button>
          ) : null}
        </form>

        <Button variant="outline" className="mt-3 w-full" onClick={google}>
          Continue with Google
        </Button>

        <button
          type="button"
          className="mt-6 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "No account yet? Create one" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
