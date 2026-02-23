"use client";

import * as React from "react";
import { ProfileCard } from "@/components/profile/profile-card";
import { profileApi } from "@/lib/api/profile";
import { useAuthStore } from "@/lib/stores/authStore";
import { Loader2, AlertCircle } from "lucide-react";
import type { UserProfile } from "@/types/profile";

export default function ProfilePage() {
    const [profile, setProfile] = React.useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const { user, isHydrated } = useAuthStore();

    React.useEffect(() => {
        async function fetchProfile() {
            if (!isHydrated) return;

            try {
                setIsLoading(true);
                const data = await profileApi.getProfile();
                setProfile(data);
                setError(null);
            } catch (err: any) {
                console.error("Failed to fetch profile:", err);
                setError(err.response?.data?.message || "Failed to load profile data. Please try again later.");
            } finally {
                setIsLoading(false);
            }
        }

        fetchProfile();
    }, [isHydrated]);

    if (!isHydrated || isLoading) {
        return (
            <div className="flex h-[70vh] w-full flex-col items-center justify-center space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-zinc-500 animate-pulse">
                    Loading your profile...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-auto max-w-2xl pt-12">
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/30 dark:bg-red-900/10">
                    <div className="flex items-center gap-3 text-red-800 dark:text-red-400">
                        <AlertCircle className="h-5 w-5" />
                        <h3 className="font-semibold">Error Loading Profile</h3>
                    </div>
                    <p className="mt-2 text-sm text-red-700 dark:text-red-300">
                        {error}
                    </p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return null;
    }

    return (
        <div className="pb-20">
            <ProfileCard initialData={profile} />
        </div>
    );
}
