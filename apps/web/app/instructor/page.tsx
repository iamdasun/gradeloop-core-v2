"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BookOpen,
  Users,
  FileText,
  TrendingUp,
  Clock,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function InstructorDashboardPage() {
  const { user } = useAuth();

  const stats = [
    {
      title: "My Courses",
      value: "6",
      change: "+1 this semester",
      icon: BookOpen,
      description: "Active courses",
    },
    {
      title: "Total Students",
      value: "142",
      change: "+12 this week",
      icon: Users,
      description: "Enrolled students",
    },
    {
      title: "Assignments",
      value: "18",
      change: "5 pending review",
      icon: FileText,
      description: "Active assignments",
    },
    {
      title: "Avg. Performance",
      value: "78.5%",
      change: "+3.2% improvement",
      icon: TrendingUp,
      description: "Class average",
    },
  ];

  const recentActivities = [
    {
      id: 1,
      type: "submission",
      title: "New assignment submission",
      description: "John Doe submitted Assignment 3 for CS101",
      time: "5 min ago",
      icon: FileText,
    },
    {
      id: 2,
      type: "question",
      title: "Student question",
      description: "Jane Smith asked a question in Math 201",
      time: "1 hour ago",
      icon: Users,
    },
    {
      id: 3,
      type: "deadline",
      title: "Upcoming deadline",
      description: "Assignment 4 due in 2 days",
      time: "2 hours ago",
      icon: Clock,
    },
  ];

  const upcomingClasses = [
    {
      id: 1,
      course: "Computer Science 101",
      time: "Today, 10:00 AM",
      room: "Room 301",
      students: 45,
    },
    {
      id: 2,
      course: "Data Structures",
      time: "Today, 2:00 PM",
      room: "Room 205",
      students: 38,
    },
    {
      id: 3,
      course: "Algorithms",
      time: "Tomorrow, 9:00 AM",
      room: "Room 401",
      students: 42,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Instructor Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.name || "Instructor"}! Here&apos;s an overview of
          your courses and students.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.change}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Activity */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your courses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-none">
                        {activity.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {activity.description}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {activity.time}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Classes */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Classes</CardTitle>
            <CardDescription>
              Your schedule for today and tomorrow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingClasses.map((classItem) => (
                <div
                  key={classItem.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <p className="text-sm font-medium leading-none">
                      {classItem.course}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {classItem.time} • {classItem.room}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {classItem.students} students
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <button className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Create Assignment</p>
                <p className="text-xs text-muted-foreground">
                  Add new assignment
                </p>
              </div>
            </button>
            <button className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Grade Submissions</p>
                <p className="text-xs text-muted-foreground">
                  Review student work
                </p>
              </div>
            </button>
            <button className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors text-left">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Manage Courses</p>
                <p className="text-xs text-muted-foreground">
                  Edit course content
                </p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
