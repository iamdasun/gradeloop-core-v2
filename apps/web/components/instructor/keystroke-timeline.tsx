"use client";

import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    ShieldAlert,
    User,
    Wifi,
    WifiOff,
    Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
    offset_seconds: number;
    similarity_score: number;
    risk_score: number;
    authenticated: boolean;
    is_anomaly: boolean;
    anomaly_type?: string;
    is_struggling: boolean;
    created_at?: string;
}

interface TimelineStats {
    total_events: number;
    anomaly_count: number;
    avg_risk_score: number;
    avg_similarity: number;
    struggle_count: number;
}

interface KeystrokeTimelineProps {
    userId: string;
    sessionId: string;
    assignmentId?: string;
    /** Override WebSocket gateway URL (defaults to NEXT_PUBLIC_WS_URL or localhost:8000) */
    wsUrl?: string;
    /** Override REST API base URL (defaults to NEXT_PUBLIC_API_URL or localhost:8000) */
    apiUrl?: string;
    className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventColor(event: TimelineEvent): string {
    if (event.is_anomaly) return "bg-red-500";
    if (event.is_struggling) return "bg-yellow-400";
    if (!event.authenticated) return "bg-orange-400";
    return "bg-emerald-500";
}

function getEventLabel(event: TimelineEvent): string {
    if (event.is_anomaly) return event.anomaly_type ?? "Anomaly";
    if (event.is_struggling) return "Struggling";
    if (!event.authenticated) return "Unverified";
    return "Authenticated";
}

function formatSeconds(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeStats(events: TimelineEvent[]): TimelineStats {
    if (events.length === 0) {
        return { total_events: 0, anomaly_count: 0, avg_risk_score: 0, avg_similarity: 0, struggle_count: 0 };
    }
    return {
        total_events: events.length,
        anomaly_count: events.filter((e) => e.is_anomaly).length,
        avg_risk_score: events.reduce((a, e) => a + e.risk_score, 0) / events.length,
        avg_similarity: events.reduce((a, e) => a + e.similarity_score, 0) / events.length,
        struggle_count: events.filter((e) => e.is_struggling).length,
    };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
    label,
    value,
    variant = "default",
}: {
    label: string;
    value: React.ReactNode;
    variant?: "default" | "danger" | "warning" | "success";
}) {
    const colors: Record<typeof variant, string> = {
        default: "bg-muted text-muted-foreground",
        danger: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
        warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
        success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    };
    return (
        <div className={cn("rounded-lg px-3 py-2 text-center", colors[variant])}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
            <p className="text-lg font-black tabular-nums">{value}</p>
        </div>
    );
}

function EventDot({ event, index }: { event: TimelineEvent; index: number }) {
    return (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        className={cn(
                            "relative flex-shrink-0 w-3 h-3 rounded-full cursor-pointer",
                            "ring-2 ring-background hover:scale-150 transition-transform duration-100",
                            getEventColor(event),
                            event.is_anomaly && "animate-pulse"
                        )}
                        style={{ marginTop: event.is_anomaly ? "-2px" : "0" }}
                    />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                    <div className="space-y-0.5">
                        <p className="font-semibold">{getEventLabel(event)}</p>
                        <p className="text-muted-foreground">@ {formatSeconds(event.offset_seconds)}</p>
                        <p>Risk: {(event.risk_score * 100).toFixed(0)}%</p>
                        <p>Similarity: {(event.similarity_score * 100).toFixed(0)}%</p>
                        {event.anomaly_type && <p className="text-red-500">⚠ {event.anomaly_type}</p>}
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function KeystrokeTimeline({
    userId,
    sessionId,
    assignmentId,
    wsUrl,
    apiUrl,
    className,
}: KeystrokeTimelineProps) {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [liveRisk, setLiveRisk] = useState<number | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const scrollEndRef = useRef<HTMLDivElement | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resolvedApiBase =
        apiUrl ??
            process.env.NEXT_PUBLIC_API_URL ??
            "http://traefik:8000";

    const resolvedWsBase =
        wsUrl ??
        (process.env.NEXT_PUBLIC_WS_URL
            ? process.env.NEXT_PUBLIC_WS_URL
            : resolvedApiBase.replace(/^http/, "ws"));

    // ── Load historical timeline ──────────────────────────────────────────────
    const fetchHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`${resolvedApiBase}/api/keystroke/timeline/${sessionId}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setEvents(data.events ?? []);
        } catch {
            // History fetch failure is non-fatal; live WS will populate events
        } finally {
            setIsLoadingHistory(false);
        }
    }, [resolvedApiBase, sessionId]);

    // ── WebSocket connection ──────────────────────────────────────────────────
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const url = `${resolvedWsBase}/ws/monitor/${userId}/${sessionId}`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => setWsStatus("connected");
        ws.onclose = () => {
            setWsStatus("disconnected");
            // Reconnect after 5 s if component still mounted
            reconnectTimerRef.current = setTimeout(connectWs, 5000);
        };
        ws.onerror = () => ws.close();

        ws.onmessage = (msg) => {
            try {
                const payload = JSON.parse(msg.data as string);

                if (payload.type === "history") {
                    setEvents(payload.events ?? []);
                    return;
                }

                if (payload.type === "auth_update" || payload.risk_score !== undefined) {
                    setLiveRisk(payload.risk_score ?? null);

                    // If server echoes a full event, append it
                    if (payload.offset_seconds !== undefined) {
                        setEvents((prev) => {
                            // Deduplicate by offset + session
                            const exists = prev.some(
                                (e) => e.offset_seconds === payload.offset_seconds
                            );
                            return exists ? prev : [...prev, payload as TimelineEvent];
                        });
                    }
                }
            } catch {
                // non-JSON frames are ignored
            }
        };
    }, [resolvedWsBase, userId, sessionId]);

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        fetchHistory();
        connectWs();

        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            wsRef.current?.close();
        };
    }, [fetchHistory, connectWs]);

    // Auto-scroll timeline to latest event
    useEffect(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
    }, [events.length]);

    // ── Derived state ─────────────────────────────────────────────────────────
    const stats = computeStats(events);
    const lastEvent = events[events.length - 1];
    const sessionDuration = lastEvent ? lastEvent.offset_seconds : 0;
    const riskPercent = liveRisk !== null ? liveRisk : stats.avg_risk_score;

    const overallStatus: "safe" | "warning" | "danger" =
        riskPercent > 0.6 ? "danger" : riskPercent > 0.3 ? "warning" : "safe";

    const statusMeta = {
        safe: { label: "Low Risk", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
        warning: { label: "Suspicious", icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400" },
        danger: { label: "High Risk", icon: ShieldAlert, color: "text-red-600 dark:text-red-400" },
    }[overallStatus];

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Card className={cn("border-border/60 shadow-sm", className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Keystroke Timeline
                    </CardTitle>

                    <div className="flex items-center gap-2">
                        {/* Live risk badge */}
                        {liveRisk !== null && (
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-xs tabular-nums",
                                    liveRisk > 0.6
                                        ? "border-red-500 text-red-500"
                                        : liveRisk > 0.3
                                        ? "border-yellow-500 text-yellow-500"
                                        : "border-emerald-500 text-emerald-500"
                                )}
                            >
                                <span className="mr-1 h-2 w-2 rounded-full bg-current inline-block animate-pulse" />
                                Live Risk: {(liveRisk * 100).toFixed(0)}%
                            </Badge>
                        )}

                        {/* Overall status */}
                        <Badge
                            variant="outline"
                            className={cn("text-xs", statusMeta.color)}
                        >
                            <statusMeta.icon className="h-3 w-3 mr-1" />
                            {statusMeta.label}
                        </Badge>

                        {/* WebSocket connection indicator */}
                        <span
                            className={cn(
                                "flex items-center gap-1 text-xs",
                                wsStatus === "connected"
                                    ? "text-emerald-500"
                                    : wsStatus === "connecting"
                                    ? "text-yellow-500"
                                    : "text-muted-foreground"
                            )}
                        >
                            {wsStatus === "connected" ? (
                                <Wifi className="h-3 w-3" />
                            ) : wsStatus === "connecting" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <WifiOff className="h-3 w-3" />
                            )}
                            {wsStatus}
                        </span>
                    </div>
                </div>

                {/* Metadata row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {userId}
                    </span>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatSeconds(sessionDuration)}
                    </span>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <StatPill label="Events" value={stats.total_events} />
                    <StatPill
                        label="Anomalies"
                        value={stats.anomaly_count}
                        variant={stats.anomaly_count > 0 ? "danger" : "success"}
                    />
                    <StatPill
                        label="Avg Risk"
                        value={`${(stats.avg_risk_score * 100).toFixed(0)}%`}
                        variant={stats.avg_risk_score > 0.6 ? "danger" : stats.avg_risk_score > 0.3 ? "warning" : "success"}
                    />
                    <StatPill
                        label="Avg Similarity"
                        value={`${(stats.avg_similarity * 100).toFixed(0)}%`}
                        variant={stats.avg_similarity < 0.4 ? "danger" : stats.avg_similarity < 0.6 ? "warning" : "success"}
                    />
                </div>

                {/* Timeline track */}
                <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Event Timeline
                    </p>

                    {isLoadingHistory ? (
                        <div className="h-10 flex items-center justify-center text-muted-foreground text-sm gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading history...
                        </div>
                    ) : events.length === 0 ? (
                        <div className="h-10 flex items-center justify-center text-muted-foreground text-sm">
                            No events yet — waiting for keystroke data
                        </div>
                    ) : (
                        <ScrollArea className="w-full">
                            <div className="flex items-center gap-1 px-1 py-3 min-w-max">
                                {/* Start cap */}
                                <div className="flex-shrink-0 w-2 h-0.5 bg-border rounded-full" />

                                {events.map((event, i) => (
                                    <React.Fragment key={`${event.offset_seconds}-${i}`}>
                                        <EventDot event={event} index={i} />
                                        <div className="flex-shrink-0 w-4 h-0.5 bg-border rounded-full" />
                                    </React.Fragment>
                                ))}

                                {/* Live indicator */}
                                {wsStatus === "connected" && (
                                    <div className="flex-shrink-0 w-3 h-3 rounded-full bg-primary animate-pulse" />
                                )}

                                {/* End cap */}
                                <div className="flex-shrink-0 w-2 h-0.5 bg-border rounded-full" />
                                <div ref={scrollEndRef} />
                            </div>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1 border-t border-border/40">
                    {[
                        { color: "bg-emerald-500", label: "Authenticated" },
                        { color: "bg-yellow-400", label: "Struggling" },
                        { color: "bg-orange-400", label: "Unverified" },
                        { color: "bg-red-500", label: "Anomaly" },
                    ].map(({ color, label }) => (
                        <span key={label} className="flex items-center gap-1.5">
                            <span className={cn("inline-block w-2.5 h-2.5 rounded-full", color)} />
                            {label}
                        </span>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
