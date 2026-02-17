"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, Columns3 } from "lucide-react";
import type { UserRole, UserStatus } from "@/schemas/user-management.schema";

interface FilterControlsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  roleFilter: UserRole | "all";
  onRoleFilterChange: (value: UserRole | "all") => void;
  statusFilter: UserStatus | "all";
  onStatusFilterChange: (value: UserStatus | "all") => void;
}

export function FilterControls({
  searchValue,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
}: FilterControlsProps) {
  return (
    <div className="bg-white rounded-t-xl border border-border p-4 flex flex-col sm:flex-row gap-4 justify-between items-center shadow-sm">
      <div className="relative w-full sm:w-96">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <Input
          type="text"
          placeholder="Search by name, email, or ID..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <Select value={roleFilter} onValueChange={onRoleFilterChange}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2 text-gray-500" />
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2 text-gray-500" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-6 w-px bg-gray-300 mx-1"></div>

        <Button variant="outline" size="sm" className="border-dashed">
          <Columns3 className="h-4 w-4 mr-2" />
          Columns
        </Button>
      </div>
    </div>
  );
}
