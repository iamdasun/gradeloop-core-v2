"use client";

import * as React from "react";
import {
    BookOpen,
    FileText,
    Trophy,
    Calendar
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export default function StudentDashboardPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                    Welcome to your learning portal! Here is what you need to focus on today.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Enrolled Courses</CardTitle>
                        <BookOpen className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">6</div>
                        <p className="text-xs text-zinc-500 mt-1">2 courses with new content</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Pending Assignments</CardTitle>
                        <FileText className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">4</div>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">1 due today</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Average Grade</CardTitle>
                        <Trophy className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">A- (3.7)</div>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">+0.2 from last term</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle>Upcoming Deadlines</CardTitle>
                        <CardDescription>Don&apos;t miss these important dates</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[
                                { title: "React Fundamentals Quiz", course: "Web Development", due: "Today, 11:59 PM" },
                                { title: "Database Schema Design", course: "Database Systems", due: "Tomorrow, 5:00 PM" },
                                { title: "Mid-term Project Proposal", course: "Software Engineering", due: "Fri, Oct 25" }
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-4 pb-4 last:pb-0 border-b last:border-0 border-zinc-100 dark:border-zinc-800">
                                    <div className="h-10 w-10 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                        <Calendar className="h-5 w-5 text-zinc-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{item.title}</p>
                                        <p className="text-xs text-zinc-500">{item.course} • <span className="text-orange-600 font-medium">{item.due}</span></p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
