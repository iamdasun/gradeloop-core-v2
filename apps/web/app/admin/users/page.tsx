"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UserStats } from "./components/user-stats";
import { UsersTable } from "./components/users-table";
import { CreateUserDialog } from "./components/create-user-dialog";
import { EditUserDialog } from "./components/edit-user-dialog";
import { DeleteUserDialog } from "./components/delete-user-dialog";
import { getUsers, getRoles } from "@/lib/api/iam";
import { User, Role } from "@/lib/types/iam";
import { useToast } from "@/hooks/use-toast";

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  // Fetch users and roles
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch users
      const usersResponse = await getUsers({
        page: currentPage,
        limit: pageSize,
        user_type: "all",
      });
      setUsers(usersResponse.users);
      setTotalCount(usersResponse.total_count);

      // Fetch roles
      const rolesResponse = await getRoles();
      setRoles(rolesResponse.roles);
    } catch (err) {
      const errorMessage = (err as Error).message || "Failed to load data";
      setError(errorMessage);
      toast({
        title: "Error loading data",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleUserCreated = () => {
    fetchData();
  };

  const handleUserUpdated = () => {
    fetchData();
  };

  const handleUserDeleted = () => {
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage all users, roles, and permissions
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <UserStats users={users} isLoading={isLoading} />

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            View and manage all user accounts in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable
            users={users}
            isLoading={isLoading}
            onEditUser={handleEditUser}
            onDeleteUser={handleDeleteUser}
            onRefresh={fetchData}
          />
        </CardContent>
      </Card>

      {/* Pagination Info */}
      {!isLoading && users.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {users.length} of {totalCount} total users
          </div>
          {totalCount > pageSize && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {Math.ceil(totalCount / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={
                  currentPage >= Math.ceil(totalCount / pageSize) || isLoading
                }
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateUserDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onUserCreated={handleUserCreated}
        roles={roles}
      />

      <EditUserDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        user={selectedUser}
        onUserUpdated={handleUserUpdated}
        roles={roles}
      />

      <DeleteUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        user={selectedUser}
        onUserDeleted={handleUserDeleted}
      />
    </div>
  );
}
