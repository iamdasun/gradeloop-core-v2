"use client";

import { Button } from "@/components/ui/button";
import { PermissionToggle, PermissionCell } from "./permission-toggle";
import type { ModulePermission, PermissionAction } from "@/schemas/role-permission.schema";
import { Users, School, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModuleSectionProps {
  module: ModulePermission;
  onPermissionChange: (resourceId: string, action: PermissionAction, enabled: boolean) => void;
  onSelectAll: (moduleId: string) => void;
}

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "user-management": Users,
  courses: School,
  evaluations: FileCheck,
};

const ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete", "manage"];

export function ModuleSection({ module, onPermissionChange, onSelectAll }: ModuleSectionProps) {
  const IconComponent = MODULE_ICONS[module.module_id] || Users;

  const isActionApplicable = (resource: any, action: PermissionAction): boolean => {
    return resource.actions[action] !== undefined;
  };

  const isActionLocked = (resource: any, action: PermissionAction): boolean => {
    return resource.locked_actions?.includes(action) ?? false;
  };

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Module Header */}
      <div className="bg-gray-50/50 px-6 py-3 flex items-center justify-between">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <IconComponent className="h-5 w-5 text-gray-400" />
          {module.module_name}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectAll(module.module_id)}
          className="text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 h-auto py-1 px-2"
        >
          Select All
        </Button>
      </div>

      {/* Resources */}
      {module.resources.map((resource, index) => {
        const isLastResource = index === module.resources.length - 1;

        return (
          <div
            key={resource.resource_id}
            className={cn(
              "grid grid-cols-12 items-center px-6 py-4 hover:bg-primary/5 transition-colors",
              !isLastResource && "border-b border-gray-50"
            )}
          >
            {/* Resource Name & Description */}
            <div className="col-span-4 pr-4">
              <p className="text-sm font-medium text-gray-900">{resource.resource_name}</p>
              {resource.resource_description && (
                <p className="text-xs text-gray-500">{resource.resource_description}</p>
              )}
            </div>

            {/* Actions Grid */}
            <div className="col-span-8 grid grid-cols-5 items-center justify-items-center gap-2">
              {ACTIONS.map((action) => {
                const applicable = isActionApplicable(resource, action);
                const locked = isActionLocked(resource, action);
                const enabled = resource.actions[action] ?? false;

                if (!applicable) {
                  return <PermissionCell key={action} enabled={false} applicable={false} />;
                }

                return (
                  <PermissionToggle
                    key={action}
                    action={action}
                    enabled={enabled}
                    locked={locked}
                    onChange={(newValue) => onPermissionChange(resource.resource_id, action, newValue)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
