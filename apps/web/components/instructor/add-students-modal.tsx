"use client";

import * as React from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Users,
    Layers,
    Search,
    Loader2,
    AlertCircle,
    CheckCircle2,
    UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { instructorCoursesApi } from "@/lib/api/academics";
import { usersApi } from "@/lib/api/users";
import type { EnrolledBatchStats, Enrollment } from "@/types/academics.types";
import type { UserListItem } from "@/types/auth.types";
import { handleApiError } from "@/lib/api/axios";

// ─── Partial-success notice ───────────────────────────────────────────────────

interface PartialSuccessNotice {
    enrolled: number;
    skipped: number;
    total: number;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddStudentsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    instanceId: string;
    /** Already-enrolled user IDs (to grey them out) */
    enrolledUserIds: Set<string>;
    onEnrolled: (newEnrollments: Enrollment[]) => void;
}

// ─── Batch Tab ────────────────────────────────────────────────────────────────

function BatchTab({
    instanceId,
    onEnrolled,
    onClose,
}: {
    instanceId: string;
    onEnrolled: (newEnrollments: Enrollment[]) => void;
    onClose: () => void;
}) {
    const [batches, setBatches] = React.useState<EnrolledBatchStats[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [search, setSearch] = React.useState("");
    const [selectedBatchId, setSelectedBatchId] = React.useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [result, setResult] = React.useState<PartialSuccessNotice | null>(null);

    React.useEffect(() => {
        let mounted = true;
        setIsLoading(true);
        instructorCoursesApi
            .listAvailableBatches()
            .then((data) => { if (mounted) setBatches(data); })
            .catch((err) => { if (mounted) setError(handleApiError(err)); })
            .finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, []);

    const filtered = batches.filter(
        (b) =>
            b.name.toLowerCase().includes(search.toLowerCase()) ||
            b.code.toLowerCase().includes(search.toLowerCase()),
    );

    const handleEnroll = async () => {
        if (!selectedBatchId) return;
        setIsSubmitting(true);
        setResult(null);
        try {
            const res = await instructorCoursesApi.enrollBatch(instanceId, selectedBatchId);
            setResult({ enrolled: res.enrolled, skipped: res.skipped, total: res.total });
            onEnrolled([]); // trigger parent refresh
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {result && (
                <div className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 text-sm",
                    result.enrolled > 0
                        ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                        : "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300",
                )}>
                    {result.enrolled > 0
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <div>
                        <p className="font-semibold">
                            {result.enrolled} student{result.enrolled !== 1 ? "s" : ""} enrolled
                        </p>
                        {result.skipped > 0 && (
                            <p className="text-xs mt-0.5">
                                {result.skipped} already enrolled — skipped
                            </p>
                        )}
                    </div>
                </div>
            )}
            {error && (
                <div className="flex gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search batches..."
                    className="pl-8"
                />
            </div>

            <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border/60">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                        <Layers className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No batches found</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10" />
                                <TableHead>Batch</TableHead>
                                <TableHead>Years</TableHead>
                                <TableHead className="text-right">Members</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((b) => (
                                <TableRow
                                    key={b.batch_id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        setSelectedBatchId((prev) =>
                                            prev === b.batch_id ? null : b.batch_id,
                                        )
                                    }
                                >
                                    <TableCell>
                                        <Checkbox
                                            checked={selectedBatchId === b.batch_id}
                                            onCheckedChange={() =>
                                                setSelectedBatchId((prev) =>
                                                    prev === b.batch_id ? null : b.batch_id,
                                                )
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-semibold text-sm">{b.name}</p>
                                        <p className="text-xs text-muted-foreground font-mono">{b.code}</p>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {b.start_year} – {b.end_year}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Badge variant="secondary" className="text-xs">
                                            {b.total_members}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </ScrollArea>

            <div className="flex items-center justify-between pt-2 border-t border-border/40 shrink-0">
                <p className="text-xs text-muted-foreground">
                    {selectedBatchId
                        ? `${batches.find((b) => b.batch_id === selectedBatchId)?.total_members ?? 0} student${(batches.find((b) => b.batch_id === selectedBatchId)?.total_members ?? 0) !== 1 ? "s" : ""} will be enrolled`
                        : "Select a batch to enroll"}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleEnroll}
                        disabled={!selectedBatchId || isSubmitting}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enrolling…</>
                        ) : (
                            <><UserPlus className="mr-2 h-4 w-4" />Enroll Batch</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Students Tab ─────────────────────────────────────────────────────────────

function StudentsTab({
    instanceId,
    enrolledUserIds,
    onEnrolled,
    onClose,
}: {
    instanceId: string;
    enrolledUserIds: Set<string>;
    onEnrolled: (newEnrollments: Enrollment[]) => void;
    onClose: () => void;
}) {
    const [students, setStudents] = React.useState<UserListItem[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [search, setSearch] = React.useState("");
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [result, setResult] = React.useState<PartialSuccessNotice | null>(null);

    React.useEffect(() => {
        let mounted = true;
        setIsLoading(true);
        usersApi
            .listStudents({ limit: 500 })
            .then(({ data }) => { if (mounted) setStudents(data); })
            .catch((err) => { if (mounted) setError(handleApiError(err)); })
            .finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, []);

    const filtered = students.filter((s) => {
        const q = search.toLowerCase();
        return (
            s.full_name.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            (s.student_id ?? "").toLowerCase().includes(q)
        );
    });

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const selectable = filtered.filter((s) => !enrolledUserIds.has(s.id));
        const allSelected = selectable.every((s) => selected.has(s.id));
        if (allSelected) {
            setSelected((prev) => {
                const next = new Set(prev);
                selectable.forEach((s) => next.delete(s.id));
                return next;
            });
        } else {
            setSelected((prev) => {
                const next = new Set(prev);
                selectable.forEach((s) => next.add(s.id));
                return next;
            });
        }
    };

    const handleEnroll = async () => {
        if (selected.size === 0) return;
        setIsSubmitting(true);
        setResult(null);
        let enrolled = 0;
        let skipped = 0;
        const newEnrollments: Enrollment[] = [];

        for (const userId of selected) {
            try {
                const e = await instructorCoursesApi.enrollStudent(instanceId, userId);
                newEnrollments.push(e);
                enrolled++;
            } catch {
                skipped++;
            }
        }

        setResult({ enrolled, skipped, total: selected.size });
        if (enrolled > 0) onEnrolled(newEnrollments);
        setSelected(new Set());
        setIsSubmitting(false);
    };

    const selectableFiltered = filtered.filter((s) => !enrolledUserIds.has(s.id));
    const allVisibleSelected =
        selectableFiltered.length > 0 &&
        selectableFiltered.every((s) => selected.has(s.id));

    return (
        <div className="flex flex-col gap-4 h-full">
            {result && (
                <div className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 text-sm",
                    result.enrolled > 0
                        ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
                        : "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300",
                )}>
                    {result.enrolled > 0
                        ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <div>
                        <p className="font-semibold">
                            {result.enrolled} student{result.enrolled !== 1 ? "s" : ""} enrolled
                        </p>
                        {result.skipped > 0 && (
                            <p className="text-xs mt-0.5">
                                {result.skipped} already enrolled — skipped
                            </p>
                        )}
                    </div>
                </div>
            )}
            {error && (
                <div className="flex gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, email or student ID…"
                    className="pl-8"
                />
            </div>

            <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border/60">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                        <Users className="h-8 w-8 opacity-40" />
                        <p className="text-sm">No students found</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox
                                        checked={allVisibleSelected}
                                        onCheckedChange={toggleAll}
                                        disabled={selectableFiltered.length === 0}
                                    />
                                </TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Student ID</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((s) => {
                                const alreadyEnrolled = enrolledUserIds.has(s.id);
                                return (
                                    <TableRow
                                        key={s.id}
                                        className={cn(
                                            !alreadyEnrolled && "cursor-pointer",
                                            alreadyEnrolled && "opacity-50",
                                        )}
                                        onClick={() => !alreadyEnrolled && toggle(s.id)}
                                    >
                                        <TableCell>
                                            <Checkbox
                                                checked={alreadyEnrolled || selected.has(s.id)}
                                                disabled={alreadyEnrolled}
                                                onCheckedChange={() => !alreadyEnrolled && toggle(s.id)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <p className="font-semibold text-sm">{s.full_name}</p>
                                            <p className="text-xs text-muted-foreground">{s.email}</p>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {s.student_id || "—"}
                                        </TableCell>
                                        <TableCell>
                                            {alreadyEnrolled ? (
                                                <Badge variant="secondary" className="text-xs">Enrolled</Badge>
                                            ) : selected.has(s.id) ? (
                                                <Badge className="text-xs bg-primary/10 text-primary border-0">Selected</Badge>
                                            ) : null}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </ScrollArea>

            <div className="flex items-center justify-between pt-2 border-t border-border/40 shrink-0">
                <p className="text-xs text-muted-foreground">
                    {selected.size > 0
                        ? `${selected.size} student${selected.size !== 1 ? "s" : ""} selected`
                        : "Select students to enroll"}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleEnroll}
                        disabled={selected.size === 0 || isSubmitting}
                    >
                        {isSubmitting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enrolling…</>
                        ) : (
                            <><UserPlus className="mr-2 h-4 w-4" />Enroll {selected.size > 0 ? selected.size : ""}</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function AddStudentsModal({
    open,
    onOpenChange,
    instanceId,
    enrolledUserIds,
    onEnrolled,
}: AddStudentsModalProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-2xl flex flex-col p-6 h-full gap-4 border-l-border/40">
                <SheetHeader className="pb-4 border-b border-border/40 shrink-0">
                    <SheetTitle className="text-2xl font-bold font-heading">Add Students</SheetTitle>
                    <SheetDescription>
                        Enroll students individually or enroll an entire batch at once.
                        Already-enrolled students are skipped automatically.
                    </SheetDescription>
                </SheetHeader>

                <Tabs defaultValue="students" className="flex-1 flex flex-col min-h-0 gap-4">
                    <TabsList className="shrink-0 w-fit">
                        <TabsTrigger value="students" className="gap-2">
                            <Users className="h-4 w-4" />
                            Students
                        </TabsTrigger>
                        <TabsTrigger value="batches" className="gap-2">
                            <Layers className="h-4 w-4" />
                            Batches
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="students" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=active]:flex">
                        <StudentsTab
                            instanceId={instanceId}
                            enrolledUserIds={enrolledUserIds}
                            onEnrolled={onEnrolled}
                            onClose={() => onOpenChange(false)}
                        />
                    </TabsContent>

                    <TabsContent value="batches" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=active]:flex">
                        <BatchTab
                            instanceId={instanceId}
                            onEnrolled={onEnrolled}
                            onClose={() => onOpenChange(false)}
                        />
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
