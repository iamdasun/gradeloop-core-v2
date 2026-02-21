"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Role } from "@/lib/types/iam";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Search,
  RefreshCw,
  Shield,
  Key,
} from "lucide-react";

interface RolesTableProps {
  roles: Role[];
  isLoading?: boolean;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
  onManagePermissions: (role: Role) => void;
  onRefresh: () => void;
}

export function RolesTable({
  roles,
  isLoading,
  onEditRole,
  onDeleteRole,
  onManagePermissions,
  onRefresh,
}: RolesTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRoles = roles.filter((role) => {
    const matchesSearch = role.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by role name..."
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
              <TableHead>Role Name</TableHead>
              <TableHead>User Type</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredRoles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No roles found</p>
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
              filteredRoles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      {role.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        role.user_type === "all"
                          ? "secondary"
                          : role.user_type === "student"
                            ? "default"
                            : "outline"
                      }
                    >
                      {role.user_type === "all"
                        ? "All Users"
                        : role.user_type === "student"
                          ? "Students"
                          : "Employees"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        role.is_system_role ? "destructive" : "secondary"
                      }
                    >
                      {role.is_system_role ? "System Role" : "Custom Role"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-normal">
                        {role.permissions?.length || 0} permissions
                      </Badge>
                      {role.permissions && role.permissions.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onManagePermissions(role)}
                          className="h-7 px-2 text-xs"
                        >
                          <Key className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onManagePermissions(role)}
                        >
                          <Key className="mr-2 h-4 w-4" />
                          Manage Permissions
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onEditRole(role)}
                          disabled={role.is_system_role}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Role
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDeleteRole(role)}
                          disabled={role.is_system_role}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Role
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      {!isLoading && filteredRoles.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredRoles.length} of {roles.length} roles
        </div>
      )}
    </div>
  );
}
