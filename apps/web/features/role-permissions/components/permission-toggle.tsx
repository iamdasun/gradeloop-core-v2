"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { PermissionAction } from "@/schemas/role-permission.schema";

interface PermissionToggleProps {
  action: PermissionAction;
  enabled: boolean;
  disabled?: boolean;
  locked?: boolean;
  onChange: (enabled: boolean) => void;
}

export function PermissionToggle({
  action,
  enabled,
  disabled = false,
  locked = false,
  onChange,
}: PermissionToggleProps) {
  const isDisabled = disabled || locked;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center",
        isDisabled && "opacity-50 cursor-not-allowed"
      )}
      title={locked ? "Permission locked for this role" : undefined}
    >
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={isDisabled}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

interface PermissionCellProps {
  enabled: boolean;
  applicable?: boolean;
}

export function PermissionCell({ enabled, applicable = true }: PermissionCellProps) {
  if (!applicable) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-gray-300 text-lg select-none">-</span>
      </div>
    );
  }

  return null;
}
