import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-[200px]" />
                    <Skeleton className="h-4 w-[300px]" />
                </div>
                <Skeleton className="h-10 w-[120px]" />
            </div>
            <Skeleton className="h-[1px] w-full my-4" />
            <div className="space-y-4">
                <Skeleton className="h-[400px] w-full rounded-md" />
            </div>
        </div>
    )
}
