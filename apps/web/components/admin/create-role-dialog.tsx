"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import {
    SideDialog,
    SideDialogContent,
    SideDialogDescription,
    SideDialogFooter,
    SideDialogHeader,
    SideDialogTitle,
} from "@/components/ui/side-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "../ui/textarea";
import { SelectNative } from "@/components/ui/select-native";
import { Checkbox } from "@/components/ui/checkbox";
import type { Role, Permission } from "@/types/auth.types";
import { rolesApi } from "@/lib/api/roles";
import { toast } from "@/lib/hooks/use-toast";
import { handleApiError } from "@/lib/api/users"; // reusing error handler

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roles: Role[];
    permissions: Permission[];
    groupedPermissions: Record<string, Permission[]>;
    onSuccess: (role: Role) => void;
}

export function CreateRoleDialog({
    open,
    onOpenChange,
    roles,
    permissions,
    groupedPermissions,
    onSuccess,
}: Props) {
    const [name, setName] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [cloneRoleId, setCloneRoleId] = React.useState("");
    const [selectedPermissions, setSelectedPermissions] = React.useState<Record<string, boolean>>({});
    const [submitting, setSubmitting] = React.useState(false);

    // Reset form when dialog opens
    React.useEffect(() => {
        if (open) {
            setName("");
            setDescription("");
            setCloneRoleId("");
            setSelectedPermissions({});
        }
    }, [open]);

    // When clone role selected, copy its permissions
    React.useEffect(() => {
        if (cloneRoleId) {
            const role = roles.find((r) => r.id === cloneRoleId);
            if (role && role.permissions) {
                const next: Record<string, boolean> = {};
                role.permissions.forEach((p) => {
                    next[p.id] = true;
                });
                setSelectedPermissions(next);
            }
        } else {
            setSelectedPermissions({});
        }
    }, [cloneRoleId, roles]);

    const togglePermission = (id: string, checked: boolean) => {
        setSelectedPermissions((prev) => ({ ...prev, [id]: checked }));
    };

    const deselectAll = () => {
        setSelectedPermissions({});
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Role Name is required");
            return;
        }

        setSubmitting(true);
        try {
            const activePermIds = Object.keys(selectedPermissions).filter(
                (id) => selectedPermissions[id]
            );

            const role = await rolesApi.create({
                name,
                description,
                permissions: activePermIds,
            });

            toast.success("Role created", `${role.name} has been added.`);
            onSuccess(role);
            onOpenChange(false);
        } catch (err) {
            toast.error("Failed to create role", handleApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <SideDialog open={open} onOpenChange={onOpenChange}>
            <SideDialogContent className="max-w-xl">
                <SideDialogHeader>
                    <div className="flex items-center justify-between w-full">
                        <div>
                            <SideDialogTitle>Create Role</SideDialogTitle>
                            <SideDialogDescription>
                                Define permissions and access levels for this new role.
                            </SideDialogDescription>
                        </div>
                    </div>
                </SideDialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="space-y-6 flex-1 overflow-y-auto pr-2 pb-4">
                        {/* Role Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="role-name">
                                Role Name <span className="text-red-500">*</span>
                            </Label>
                            <div className="relative">
                                <Input
                                    id="role-name"
                                    placeholder="e.g. Assistant Principal"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label htmlFor="role-desc">Description</Label>
                            <Textarea
                                id="role-desc"
                                placeholder="Describe the responsibilities of this role..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={submitting}
                                className="resize-none h-20"
                            />
                        </div>

                        {/* Clone from Existing */}
                        <div className="space-y-1.5">
                            <Label htmlFor="clone-role">Clone from Existing Role</Label>
                            <SelectNative
                                id="clone-role"
                                value={cloneRoleId}
                                onChange={(e) => setCloneRoleId(e.target.value)}
                                disabled={submitting}
                            >
                                <option value="">Select a role template</option>
                                {roles.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </SelectNative>
                            <p className="text-xs text-zinc-500">
                                Start with permissions from an existing role to save time.
                            </p>
                        </div>

                        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Base Permissions
                                </h3>
                                <button
                                    type="button"
                                    onClick={deselectAll}
                                    className="text-sm text-primary hover:underline font-medium"
                                >
                                    Deselect All
                                </button>
                            </div>

                            <div className="space-y-4">
                                {Object.entries(groupedPermissions).map(([group, perms]) => (
                                    <div
                                        key={group}
                                        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden"
                                    >
                                        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/50 flex flex-col">
                                            <span className="text-sm font-semibold capitalize flex items-center gap-2">
                                                {group.toLowerCase()}
                                            </span>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {perms.map((p) => {
                                                // try to extract a better label from ID/name
                                                const rawName = p.name || p.id;
                                                const labelPart = rawName.includes(";") || rawName.includes(":")
                                                    ? rawName.split(/[:;]/).pop()
                                                    : rawName;
                                                let cleanName = (labelPart || rawName).replace(/_/g, " ");
                                                cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

                                                return (
                                                    <div key={p.id} className="flex items-start gap-3">
                                                        <Checkbox
                                                            id={`perm-${p.id}`}
                                                            checked={!!selectedPermissions[p.id]}
                                                            onCheckedChange={(c) =>
                                                                togglePermission(p.id, c as boolean)
                                                            }
                                                            className="mt-1"
                                                        />
                                                        <div className="space-y-1 leading-none">
                                                            <Label
                                                                htmlFor={`perm-${p.id}`}
                                                                className="font-medium cursor-pointer"
                                                            >
                                                                {cleanName}
                                                            </Label>
                                                            {p.description && (
                                                                <p className="text-xs text-zinc-500">
                                                                    {p.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <SideDialogFooter className="pt-4 mt-auto">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? "Saving…" : "Save Role"}
                        </Button>
                    </SideDialogFooter>
                </form>
            </SideDialogContent>
        </SideDialog>
    );
}
