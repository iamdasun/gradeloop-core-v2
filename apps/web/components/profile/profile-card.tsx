"use client";

import * as React from "react";
import {
  User as UserIcon,
  Mail,
  ShieldCheck,
  School,
  Building2,
  Hash,
  Briefcase,
} from "lucide-react";
import { AvatarUpload } from "./avatar-upload";
import { ProfileField } from "./profile-field";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { UserProfile } from "@/types/profile";

interface ProfileCardProps {
  initialData: UserProfile;
}

export function ProfileCard({ initialData }: ProfileCardProps) {
  const [profile, setProfile] = React.useState<UserProfile>(initialData);

  const handleAvatarSuccess = (newUrl: string) => {
    setProfile((prev) => ({ ...prev, avatar_url: newUrl }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <AvatarUpload
          currentAvatar={profile.avatar_url}
          name={profile.full_name || profile.email}
          onSuccess={handleAvatarSuccess}
        />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {profile.full_name || profile.email}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium capitalize">
            {profile.role_name} •{" "}
            {profile.user_type === "employee" ? profile.designation : "Student"}
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-zinc-200/60 shadow-xl shadow-zinc-200/20 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:shadow-none backdrop-blur-sm">
        <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-indigo-600 rounded-full" />
            <div>
              <CardTitle className="text-lg">Personal Information</CardTitle>
              <CardDescription>
                Basic account details retrieved from IAM service
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="grid gap-8 md:grid-cols-2">
            <ProfileField
              label="Full Name"
              value={profile.full_name}
              icon={UserIcon}
            />
            <ProfileField
              label="Email Address"
              value={profile.email}
              icon={Mail}
            />
            <ProfileField
              label="Account Role"
              value={profile.role_name}
              icon={ShieldCheck}
            />
          </div>

          <Separator className="my-10 bg-zinc-100 dark:bg-zinc-800" />

          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-1 bg-purple-600 rounded-full" />
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Academic & Professional
            </h3>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <ProfileField
              label="Faculty"
              value={profile.faculty}
              icon={School}
            />
            <ProfileField
              label="Department"
              value={profile.department}
              icon={Building2}
            />

            {profile.user_type === "student" ? (
              <ProfileField
                label="Student ID"
                value={profile.student_id}
                icon={Hash}
              />
            ) : (
              <ProfileField
                label="Designation"
                value={profile.designation}
                icon={Briefcase}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-amber-200/50 bg-amber-50/30 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
        <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed text-center">
          <strong>Note:</strong> Some profile details are managed by the
          administration. To update your name, role, or faculty information,
          please contact the Registrar's Office or Human Resources department.
        </p>
      </div>
    </div>
  );
}
