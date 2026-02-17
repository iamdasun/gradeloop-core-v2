"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Search, ChevronRight } from "lucide-react";
import { useRoleWithPermissions, useUpdateRole, useUpdateRolePermissions } from "../hooks/use-roles";
import { RoleDetailsSidebar } from "./role-details-sidebar";
import { ModuleSection } from "./module-section";
import type { PermissionAction } from "@/schemas/role-permission.schema";
import Link from "next/link";

interface RolePermissionConfigPageProps {
  roleId: string;
}

export function RolePermissionConfigPage({ roleId }: RolePermissionConfigPageProps) {
  const router = useRouter();

  // Fetch role data
  const { data: role, isLoading, error } = useRoleWithPermissions(roleId);
  
  // Mutations
  const updateRoleMutation = useUpdateRole();
  const updatePermissionsMutation = useUpdateRolePermissions();

  // Local state for edits
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleStatus, setRoleStatus] = useState(true);
  const [permissionChanges, setPermissionChanges] = useState<Map<string, boolean>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  // Sync with fetched data
  useMemo(() => {
    if (role) {
      setRoleName(role.name);
      setRoleDescription(role.description || "");
      setRoleStatus(role.is_active);
    }
  }, [role]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!role) return false;
    return (
      roleName !== role.name ||
      roleDescription !== (role.description || "") ||
      roleStatus !== role.is_active ||
      permissionChanges.size > 0
    );
  }, [role, roleName, roleDescription, roleStatus, permissionChanges]);

  // Filter modules by search query
  const filteredModules = useMemo(() => {
    if (!role || !searchQuery) return role?.modules || [];
    
    const query = searchQuery.toLowerCase();
    return role.modules.filter((module) => {
      const moduleMatches = module.module_name.toLowerCase().includes(query);
      const resourceMatches = module.resources.some((resource) =>
        resource.resource_name.toLowerCase().includes(query) ||
        resource.resource_description?.toLowerCase().includes(query)
      );
      return moduleMatches || resourceMatches;
    });
  }, [role, searchQuery]);

  // Handle permission change
  const handlePermissionChange = (resourceId: string, action: PermissionAction, enabled: boolean) => {
    const key = `${resourceId}:${action}`;
    const newChanges = new Map(permissionChanges);
    newChanges.set(key, enabled);
    setPermissionChanges(newChanges);
  };

  // Handle select all for a module
  const handleSelectAll = (moduleId: string) => {
    if (!role) return;
    
    const module = role.modules.find((m) => m.module_id === moduleId);
    if (!module) return;

    const newChanges = new Map(permissionChanges);
    module.resources.forEach((resource) => {
      Object.keys(resource.actions).forEach((action) => {
        const key = `${resource.resource_id}:${action}`;
        newChanges.set(key, true);
      });
    });
    setPermissionChanges(newChanges);
  };

  // Handle save
  const handleSave = async () => {
    if (!role) return;

    try {
      // Update role basic info if changed
      if (
        roleName !== role.name ||
        roleDescription !== (role.description || "") ||
        roleStatus !== role.is_active
      ) {
        await updateRoleMutation.mutateAsync({
          roleId: role.id,
          data: {
            name: roleName,
            description: roleDescription,
            is_active: roleStatus,
          },
        });
      }

      // Update permissions if changed
      if (permissionChanges.size > 0) {
        const permissionsArray = Array.from(permissionChanges.entries()).map(([key, enabled]) => {
          const [resourceId, action] = key.split(":");
          return {
            module_id: "", // Backend should derive from resourceId
            resource_id: resourceId,
            action: action as PermissionAction,
            enabled,
          };
        });

        await updatePermissionsMutation.mutateAsync({
          role_id: role.id,
          permissions: permissionsArray,
        });
      }

      // Clear changes
      setPermissionChanges(new Map());
    } catch (error) {
      console.error("Failed to save changes:", error);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    router.push("/admin/roles");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-30">
          <Skeleton className="h-8 w-64" />
        </header>
        <main className="flex-grow p-8">
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (error || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Role Not Found</h2>
          <p className="text-gray-500 mb-4">The requested role could not be loaded.</p>
          <Button onClick={() => router.push("/admin/roles")}>Back to Roles</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex text-sm text-gray-500 mb-1">
              <ol className="flex items-center space-x-2">
                <li>
                  <Link href="/admin/settings" className="hover:text-primary transition-colors">
                    Settings
                  </Link>
                </li>
                <li>
                  <span className="text-gray-300">/</span>
                </li>
                <li>
                  <Link href="/admin/roles" className="hover:text-primary transition-colors">
                    Roles & Permissions
                  </Link>
                </li>
                <li>
                  <span className="text-gray-300">/</span>
                </li>
                <li aria-current="page" className="text-primary font-medium">
                  Configure Role
                </li>
              </ol>
            </nav>
            <h1 className="text-2xl font-bold text-gray-900">Configure Role Permissions</h1>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges || updateRoleMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <RoleDetailsSidebar
            role={role}
            onNameChange={setRoleName}
            onDescriptionChange={setRoleDescription}
            onStatusChange={setRoleStatus}
          />

          {/* Permission Matrix */}
          <div className="lg:col-span-9 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <h2 className="text-xl font-bold text-gray-900">Permissions Matrix</h2>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Search modules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Permission Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              {/* Table Header */}
              <div className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10 grid grid-cols-12 py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-4">Module / Resource</div>
                <div className="col-span-8 grid grid-cols-5 text-center">
                  <span>View</span>
                  <span>Create</span>
                  <span>Edit</span>
                  <span>Delete</span>
                  <span className="text-primary">Manage</span>
                </div>
              </div>

              {/* Modules */}
              {filteredModules.length > 0 ? (
                filteredModules.map((module) => (
                  <ModuleSection
                    key={module.module_id}
                    module={module}
                    onPermissionChange={handlePermissionChange}
                    onSelectAll={handleSelectAll}
                  />
                ))
              ) : (
                <div className="px-6 py-12 text-center text-gray-500">
                  No modules found matching your search.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
