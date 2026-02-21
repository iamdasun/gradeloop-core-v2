"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, GraduationCap, Briefcase } from "lucide-react";
import { User } from "@/lib/types/iam";

interface UserStatsProps {
  users: User[];
  isLoading?: boolean;
}

export function UserStats({ users, isLoading }: UserStatsProps) {
  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    inactive: users.filter((u) => !u.is_active).length,
    students: users.filter((u) => u.user_type === "student").length,
    employees: users.filter((u) => u.user_type === "employee").length,
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats.total,
      icon: Users,
      description: "All users in the system",
    },
    {
      title: "Active Users",
      value: stats.active,
      icon: UserCheck,
      description: "Currently active",
      className: "text-green-600",
    },
    {
      title: "Inactive Users",
      value: stats.inactive,
      icon: UserX,
      description: "Currently inactive",
      className: "text-gray-500",
    },
    {
      title: "Students",
      value: stats.students,
      icon: GraduationCap,
      description: "Student accounts",
      className: "text-blue-600",
    },
    {
      title: "Employees",
      value: stats.employees,
      icon: Briefcase,
      description: "Employee accounts",
      className: "text-purple-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.className || "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
