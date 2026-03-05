"use client";

import * as React from "react";
import { Mic2, Loader2, CheckCircle2, XCircle, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import type { ProviderInfo } from "@/types/ivas";

interface ProviderHealth {
    status: string;
    provider: string;
    reachable: boolean;
}

export default function IvasSettingsPage() {
    const [providerInfo, setProviderInfo] = React.useState<ProviderInfo | null>(null);
    const [health, setHealth] = React.useState<ProviderHealth | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [switching, setSwitching] = React.useState<string | null>(null);
    const [checkingHealth, setCheckingHealth] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 4000);
    };

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [info, healthData] = await Promise.allSettled([
                ivasApi.getProvider(),
                ivasApi.getProviderHealth(),
            ]);
            if (info.status === "fulfilled") setProviderInfo(info.value);
            if (healthData.status === "fulfilled") setHealth(healthData.value);
        } catch {
            setError("Failed to load provider information.");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadData();
    }, []);

    const handleSwitch = async (provider: string) => {
        try {
            setSwitching(provider);
            setError(null);
            const result = await ivasApi.switchProvider(provider);
            setProviderInfo((prev) =>
                prev
                    ? { ...prev, active_provider: result.active_provider }
                    : prev
            );
            showSuccess(`Switched to ${result.active_provider} successfully.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to switch provider.");
        } finally {
            setSwitching(null);
        }
    };

    const handleCheckHealth = async () => {
        try {
            setCheckingHealth(true);
            const result = await ivasApi.getProviderHealth();
            setHealth(result);
        } catch {
            setHealth({ status: "error", provider: providerInfo?.active_provider ?? "unknown", reachable: false });
        } finally {
            setCheckingHealth(false);
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-8">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/40 pb-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mic2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">IVAS Settings</h1>
                    <p className="text-sm text-muted-foreground">
                        Configure the AI provider powering IVAS oral assessments.
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}
            {successMsg && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                    {successMsg}
                </div>
            )}

            {/* Health status */}
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-5 py-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        loading || checkingHealth
                            ? "bg-amber-400 animate-pulse"
                            : health?.reachable
                                ? "bg-emerald-500"
                                : "bg-red-500"
                    )} />
                    <div>
                        <p className="text-sm font-medium">
                            {loading ? (
                                <Skeleton className="h-4 w-32" />
                            ) : health?.reachable ? (
                                "Connected"
                            ) : (
                                "Offline"
                            )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {loading ? <Skeleton className="h-3 w-24 mt-1" /> : `Provider: ${health?.provider ?? "—"}`}
                        </p>
                    </div>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCheckHealth}
                    disabled={checkingHealth || loading}
                >
                    {checkingHealth ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Check health
                </Button>
            </div>

            {/* Provider selection */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-base font-semibold">LLM Provider</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Select the language model backend for IVAS assessments. Changes take effect immediately.
                    </p>
                </div>

                {loading ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-24 rounded-xl" />
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {(providerInfo?.supported_providers ?? []).map((provider) => {
                            const isActive = provider === providerInfo?.active_provider;
                            const isSwitching = switching === provider;
                            return (
                                <button
                                    key={provider}
                                    onClick={() => !isActive && handleSwitch(provider)}
                                    disabled={isActive || !!switching}
                                    className={cn(
                                        "relative flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                                        isActive
                                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                            : "border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30",
                                        !!switching && !isSwitching && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isActive && (
                                        <span className="absolute top-3 right-3">
                                            <CheckCircle2 className="h-4 w-4 text-primary" />
                                        </span>
                                    )}
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={cn(
                                            "h-8 w-8 rounded-lg flex items-center justify-center",
                                            isActive ? "bg-primary/10" : "bg-muted",
                                        )}>
                                            <Zap className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                                        </div>
                                        {isSwitching && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                    </div>
                                    <p className={cn("text-sm font-semibold capitalize", isActive ? "text-primary" : "")}>
                                        {provider}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {isActive ? "Currently active" : "Click to activate"}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
