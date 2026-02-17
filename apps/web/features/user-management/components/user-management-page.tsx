"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Download, Plus, Users, BadgeCheck, GraduationCap, ChevronRight } from "lucide-react";
import { useUsers, useUserCounts, useDeleteUser, useUpdateUserStatus } from "../hooks/use-users";
import { FilterControls } from "../components/filter-controls";
import { TableHeader } from "../components/table-header";
import { UserRow } from "../components/user-row";
import { PaginationControls } from "../components/pagination-controls";
import type { UserManagement, UserRole, UserStatus } from "@/schemas/user-management.schema";
import Link from "next/link";

export function UserManagementPage() {
  // Filter states
  const [searchValue, setSearchValue] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [currentTab, setCurrentTab] = useState<"all" | "employees" | "students">("all");
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  
  // Selection states
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  
  // Sort states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);

  // Build query params
  const queryParams = useMemo(() => {
    const params: any = {
      page: currentPage,
      per_page: perPage,
    };

    if (searchValue) params.search = searchValue;
    if (roleFilter !== "all") params.role = roleFilter;
    if (statusFilter !== "all") params.status = statusFilter;

    return params;
  }, [searchValue, roleFilter, statusFilter, currentPage, perPage]);

  // Data fetching
  const { data: usersData, isLoading, error } = useUsers(queryParams);
  const { data: counts } = useUserCounts();
  const deleteUserMutation = useDeleteUser();
  const updateStatusMutation = useUpdateUserStatus();

  // Handlers
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && usersData?.data) {
      setSelectedUsers(new Set(usersData.data.map((u) => u.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedUsers);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleEdit = (user: UserManagement) => {
    // TODO: Implement edit modal
    console.log("Edit user:", user);
  };

  const handleDelete = (user: UserManagement) => {
    if (window.confirm(`Are you sure you want to delete ${user.full_name}?`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  const handleStatusChange = (user: UserManagement, status: "active" | "inactive" | "suspended") => {
    updateStatusMutation.mutate({ id: user.id, status });
  };

  const allSelected = usersData?.data && selectedUsers.size === usersData.data.length && usersData.data.length > 0;

  return (
    <div className="max-w-[1440px] mx-auto p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex text-sm text-muted-foreground mb-6">
        <ol className="inline-flex items-center space-x-1 md:space-x-3">
          <li className="inline-flex items-center">
            <Link href="/" className="hover:text-primary transition-colors">
              Home
            </Link>
          </li>
          <li>
            <div className="flex items-center">
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <Link href="/admin" className="ml-1 hover:text-primary transition-colors md:ml-2">
                Administration
              </Link>
            </div>
          </li>
          <li aria-current="page">
            <div className="flex items-center">
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <span className="ml-1 font-medium text-foreground md:ml-2">User Management</span>
            </div>
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your institute members and their permissions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as any)} className="mb-6">
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Users className="h-4 w-4" />
            All Users
            {counts && (
              <Badge variant="secondary" className="ml-2">
                {counts.all}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <BadgeCheck className="h-4 w-4" />
            Employees
            {counts && (
              <Badge variant="secondary" className="ml-2">
                {counts.employees}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="students" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Students
            {counts && (
              <Badge variant="secondary" className="ml-2">
                {counts.students}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <FilterControls
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {/* Table */}
      <div className="bg-white border-x border-b border-border rounded-b-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <TableHeader
              allSelected={!!allSelected}
              onSelectAll={handleSelectAll}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                Array.from({ length: perPage }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-4">
                      <Skeleton className="h-12 w-full" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-red-600">
                    Error loading users. Please try again.
                  </td>
                </tr>
              ) : usersData?.data && usersData.data.length > 0 ? (
                usersData.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelected={selectedUsers.has(user.id)}
                    onSelectChange={(checked) => handleSelectUser(user.id, checked)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No users found. Try adjusting your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {usersData && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={usersData.total_pages}
            perPage={perPage}
            total={usersData.total}
            onPageChange={setCurrentPage}
            onPerPageChange={(value) => {
              setPerPage(value);
              setCurrentPage(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
