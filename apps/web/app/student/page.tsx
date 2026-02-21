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
  FileText,
  TrendingUp,
  Clock,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export default function StudentDashboardPage() {
  const { user } = useAuth();

  const stats = [
    {
      title: "Enrolled Courses",
      value: "5",
      change: "2 active this week",
      icon: BookOpen,
      description: "Total courses",
    },
    {
      title: "Assignments",
      value: "12",
      change: "3 due this week",
      icon: FileText,
      description: "Total assignments",
    },
    {
      title: "Average Grade",
      value: "85.2%",
      change: "+2.3% from last month",
      icon: TrendingUp,
      description: "Overall performance",
    },
    {
      title: "Completed",
      value: "28",
      change: "9 pending",
      icon: CheckCircle2,
      description: "Assignments done",
    },
  ];

  const upcomingAssignments = [
    {
      id: 1,
      title: "Essay on Machine Learning",
      course: "Computer Science 101",
      dueDate: "Due in 2 days",
      status: "pending",
      priority: "high",
    },
    {
      id: 2,
      title: "Math Problem Set 5",
      course: "Calculus II",
      dueDate: "Due in 4 days",
      status: "pending",
      priority: "medium",
    },
    {
      id: 3,
      title: "Physics Lab Report",
      course: "Physics 201",
      dueDate: "Due in 5 days",
      status: "in-progress",
      priority: "medium",
    },
    {
      id: 4,
      title: "History Research Paper",
      course: "World History",
      dueDate: "Due in 1 week",
      status: "pending",
      priority: "low",
    },
  ];

  const upcomingClasses = [
    {
      id: 1,
      course: "Computer Science 101",
      instructor: "Dr. Smith",
      time: "Today, 10:00 AM",
      location: "Room 301",
    },
    {
      id: 2,
      course: "Calculus II",
      instructor: "Prof. Johnson",
      time: "Today, 2:00 PM",
      location: "Room 205",
    },
    {
      id: 3,
      course: "Physics 201",
      instructor: "Dr. Williams",
      time: "Tomorrow, 9:00 AM",
      location: "Lab 101",
    },
  ];

  const recentGrades = [
    {
      id: 1,
      assignment: "Midterm Exam",
      course: "Computer Science 101",
      grade: "92%",
      feedback: "Excellent work!",
    },
    {
      id: 2,
      assignment: "Quiz 3",
      course: "Calculus II",
      grade: "88%",
      feedback: "Good understanding",
    },
    {
      id: 3,
      assignment: "Lab Assignment 2",
      course: "Physics 201",
      grade: "95%",
      feedback: "Perfect execution",
    },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "in-progress":
        return <Badge variant="default">In Progress</Badge>;
      case "completed":
        return <Badge variant="outline">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.name || "Student"}! Here&apos;s your academic
          overview.
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

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Upcoming Assignments */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Upcoming Assignments</CardTitle>
            <CardDescription>
              Assignments and tasks that need your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-start gap-4 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">
                        {assignment.title}
                      </p>
                      <Badge
                        variant={getPriorityColor(assignment.priority)}
                        className="text-xs"
                      >
                        {assignment.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {assignment.course}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        {assignment.dueDate}
                      </p>
                      {getStatusBadge(assignment.status)}
                    </div>
                  </div>
                </div>
              ))}
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
            <div className="space-y-3">
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
                      {classItem.instructor}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {classItem.time}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      📍 {classItem.location}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Grades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Grades</CardTitle>
          <CardDescription>
            Your latest graded assignments and feedback
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {recentGrades.map((grade) => (
              <div
                key={grade.id}
                className="flex flex-col gap-2 p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">
                      {grade.assignment}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {grade.course}
                    </p>
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {grade.grade}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  &quot;{grade.feedback}&quot;
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
