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
import { batchesApi, batchMembersApi } from '@/lib/api/academics';
import { usersApi } from '@/lib/api/users';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import type { Batch, BatchMemberDetail } from '@/types/academics.types';
import type { UserListItem } from '@/types/auth.types';
import { cn } from '@/lib/utils/cn';

export default function GroupDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const { canAccess, canWrite } = useAcademicsAccess();

    const [batch, setBatch] = React.useState<Batch | null>(null);
    const [members, setMembers] = React.useState<BatchMemberDetail[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');

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
        } catch (err) {
            setError(handleApiError(err));
            toast.error('Failed to load group details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    React.useEffect(() => { fetchData(); }, [fetchData]);

    // Search students for bulk add
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
                    <div className="flex items-center gap-3 mt-1">
                        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{batch.name}</h1>
                            <div className="flex items-center gap-2 mt-0.5">
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
                        <Dialog open={addOpen} onOpenChange={setAddOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2 font-bold shadow-sm">
                                    <UserPlus className="h-4 w-4" />
                                    Enroll Students
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px]">
                                <DialogHeader>
                                    <DialogTitle>Enroll Students</DialogTitle>
                                    <DialogDescription>
                                        Search and select students to add to {batch.name}.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                        <Input
                                            placeholder="Search by name, email or student ID..."
                                            className="pl-9"
                                            value={studentSearch}
                                            onChange={(e) => setStudentSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto space-y-2 rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
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
                                                            "flex items-center justify-between p-3 rounded-lg border transition-all",
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
                                                {studentSearch ? 'No students found' : 'Start typing to search students'}
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
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
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
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Stats / Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
                        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-900">
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">Group Metadata</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-4">
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase">Degree Level</span>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-semibold text-xs border-primary/20 bg-primary/5 text-primary">
                                        Undergraduate
                                    </Badge>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase">Commencement</span>
                                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                                    <Calendar className="h-4 w-4 text-zinc-400" />
                                    <span className="text-sm font-semibold">{batch.start_year}</span>
                                </div>
                            </div>
                            <div className="space-y-1 border-t border-zinc-100 dark:border-zinc-900 pt-4">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase">Member Count</span>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="text-3xl font-black text-zinc-900 dark:text-zinc-100">{members.length}</span>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-tighter">Students</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Quick Access Card */}
                    <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-zinc-900 text-white">
                        <CardContent className="p-5">
                            <h3 className="font-bold text-sm mb-1 text-zinc-400">ADMIN CONTROLS</h3>
                            <p className="text-xs text-zinc-500 mb-4 font-medium leading-relaxed">
                                Detailed student synchronization and bulk operations are restricted.
                            </p>
                            <Button variant="secondary" className="w-full text-xs font-bold h-9 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors gap-2">
                                <Search className="h-3 w-3" /> Find Records
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content: Member Table */}
                <div className="lg:col-span-3">
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
                </div>
            </div>
        </div>
    );
}
