"use client";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Permission } from "@/lib/types/iam";
import { Search, RefreshCw, Key } from "lucide-react";

interface PermissionsTableProps {
  permissions: Permission[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function PermissionsTable({
  permissions,
  isLoading,
  onRefresh,
}: PermissionsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPermissions = permissions.filter((permission) => {
    const matchesSearch =
      permission.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (permission.description &&
        permission.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()));

    return matchesSearch;
  });

  // Group permissions by category (assuming permission names follow pattern: "category:action")
  const groupedPermissions = filteredPermissions.reduce(
    (acc, permission) => {
      const category = permission.name.split(":")[0] || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(permission);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by permission name or description..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPermissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Key className="h-8 w-8 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      No permissions found
                    </p>
                    {searchQuery && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              Object.entries(groupedPermissions).map(
                ([category, categoryPermissions]) => (
                  <React.Fragment key={category}>
                    {/* Category Header Row */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={3} className="font-semibold">
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                          <Badge variant="outline" className="ml-2">
                            {categoryPermissions.length}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Permission Rows */}
                    {categoryPermissions.map((permission) => (
                      <TableRow key={permission.id}>
                        <TableCell className="font-medium font-mono text-sm pl-8">
                          {permission.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {permission.description || "No description"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{category}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      {!isLoading && filteredPermissions.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredPermissions.length} of {permissions.length}{" "}
          permissions
          {Object.keys(groupedPermissions).length > 1 && (
            <> across {Object.keys(groupedPermissions).length} categories</>
          )}
        </div>
      )}
    </div>
  );
}
