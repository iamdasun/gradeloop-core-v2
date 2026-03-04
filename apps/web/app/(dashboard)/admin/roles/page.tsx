"use client";

import * as React from "react";
import { Plus, Search, Shield, Info, MoreHorizontal, UserCog } from "lucide-react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreateRoleDialog } from "@/components/admin/create-role-dialog";
import { rolesApi, permissionsApi } from "@/lib/api/roles";
import type { Role, Permission } from "@/types/auth.types";
import { toast } from "@/lib/hooks/use-toast";
import { handleApiError } from "@/lib/api/users";

export default function RolesPermissionsPage() {
    const [roles, setRoles] = React.useState<Role[]>([]);
    const [permissions, setPermissions] = React.useState<Permission[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState("");

    // Create role dialog
    const [createRoleOpen, setCreateRoleOpen] = React.useState(false);

    // Edit states for the selected role
    const [selectedPermissions, setSelectedPermissions] = React.useState<Record<string, boolean>>({});
    const [saving, setSaving] = React.useState(false);

    const fetchInitialData = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [fetchedRoles, fetchedPerms] = await Promise.all([
                rolesApi.list(),
                permissionsApi.list(),
            ]);
            setRoles(fetchedRoles);
            setPermissions(fetchedPerms);
            if (fetchedRoles.length > 0 && !selectedRoleId) {
                setSelectedRoleId(fetchedRoles[0].id);
            }
        } catch (err) {
            setError(handleApiError(err));
            toast.error("Failed to load roles & permissions", handleApiError(err));
        } finally {
            setLoading(false);
        }
    }, [selectedRoleId]);

    React.useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const selectedRole = React.useMemo(() => {
        return roles.find((r) => r.id === selectedRoleId);
    }, [roles, selectedRoleId]);

    // Load selected role's permissions into editable state when selection changes
    React.useEffect(() => {
        if (selectedRole?.permissions) {
            const permsMap: Record<string, boolean> = {};
            selectedRole.permissions.forEach((p) => {
                permsMap[p.id] = true;
            });
            setSelectedPermissions(permsMap);
        } else {
            setSelectedPermissions({});
        }
    }, [selectedRole]);

    const groupedPermissions = React.useMemo(() => {
        const groups: Record<string, Permission[]> = {};
        const lowerQuery = searchQuery.toLowerCase();

        permissions.forEach((p) => {
            // Basic search filter
            if (searchQuery && !p.name.toLowerCase().includes(lowerQuery) && !p.description?.toLowerCase().includes(lowerQuery)) {
                return;
            }

            // We extract group from the name e.g. "users:read" -> "Users"
            const parts = p.name.split(":");
            const groupName = parts.length > 1 ? parts[0] : "General";
            const normalizedGroup = groupName.toUpperCase().replace(/_/g, " ");

            if (!groups[normalizedGroup]) {
                groups[normalizedGroup] = [];
            }
            groups[normalizedGroup].push(p);
        });

        return groups;
    }, [permissions, searchQuery]);

    const toggleGroupPermissions = (groupPerms: Permission[], selectAll: boolean) => {
        setSelectedPermissions((prev) => {
            const next = { ...prev };
            groupPerms.forEach((p) => {
                next[p.id] = selectAll;
            });
            return next;
        });
    };

    const handleSavePermissions = async () => {
        if (!selectedRole) return;
        setSaving(true);
        try {
            const activeIds = Object.keys(selectedPermissions).filter((id) => selectedPermissions[id]);
            const updated = await rolesApi.update(selectedRole.id, {
                permissions: activeIds,
            });

            // Update locally
            setRoles((prev) =>
                prev.map((r) => (r.id === updated.id ? { ...r, permissions: updated.permissions } : r))
            );
            toast.success("Permissions updated", `${selectedRole.name} permissions saved successfully.`);
        } catch (err) {
            toast.error("Failed to save permissions", handleApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicateRole = () => {
        // We could prefill create dialog but for now just open it
        if (!selectedRole) return;
        setCreateRoleOpen(true);
    };

    // The Create role dialog will call this on success
    const handleRoleCreated = (role: Role) => {
        setRoles((curr) => [...curr, role]);
        setSelectedRoleId(role.id);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] p-6 gap-6">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Roles & Permission Management
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400">
                        Manage system roles and fine-grained permissions.
                    </p>
                </div>
                <Button onClick={() => setCreateRoleOpen(true)} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Create Role
                </Button>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Left Sidebar: Roles List */}
                <div className="w-64 flex flex-col shrink-0">
                    <Card className="flex flex-col h-full border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                            <h2 className="font-semibold text-sm">Roles</h2>
                            {loading && <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />}
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {roles.map((r) => {
                                const isActive = r.id === selectedRoleId;
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => setSelectedRoleId(r.id)}
                                        className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${isActive
                                                ? "bg-primary/10 text-primary border border-primary/20"
                                                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-transparent"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Shield className={`h-4 w-4 ${isActive ? "text-primary" : "text-zinc-400"}`} />
                                            <span className="font-medium text-sm truncate">{r.name}</span>
                                        </div>
                                    </button>
                                );
                            })}
                            {!loading && roles.length === 0 && (
                                <div className="p-4 text-center text-sm text-zinc-500">
                                    No roles found
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <Card className="flex flex-col h-full overflow-hidden shadow-sm">
                        {selectedRole ? (
                            <>
                                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                            <Shield className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-bold">{selectedRole.name}</h2>
                                                {selectedRole.name.toLowerCase().includes("admin") && (
                                                    <Badge variant="info" className="text-[10px] h-5 px-1.5 uppercase tracking-wider">
                                                        Full Access
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                {selectedRole.description || "Configure permission access for this role."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={handleDuplicateRole}>
                                            Duplicate
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedPermissions({})}>
                                            Reset Defaults
                                        </Button>
                                    </div>
                                </div>

                                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
                                    <div className="relative max-w-lg">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                        <Input
                                            placeholder="Search specific permissions..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 bg-white dark:bg-zinc-950"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                    {Object.entries(groupedPermissions).map(([groupName, groupPerms]) => {
                                        const allSelected = groupPerms.every((p) => selectedPermissions[p.id]);
                                        const someSelected = groupPerms.some((p) => selectedPermissions[p.id]);
                                        const isIndeterminate = someSelected && !allSelected;

                                        return (
                                            <div key={groupName} className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-sm font-bold tracking-wider text-zinc-500 uppercase">
                                                        {groupName}
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <Label htmlFor={`select-all-${groupName}`} className="text-xs text-zinc-500 cursor-pointer">
                                                            Select All
                                                        </Label>
                                                        <Checkbox
                                                            id={`select-all-${groupName}`}
                                                            checked={isIndeterminate ? "indeterminate" : allSelected}
                                                            onCheckedChange={(checked) => toggleGroupPermissions(groupPerms, checked === true)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                                                    {groupPerms.map((p) => {
                                                        // Extract cleaner name
                                                        const rawName = p.name || p.id;
                                                        const labelPart = rawName.includes(";") || rawName.includes(":")
                                                            ? rawName.split(/[:;]/).pop()
                                                            : rawName;
                                                        let cleanName = (labelPart || rawName).replace(/_/g, " ");
                                                        cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

                                                        return (
                                                            <div key={p.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                                                <div className="space-y-1">
                                                                    <Label htmlFor={`perm-${p.id}`} className="font-semibold cursor-pointer">
                                                                        {cleanName}
                                                                    </Label>
                                                                    {p.description ? (
                                                                        <p className="text-sm text-zinc-500">{p.description}</p>
                                                                    ) : (
                                                                        <p className="text-sm text-zinc-500">Allow {cleanName.toLowerCase()} access.</p>
                                                                    )}
                                                                </div>
                                                                <div className="ml-4 flex items-center shrink-0">
                                                                    {/* Just use a regular switch if we want the iOS style or the new checkbox style. In the picture it looks like bordered circular checkbox with tick or simple circular checkmark. Let's use Checkbox but styled rounded if possible, otherwise normal Checkbox */}
                                                                    <Checkbox
                                                                        id={`perm-${p.id}`}
                                                                        checked={!!selectedPermissions[p.id]}
                                                                        onCheckedChange={(checked) => {
                                                                            setSelectedPermissions((prev) => ({ ...prev, [p.id]: !!checked }));
                                                                        }}
                                                                        className="h-5 w-5 rounded-full"
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {Object.keys(groupedPermissions).length === 0 && (
                                        <div className="py-12 text-center text-zinc-500">
                                            No permissions found matching "{searchQuery}"
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-end gap-3 shrink-0">
                                    <Button variant="outline" onClick={() => fetchInitialData()} disabled={saving}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSavePermissions} disabled={saving}>
                                        {saving ? "Saving..." : "Save Permissions"}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                                <Shield className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mb-4" />
                                <p>Select a role to configure permissions</p>
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <CreateRoleDialog
                open={createRoleOpen}
                onOpenChange={setCreateRoleOpen}
                roles={roles}
                permissions={permissions}
                groupedPermissions={groupedPermissions}
                onSuccess={handleRoleCreated}
            />
        </div>
    );
}
