"use client";

import * as React from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { profileApi } from "@/lib/api/profile";
import { cn } from "@/lib/utils";

interface AvatarUploadProps {
    currentAvatar?: string;
    name: string;
    onSuccess?: (newUrl: string) => void;
}

export function AvatarUpload({ currentAvatar, name, onSuccess }: AvatarUploadProps) {
    const [isUploading, setIsUploading] = React.useState(false);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .substring(0, 2);
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Client-side validation
        if (!file.type.startsWith("image/")) {
            alert("Please upload an image file.");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            alert("File size must be less than 2MB.");
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);

        // Upload
        try {
            setIsUploading(true);
            const response = await profileApi.updateAvatar(file);
            onSuccess?.(response.avatar_url);
            setPreviewUrl(null); // Clear preview once persisted if needed, or keep it.
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Failed to upload avatar. Please try again.");
            setPreviewUrl(null);
        } finally {
            setIsUploading(false);
        }
    };

    const triggerUpload = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="group relative flex flex-col items-center">
            <div className="relative">
                <Avatar className="h-32 w-32 border-4 border-white shadow-xl ring-1 ring-zinc-200 dark:border-zinc-800 dark:ring-zinc-700">
                    <AvatarImage src={previewUrl || currentAvatar} alt={name} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-semibold text-white">
                        {getInitials(name)}
                    </AvatarFallback>
                </Avatar>

                <button
                    onClick={triggerUpload}
                    disabled={isUploading}
                    className={cn(
                        "absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-zinc-900 text-white shadow-lg transition-all hover:scale-110 active:scale-95 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-100 dark:text-zinc-900",
                        isUploading && "animate-pulse"
                    )}
                >
                    {isUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <Camera className="h-5 w-5" />
                    )}
                </button>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />

            <div className="mt-4 text-center">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {isUploading ? "Uploading..." : "Click the camera to update photo"}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    JPG, PNG or SVG. Max 2MB.
                </p>
            </div>
        </div>
    );
}
