import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  claimAdmin,
  getAdminData,
  getAdminStatus,
  saveProvider,
  setEngineDefaults,
  setZeroCostMode,
  testAiRouting,
  type AdminData,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin · Channel Studio" },
      {
        name: "description",
        content:
          "Control which AI engines Channel Studio uses, store provider keys and watch usage and cost.",
      },
      { property: "og:title", content: "Admin · Channel Studio" },
      {
        property: "og:description",
        content: "AI engine controls, provider keys and usage numbers for Channel Studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  llm: "Writing",
  tts: "Voice",
  image: "Pictures",
};

function AdminPage() {
  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => getAdminStatus() });
  const claim = useMutation({
    mutationFn: useServerFn(claimAdmin),
    onSuccess: () => {
      toast.success("You are now the admin");
      void status.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (status.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status.data?.isAdmin) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Admin area</CardTitle>
          <CardDescription>
            {status.data?.canClaim
              ? "No admin has been set up yet. Take the admin seat to manage AI engines."
              : "This area is for admins only."}
          </CardDescription>
        </CardHeader>
        {status.data?.canClaim ? (
          <CardContent>
            <Button onClick={() => claim.mutate({})} disabled={claim.isPending}>
              {claim.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Make me the admin
            </Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["admin-data"], queryFn: () => getAdminData() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-data"] });

  const saveProviderFn = useServerFn(saveProvider);
  const providerMutation = useMutation({
    mutationFn: saveProviderFn,
    onSuccess: () => {
      toast.success("Saved");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const defaultsMutation = useMutation({
    mutationFn: useServerFn(setEngineDefaults),
    onSuccess: () => {
      toast.success("Engine choices saved");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const zeroCostMutation = useMutation({
    mutationFn: useServerFn(setZeroCostMode),
    onSuccess: () => {
      toast.success("Zero-cost mode updated");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: useServerFn(testAiRouting),
    onSuccess: (result: { provider: string; ms: number; reply: string }) =>
      toast.success(`${result.provider} replied in ${result.ms} ms`, { description: result.reply }),

    onError: (error: Error) => toast.error(error.message),
  });

  if (data.isLoading || !data.data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const config: AdminData = data.data;
  const categories: ("llm" | "tts" | "image")[] = ["llm", "tts", "image"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Admin</h2>
          <p className="text-sm text-muted-foreground">
            Pick the engines, store keys and watch what everything costs.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => testMutation.mutate({})}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Test AI
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zero-cost mode</CardTitle>
          <CardDescription>
            Only free engines are used while this is on. Paid engines are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={config.zeroCostMode}
              disabled={zeroCostMutation.isPending}
              onCheckedChange={(enabled) => zeroCostMutation.mutate({ data: { enabled } })}
              aria-label="Zero-cost mode"
            />
            <span className="text-sm">{config.zeroCostMode ? "On" : "Off"}</span>
          </div>
        </CardContent>
      </Card>

      <DefaultsCard
        config={config}
        pending={defaultsMutation.isPending}
        onSave={(defaults) => defaultsMutation.mutate({ data: defaults })}
      />

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{CATEGORY_LABEL[category]} engines</CardTitle>
            <CardDescription>Turn engines on or off and store their keys.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.providers
              .filter((provider) => provider.category === category)
              .map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  pending={providerMutation.isPending}
                  onSave={(input) => providerMutation.mutate({ data: input })}
                />
              ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>Every AI call the app has made.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total calls" value={String(config.telemetry.totalCalls)} />
            <Stat label="Last 30 days" value={String(config.telemetry.last30dCalls)} />
            <Stat label="Failed" value={String(config.telemetry.failedCalls)} />
            <Stat label="Cost" value={`$${config.telemetry.totalCostUsd.toFixed(3)}`} />
          </div>

          {config.telemetry.byProvider.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">By engine</p>
              {config.telemetry.byProvider.map((row) => (
                <div key={row.provider} className="flex justify-between text-sm">
                  <span>{row.provider}</span>
                  <span className="text-muted-foreground">
                    {row.calls} calls · ${row.costUsd.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No AI calls recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function DefaultsCard({
  config,
  pending,
  onSave,
}: {
  config: AdminData;
  pending: boolean;
  onSave: (defaults: { llm: string; tts: string; image: string }) => void;
}) {
  const [defaults, setDefaults] = useState(config.defaults);
  useEffect(() => setDefaults(config.defaults), [config.defaults]);

  const options = (category: "llm" | "tts" | "image") =>
    config.providers.filter((provider) => provider.category === category);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Which engine does what</CardTitle>
        <CardDescription>
          If the chosen engine is off or missing a key, the built-in AI is used instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["llm", "tts", "image"] as const).map((category) => (
          <div key={category} className="space-y-2">
            <Label htmlFor={`default-${category}`}>{CATEGORY_LABEL[category]}</Label>
            <select
              id={`default-${category}`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={defaults[category]}
              onChange={(event) =>
                setDefaults((prev) => ({ ...prev, [category]: event.target.value }))
              }
            >
              {options(category).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                  {provider.tier === "free" ? " (free)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button onClick={() => onSave(defaults)} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save choices
        </Button>
      </CardContent>
    </Card>
  );
}

function ProviderRow({
  provider,
  pending,
  onSave,
}: {
  provider: AdminData["providers"][number];
  pending: boolean;
  onSave: (input: { id: string; enabled?: boolean; apiKey?: string; clearKey?: boolean }) => void;
}) {
  const [key, setKey] = useState("");

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{provider.label}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant={provider.tier === "free" ? "secondary" : "outline"}>
              {provider.tier === "free" ? "Free" : "Paid"}
            </Badge>
            {provider.requires_key ? (
              <Badge variant={provider.has_key ? "secondary" : "destructive"}>
                {provider.has_key ? "Key saved" : "Key needed"}
              </Badge>
            ) : (
              <Badge variant="secondary">No key needed</Badge>
            )}
          </div>
        </div>
        <Switch
          checked={provider.enabled}
          disabled={pending}
          aria-label={`Enable ${provider.label}`}
          onCheckedChange={(enabled) => onSave({ id: provider.id, enabled })}
        />
      </div>

      {provider.requires_key ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="password"
            value={key}
            placeholder={provider.has_key ? "Replace saved key" : "Paste key"}
            aria-label={`${provider.label} key`}
            onChange={(event) => setKey(event.target.value)}
            className="min-w-[12rem] flex-1"
          />
          <Button
            variant="outline"
            disabled={pending || !key.trim()}
            onClick={() => {
              onSave({ id: provider.id, apiKey: key });
              setKey("");
            }}
          >
            Save key
          </Button>
          {provider.has_key ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => onSave({ id: provider.id, clearKey: true })}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
