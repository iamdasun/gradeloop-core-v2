"use client";

import * as React from "react";
import {
    Bell,
    Lock,
    Palette,
    Globe,
    Mail,
    Smartphone,
    Monitor,
    Moon,
    Sun,
    Eye,
    EyeOff,
    Save,
    User,
    Settings2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/instructor/section-header";
import { Badge } from "@/components/ui/badge";

function SettingsSection({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="border-border/60 bg-background">
            <CardContent className="p-6">
                <div className="flex items-start gap-3 mb-5">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <Icon className="h-4.5 w-4.5 text-primary h-[18px] w-[18px]" />
                    </div>
                    <div>
                        <h3 className="font-bold font-heading text-base leading-tight">{title}</h3>
                        {description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
                {children}
            </CardContent>
        </Card>
    );
}

function SettingsRow({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-6 py-3 border-b border-border/40 last:border-0">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

export default function InstructorSettingsPage() {
    const [showPassword, setShowPassword] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    const handleSave = async () => {
        setSaving(true);
        await new Promise((r) => setTimeout(r, 900));
        setSaving(false);
    };

    return (
        <div className="flex flex-col gap-8 pb-8 max-w-3xl">
            <SectionHeader
                title="Settings"
                description="Manage your account preferences, notifications, and security."
                action={
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent inline-block" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Save Changes
                            </>
                        )}
                    </Button>
                }
            />

            {/* Profile */}
            <SettingsSection
                icon={User}
                title="Profile"
                description="Update your display name and contact information."
            >
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input id="firstName" placeholder="John" defaultValue="" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input id="lastName" placeholder="Doe" defaultValue="" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="displayEmail">Email Address</Label>
                        <Input
                            id="displayEmail"
                            type="email"
                            placeholder="you@example.com"
                            defaultValue=""
                            disabled
                        />
                        <p className="text-xs text-muted-foreground">
                            Email changes are managed by your administrator.
                        </p>
                    </div>
                </div>
            </SettingsSection>

            {/* Notifications */}
            <SettingsSection
                icon={Bell}
                title="Notifications"
                description="Control which events trigger email and in-app alerts."
            >
                <SettingsRow
                    label="New submission received"
                    description="Get notified when a student submits an assignment."
                >
                    <Switch defaultChecked />
                </SettingsRow>
                <SettingsRow
                    label="Submission deadline approaching"
                    description="Reminder 24 hours before a deadline closes."
                >
                    <Switch defaultChecked />
                </SettingsRow>
                <SettingsRow
                    label="CIPAS analysis complete"
                    description="Alert when plagiarism/similarity analysis finishes."
                >
                    <Switch />
                </SettingsRow>
                <SettingsRow
                    label="Grade published to student"
                    description="Confirmation when a grade is released."
                >
                    <Switch defaultChecked />
                </SettingsRow>
                <SettingsRow
                    label="Weekly digest"
                    description="Weekly summary of course activity sent every Monday."
                >
                    <Switch />
                </SettingsRow>
            </SettingsSection>

            {/* Appearance */}
            <SettingsSection
                icon={Palette}
                title="Appearance"
                description="Customize the visual style of the interface."
            >
                <SettingsRow label="Theme" description="Choose your preferred color scheme.">
                    <Select defaultValue="system">
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="light">
                                <span className="flex items-center gap-2">
                                    <Sun className="h-4 w-4" /> Light
                                </span>
                            </SelectItem>
                            <SelectItem value="dark">
                                <span className="flex items-center gap-2">
                                    <Moon className="h-4 w-4" /> Dark
                                </span>
                            </SelectItem>
                            <SelectItem value="system">
                                <span className="flex items-center gap-2">
                                    <Monitor className="h-4 w-4" /> System
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </SettingsRow>
                <SettingsRow label="Language" description="Interface display language.">
                    <Select defaultValue="en">
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="ar">Arabic</SelectItem>
                            <SelectItem value="fr">French</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingsRow>
                <SettingsRow
                    label="Compact view"
                    description="Reduce table row height and card padding."
                >
                    <Switch />
                </SettingsRow>
            </SettingsSection>

            {/* Security */}
            <SettingsSection
                icon={Lock}
                title="Security"
                description="Manage your password and session settings."
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                            <Input
                                id="currentPassword"
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                className="pr-10"
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowPassword((v) => !v)}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input id="newPassword" type="password" placeholder="••••••••" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input id="confirmPassword" type="password" placeholder="••••••••" />
                        </div>
                    </div>
                    <Separator />
                    <SettingsRow
                        label="Two-factor authentication"
                        description="Require a verification code on each sign-in."
                    >
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                                Coming soon
                            </Badge>
                            <Switch disabled />
                        </div>
                    </SettingsRow>
                    <SettingsRow
                        label="Active sessions"
                        description="Sign out of all other devices."
                    >
                        <Button variant="outline" size="sm" disabled>
                            Revoke All
                        </Button>
                    </SettingsRow>
                </div>
            </SettingsSection>

            {/* Integrations placeholder */}
            <SettingsSection
                icon={Settings2}
                title="Integrations"
                description="Connect third-party tools and services."
            >
                <div className="text-sm text-muted-foreground text-center py-6">
                    No integrations configured. Available integrations will appear here.
                </div>
            </SettingsSection>
        </div>
    );
}
