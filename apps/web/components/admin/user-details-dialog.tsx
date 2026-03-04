"use client";

import * as React from "react";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Hash,
  Edit,
  ShieldOff,
  Trash2,
  FileText,
  Key,
} from "lucide-react";
import {
  SideDialog,
  SideDialogContent,
  SideDialogHeader,
  SideDialogTitle,
} from "@/components/ui/side-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserListItem } from "@/types/auth.types";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (user: UserListItem) => void;
  onRevokeSessions: (user: UserListItem) => void;
  onDelete: (user: UserListItem) => void;
}

function getInitials(fullName: string, email: string) {
  const name = fullName || email;
  return name
    .split(/[.\-_\s]/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roleBadgeVariant(roleName: string) {
  const lower = roleName.toLowerCase();
  if (lower.includes("admin")) return "purple" as const;
  if (lower.includes("instructor") || lower.includes("teacher"))
    return "info" as const;
  return "secondary" as const;
}

export function UserDetailsDialog({
  user,
  open,
  onOpenChange,
  onEdit,
  onRevokeSessions,
  onDelete,
}: Props) {
  if (!user) return null;

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent className="max-w-lg">
        <SideDialogHeader>
          <SideDialogTitle>User Details</SideDialogTitle>
        </SideDialogHeader>

        {/* Avatar + name + status */}
        <div className="flex items-center gap-4 py-2">
          <Avatar className="h-14 w-14 text-lg">
            <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800">
              {getInitials(user.full_name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">
              {user.full_name || "No Name"}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {user.email}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={user.is_active ? "success" : "destructive"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
              <Badge variant={roleBadgeVariant(user.role_name)}>
                {user.role_name}
              </Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="w-full grid-cols-2 grid bg-zinc-100 dark:bg-zinc-800">
            <TabsTrigger value="details">Detail Information</TabsTrigger>
            <TabsTrigger value="security">Security & Access</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="pt-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
              <FileText className="h-5 w-5" />
              General Information
            </div>

            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <Hash className="h-4 w-4 shrink-0" />
                  User ID
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span className="font-mono break-all">{user.id}</span>
                </dd>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <User className="h-4 w-4 shrink-0" />
                  Full Name
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span>{user.full_name || "—"}</span>
                </dd>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <Mail className="h-4 w-4 shrink-0" />
                  Email
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span className="break-all">{user.email}</span>
                </dd>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <Shield className="h-4 w-4 shrink-0" />
                  Role / Type
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span className="capitalize">{user.role_name} ({user.user_type || "N/A"})</span>
                </dd>
              </div>

              {user.designation && (
                <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                  <dt className="flex items-center gap-2 text-zinc-500">
                    <User className="h-4 w-4 shrink-0" />
                    Designation
                  </dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                    <span className="text-zinc-400">:</span>
                    <span>{user.designation}</span>
                  </dd>
                </div>
              )}
            </dl>
          </TabsContent>

          <TabsContent value="security" className="pt-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
              <Key className="h-5 w-5" />
              Access Information
            </div>

            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <Calendar className="h-4 w-4 shrink-0" />
                  Created Date
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span>{formatDate(user.created_at)}</span>
                </dd>
              </div>

              <div className="grid grid-cols-[140px_1fr] items-start gap-2">
                <dt className="flex items-center gap-2 text-zinc-500">
                  <Clock className="h-4 w-4 shrink-0" />
                  Last Login
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100 flex gap-2">
                  <span className="text-zinc-400">:</span>
                  <span>{formatDate(user.last_login_at)}</span>
                </dd>
              </div>
            </dl>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false);
              onEdit(user);
            }}
          >
            <Edit className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onOpenChange(false);
              onRevokeSessions(user);
            }}
          >
            <ShieldOff className="h-4 w-4" />
            Revoke Sessions
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-800"
            onClick={() => {
              onOpenChange(false);
              onDelete(user);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </SideDialogContent>
    </SideDialog>
  );
}
