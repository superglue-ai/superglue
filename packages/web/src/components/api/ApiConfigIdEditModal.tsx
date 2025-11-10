import { useConfig } from "@/src/app/config-context";
import { tokenRegistry } from "@/src/lib/token-registry";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { useToast } from "@/src/hooks/use-toast";
import { SuperglueClient } from "@superglue/client";
import React, { useState } from "react";

type ApiConfigIdEditModalProps = {
  isOpen: boolean;
  onClose: () => void;
  configId: string;
  onConfigUpdated: (newId: string) => void;
};

const ApiConfigIdEditModal = ({
  isOpen,
  onClose,
  configId,
  onConfigUpdated,
}: ApiConfigIdEditModalProps) => {
  const [newConfigId, setNewConfigId] = useState(configId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const config = useConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate the new ID
      if (!newConfigId.trim()) {
        setError("ID cannot be empty");
        setIsSubmitting(false);
        return;
      }

      if (newConfigId === configId) {
        setError("New ID must be different from the current ID");
        setIsSubmitting(false);
        return;
      }

      // TODO: Once the client SDK is updated:
      // const result = await superglueClient.updateApiConfigId(configId, newConfigId);

      // TODO: remove! call GraphQL mutation directly until it's in the SDK
      const response = await fetch(`${config.superglueEndpoint}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRegistry.getToken()}`,
        },
        body: JSON.stringify({
          query: `
            mutation UpdateApiConfigId($oldId: ID!, $newId: ID!) {
              updateApiConfigId(oldId: $oldId, newId: $newId) {
                id
              }
            }
          `,
          variables: {
            oldId: configId,
            newId: newConfigId,
          },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Temporary implementation until server supports the mutation
      // This is just a mock that simulates success for UI testing
      // console.log(`ID update from ${configId} to ${newConfigId} would happen here`);
      // Simulate a short delay to make the UX feel realistic
      // await new Promise(resolve => setTimeout(resolve, 500));

      toast({
        title: "Success",
        description: `Config ID successfully updated from "${configId}" to "${newConfigId}"`,
      });

      onConfigUpdated(newConfigId);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while updating the config ID",
      );
      console.error("Error updating config ID:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit API Config ID</DialogTitle>
          <DialogDescription>
            Changing the API Config ID updates all references in the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="col-span-1">Current ID:</div>
              <div className="col-span-3 font-medium">{configId}</div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="col-span-1">New ID:</div>
              <div className="col-span-3">
                <Input
                  id="newConfigId"
                  value={newConfigId}
                  onChange={(e) => setNewConfigId(e.target.value)}
                  placeholder="Enter new config ID"
                  className="col-span-3"
                />
              </div>
            </div>

            {error && <div className="text-red-500 text-sm mt-2">{error}</div>}

            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md border border-amber-200 dark:border-amber-800 mt-2">
              <p className="text-amber-800 dark:text-amber-300 dark:text-amber-300 text-sm">
                <strong>Warning:</strong> Changing the ID will break any
                existing code that references the current ID. Make sure to
                update all references in your application code.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update ID"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ApiConfigIdEditModal;
