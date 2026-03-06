"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { instructorAssessmentsApi } from "@/lib/api/assessments";
import type { AssignmentResponse } from "@/types/assessments.types";
import { handleApiError } from "@/lib/api/axios";
import { Plus, AlertCircle, Filter, FileText } from "lucide-react";
import { SectionHeader } from "@/components/instructor/section-header";
import { DataTable, type ColumnDef } from "@/components/instructor/data-table";
import { StatusBadge } from "@/components/instructor/status-badge";
import { EmptyStateCard } from "@/components/instructor/empty-state";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function deriveStatus(a: AssignmentResponse): "Draft" | "Active" | "Closed" {
    if (!a.is_active) return "Draft";
    if (a.due_at && new Date(a.due_at) < new Date()) return "Closed";
    if (a.submission_config?.submission_allowed) return "Active";
    return "Draft";
}

export default function InstructorAssignmentsPage() {
    const params = useParams();
    const router = useRouter();
    const instanceId = params.instanceId as string;

    const [assignments, setAssignments] = React.useState<AssignmentResponse[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [statusFilter, setStatusFilter] = React.useState<string>("all");

    const fetchAssignments = React.useCallback(async () => {
        try {
            setIsLoading(true);
            const all = await instructorAssessmentsApi.listMyAssignments();
            setAssignments(all.filter((a) => a.course_instance_id === instanceId));
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    }, [instanceId]);

    React.useEffect(() => {
        fetchAssignments();
    }, [fetchAssignments]);

    const filtered = React.useMemo(() => {
        if (statusFilter === "all") return assignments;
        return assignments.filter((a) => deriveStatus(a).toLowerCase() === statusFilter);
    }, [assignments, statusFilter]);

    const columns: ColumnDef<AssignmentResponse, any>[] = [
        {
            accessorKey: "title",
            header: "Title",
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{row.getValue("title")}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        {row.original.assessment_type || "Assignment"}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={deriveStatus(row.original)} />,
        },
        {
            accessorKey: "due_at",
            header: "Deadline",
            cell: ({ row }) => {
                const val = row.original.due_at;
                if (!val) return <span className="text-muted-foreground">No deadline</span>;
                return (
                    <span className="text-sm whitespace-nowrap">
                        {format(new Date(val), "MMM d, yyyy • h:mm a")}
                    </span>
                );
            },
        },
        {
            accessorKey: "total_marks",
            header: "Total Marks",
            cell: ({ row }) => (
                <span className="font-mono font-semibold">{row.getValue("total_marks") ?? "—"}</span>
            ),
        },
        {
            id: "submissions",
            header: "Submissions",
            cell: () => <span className="text-muted-foreground text-sm">—</span>,
        },
    ];

    if (error) {
        return (
            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 pb-8 h-full">
            <SectionHeader
                title="Assignments"
                description="Manage assignments and review student submissions for this course instance."
                action={
                    <Button onClick={() => router.push(`/instructor/courses/${instanceId}/assignments/create`)}>
                        <Plus className="mr-2 h-4 w-4" /> Add Assignment
                    </Button>
                }
            />

            {/* Filter toolbar */}
            {!isLoading && assignments.length > 0 && (
                <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-48 h-9">
                            <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground ml-auto">
                        {filtered.length} assignment{filtered.length !== 1 ? "s" : ""}
                    </span>
                </div>
            )}

            {!isLoading && assignments.length === 0 ? (
                <EmptyStateCard
                    icon={FileText}
                    title="No assignments yet"
                    description="Create your first assignment to start evaluating students in this course instance."
                    action={
                        <Button onClick={() => router.push(`/instructor/courses/${instanceId}/assignments/create`)} className="mt-4">
                            <Plus className="mr-2 h-4 w-4" /> Create Assignment
                        </Button>
                    }
                />
            ) : !isLoading && filtered.length === 0 ? (
                <EmptyStateCard
                    icon={FileText}
                    title="No assignments match the filter"
                    description={`No ${statusFilter} assignments found. Try a different filter.`}
                    action={
                        <Button variant="outline" onClick={() => setStatusFilter("all")} className="mt-4">
                            Clear Filter
                        </Button>
                    }
                />
            ) : (
                <DataTable
                    columns={columns}
                    data={filtered}
                    isLoading={isLoading}
                    searchKey="title"
                    searchPlaceholder="Search assignments..."
                    onRowClick={(row) =>
                        router.push(
                            `/instructor/courses/${instanceId}/assignments/${row.id}`
                        )
                    }
                />
            )}
        </div>
    );
}
