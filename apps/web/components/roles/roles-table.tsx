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
import { MoreHorizontal, Edit, Trash2, Shield } from "lucide-react";
import { Role, RoleService, Permission } from "@/lib/api/role-service";
import { RoleFormDialog } from "./role-form-dialog";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { RolesTableSkeleton } from "./roles-table-skeleton";

interface RolesTableProps {
    roles: Role[];
    permissions: Permission[];
    isLoading: boolean;
}

export function RolesTable({ roles, permissions, isLoading }: RolesTableProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [deletingRole, setDeletingRole] = useState<Role | null>(null);

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setIsFormOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingRole) return;

        try {
            await RoleService.deleteRole(deletingRole.id);
            toast({
                title: "Role deleted",
                description: "The role has been successfully deleted.",
            });
            queryClient.invalidateQueries({ queryKey: ["roles"] });
        } catch (error) {
            console.error("Failed to delete role:", error);
            toast({
                title: "Error",
                description: "Failed to delete role. It might be assigned to users.",
                variant: "destructive",
            });
        } finally {
            setDeletingRole(null);
        }
    };

    const handleSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ["roles"] });
    };


    if (isLoading) {
        return <RolesTableSkeleton />;
    }

    return (
        <>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Role Name</TableHead>
                            <TableHead>Permissions</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {roles.map((role) => (
                            <TableRow key={role.id}>
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                        <Shield className="h-4 w-4 text-muted-foreground" />
                                        {role.name}
                                        {role.is_system_role && (
                                            <Badge variant="secondary" className="ml-2 text-xs">
                                                System
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {role.permissions.length > 0 ? (
                                            <>
                                                <Badge variant="outline">{role.permissions.length} permissions</Badge>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {role.permissions.slice(0, 3).map(p => p.name).join(", ")}
                                                    {role.permissions.length > 3 && "..."}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">No permissions</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => handleEdit(role)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Edit
                                            </DropdownMenuItem>
                                            {!role.is_system_role && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        className="text-destructive focus:text-destructive"
                                                        onClick={() => setDeletingRole(role)}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <RoleFormDialog
                open={isFormOpen}
                onOpenChange={(open) => {
                    setIsFormOpen(open);
                    if (!open) setEditingRole(null);
                }}
                role={editingRole}
                permissions={permissions}
                onSuccess={handleSuccess}
            />

            <AlertDialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the role
                            <span className="font-semibold text-foreground"> {deletingRole?.name} </span>
                            and remove it from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete Role
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
