'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Plus,
    Search,
    RefreshCw,
    UserPlus,
    X,
    Check,
    Loader2,
    Calendar,
    Users,
    ChevronRight,
    MoreHorizontal,
    UserCircle,
    Copy,
    Settings,
    Save,
    ShieldAlert,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { batchesApi, batchMembersApi, degreesApi, specializationsApi } from '@/lib/api/academics';
import { usersApi } from '@/lib/api/users';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import {
    SideDialog,
    SideDialogContent,
    SideDialogDescription,
    SideDialogFooter,
    SideDialogHeader,
    SideDialogTitle,
} from '@/components/ui/side-dialog';
import type { Batch, BatchMemberDetail } from '@/types/academics.types';
import type { UserListItem } from '@/types/auth.types';
import { cn } from '@/lib/utils/cn';
import { useUIStore } from '@/lib/stores/uiStore';

export default function GroupDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { canAccess, canWrite } = useAcademicsAccess();
    const setPageTitle = useUIStore(s => s.setPageTitle);

    const [batch, setBatch] = React.useState<Batch | null>(null);
    const [members, setMembers] = React.useState<BatchMemberDetail[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [activeTab, setActiveTab] = React.useState<'students' | 'settings'>('students');

    // Settings form state
    const [editValues, setEditValues] = React.useState<any>({});
    const [saving, setSaving] = React.useState(false);
    const [specializations, setSpecializations] = React.useState<any[]>([]);

    // Bulk Add state
    const [addOpen, setAddOpen] = React.useState(false);
    const [studentSearch, setStudentSearch] = React.useState('');
    const [availableStudents, setAvailableStudents] = React.useState<UserListItem[]>([]);
    const [selectedStudents, setSelectedStudents] = React.useState<Set<string>>(new Set());
    const [searchingStudents, setSearchingStudents] = React.useState(false);
    const [addingStudents, setAddingStudents] = React.useState(false);

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [batchData, membersData] = await Promise.all([
                batchesApi.get(id),
                batchesApi.getMembersDetailed(id)
            ]);
            setBatch(batchData);
            setMembers(membersData);
            setPageTitle(batchData.name);
            setEditValues({
                name: batchData.name,
                specialization_id: batchData.specialization_id,
                start_year: batchData.start_year,
                end_year: batchData.end_year
            });

            if (batchData.degree_id) {
                const specs = await specializationsApi.listByDegree(batchData.degree_id);
                setSpecializations(specs);
            }
        } catch (err) {
            setError(handleApiError(err));
            toast.error('Failed to load group details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    React.useEffect(() => {
        return () => setPageTitle(null);
    }, [setPageTitle]);

    // Search students for bulk add
    // Reset state when dialog opens
    React.useEffect(() => {
        if (addOpen) {
            setStudentSearch('');
            setSelectedStudents(new Set());
        }
    }, [addOpen]);

    React.useEffect(() => {
        if (!addOpen) return;

        const timer = setTimeout(async () => {
            setSearchingStudents(true);
            try {
                const resp = await usersApi.list({
                    search: studentSearch,
                    user_type: 'Student',
                    limit: 10
                });
                setAvailableStudents(resp.data);
            } catch (err) {
                console.error('Failed to search students', err);
            } finally {
                setSearchingStudents(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [studentSearch, addOpen]);

    const handleAddStudents = async () => {
        if (selectedStudents.size === 0) return;
        setAddingStudents(true);
        try {
            await batchMembersApi.addBulk({
                batch_id: id,
                user_ids: Array.from(selectedStudents)
            });
            toast.success('Students successfully enrolled', `${selectedStudents.size} students added to ${batch?.name}`);
            setAddOpen(false);
            setSelectedStudents(new Set());
            fetchData();
        } catch (err) {
            toast.error('Enrollment failed', handleApiError(err));
        } finally {
            setAddingStudents(false);
        }
    };

    const toggleStudentSelection = (userId: string) => {
        setSelectedStudents(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleRemoveMember = async (userId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            await batchMembersApi.remove(id, userId);
            toast.success('Member removed');
            fetchData();
        } catch (err) {
            toast.error('Removal failed', handleApiError(err));
        }
    };

    const handleUpdateBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!batch) return;
        setSaving(true);
        try {
            const updated = await batchesApi.update(id, editValues);
            setBatch(updated);
            setPageTitle(updated.name);
            toast.success('Group settings updated');
        } catch (err) {
            toast.error('Update failed', handleApiError(err));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        if (!batch) return;
        try {
            if (batch.is_active) {
                await batchesApi.deactivate(id);
                toast.success('Group deactivated');
            } else {
                await batchesApi.reactivate(id);
                toast.success('Group reactivated');
            }
            fetchData();
        } catch (err) {
            toast.error('Action failed', handleApiError(err));
        }
    };

    const filteredMembers = React.useMemo(() => {
        if (!search.trim()) return members;
        const q = search.toLowerCase();
        return members.filter(m =>
            m.full_name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q) ||
            m.student_id?.toLowerCase().includes(q)
        );
    }, [members, search]);

    if (!canAccess) return null;

    if (loading && !batch) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!batch) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 gap-1.5 text-zinc-500 hover:text-zinc-900"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Groups
                    </Button>
                    <div className="flex items-center gap-4 mt-1">
                        <div className="h-12 w-12 flex items-center justify-center rounded-2xl bg-secondary text-primary shrink-0">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">{batch.name}</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                                    {batch.code}
                                </Badge>
                                <span className="text-zinc-400 text-xs font-medium">
                                    {batch.start_year} — {batch.end_year}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {canWrite && (
                    <div className="flex items-center gap-2">
                        <Button className="gap-2 font-bold shadow-sm" onClick={() => setAddOpen(true)}>
                            <UserPlus className="h-4 w-4" />
                            Enroll Students
                        </Button>
                    </div>
                )}

                <SideDialog open={addOpen} onOpenChange={setAddOpen}>
                    <SideDialogContent className="max-w-md">
                        <SideDialogHeader>
                            <SideDialogTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-primary" />
                                Enroll Students
                            </SideDialogTitle>
                            <SideDialogDescription>
                                Search and select students to add to {batch.name}.
                            </SideDialogDescription>
                        </SideDialogHeader>

                        <div className="space-y-4 flex-1 overflow-y-auto">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                <Input
                                    placeholder="Search by name, email or student ID..."
                                    className="pl-9"
                                    value={studentSearch}
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-2 min-h-[200px]">
                                {searchingStudents ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
                                    </div>
                                ) : availableStudents.length > 0 ? (
                                    availableStudents.map((student) => {
                                        const isSelected = selectedStudents.has(student.id);
                                        const isAlreadyMember = members.some(m => m.user_id === student.id);

                                        return (
                                            <div
                                                key={student.id}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                                                    isSelected
                                                        ? "bg-primary/5 border-primary shadow-sm"
                                                        : "bg-white dark:bg-zinc-950 border-zinc-100 dark:border-zinc-900 hover:border-zinc-300",
                                                    isAlreadyMember && "opacity-50 pointer-events-none grayscale"
                                                )}
                                                onClick={() => !isAlreadyMember && toggleStudentSelection(student.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={student.avatar_url} />
                                                        <AvatarFallback>{student.full_name.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold">{student.full_name}</span>
                                                        <span className="text-[10px] text-zinc-500">{student.student_id ? student.student_id : student.email}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isAlreadyMember ? (
                                                        <Badge variant="secondary" className="text-[9px]">Enrolled</Badge>
                                                    ) : isSelected ? (
                                                        <div className="h-5 w-5 bg-primary text-white flex items-center justify-center rounded-full">
                                                            <Check className="h-3 w-3" />
                                                        </div>
                                                    ) : (
                                                        <div className="h-5 w-5 border-2 border-zinc-200 rounded-full" />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-8 text-zinc-500 text-sm">
                                        {studentSearch ? 'No students found' : 'No students available'}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs text-zinc-500 font-medium">
                                    {selectedStudents.size} students selected
                                </span>
                                {selectedStudents.size > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/5"
                                        onClick={() => setSelectedStudents(new Set())}
                                    >
                                        Clear all
                                    </Button>
                                )}
                            </div>
                        </div>

                        <SideDialogFooter>
                            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                            <Button
                                onClick={handleAddStudents}
                                disabled={selectedStudents.size === 0 || addingStudents}
                                className="font-bold min-w-[120px]"
                            >
                                {addingStudents ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enrolling...
                                    </>
                                ) : (
                                    `Enroll ${selectedStudents.size} Students`
                                )}
                            </Button>
                        </SideDialogFooter>
                    </SideDialogContent>
                </SideDialog>
            </div>

            {/* Top Row: Group Metadata */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                    <CardContent className="p-5 flex flex-col justify-center h-full">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Commencement</span>
                        <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mt-auto">
                            <Calendar className="h-4 w-4 text-zinc-400" />
                            <span className="text-sm font-semibold">{batch.start_year}</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 relative group/copy">
                    <CardContent className="p-5 flex flex-col justify-center h-full">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Group ID</span>
                        <div className="flex items-center gap-2 mt-auto">
                            <span className="text-[11px] font-mono font-medium text-zinc-500 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 rounded border border-zinc-100 dark:border-zinc-900 w-full truncate cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                                onClick={() => {
                                    navigator.clipboard.writeText(batch.id);
                                    toast.success('ID copied to clipboard');
                                }}>
                                {batch.id}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-3 right-3 h-6 w-6 text-zinc-400 hover:text-zinc-900 opacity-0 group-hover/copy:opacity-100 transition-opacity"
                                onClick={() => {
                                    navigator.clipboard.writeText(batch.id);
                                    toast.success('ID copied to clipboard');
                                }}
                            >
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                    <CardContent className="p-5 flex flex-col justify-center h-full">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Member Count</span>
                        <div className="flex items-baseline gap-2 mt-auto">
                            <span className="text-3xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{members.length}</span>
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-tighter">Students</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* LHS Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                        <CardContent className="p-5">
                            <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-3">Degree Level</h3>
                            <Badge variant="secondary" className="bg-secondary text-primary hover:bg-secondary/80 font-bold px-3 py-1 shadow-none">
                                Undergraduate
                            </Badge>
                        </CardContent>
                    </Card>

                    <div className="flex flex-col gap-2">
                        <Button
                            variant={activeTab === 'students' ? "default" : "ghost"}
                            className={cn(
                                "justify-start font-semibold  w-full",
                                activeTab === 'students' ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setActiveTab('students')}
                        >
                            <Users className="h-4 w-4 mr-2" />
                            Enrolled Students
                        </Button>
                        <Button
                            variant={activeTab === 'settings' ? "default" : "ghost"}
                            className={cn(
                                "justify-start font-semibold  w-full",
                                activeTab === 'settings' ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:text-foreground"
                            )}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Settings
                        </Button>
                    </div>

                    {/* Quick Access Card */}
                    <Card className="shadow-sm border-border bg-muted">
                        <CardContent className="p-4 pt-5">
                            <h3 className="font-bold text-xs mb-1 text-muted-foreground uppercase tracking-wider">Admin Controls</h3>
                            <p className="text-[11px] text-muted-foreground mb-4 font-medium leading-relaxed">
                                Detailed student synchronization and bulk operations are restricted.
                            </p>
                            <Button variant="secondary" className="w-full text-xs font-semibold h-9 gap-2">
                                <Search className="h-3.5 w-3.5" /> Find Records
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Pane */}
                <div className="lg:col-span-3 space-y-6">

                    {activeTab === 'students' ? (
                        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 h-full overflow-hidden bg-white dark:bg-zinc-950">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-zinc-100 dark:border-zinc-900">
                                <div>
                                    <CardTitle className="text-lg font-bold">Enrolled Students</CardTitle>
                                    <CardDescription className="text-xs">All current members of this batch/group.</CardDescription>
                                </div>
                                <div className="relative w-64">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 font-bold" />
                                    <Input
                                        placeholder="Search members..."
                                        className="pl-8 h-8 text-xs border-zinc-200 dark:border-zinc-800"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                            </CardHeader>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-50/50">
                                        <TableHead className="pl-6 text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Student</TableHead>
                                        <TableHead className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider">ID / Email</TableHead>
                                        <TableHead className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Status</TableHead>
                                        <TableHead className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider">Enrolled On</TableHead>
                                        <TableHead className="text-right pr-6 w-12" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i} className="h-16">
                                                <TableCell className="pl-6"><div className="flex items-center gap-3"><div className="h-9 w-9 bg-zinc-100 rounded-full" /><div className="space-y-2"><div className="h-3 w-24 bg-zinc-100 rounded" /><div className="h-2 w-32 bg-zinc-100 rounded" /></div></div></TableCell>
                                                <TableCell><div className="h-3 w-32 bg-zinc-100 rounded" /></TableCell>
                                                <TableCell><div className="h-5 w-16 bg-zinc-100 rounded-full" /></TableCell>
                                                <TableCell><div className="h-3 w-20 bg-zinc-100 rounded" /></TableCell>
                                                <TableCell className="pr-6"><div className="h-8 w-8 bg-zinc-100 rounded ml-auto" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredMembers.length > 0 ? (
                                        filteredMembers.map((member) => (
                                            <TableRow key={member.user_id} className="group h-16 transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10">
                                                <TableCell className="pl-6">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-9 w-9 border border-zinc-100 dark:border-zinc-900">
                                                            <AvatarImage src={member.avatar_url} />
                                                            <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold leading-none">
                                                                {member.full_name?.charAt(0) || <UserCircle className="h-4 w-4" />}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                                {member.full_name}
                                                            </span>
                                                            <span className="text-[10px] text-zinc-500 font-medium">
                                                                {member.email}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-xs font-mono font-medium text-zinc-500">
                                                        {member.student_id || 'N/A'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={member.status === 'Active' ? 'success' : 'secondary'}
                                                        className="rounded-full px-2 py-0 font-bold text-[9px] h-5 uppercase tracking-tighter"
                                                    >
                                                        {member.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-xs text-zinc-500 font-medium">
                                                        {new Date(member.enrolled_at).toLocaleDateString()}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    {canWrite && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-zinc-400 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                                            onClick={() => handleRemoveMember(member.user_id)}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-48 text-center">
                                                <div className="flex flex-col items-center justify-center text-zinc-400">
                                                    <Users className="h-10 w-10 mb-2 opacity-10" />
                                                    <p className="text-sm font-medium">No students enrolled</p>
                                                    <p className="text-xs">Use the Enroll button to add members.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </Card>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                                <CardHeader className="border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">General Settings</CardTitle>
                                            <CardDescription className="text-xs">Update the group identity and duration.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <form onSubmit={handleUpdateBatch} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="group_name" className="text-xs font-bold uppercase text-zinc-500">Display Name</Label>
                                                <Input
                                                    id="group_name"
                                                    value={editValues.name}
                                                    onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                                                    className="font-medium"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="specialization" className="text-xs font-bold uppercase text-zinc-500">Specialization</Label>
                                                <SelectNative
                                                    id="specialization"
                                                    value={editValues.specialization_id || ''}
                                                    onChange={e => setEditValues({ ...editValues, specialization_id: e.target.value || null })}
                                                >
                                                    <option value="">General / None</option>
                                                    {specializations.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </SelectNative>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-100 dark:border-zinc-900">
                                            <div className="space-y-2">
                                                <Label htmlFor="start_year" className="text-xs font-bold uppercase text-zinc-500">Start Year</Label>
                                                <Input
                                                    id="start_year"
                                                    type="number"
                                                    value={editValues.start_year}
                                                    onChange={e => setEditValues({ ...editValues, start_year: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="end_year" className="text-xs font-bold uppercase text-zinc-500">End Year</Label>
                                                <Input
                                                    id="end_year"
                                                    type="number"
                                                    value={editValues.end_year}
                                                    onChange={e => setEditValues({ ...editValues, end_year: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button disabled={saving} className="font-bold gap-2">
                                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                                Save Changes
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-red-100 dark:border-red-900/30 overflow-hidden">
                                <CardHeader className="bg-red-50/50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20">
                                    <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                                        <ShieldAlert className="h-5 w-5" />
                                        <div>
                                            <CardTitle className="text-base font-bold">Danger Zone</CardTitle>
                                            <CardDescription className="text-xs text-red-500/70">Proceed with caution. These actions cannot be easily undone.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                                {batch.is_active ? 'Deactivate Group' : 'Reactivate Group'}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {batch.is_active
                                                    ? 'Members will no longer be able to access group-specific resources.'
                                                    : 'Restore group access and visibility for all members.'}
                                            </p>
                                        </div>
                                        <Button
                                            variant={batch.is_active ? "destructive" : "secondary"}
                                            className="font-bold whitespace-nowrap"
                                            onClick={handleToggleStatus}
                                        >
                                            {batch.is_active ? 'Deactivate' : 'Reactivate'}
                                        </Button>
                                    </div>

                                    <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Delete Permanently</p>
                                            <p className="text-xs text-zinc-500 tracking-tight">
                                                Only possible if the group has zero members and no historical data.
                                            </p>
                                        </div>
                                        <Button variant="ghost" className="text-red-500 hover:bg-red-50 font-bold gap-2" disabled>
                                            <Trash2 className="h-4 w-4" /> Delete
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
