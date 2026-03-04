'use client';

import * as React from 'react';
import {
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    Download,
    ArrowRight,
    Check,
    Loader2,
    Table as TableIcon,
} from 'lucide-react';
import {
    SideDialog as Dialog,
    SideDialogContent as DialogContent,
    SideDialogDescription as DialogDescription,
    SideDialogHeader as DialogHeader,
    SideDialogTitle as DialogTitle,
} from '@/components/ui/side-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import type {
    BulkImportPreviewResponse,
    BulkImportExecuteResponse,
    BulkImportUserRow,
} from '@/types/admin.types';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

type Step = 'upload' | 'preview' | 'result';

export function BulkImportDialog({ open, onOpenChange, onSuccess }: Props) {
    const [step, setStep] = React.useState<Step>('upload');
    const [file, setFile] = React.useState<File | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [preview, setPreview] = React.useState<BulkImportPreviewResponse | null>(null);
    const [result, setResult] = React.useState<BulkImportExecuteResponse | null>(null);

    React.useEffect(() => {
        if (open) {
            setStep('upload');
            setFile(null);
            setPreview(null);
            setResult(null);
        }
    }, [open]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setLoading(true);
        try {
            const resp = await usersApi.importPreview(selectedFile);
            setPreview(resp);
            setStep('preview');
        } catch (err) {
            toast.error('Failed to parse file', handleApiError(err));
            setFile(null);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!preview || !file) return;

        setLoading(true);
        try {
            const resp = await usersApi.importExecute(file, preview.column_mapping);
            setResult(resp);
            setStep('result');
            toast.success('Import completed', `Successfully imported ${resp.success_count} users.`);
            onSuccess();
        } catch (err) {
            toast.error('Failed to execute import', handleApiError(err));
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = (format: 'csv' | 'xlsx') => {
        usersApi.importTemplate(format);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
                <DialogHeader className="pb-2">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <Upload className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                            <DialogTitle>Bulk User Import</DialogTitle>
                            <DialogDescription>
                                Import multiple users at once using a CSV or Excel file.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    {step === 'upload' && (
                        <div className="pt-2 space-y-6">
                            <div
                                className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer relative"
                                onClick={() => document.getElementById('file-upload')?.click()}
                            >
                                <input
                                    id="file-upload"
                                    type="file"
                                    className="hidden"
                                    accept=".csv,.xlsx"
                                    onChange={handleFileChange}
                                />
                                <div className="h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                    {loading ? (
                                        <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
                                    ) : (
                                        <Upload className="h-6 w-6 text-zinc-400" />
                                    )}
                                </div>
                                <div>
                                    <p className="font-medium text-zinc-900 dark:text-zinc-50">
                                        Click to upload or drag and drop
                                    </p>
                                    <p className="text-sm text-zinc-500">CSV or XLSX (max 5,000 rows)</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                    Don't have a file? Download our template
                                </p>
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => downloadTemplate('xlsx')}
                                    >
                                        <Download className="h-4 w-4" />
                                        Excel Template (.xlsx)
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => downloadTemplate('csv')}
                                    >
                                        <Download className="h-4 w-4" />
                                        CSV Template (.csv)
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && preview && (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                <div className="flex gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-zinc-500 uppercase font-semibold">Total Rows</span>
                                        <span className="text-lg font-bold">{preview.total_rows}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-zinc-500 uppercase font-semibold">Valid</span>
                                        <span className="text-lg font-bold text-green-600">{preview.valid_rows}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-zinc-500 uppercase font-semibold">Invalid</span>
                                        <span className="text-lg font-bold text-red-600">{preview.invalid_rows}</span>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={() => setStep('upload')}>
                                        Back
                                    </Button>
                                    <Button onClick={handleImport} disabled={preview.valid_rows === 0 || loading}>
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Importing...
                                            </>
                                        ) : (
                                            <>
                                                Import {preview.valid_rows} Users
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <ScrollArea className="flex-1">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/50">
                                            <TableHead className="w-12">#</TableHead>
                                            <TableHead className="min-w-[150px]">Full Name</TableHead>
                                            <TableHead className="min-w-[150px]">Email</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {preview.rows.map((row) => (
                                            <TableRow key={row.row_index} className={row.is_valid ? '' : 'bg-red-50/30 dark:bg-red-900/10'}>
                                                <TableCell className="text-zinc-500 text-xs">{row.row_index}</TableCell>
                                                <TableCell className="font-medium text-sm">{row.data.full_name}</TableCell>
                                                <TableCell className="text-sm">{row.data.email}</TableCell>
                                                <TableCell className="text-sm">{row.data.role}</TableCell>
                                                <TableCell className="text-sm capitalize">{row.data.user_type}</TableCell>
                                                <TableCell>
                                                    {row.is_valid ? (
                                                        <Badge variant="success" className="gap-1">
                                                            <Check className="h-3 w-3" />
                                                            Ready
                                                        </Badge>
                                                    ) : (
                                                        <div className="flex flex-col gap-1">
                                                            <Badge variant="destructive" className="gap-1">
                                                                <AlertCircle className="h-3 w-3" />
                                                                Error
                                                            </Badge>
                                                            {row.errors?.map((err, idx) => (
                                                                <span key={idx} className="text-[10px] text-red-600 dark:text-red-400">
                                                                    {err}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </div>
                    )}

                    {step === 'result' && result && (
                        <div className="p-12 flex flex-col items-center justify-center text-center space-y-6">
                            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                                    Import Completed Successfully
                                </h3>
                                <p className="text-zinc-500 max-w-md mx-auto">
                                    We've finished processing your file. Below is a summary of the operation.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-8 w-full max-w-sm border border-zinc-100 dark:border-zinc-800 rounded-xl p-6 bg-zinc-50/50 dark:bg-zinc-900/50">
                                <div className="flex flex-col">
                                    <span className="text-sm text-zinc-500 mb-1">Success</span>
                                    <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                                        {result.success_count}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm text-zinc-500 mb-1">Failed</span>
                                    <span className="text-3xl font-bold text-red-600">
                                        {result.failure_count}
                                    </span>
                                </div>
                            </div>

                            {result.failure_count > 0 && (
                                <div className="w-full max-w-md bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg p-4 text-left">
                                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-2">
                                        <AlertCircle className="h-4 w-4" />
                                        Failed Rows
                                    </div>
                                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1.5 list-disc list-inside">
                                        {result.results.filter(r => !r.success).map((r, i) => (
                                            <li key={i}>
                                                Row {r.row_index} ({r.email}): {r.error}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <Button className="w-full max-w-sm" onClick={() => onOpenChange(false)}>
                                Go Back to Users
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
