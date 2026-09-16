import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getWorkspace } from "./studio.functions";

export const workspaceKey = ["workspace"] as const;

type WorkspaceSelection = {
  projectId: string | undefined;
  selectProject: (projectId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceSelection | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string>();

  useEffect(() => {
    setProjectId(window.localStorage.getItem("channel-studio-project") ?? undefined);
  }, []);

  const value = useMemo(
    () => ({
      projectId,
      selectProject: (nextId: string) => {
        window.localStorage.setItem("channel-studio-project", nextId);
        setProjectId(nextId);
      },
    }),
    [projectId],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceSelection() {
  const selection = useContext(WorkspaceContext);
  if (!selection) throw new Error("WorkspaceProvider is missing");
  return selection;
}

export function useWorkspace() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const { projectId } = useWorkspaceSelection();
  return useQuery({
    queryKey: [...workspaceKey, projectId ?? "default"],
    queryFn: () => fetchWorkspace({ data: projectId ? { projectId } : undefined }),
  });
}

export function useRefreshWorkspace() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: workspaceKey });
}
