"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TableHeaderProps {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  sortField: string | null;
  sortDirection: "asc" | "desc" | null;
  onSort: (field: string) => void;
}

export function TableHeader({
  allSelected,
  onSelectAll,
  sortField,
  sortDirection,
  onSort,
}: TableHeaderProps) {
  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-gray-600" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-gray-600" />
    );
  };

  return (
    <thead className="bg-gray-50">
      <tr>
        <th scope="col" className="px-6 py-3 w-12 text-left">
          <Checkbox checked={allSelected} onCheckedChange={onSelectAll} />
        </th>
        <th scope="col" className="px-6 py-3 text-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("full_name")}
            className="h-auto p-0 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 group"
          >
            User
            <span className="ml-1">{getSortIcon("full_name")}</span>
          </Button>
        </th>
        <th scope="col" className="px-6 py-3 text-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("role")}
            className="h-auto p-0 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 group"
          >
            Role
            <span className="ml-1">{getSortIcon("role")}</span>
          </Button>
        </th>
        <th scope="col" className="px-6 py-3 text-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("status")}
            className="h-auto p-0 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 group"
          >
            Status
            <span className="ml-1">{getSortIcon("status")}</span>
          </Button>
        </th>
        <th scope="col" className="px-6 py-3 text-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSort("last_login")}
            className="h-auto p-0 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 group"
          >
            Last Login
            <span className="ml-1">{getSortIcon("last_login")}</span>
          </Button>
        </th>
        <th scope="col" className="relative px-6 py-3">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}
