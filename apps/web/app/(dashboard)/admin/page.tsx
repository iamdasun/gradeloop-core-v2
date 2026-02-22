import * as React from "react";
import {
  Users,
  BookOpen,
  FileText,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  GraduationCap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDashboardPage() {
  const stats = [
    {
      title: "Total Students",
      value: "2,845",
      change: "+12.5%",
      trend: "up",
      icon: GraduationCap,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    {
      title: "Active Courses",
      value: "48",
      change: "+4.2%",
      trend: "up",
      icon: BookOpen,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
    },
    {
      title: "Assignments",
      value: "156",
      change: "+8.1%",
      trend: "up",
      icon: FileText,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
    },
    {
      title: "Completion Rate",
      value: "87.3%",
      change: "+2.4%",
      trend: "up",
      icon: TrendingUp,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-100 dark:bg-orange-900/20",
    },
  ];

  const recentActivity = [
    {
      id: 1,
      type: "submission",
      title: "Assignment submitted",
      description: "John Doe submitted 'React Fundamentals' assignment",
      time: "5 minutes ago",
      icon: CheckCircle,
      color: "text-green-600 dark:text-green-400",
    },
    {
      id: 2,
      type: "enrollment",
      title: "New enrollment",
      description: "Sarah Smith enrolled in 'Advanced JavaScript'",
      time: "15 minutes ago",
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      id: 3,
      type: "deadline",
      title: "Deadline approaching",
      description: "'Database Design' assignment due in 2 hours",
      time: "1 hour ago",
      icon: Clock,
      color: "text-orange-600 dark:text-orange-400",
    },
    {
      id: 4,
      type: "issue",
      title: "Review required",
      description: "3 assignments pending review in 'Web Development'",
      time: "2 hours ago",
      icon: AlertCircle,
      color: "text-red-600 dark:text-red-400",
    },
  ];

  const topCourses = [
    {
      id: 1,
      name: "Introduction to React",
      students: 245,
      completion: 92,
      instructor: "Dr. Jane Smith",
    },
    {
      id: 2,
      name: "Advanced JavaScript",
      students: 198,
      completion: 85,
      instructor: "Prof. John Doe",
    },
    {
      id: 3,
      name: "Database Design",
      students: 176,
      completion: 78,
      instructor: "Dr. Emily Brown",
    },
    {
      id: 4,
      name: "Web Development",
      students: 234,
      completion: 88,
      instructor: "Prof. Michael Lee",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2">
          Welcome back! Here&apos;s what&apos;s happening with your platform
          today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.title}
              className="shadow-sm hover:shadow-md transition-shadow"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {stat.change} from last month
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => {
                const Icon = activity.icon;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 pb-4 last:pb-0 border-b last:border-0 border-zinc-200 dark:border-zinc-800"
                  >
                    <div className={`mt-1 ${activity.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {activity.description}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {activity.time}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="w-full mt-4">
              View All Activity
            </Button>
          </CardContent>
        </Card>

        {/* Top Courses */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Top Courses</CardTitle>
            <CardDescription>Most popular courses this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCourses.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between pb-4 last:pb-0 border-b last:border-0 border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{course.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {course.instructor}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-sm font-medium">
                      {course.students} students
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 dark:bg-green-400"
                          style={{ width: `${course.completion}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {course.completion}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4">
              View All Courses
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="justify-start gap-2">
              <Users className="h-4 w-4" />
              Add New User
            </Button>
            <Button variant="outline" className="justify-start gap-2">
              <BookOpen className="h-4 w-4" />
              Create Course
            </Button>
            <Button variant="outline" className="justify-start gap-2">
              <FileText className="h-4 w-4" />
              New Assignment
            </Button>
            <Button variant="outline" className="justify-start gap-2">
              <TrendingUp className="h-4 w-4" />
              View Reports
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
