"use client";

import { useConfig } from "@/src/app/config-context";
import { useSystems } from "@/src/app/systems-context";
import { createSuperglueClient } from "@/src/lib/client-utils";
import type { System } from "@superglue/shared";
import { Hammer, MoreVertical, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useToast } from "@/src/hooks/use-toast";

interface SystemActionsMenuProps {
  system: System;
  onDeleted?: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

export function SystemActionsMenu({
  system,
  onDeleted,
  disabled = false,
  showLabel = false,
}: SystemActionsMenuProps) {
  const config = useConfig();
  const router = useRouter();
  const { toast } = useToast();
  const { refreshSystems } = useSystems();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleBuildTool = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/tools?system=${encodeURIComponent(system.id)}`);
  };

  const handleDelete = async () => {
    try {
      const client = createSuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.deleteSystem(system.id);
      await refreshSystems();
      onDeleted?.();
    } catch (error) {
      console.error("Error deleting system:", error);
      toast({
        title: "Error",
        description: "Failed to delete system",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={showLabel ? "sm" : "icon"}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            className={
              showLabel ? "h-8 gap-1.5 text-muted-foreground hover:text-foreground" : undefined
            }
          >
            <MoreVertical className={showLabel ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {showLabel && <span className="text-xs">More</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleBuildTool}>
            <Hammer className="h-4 w-4 mr-2" />
            Build Tool
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the system "{system.id}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await handleDelete();
                setDeleteDialogOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
