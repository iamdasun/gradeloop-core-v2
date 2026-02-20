import { Skeleton } from "@/components/ui/skeleton"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export function RolesTableSkeleton() {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Role Name</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell>
                                <Skeleton className="h-6 w-[150px]" />
                            </TableCell>
                            <TableCell>
                                <div className="flex gap-2">
                                    <Skeleton className="h-5 w-[100px]" />
                                    <Skeleton className="h-5 w-[80px]" />
                                </div>
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
