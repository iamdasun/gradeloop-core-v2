"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  UserCheck,
  UserPlus,
  Search,
  MoreHorizontal,
  Mail,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Calendar,
  Settings2,
  Trash2,
  XCircle,
  Save,
  GraduationCap,
  UserMinus,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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

import {
  courseInstancesApi,
  coursesApi,
  semestersApi,
  batchesApi,
  batchMembersApi,
  enrollmentsApi,
} from "@/lib/api/academics";
import { useAcademicsAccess } from "@/lib/hooks/useAcademicsAccess";
import { handleApiError } from "@/lib/api/axios";
import { toast } from "@/lib/hooks/use-toast";
import { useUIStore } from "@/lib/stores/uiStore";
import {
  EnrollStudentsDialog,
  AddBatchToInstanceDialog,
  AddIndividualStudentDialog,
} from "@/components/admin/academics/course-instance-dialogs";
import { AcademicsDetailLayout } from "@/components/admin/academics/AcademicsDetailLayout";
import { DangerZone } from "@/components/admin/academics/DangerZone";
import type {
  CourseInstance,
  CourseInstructor,
  Enrollment,
  Course,
  Semester,
  Batch,
  BatchMemberDetail,
  CourseInstanceStatus,
} from "@/types/academics.types";

const STATUSES: CourseInstanceStatus[] = [
  "Planned",
  "Active",
  "Completed",
  "Cancelled",
];

const statusVariantClasses: Record<
  CourseInstanceStatus,
  { badge: string; dot: string }
> = {
  Planned: {
    badge: "bg-warning/10 text-warning-muted-foreground border-warning/20",
    dot: "bg-warning",
  },
  Active: {
    badge: "bg-success/10 text-success-muted-foreground border-success/20",
    dot: "bg-success",
  },
  Completed: {
    badge: "bg-info/10 text-info-muted-foreground border-info/20",
    dot: "bg-info",
  },
  Cancelled: {
    badge: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROSTER_PER_PAGE = 20;

function instanceStatusVariant(status: string) {
  if (status === "Active") return "success" as const;
  if (status === "Planned") return "info" as const;
  if (status === "Completed") return "secondary" as const;
  return "destructive" as const;
}

function enrollmentStatusVariant(status: string) {
  if (status === "Enrolled") return "success" as const;
  if (status === "Completed") return "secondary" as const;
  if (status === "Dropped") return "destructive" as const;
  return "secondary" as const;
}

function getInitials(name: string, email: string) {
  const src = name || email;
  return src
    .split(/[.\-_\s@]/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CourseInstancePage() {
  const params = useParams();
  const { id, instanceId } = params as { id: string; instanceId: string };
  const router = useRouter();
  const { canAccess, canWrite } = useAcademicsAccess();
  const setPageTitle = useUIStore((s) => s.setPageTitle);

  // ── Data state ──────────────────────────────────────────────────────
  const [instance, setInstance] = React.useState<CourseInstance | null>(null);
  const [course, setCourse] = React.useState<Course | null>(null);
  const [semester, setSemester] = React.useState<Semester | null>(null);
  const [batch, setBatch] = React.useState<Batch | null>(null);
  const [instructors, setInstructors] = React.useState<CourseInstructor[]>([]);
  const [enrollments, setEnrollments] = React.useState<Enrollment[]>([]);
  const [batchMembers, setBatchMembers] = React.useState<BatchMemberDetail[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // ── Settings state ──────────────────────────────────────────────────
  const [enrollStudentsOpen, setEnrollStudentsOpen] = React.useState(false);
  const [addBatchOpen, setAddBatchOpen] = React.useState(false);
  const [addIndividualStudentOpen, setAddIndividualStudentOpen] =
    React.useState(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [settingsStatus, setSettingsStatus] =
    React.useState<CourseInstanceStatus>("Planned");
  const [settingsMaxEnrollment, setSettingsMaxEnrollment] = React.useState(30);

  // ── Search & pagination ─────────────────────────────────────────────
  const [search, setSearch] = React.useState("");
  const [rosterPage, setRosterPage] = React.useState(1);
  const [expandedBatches, setExpandedBatches] = React.useState<Set<string>>(
    new Set(),
  );

  // ── Tab state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "roster" | "instructors" | "settings"
  >("overview");

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const inst = await courseInstancesApi.getById(instanceId);
      setInstance(inst);
      setSettingsStatus(inst.status);
      setSettingsMaxEnrollment(inst.max_enrollment);

      const [courseData, semData, instrData, enrollData] = await Promise.all([
        coursesApi.get(inst.course_id),
        semestersApi.get(inst.semester_id),
        courseInstancesApi.getInstructors(instanceId),
        courseInstancesApi.getEnrollments(instanceId),
      ]);

      setCourse(courseData);
      setSemester(semData);
      setInstructors(instrData);
      setEnrollments(enrollData);

      // Fetch batch data + members (only if batch_id exists)
      if (inst.batch_id) {
        const [batData, membersData] = await Promise.all([
          batchesApi.get(inst.batch_id),
          batchesApi.getMembersDetailed(inst.batch_id),
        ]);
        setBatch(batData);
        setBatchMembers(membersData);
      } else {
        setBatch(null);
        setBatchMembers([]);
      }

      const title = courseData
        ? `${courseData.code} — Instance`
        : `Instance ${instanceId.slice(0, 8)}`;
      setPageTitle(title);
    } catch (err) {
      const msg = handleApiError(err);
      setError(msg);
      toast.error("Failed to load instance details", msg);
    } finally {
      setLoading(false);
    }
  }, [instanceId, setPageTitle]);

  React.useEffect(() => {
    if (!canAccess) return;
    fetchAll();
  }, [canAccess, fetchAll]);

  React.useEffect(() => {
    return () => setPageTitle(null);
  }, [setPageTitle]);

  // ── Settings handlers ────────────────────────────────────────────────
  async function handleSaveSettings() {
    if (!instance) return;
    setSavingSettings(true);
    try {
      const updated = await courseInstancesApi.update(instance.id, {
        status: settingsStatus,
        max_enrollment: settingsMaxEnrollment,
      });
      setInstance(updated);
      toast.success("Settings saved", "Course instance updated successfully.");
    } catch (err) {
      toast.error("Failed to save settings", handleApiError(err));
    } finally {
      setSavingSettings(false);
    }
  }

  if (!canAccess) return null;

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !instance) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="h-10 w-10 text-error" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchAll}>
          Try again
        </Button>
      </div>
    );
  }

  if (!instance) return null;

  // ── Student roster derivations ───────────────────────────────────────
  const q = search.toLowerCase().trim();
  const batchMemberIds = new Set(batchMembers.map((m) => m.user_id));

  // Batch students: batchMembers with their enrollment status overlaid
  const filteredBatchStudents = batchMembers.filter((m) => {
    if (!q) return true;
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.student_id.toLowerCase().includes(q)
    );
  });

  // Individual students: enrolled but NOT in batch
  const individualEnrollments = enrollments.filter(
    (e) => !batchMemberIds.has(e.user_id),
  );
  const filteredIndividual = individualEnrollments.filter((e) => {
    if (!q) return true;
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.student_id.toLowerCase().includes(q)
    );
  });

  // All enrollments for search-across-all view (paged)
  const allFiltered = enrollments.filter((e) => {
    if (!q) return true;
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.student_id.toLowerCase().includes(q)
    );
  });
  const totalRosterPages = Math.max(
    1,
    Math.ceil(allFiltered.length / ROSTER_PER_PAGE),
  );
  const pagedEnrollments = allFiltered.slice(
    (rosterPage - 1) * ROSTER_PER_PAGE,
    rosterPage * ROSTER_PER_PAGE,
  );

  // Enrollment lookup map (for batch member status badge overlay)
  const enrollmentByUserId = new Map(enrollments.map((e) => [e.user_id, e]));

  const pageTitle = course
    ? `${course.code}: ${course.title}`
    : `Instance ${instanceId.slice(0, 8)}`;

  const settingsDirty =
    instance &&
    (settingsStatus !== instance.status ||
      settingsMaxEnrollment !== instance.max_enrollment);

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BookOpen },
    { id: "roster" as const, label: "Roster", icon: Users },
    { id: "instructors" as const, label: "Instructors", icon: GraduationCap },
    { id: "settings" as const, label: "Settings", icon: Settings2 },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => router.push(`/admin/academics/courses/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Course
        </Button>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">
              {pageTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusVariantClasses[instance.status].badge}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${statusVariantClasses[instance.status].dot}`}
                />
                {instance.status}
              </span>
              {semester && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {semester.name} ({semester.term_type})
                </span>
              )}
              {batch && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {batch.name} ({batch.code})
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={fetchAll}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Tabbed Layout */}
      <AcademicsDetailLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{enrollments.length}</p>
                    <p className="text-xs text-muted-foreground">Enrolled</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <UserCheck className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {instance.max_enrollment}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Max Capacity
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                    <GraduationCap className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{batchMembers.length}</p>
                    <p className="text-xs text-muted-foreground">
                      Batch Students
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <BookOpen className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{instructors.length}</p>
                    <p className="text-xs text-muted-foreground">Instructors</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Instance Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Instance Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {course && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Course</p>
                    <p className="text-sm font-medium">
                      {course.code} — {course.title}
                    </p>
                  </div>
                )}
                {semester && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Semester</p>
                    <p className="text-sm font-medium">
                      {semester.name} ({semester.term_type})
                    </p>
                  </div>
                )}
                {batch && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Batch</p>
                    <p className="text-sm font-medium">
                      {batch.name} ({batch.code})
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">
                    {new Date(instance.created_at).toLocaleDateString("en-US", {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Instance ID</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {instance.id}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Roster Tab */}
        {activeTab === "roster" && (
          <div className="space-y-4">
            {/* Search & Actions */}
            <Card className="shadow-sm">
              <CardContent className="flex items-center gap-3 p-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email or ID…"
                    className="pl-9 h-8 text-sm"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setRosterPage(1);
                    }}
                  />
                </div>
                {canWrite && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setAddBatchOpen(true)}
                    >
                      <Users className="h-4 w-4" />
                      Add Batch
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => setAddIndividualStudentOpen(true)}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add Student
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {enrollments.length} student
                {enrollments.length !== 1 ? "s" : ""} enrolled
              </span>
            </div>

            {/* Batches Section */}
            {batchMembers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success shrink-0">
                    <GraduationCap className="h-3 w-3" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Batches
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {batchMembers.length} students
                  </span>
                </div>

                {/* Batch Card */}
                {batch && (
                  <Card
                    className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setExpandedBatches((prev) => {
                        const next = new Set(prev);
                        if (next.has(batch.id)) {
                          next.delete(batch.id);
                        } else {
                          next.add(batch.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <CardHeader className="pb-3 pt-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                          <Users className="h-5 w-5 text-success" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {batch.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {batch.code} • {batchMembers.length} students
                          </p>
                        </div>
                        <ChevronRight
                          className={`h-5 w-5 text-muted-foreground transition-transform ${
                            expandedBatches.has(batch.id)
                              ? "rotate-90"
                              : ""
                          }`}
                        />
                      </div>
                    </CardHeader>

                    {expandedBatches.has(batch.id) && (
                      <div
                        className="border-t border-border"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[200px]">
                                Student
                              </TableHead>
                              <TableHead>Student ID</TableHead>
                              <TableHead>Enrollment</TableHead>
                              <TableHead className="hidden md:table-cell">
                                Joined Batch
                              </TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {batchMembers
                              .filter((m) => {
                                if (!search) return true;
                                const q = search.toLowerCase();
                                return (
                                  m.full_name.toLowerCase().includes(q) ||
                                  m.email.toLowerCase().includes(q) ||
                                  m.student_id?.toLowerCase().includes(q)
                                );
                              })
                              .map((m) => {
                                const enr = enrollmentByUserId.get(m.user_id);
                                return (
                                  <TableRow key={m.user_id}>
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9 shrink-0">
                                          <AvatarFallback className="bg-success/10 text-success text-sm">
                                            {getInitials(m.full_name, m.email)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <p className="font-medium text-sm truncate">
                                            {m.full_name || "No Name"}
                                          </p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {m.email}
                                          </p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm text-muted-foreground">
                                      {m.student_id || "—"}
                                    </TableCell>
                                    <TableCell>
                                      {enr ? (
                                        <Badge
                                          variant={enrollmentStatusVariant(
                                            enr.status,
                                          )}
                                        >
                                          {enr.status}
                                        </Badge>
                                      ) : (
                                        <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-xs">
                                          Not enrolled
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                      {new Date(m.enrolled_at).toLocaleDateString(
                                        "en-US",
                                        { dateStyle: "medium" },
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {canWrite && (
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                              <MoreHorizontal className="h-4 w-4" />
                                              <span className="sr-only">
                                                Open menu
                                              </span>
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent
                                            align="end"
                                            className="w-44"
                                          >
                                            <DropdownMenuLabel>
                                              Actions
                                            </DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              className="gap-2"
                                              asChild
                                            >
                                              <a href={`mailto:${m.email}`}>
                                                <Mail className="h-4 w-4" />
                                                Email Student
                                              </a>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              className="gap-2 text-destructive focus:text-destructive"
                                              onClick={async () => {
                                                if (
                                                  !confirm(
                                                    "Remove this student from the batch?",
                                                  )
                                                )
                                                  return;
                                                try {
                                                  await batchMembersApi.remove(
                                                    batch.id,
                                                    m.user_id,
                                                  );
                                                  toast.success(
                                                    "Student removed from batch",
                                                  );
                                                  fetchAll();
                                                } catch (err) {
                                                  toast.error(
                                                    "Failed to remove student",
                                                    handleApiError(err),
                                                  );
                                                }
                                              }}
                                            >
                                              <UserX className="h-4 w-4" />
                                              Remove from Batch
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* Individual Students Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-info/10 text-info shrink-0">
                  <UserCheck className="h-3 w-3" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Individual Students
                </h3>
                <span className="text-xs text-muted-foreground">
                  {
                    enrollments.filter(
                      (e) => !batchMemberIds.has(e.user_id),
                    ).length
                  }{" "}
                  students
                </span>
              </div>

              <Card className="shadow-sm overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Student</TableHead>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Enrolled
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Grade
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {individualEnrollments
                      .filter((e) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return (
                          e.full_name.toLowerCase().includes(q) ||
                          e.email.toLowerCase().includes(q) ||
                          e.student_id?.toLowerCase().includes(q)
                        );
                      })
                      .map((e) => (
                        <TableRow key={e.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarFallback className="bg-info/10 text-info text-sm">
                                  {getInitials(e.full_name, e.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {e.full_name || "No Name"}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {e.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {e.student_id || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={enrollmentStatusVariant(e.status)}>
                              {e.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(e.enrolled_at).toLocaleDateString(
                              "en-US",
                              { dateStyle: "medium" },
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {e.final_grade ?? "—"}
                          </TableCell>
                          <TableCell>
                            {canWrite && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-44"
                                >
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="gap-2" asChild>
                                    <a href={`mailto:${e.email}`}>
                                      <Mail className="h-4 w-4" />
                                      Email Student
                                    </a>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="gap-2 text-destructive focus:text-destructive"
                                    onClick={async () => {
                                      if (
                                        !confirm(
                                          "Unenroll this student from the course?",
                                        )
                                      )
                                        return;
                                      try {
                                        await enrollmentsApi.update(
                                          instanceId,
                                          e.user_id,
                                          { status: "Dropped" },
                                        );
                                        toast.success(
                                          "Student unenrolled",
                                          `${e.full_name || e.email} has been unenrolled.`,
                                        );
                                        fetchAll();
                                      } catch (err) {
                                        toast.error(
                                          "Failed to unenroll",
                                          handleApiError(err),
                                        );
                                      }
                                    }}
                                  >
                                    <UserX className="h-4 w-4" />
                                    Unenroll
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    {individualEnrollments.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          <UserMinus className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm">
                            {search
                              ? "No individual students match your search"
                              : "No individual students enrolled"}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </div>
        )}

        {/* Instructors Tab */}
        {activeTab === "instructors" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {instructors.length} instructor
                {instructors.length !== 1 ? "s" : ""} assigned
              </span>
            </div>

            {instructors.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <GraduationCap className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No instructors assigned yet
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-sm">
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {instructors.map((instr) => (
                    <div
                      key={instr.user_id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(instr.full_name, instr.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {instr.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {instr.role}
                        </p>
                      </div>
                      <a
                        href={`mailto:${instr.email}`}
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        title={instr.email}
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {canWrite ? (
              <>
                <Card className="shadow-sm">
                  <div className="divide-y divide-border">
                    {/* Status row */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Status
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Change the operational state of this instance
                        </p>
                      </div>
                      <select
                        value={settingsStatus}
                        onChange={(e) =>
                          setSettingsStatus(
                            e.target.value as CourseInstanceStatus,
                          )
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-32"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Max enrollment row */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Max Enrollment
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Maximum number of students allowed in this instance
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={settingsMaxEnrollment}
                        onChange={(e) =>
                          setSettingsMaxEnrollment(
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>

                    {/* Instance ID row (read-only) */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Instance ID
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Unique identifier for this course instance
                        </p>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                        {instance.id.slice(0, 8)}…
                      </span>
                    </div>

                    {/* Save row */}
                    <div className="flex items-center justify-end gap-3 px-4 py-3 bg-muted/20">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!settingsDirty || savingSettings}
                        onClick={handleSaveSettings}
                        className="gap-1.5"
                      >
                        {savingSettings ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save className="h-3.5 w-3.5" />
                            Save Changes
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>

                <DangerZone
                  entityName={pageTitle}
                  entityType="course instance"
                  isActive={instance.status !== "Cancelled"}
                  onDeactivate={async () => {
                    const updated = await courseInstancesApi.update(
                      instance.id,
                      { status: "Cancelled" },
                    );
                    setInstance(updated);
                    setSettingsStatus("Cancelled");
                    toast.success(
                      "Instance cancelled",
                      "This course instance has been cancelled.",
                    );
                  }}
                  onReactivate={async () => {
                    const updated = await courseInstancesApi.update(
                      instance.id,
                      { status: "Planned" },
                    );
                    setInstance(updated);
                    setSettingsStatus("Planned");
                    toast.success(
                      "Instance reactivated",
                      "Course instance status set to Planned.",
                    );
                  }}
                  onDelete={async () => {
                    await courseInstancesApi.delete(instance.id);
                    toast.success(
                      "Instance deleted",
                      "Course instance has been permanently removed.",
                    );
                    router.push(`/admin/academics/courses/${id}`);
                  }}
                />
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Settings2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    You don't have permission to modify settings
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </AcademicsDetailLayout>

      {/* Dialogs */}
      <EnrollStudentsDialog
        open={enrollStudentsOpen}
        onOpenChange={setEnrollStudentsOpen}
        courseInstanceId={instanceId}
        enrolledUserIds={enrollments.map((e) => e.user_id)}
        onSuccess={fetchAll}
      />

      <AddBatchToInstanceDialog
        open={addBatchOpen}
        onOpenChange={setAddBatchOpen}
        instanceId={instanceId}
        onSuccess={fetchAll}
      />

      <AddIndividualStudentDialog
        open={addIndividualStudentOpen}
        onOpenChange={setAddIndividualStudentOpen}
        instanceId={instanceId}
        excludeUserIds={enrollments.map((e) => e.user_id)}
        onSuccess={fetchAll}
      />
    </div>
  );
}
