/**
 * Keystroke service API client.
 *
 * The keystroke service lives behind the API gateway at
 * /api/keystroke/… (NOT under /api/v1). We derive the gateway root
 * from NEXT_PUBLIC_GATEWAY_URL or strip the /api/v1 suffix from the
 * shared NEXT_PUBLIC_API_URL.
 */

const GATEWAY_URL = (() => {
    const raw =
        process.env.NEXT_PUBLIC_GATEWAY_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://traefik:8000";
    // Strip trailing "/api/v1" or "/api/v1/" if present
    return raw.replace(/\/api\/v1\/?$/, "");
})();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrollmentProgress {
    success: boolean;
    user_id: string;
    enrollment_complete: boolean;
    phases_complete?: string[];
    phases_remaining?: string[];
    total_sessions?: number;
    started_at?: string | null;
    completed_at?: string | null;
    database_enabled?: boolean;
    message?: string;
}

export interface RawKeystrokeEvent {
    userId: string;
    sessionId: string;
    timestamp: number;
    key: string;
    dwellTime: number;   // ms key was held down
    flightTime: number;  // ms from previous keyup to this keydown
    keyCode: number;
}

export interface EnrollPhaseRequest {
    userId: string;
    phase: string;
    keystrokeEvents: RawKeystrokeEvent[];
    metadata?: Record<string, unknown>;
}

export interface EnrollPhaseResponse {
    success: boolean;
    user_id: string;
    phase: string;
    sequences_created: number;
    enrollment_complete: boolean;
    message?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string | null> {
    // Lazily import to avoid circular deps
    const { useAuthStore } = await import("@/lib/stores/authStore");
    return useAuthStore.getState().accessToken;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const keystrokeApi = {
    /**
     * GET /api/keystroke/enroll/progress/{userId}
     * Returns enrollment status for the given user.
     */
    getEnrollmentProgress: async (userId: string): Promise<EnrollmentProgress> => {
        const token = await getAccessToken();

        const res = await fetch(
            `${GATEWAY_URL}/api/keystroke/enroll/progress/${encodeURIComponent(userId)}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            }
        );

        if (!res.ok) {
            throw new Error(`Keystroke service returned ${res.status}`);
        }

        return res.json() as Promise<EnrollmentProgress>;
    },

    /**
     * POST /api/keystroke/enroll/phase
     * Submit keystroke events for one enrollment phase.
     * Needs at least 150 events.
     */
    enrollPhase: async (payload: EnrollPhaseRequest): Promise<EnrollPhaseResponse> => {
        const token = await getAccessToken();

        const res = await fetch(`${GATEWAY_URL}/api/keystroke/enroll/phase`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => res.status.toString());
            throw new Error(detail);
        }

        return res.json() as Promise<EnrollPhaseResponse>;
    },
};
