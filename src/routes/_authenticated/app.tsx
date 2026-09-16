import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Folder, Loader2, LogOut, Menu, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { createProject, type ChannelProfile } from "@/lib/studio.functions";
import {
  useRefreshWorkspace,
  useWorkspace,
  useWorkspaceSelection,
  WorkspaceProvider,
} from "@/lib/useWorkspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: () => (
    <WorkspaceProvider>
      <AppLayout />
    </WorkspaceProvider>
  ),
});

const TABS = [
  { to: "/app/sources", label: "Sources" },
  { to: "/app/chat", label: "Chat" },
  { to: "/app/studio", label: "Studio" },
  { to: "/app/channels", label: "Channels" },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const refresh = useRefreshWorkspace();
  const { selectProject } = useWorkspaceSelection();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close the phone menu whenever the page changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  const addProject = useMutation({
    mutationFn: useServerFn(createProject),
    onSuccess: async (project: Tables<"projects">) => {
      await refresh();
      selectProject(project.id);
      setName("");
      setAdding(false);
      toast.success("Project created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const profile = workspace.data?.project.channel_profile as ChannelProfile | null | undefined;
  const style = profile?.visualStyle?.trim() || "Style pending analysis";
  const projectName = workspace.data?.project.name ?? "Channel Studio";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const projectList = (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-muted-foreground">Your projects</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:h-8 md:w-8"
          title="New project"
          aria-label="New project"
          onClick={() => setAdding((value) => !value)}
        >
          <Plus />
        </Button>
      </div>
      {adding ? (
        <form
          className="mb-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) addProject.mutate({ data: { name } });
          }}
        >
          <Input
            value={name}
            maxLength={80}
            autoFocus
            placeholder="Project name"
            aria-label="Project name"
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size="icon"
            type="submit"
            className="h-11 w-11 shrink-0 md:h-9 md:w-9"
            aria-label="Create project"
            disabled={!name.trim() || addProject.isPending}
          >
            {addProject.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </form>
      ) : null}
      <div className="space-y-1">
        {(workspace.data?.projects ?? []).map((project) => {
          const projectProfile = project.channel_profile as ChannelProfile | null;
          const active = project.id === workspace.data?.project.id;
          return (
            <Button
              key={project.id}
              type="button"
              variant="ghost"
              onClick={() => {
                selectProject(project.id);
                setMenuOpen(false);
              }}
              className={cn(
                "h-auto w-full justify-start px-2 py-3 text-left md:py-2",
                active && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              <Folder className="self-start" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{project.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {projectProfile?.visualStyle || "Not analysed"}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-sidebar-border px-4 py-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">Current project</p>
        <h1 className="truncate text-base font-semibold text-sidebar-foreground">{projectName}</h1>
        <p className="truncate text-xs text-muted-foreground">{style}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 md:h-8 md:w-8"
        title="Sign out"
        aria-label="Sign out"
        onClick={() => void signOut()}
      >
        <LogOut />
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden bg-sidebar md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto md:border-r md:border-sidebar-border">
        {header}
        {projectList}
      </aside>

      <div className="min-w-0">
        {/* Phone top bar: menu on the left, current project in the middle. */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {header}
              <nav className="flex flex-col gap-1 border-b border-sidebar-border p-3">
                {TABS.map((tab) => (
                  <Link
                    key={tab.to}
                    to={tab.to}
                    className="rounded-md px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                    activeProps={{
                      className: cn("bg-sidebar-accent text-sidebar-accent-foreground font-medium"),
                    }}
                  >
                    {tab.label}
                  </Link>
                ))}
              </nav>
              {projectList}
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{projectName}</p>
            <p className="truncate text-xs text-muted-foreground">{style}</p>
          </div>
        </div>

        <header className="hidden border-b border-border md:block">
          <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pt-2">
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: cn("border-primary text-foreground font-medium") }}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-5 pb-24 md:py-6 md:pb-6">
          <Outlet />
        </main>

        {/* Phone bottom bar so the four areas are always one tap away. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur md:hidden">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex min-h-14 items-center justify-center px-1 text-xs text-muted-foreground"
              activeProps={{ className: cn("text-foreground font-semibold") }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
