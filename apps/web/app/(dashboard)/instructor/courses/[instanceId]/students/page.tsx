"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { instructorCoursesApi } from "@/lib/api/academics";
import type { Enrollment, EnrolledBatchStats } from "@/types/academics.types";
import { handleApiError } from "@/lib/api/axios";
import {
    AlertCircle,
    FileDown,
    Users,
    Layers,
    Trash2,
    UserPlus,
    Loader2,
} from "lucide-react";
import { SectionHeader } from "@/components/instructor/section-header";
import { DataTable, type ColumnDef } from "@/components/instructor/data-table";
import { StatusBadge } from "@/components/instructor/status-badge";
import { EmptyStateCard } from "@/components/instructor/empty-state";
import { AddStudentsModal } from "@/components/instructor/add-students-modal";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "sonner";

function exportToCsv(students: Enrollment[], filename = "students.csv") {
    const headers = ["Student ID", "Name", "Email", "Status", "Enrolled Date"];
    const rows = students.map((s) => [
        s.student_id ?? "",
        s.full_name ?? "",
        s.email ?? "",
        s.status ?? "",
        s.enrolled_at ? format(new Date(s.enrolled_at), "yyyy-MM-dd") : "",
    ]);
    const csv = [headers, ...rows]
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function InstructorStudentsPage() {
    const params = useParams();
    const instanceId = params.instanceId as string;

    // ── Students state ─────────────────────────────────────────────────────
    const [students, setStudents] = React.useState<Enrollment[]>([]);
    const [isLoadingStudents, setIsLoadingStudents] = React.useState(true);
    const [studentsError, setStudentsError] = React.useState<string | null>(null);

    // ── Enrolled batches state ────────────────────────────────────────────
    const [enrolledBatches, setEnrolledBatches] = React.useState<EnrolledBatchStats[]>([]);
    const [isLoadingBatches, setIsLoadingBatches] = React.useState(true);
    const [batchesError, setBatchesError] = React.useState<string | null>(null);

    // ── Modal / remove state ──────────────────────────────────────────────
    const [modalOpen, setModalOpen] = React.useState(false);
    const [removingStudentId, setRemovingStudentId] = React.useState<string | null>(null);
    const [removingBatchId, setRemovingBatchId] = React.useState<string | null>(null);
    const [confirmStudent, setConfirmStudent] = React.useState<Enrollment | null>(null);
    const [confirmBatch, setConfirmBatch] = React.useState<EnrolledBatchStats | null>(null);

    // ── Data fetching ──────────────────────────────────────────────────────

    const fetchStudents = React.useCallback(async () => {
        try {
            setIsLoadingStudents(true);
            const data = await instructorCoursesApi.listMyStudents(instanceId);
            setStudents(data);
            setStudentsError(null);
        } catch (err) {
            setStudentsError(handleApiError(err));
        } finally {
            setIsLoadingStudents(false);
        }
    }, [instanceId]);

    const fetchBatches = React.useCallback(async () => {
        try {
            setIsLoadingBatches(true);
            const data = await instructorCoursesApi.getEnrolledBatches(instanceId);
            setEnrolledBatches(data);
            setBatchesError(null);
        } catch (err) {
            setBatchesError(handleApiError(err));
        } finally {
            setIsLoadingBatches(false);
        }
    }, [instanceId]);

    React.useEffect(() => {
        if (instanceId) {
            fetchStudents();
            fetchBatches();
        }
    }, [instanceId, fetchStudents, fetchBatches]);

    const enrolledUserIds = React.useMemo(
        () => new Set(students.map((s) => s.user_id)),
        [students],
    );

    // ── Remove student ────────────────────────────────────────────────────

    const handleUnenrollStudent = async (student: Enrollment) => {
        setRemovingStudentId(student.user_id);
        try {
            await instructorCoursesApi.unenrollStudent(instanceId, student.user_id);
            setStudents((prev) => prev.filter((s) => s.user_id !== student.user_id));
            toast.success(`${student.full_name || "Student"} removed from course`);
            fetchBatches(); // batch counts may change
        } catch (err) {
            toast.error(handleApiError(err));
        } finally {
            setRemovingStudentId(null);
            setConfirmStudent(null);
        }
    };

    // ── Remove batch ──────────────────────────────────────────────────────

    const handleUnenrollBatch = async (batch: EnrolledBatchStats) => {
        setRemovingBatchId(batch.batch_id);
        try {
            const res = await instructorCoursesApi.unenrollBatch(instanceId, batch.batch_id);
            toast.success(`${res.removed} student${res.removed !== 1 ? "s" : ""} removed from course`);
            fetchStudents();
            fetchBatches();
        } catch (err) {
            toast.error(handleApiError(err));
        } finally {
            setRemovingBatchId(null);
            setConfirmBatch(null);
        }
    };

    // ── Columns: students ─────────────────────────────────────────────────

    const studentColumns: ColumnDef<Enrollment, any>[] = [
        {
            accessorKey: "student_id",
            header: "Student ID",
            cell: ({ row }) => (
                <span className="font-mono text-sm font-semibold text-muted-foreground">
                    {row.getValue("student_id") || "—"}
                </span>
            ),
        },
        {
            accessorKey: "full_name",
            header: "Name",
            cell: ({ row }) => (
                <span className="font-semibold text-foreground">
                    {row.getValue("full_name") || "—"}
                </span>
            ),
        },
        {
            accessorKey: "email",
            header: "Email",
            cell: ({ row }) => (
                <span className="text-muted-foreground text-sm">
                    {row.getValue("email") || "—"}
                </span>
            ),
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
        },
        {
            accessorKey: "enrolled_at",
            header: "Enrolled",
            cell: ({ row }) => {
                const val = row.getValue("enrolled_at") as string;
                if (!val) return <span className="text-muted-foreground">—</span>;
                try {
                    return (
                        <span className="text-muted-foreground text-sm">
                            {format(new Date(val), "MMM d, yyyy")}
                        </span>
                    );
                } catch {
                    return <span className="text-muted-foreground">—</span>;
                }
            },
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => {
                const student = row.original;
                return (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={removingStudentId === student.user_id}
                            onClick={(e) => {
                                e.stopPropagation();
                                setConfirmStudent(student);
                            }}
                        >
                            {removingStudentId === student.user_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                );
            },
        },
    ];

    // ── Columns: batches ──────────────────────────────────────────────────

    const batchColumns: ColumnDef<EnrolledBatchStats, any>[] = [
        {
            accessorKey: "name",
            header: "Batch",
            cell: ({ row }) => (
                <div>
                    <p className="font-semibold text-sm">{row.getValue("name")}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                        {row.original.code}
                    </p>
                </div>
            ),
        },
        {
            id: "years",
            header: "Years",
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {row.original.start_year} – {row.original.end_year}
                </span>
            ),
        },
        {
            accessorKey: "enrolled_count",
            header: "Enrolled",
            cell: ({ row }) => (
                <Badge variant="secondary" className="text-xs">
                    {row.getValue("enrolled_count")} / {row.original.total_members}
                </Badge>
            ),
        },
        {
            id: "actions",
            header: "",
            cell: ({ row }) => {
                const batch = row.original;
                return (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            disabled={removingBatchId === batch.batch_id}
                            onClick={(e) => {
                                e.stopPropagation();
                                setConfirmBatch(batch);
                            }}
                        >
                            {removingBatchId === batch.batch_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                );
            },
        },
    ];

    // ── Page error ────────────────────────────────────────────────────────

    if (studentsError && !isLoadingStudents) {
        return (
            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{studentsError}</span>
            </div>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-8 pb-8 h-full">
                <SectionHeader
                    title="Student Management"
                    description="Manage enrolled students and batches for this course instance."
                    action={
                        <div className="flex items-center gap-2">
                            {!isLoadingStudents && students.length > 0 && (
                                <Badge variant="outline" className="font-semibold text-sm px-3 py-1">
                                    {students.length} student{students.length !== 1 ? "s" : ""}
                                </Badge>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exportToCsv(students)}
                                disabled={isLoadingStudents || students.length === 0}
                            >
                                <FileDown className="mr-2 h-4 w-4" />
                                Export CSV
                            </Button>
                            <Button size="sm" onClick={() => setModalOpen(true)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Add Students
                            </Button>
                        </div>
                    }
                />

                <Tabs defaultValue="students" className="flex-1 flex flex-col">
                    <TabsList className="w-fit mb-4">
                        <TabsTrigger value="students" className="gap-2">
                            <Users className="h-4 w-4" />
                            Enrolled Students
                            {!isLoadingStudents && students.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
                                    {students.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="batches" className="gap-2">
                            <Layers className="h-4 w-4" />
                            Enrolled Batches
                            {!isLoadingBatches && enrolledBatches.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
                                    {enrolledBatches.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Students table ─────────────────────────────────── */}
                    <TabsContent value="students" className="flex-1">
                        {!isLoadingStudents && students.length === 0 ? (
                            <EmptyStateCard
                                icon={Users}
                                title="No students enrolled"
                                description="Use the Add Students button to enroll students individually or by batch."
                                action={
                                    <Button size="sm" onClick={() => setModalOpen(true)}>
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        Add Students
                                    </Button>
                                }
                            />
                        ) : (
                            <DataTable
                                columns={studentColumns}
                                data={students}
                                isLoading={isLoadingStudents}
                                searchKey="full_name"
                                searchPlaceholder="Search students by name…"
                            />
                        )}
                    </TabsContent>

                    {/* ── Batches table ──────────────────────────────────── */}
                    <TabsContent value="batches" className="flex-1">
                        {batchesError && !isLoadingBatches && (
                            <div className="flex gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{batchesError}</span>
                            </div>
                        )}
                        {!isLoadingBatches && enrolledBatches.length === 0 ? (
                            <EmptyStateCard
                                icon={Layers}
                                title="No batches enrolled"
                                description="Use the Add Students modal and select the Batches tab to enroll an entire batch."
                                action={
                                    <Button size="sm" onClick={() => setModalOpen(true)}>
                                        <UserPlus className="mr-2 h-4 w-4" />
                                        Add Students
                                    </Button>
                                }
                            />
                        ) : (
                            <DataTable
                                columns={batchColumns}
                                data={enrolledBatches}
                                isLoading={isLoadingBatches}
                                searchKey="name"
                                searchPlaceholder="Search batches…"
                            />
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* ── Add Students Modal ─────────────────────────────────────── */}
            <AddStudentsModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                instanceId={instanceId}
                enrolledUserIds={enrolledUserIds}
                onEnrolled={() => {
                    fetchStudents();
                    fetchBatches();
                }}
            />

            {/* ── Confirm remove student ─────────────────────────────────── */}
            <AlertDialog
                open={!!confirmStudent}
                onOpenChange={(open) => !open && setConfirmStudent(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove student?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>{confirmStudent?.full_name || "This student"}</strong> will be
                            unenrolled from this course instance. This action can be undone by
                            re-enrolling them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => confirmStudent && handleUnenrollStudent(confirmStudent)}
                        >
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Confirm remove batch ───────────────────────────────────── */}
            <AlertDialog
                open={!!confirmBatch}
                onOpenChange={(open) => !open && setConfirmBatch(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove batch?</AlertDialogTitle>
                        <AlertDialogDescription>
                            All <strong>{confirmBatch?.enrolled_count}</strong> enrolled members of{" "}
                            <strong>{confirmBatch?.name}</strong> will be unenrolled from this course
                            instance.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => confirmBatch && handleUnenrollBatch(confirmBatch)}
                        >
                            Remove Batch
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
