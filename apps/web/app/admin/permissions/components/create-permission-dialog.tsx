"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createPermission } from "@/lib/api/iam";
import { CreatePermissionRequest } from "@/lib/types/iam";
import { Loader2, Key } from "lucide-react";

interface CreatePermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPermissionCreated: () => void;
}

export function CreatePermissionDialog({
  open,
  onOpenChange,
  onPermissionCreated,
}: CreatePermissionDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<CreatePermissionRequest>({
    name: "",
    description: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Permission name is required";
    } else if (formData.name.length < 3) {
      newErrors.name = "Permission name must be at least 3 characters";
    } else if (!/^[a-z_:]+$/.test(formData.name)) {
      newErrors.name =
        "Permission name must be lowercase with underscores or colons only (e.g., users:read)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const requestData: CreatePermissionRequest = {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
      };

      await createPermission(requestData);

      toast({
        title: "Permission created successfully",
        description: `${formData.name} has been created.`,
      });

      onPermissionCreated();
      handleClose();
    } catch (error) {
      toast({
        title: "Failed to create permission",
        description:
          (error as Error).message ||
          "An error occurred while creating the permission",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
    });
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Create New Permission
          </DialogTitle>
          <DialogDescription>
            Create a new permission that can be assigned to roles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Permission Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Permission Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., users:read, courses:write"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Use lowercase letters, underscores, and colons. Common format:
                category:action (e.g., users:read, courses:write)
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe what this permission allows..."
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Provide a clear description to help administrators understand
                what this permission controls.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Permission
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
