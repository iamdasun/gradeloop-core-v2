"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge, Users } from "lucide-react";
import type { RoleWithPermissions } from "@/schemas/role-permission.schema";

interface RoleDetailsSidebarProps {
  role: RoleWithPermissions;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onStatusChange: (isActive: boolean) => void;
}

export function RoleDetailsSidebar({
  role,
  onNameChange,
  onDescriptionChange,
  onStatusChange,
}: RoleDetailsSidebarProps) {
  return (
    <aside className="lg:col-span-3 space-y-6">
      {/* Role Details Card */}
      <Card className="sticky top-28 p-6 border-gray-100 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Badge className="h-5 w-5 text-primary" />
          Role Details
        </h2>

        <div className="space-y-4">
          {/* Role Name */}
          <div>
            <label htmlFor="role_name" className="block text-sm font-medium text-gray-700 mb-1">
              Role Name
            </label>
            <Input
              id="role_name"
              type="text"
              placeholder="e.g. Course Creator"
              value={role.name}
              onChange={(e) => onNameChange(e.target.value)}
              className="bg-gray-50"
              disabled={role.is_system_role}
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="role_desc" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <Textarea
              id="role_desc"
              placeholder="Describe the responsibilities..."
              rows={4}
              value={role.description || ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="bg-gray-50 resize-none"
              disabled={role.is_system_role}
            />
          </div>

          {/* Status Toggle */}
          <div className="pt-4 border-t border-gray-100">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm font-medium text-gray-700">Role Status</span>
              <Switch
                id="role_status"
                checked={role.is_active}
                onCheckedChange={onStatusChange}
                disabled={role.is_system_role}
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">
              Inactive roles cannot be assigned to new users.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats Card */}
      <Card className="bg-primary/5 border-primary/10 p-5">
        <div className="flex items-start gap-3">
          <div className="bg-white p-1.5 rounded-lg shadow-sm">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">
              Assigned Users
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              {role.assigned_users_count}
            </p>
            <p className="text-xs text-gray-500 mt-1">Users currently hold this role.</p>
          </div>
        </div>
      </Card>
    </aside>
  );
}
