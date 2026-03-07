#!/usr/bin/env python3
"""
GradeLoop Test Data Seed Script
================================
Creates a complete set of test data following the correct system flow:

  IAM:
    1. Login as super_admin
    2. Fetch existing roles (admin, employee, student)
    3. Create users:  admin · instructor · student
    4. Activate each user via the reset-password link returned on creation

  Academic:
    5. Create Faculty
    6. Create Department (under faculty)
    7. Create Degree    (under department)
    8. Create Batch     (under degree)
    9. Create Semester
   10. Create Course
   11. Create Course Instance  (course + semester + batch)
   12. Add Student to Batch
   13. Assign Instructor to Course Instance
   14. Enroll Student in Course Instance

  Assessment:
   15. Create Assignment

Usage:
    python scripts/seed_test_data.py [--base-url http://localhost:8000]
"""

import argparse
import json
import sys
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

# ──────────────────────────────────────────────
# ANSI colours
# ──────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def info(msg): print(f"  {BLUE}ℹ{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):  print(f"  {RED}✗{RESET}  {msg}")
def step(n, msg): print(f"\n{BOLD}{BLUE}[{n:02d}]{RESET} {BOLD}{msg}{RESET}")
def section(msg): print(f"\n{BOLD}{YELLOW}{'═'*60}{RESET}\n{BOLD}  {msg}{RESET}\n{BOLD}{YELLOW}{'═'*60}{RESET}")


# ──────────────────────────────────────────────
# Minimal HTTP helpers (stdlib only)
# ──────────────────────────────────────────────

def _request(method: str, url: str, payload: dict | None = None, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(payload).encode() if payload is not None else None
    req  = Request(url, data=body, headers=headers, method=method)

    try:
        with urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except HTTPError as exc:
        raw = exc.read().decode()
        try:
            data = json.loads(raw)
        except Exception:
            data = {"raw": raw}
        raise RuntimeError(
            f"HTTP {exc.code} {exc.reason} → {url}\n  body: {json.dumps(data, indent=2)}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Connection error → {url}: {exc.reason}") from exc


def get(url, token=None):         return _request("GET",    url, token=token)
def post(url, payload, token=None): return _request("POST", url, payload, token=token)


# ──────────────────────────────────────────────
# Token helper
# ──────────────────────────────────────────────

def extract_token_from_link(link: str) -> str:
    """Pull the ?token= query-param out of a reset / activation link."""
    parsed = urlparse(link)
    params = parse_qs(parsed.query)
    tokens = params.get("token", [])
    if tokens:
        return tokens[0]
    # Some implementations put the token at the end of the path
    if parsed.fragment:
        frag_params = parse_qs(parsed.fragment.lstrip("?"))
        tokens = frag_params.get("token", [])
        if tokens:
            return tokens[0]
    raise ValueError(f"Cannot find token in link: {link}")


# ──────────────────────────────────────────────
# Main seeder
# ──────────────────────────────────────────────

def seed(base: str):
    v1 = f"{base}/api/v1"

    # ── state bag ─────────────────────────────
    ids = {}

    # ══════════════════════════════════════════
    section("PHASE 1 — IAM: Users & Roles")
    # ══════════════════════════════════════════

    # ── 01. Super-admin login ─────────────────
    step(1, "Login as super_admin")
    resp = post(f"{v1}/auth/login", {
        "email":    "superadmin@gradeloop.com",
        "password": "Strong#Pass123!",
    })
    token = resp["access_token"]
    ok(f"Logged in — token: {token[:40]}…")

    # ── 02. List roles ────────────────────────
    step(2, "Fetch system roles")
    roles_resp = get(f"{v1}/roles", token=token)

    # Support list, paginated, or {"roles": [...]} shapes
    if isinstance(roles_resp, list):
        roles_list = roles_resp
    else:
        roles_list = (
            roles_resp.get("roles")
            or roles_resp.get("data")
            or roles_resp.get("items")
            or []
        )
    role_map: dict[str, str] = {}
    for r in roles_list:
        role_map[r["name"].lower()] = r["id"]
        info(f"  role '{r['name']}' → {r['id']}")

    required = {"admin", "employee", "student"}
    missing  = required - set(role_map.keys())
    if missing:
        err(f"System roles not found: {missing}. Run the IAM seeder / migrations first.")
        sys.exit(1)

    # ── 03. Create Admin user ─────────────────
    step(3, "Create Admin user  (employee type, 'admin' role)")
    try:
        resp = post(f"{v1}/users", {
            "email":       "admin.test@gradeloop.com",
            "full_name":   "Alice Admin",
            "role_id":     role_map["admin"],
            "user_type":   "employee",
            "designation": "System Administrator",
        }, token=token)
        ids["admin_user_id"] = resp["id"]
        admin_reset_link     = resp.get("reset_link", "")
        ok(f"Admin user created → {ids['admin_user_id']}")
        if admin_reset_link:
            info(f"  reset_link: {admin_reset_link}")
    except RuntimeError as exc:
        if "email" in str(exc).lower() and ("taken" in str(exc).lower() or "exists" in str(exc).lower()):
            warn("Admin user already exists — skipping creation")
            admin_reset_link = ""
        else:
            raise

    # ── 04. Create Instructor user ────────────
    step(4, "Create Instructor user  (employee type, 'employee' role)")
    try:
        resp = post(f"{v1}/users", {
            "email":       "instructor.test@gradeloop.com",
            "full_name":   "Bob Instructor",
            "role_id":     role_map["employee"],
            "user_type":   "employee",
            "designation": "Senior Lecturer",
        }, token=token)
        ids["instructor_user_id"] = resp["id"]
        instructor_reset_link     = resp.get("reset_link", "")
        ok(f"Instructor user created → {ids['instructor_user_id']}")
        if instructor_reset_link:
            info(f"  reset_link: {instructor_reset_link}")
    except RuntimeError as exc:
        if "email" in str(exc).lower() and ("taken" in str(exc).lower() or "exists" in str(exc).lower()):
            warn("Instructor user already exists — skipping creation")
            instructor_reset_link = ""
        else:
            raise

    # ── 05. Create Student user ───────────────
    step(5, "Create Student user  (student type, 'student' role)")
    try:
        resp = post(f"{v1}/users", {
            "email":      "student.test@gradeloop.com",
            "full_name":  "Carol Student",
            "role_id":    role_map["student"],
            "user_type":  "student",
            "student_id": "IT22000001",
        }, token=token)
        ids["student_user_id"] = resp["id"]
        student_reset_link     = resp.get("reset_link", "")
        ok(f"Student user created → {ids['student_user_id']}")
        if student_reset_link:
            info(f"  reset_link: {student_reset_link}")
    except RuntimeError as exc:
        if "email" in str(exc).lower() and ("taken" in str(exc).lower() or "exists" in str(exc).lower()):
            warn("Student user already exists — skipping creation")
            student_reset_link = ""
        else:
            raise

    # ── 06–08. Activate users via reset-password ──
    for label, reset_link, email_key in [
        ("Admin",      admin_reset_link,      "admin.test@gradeloop.com"),
        ("Instructor", instructor_reset_link, "instructor.test@gradeloop.com"),
        ("Student",    student_reset_link,    "student.test@gradeloop.com"),
    ]:
        step_label = f"Activate {label} account"
        step(6 if label == "Admin" else (7 if label == "Instructor" else 8), step_label)

        if not reset_link:
            warn(f"No reset_link available for {label} — account may already be active, skipping")
            continue

        try:
            tok = extract_token_from_link(reset_link)
        except ValueError as exc:
            warn(f"Could not extract token: {exc}")
            continue

        try:
            post(f"{v1}/auth/reset-password", {
                "token":        tok,
                "new_password": "Test@12345!",
            })
            ok(f"{label} account activated — password set to 'Test@12345!'")
        except RuntimeError as exc:
            warn(f"Activation attempt returned error (may already be active): {exc}")

    # Fetch user IDs if they weren't set (users already existed)
    if "admin_user_id" not in ids or "instructor_user_id" not in ids or "student_user_id" not in ids:
        info("Fetching existing user IDs...")
        email_to_key = {
            "admin.test@gradeloop.com":      "admin_user_id",
            "instructor.test@gradeloop.com": "instructor_user_id",
            "student.test@gradeloop.com":    "student_user_id",
        }
        for email, id_key in email_to_key.items():
            if id_key not in ids:
                resp_u = get(f"{v1}/users?search={email}&limit=1", token=token)
                u_list = resp_u.get("users") or resp_u.get("data") or resp_u.get("items") or (resp_u if isinstance(resp_u, list) else [])
                for u in u_list:
                    if u.get("email") == email:
                        ids[id_key] = u["id"]
                        ok(f"Resolved {id_key} → {u['id']}")
                        break

    # ══════════════════════════════════════════
    section("PHASE 2 — Academic Structure")
    # ══════════════════════════════════════════

    # ── 09. Create Faculty ────────────────────
    step(9, "Create Faculty")
    try:
        resp = post(f"{v1}/faculties", {
            "name":        "Faculty of Computing",
            "code":        "FOC-TEST",
            "description": "Faculty of Computing — test seed",
            "leaders": [
                {"user_id": ids["admin_user_id"], "role": "Dean"},
            ],
        }, token=token)
        ids["faculty_id"] = resp["id"]
        ok(f"Faculty created → {ids['faculty_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Faculty already exists — fetching existing ID")
            faculties = get(f"{v1}/faculties", token=token)
            fac_list  = faculties if isinstance(faculties, list) else faculties.get("data", faculties.get("items", []))
            for f in fac_list:
                if f.get("code") == "FOC-TEST":
                    ids["faculty_id"] = f["id"]
                    ok(f"Found existing faculty → {ids['faculty_id']}")
                    break
            if "faculty_id" not in ids:
                raise
        else:
            raise

    # ── 10. Create Department ─────────────────
    step(10, "Create Department")
    try:
        resp = post(f"{v1}/departments", {
            "faculty_id":  ids["faculty_id"],
            "name":        "Department of Computer Science",
            "code":        "DCS-TEST",
            "description": "Computer Science department — test seed",
        }, token=token)
        ids["department_id"] = resp["id"]
        ok(f"Department created → {ids['department_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Department already exists — fetching existing ID")
            depts = get(f"{v1}/departments?faculty_id={ids['faculty_id']}", token=token)
            dept_list = depts if isinstance(depts, list) else depts.get("data", depts.get("items", []))
            for d in dept_list:
                if d.get("code") == "DCS-TEST":
                    ids["department_id"] = d["id"]
                    ok(f"Found existing department → {ids['department_id']}")
                    break
            if "department_id" not in ids:
                raise
        else:
            raise

    # ── 11. Create Degree ─────────────────────
    step(11, "Create Degree")
    try:
        resp = post(f"{v1}/degrees", {
            "department_id": ids["department_id"],
            "name":          "BSc in Computer Science",
            "code":          "BSCCS-TEST",
            "level":         "Undergraduate",
        }, token=token)
        ids["degree_id"] = resp["id"]
        ok(f"Degree created → {ids['degree_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Degree already exists — fetching existing ID")
            degs = get(f"{v1}/degrees?department_id={ids['department_id']}", token=token)
            deg_list = degs if isinstance(degs, list) else degs.get("data", degs.get("items", []))
            for d in deg_list:
                if d.get("code") == "BSCCS-TEST":
                    ids["degree_id"] = d["id"]
                    ok(f"Found existing degree → {ids['degree_id']}")
                    break
            if "degree_id" not in ids:
                raise
        else:
            raise

    # ── 12. Create Batch ──────────────────────
    step(12, "Create Batch")
    try:
        resp = post(f"{v1}/batches", {
            "degree_id":  ids["degree_id"],
            "name":       "CS Class of 2026",
            "code":       "CS2026-TEST",
            "start_year": 2023,
            "end_year":   2026,
        }, token=token)
        ids["batch_id"] = resp["id"]
        ok(f"Batch created → {ids['batch_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Batch already exists — fetching existing ID")
            batches = get(f"{v1}/batches?degree_id={ids['degree_id']}", token=token)
            batch_list = batches if isinstance(batches, list) else batches.get("data", batches.get("items", []))
            for b in batch_list:
                if b.get("code") == "CS2026-TEST":
                    ids["batch_id"] = b["id"]
                    ok(f"Found existing batch → {ids['batch_id']}")
                    break
            if "batch_id" not in ids:
                raise
        else:
            raise

    # ── 13. Create Semester ───────────────────
    step(13, "Create Semester")
    try:
        resp = post(f"{v1}/semesters", {
            "name":       "Semester 1 — Fall 2025",
            "code":       "SEM-FALL2025-TEST",
            "term_type":  "Fall",
            "start_date": "2025-09-01",
            "end_date":   "2025-12-15",
            "status":     "Active",
        }, token=token)
        ids["semester_id"] = resp["id"]
        ok(f"Semester created → {ids['semester_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Semester already exists — fetching existing ID")
            sems = get(f"{v1}/semesters", token=token)
            sem_list = sems if isinstance(sems, list) else sems.get("data", sems.get("items", []))
            for s in sem_list:
                if s.get("code") == "SEM-FALL2025-TEST":
                    ids["semester_id"] = s["id"]
                    ok(f"Found existing semester → {ids['semester_id']}")
                    break
            if "semester_id" not in ids:
                raise
        else:
            raise

    # ── 14. Create Course ─────────────────────
    step(14, "Create Course")
    try:
        resp = post(f"{v1}/courses", {
            "code":        "CS101-TEST",
            "title":       "Introduction to Programming",
            "description": "Fundamentals of programming using Python — test seed",
            "credits":     3,
        }, token=token)
        ids["course_id"] = resp["id"]
        ok(f"Course created → {ids['course_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Course already exists — fetching existing ID")
            courses = get(f"{v1}/courses", token=token)
            course_list = courses if isinstance(courses, list) else courses.get("data", courses.get("items", []))
            for c in course_list:
                if c.get("code") == "CS101-TEST":
                    ids["course_id"] = c["id"]
                    ok(f"Found existing course → {ids['course_id']}")
                    break
            if "course_id" not in ids:
                raise
        else:
            raise

    # ── 15. Create Course Instance ────────────
    step(15, "Create Course Instance  (course + semester + batch)")
    try:
        resp = post(f"{v1}/course-instances", {
            "course_id":      ids["course_id"],
            "semester_id":    ids["semester_id"],
            "batch_id":       ids["batch_id"],
            "status":         "Active",
            "max_enrollment": 30,
        }, token=token)
        ids["course_instance_id"] = resp["id"]
        ok(f"Course Instance created → {ids['course_instance_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Course instance already exists — fetching existing ID")
            cis = get(f"{v1}/course-instances?batch_id={ids['batch_id']}", token=token)
            ci_list = cis if isinstance(cis, list) else cis.get("data", cis.get("items", []))
            for ci in ci_list:
                if ci.get("course_id") == ids["course_id"] and ci.get("semester_id") == ids["semester_id"]:
                    ids["course_instance_id"] = ci["id"]
                    ok(f"Found existing course instance → {ids['course_instance_id']}")
                    break
            if "course_instance_id" not in ids:
                raise
        else:
            raise

    # ── 16. Add Student to Batch ──────────────
    step(16, "Add Student to Batch")
    try:
        resp = post(f"{v1}/batch-members", {
            "batch_id": ids["batch_id"],
            "user_id":  ids["student_user_id"],
            "status":   "Active",
        }, token=token)
        ok(f"Student added to batch → batch_id={ids['batch_id']}")
    except RuntimeError as exc:
        if "already" in str(exc).lower() or "duplicate" in str(exc).lower() or "exists" in str(exc).lower():
            warn("Student already a batch member — skipping")
        else:
            raise

    # ── 17. Assign Instructor ─────────────────
    step(17, "Assign Instructor to Course Instance")
    try:
        resp = post(f"{v1}/course-instructors", {
            "course_instance_id": ids["course_instance_id"],
            "user_id":            ids["instructor_user_id"],
            "role":               "Lead Instructor",
        }, token=token)
        ok(f"Instructor assigned → course_instance_id={ids['course_instance_id']}")
    except RuntimeError as exc:
        if "already" in str(exc).lower() or "duplicate" in str(exc).lower() or "exists" in str(exc).lower():
            warn("Instructor already assigned — skipping")
        else:
            raise

    # ── 18. Enroll Student ────────────────────
    step(18, "Enroll Student in Course Instance")
    try:
        resp = post(f"{v1}/enrollments", {
            "course_instance_id": ids["course_instance_id"],
            "user_id":            ids["student_user_id"],
            "status":             "Enrolled",
        }, token=token)
        ok(f"Student enrolled → course_instance_id={ids['course_instance_id']}")
    except RuntimeError as exc:
        if "already" in str(exc).lower() or "duplicate" in str(exc).lower() or "exists" in str(exc).lower():
            warn("Student already enrolled — skipping")
        else:
            raise

    # ══════════════════════════════════════════
    section("PHASE 3 — Assessment: Assignment")
    # ══════════════════════════════════════════

    # ── 19. Create Assignment ─────────────────
    step(19, "Create Assignment")
    try:
        resp = post(f"{v1}/assignments", {
            "course_instance_id":      ids["course_instance_id"],
            "title":                   "Assignment 1: Hello, Python!",
            "description":             (
                "Write a Python program that prints 'Hello, World!' and includes "
                "a function that returns the sum of two integers."
            ),
            "code":                    "CS101-A1-TEST",
            "release_at":              "2025-09-10T09:00:00Z",
            "due_at":                  "2025-09-24T23:59:00Z",
            "late_due_at":             "2025-09-27T23:59:00Z",
            "allow_late_submissions":  True,
            "enforce_time_limit":      120,
            "allow_group_submission":  False,
            "max_group_size":          1,
            "enable_ai_assistant":     True,
            "enable_socratic_feedback":True,
            "allow_regenerate":        False,
        }, token=token)
        ids["assignment_id"] = resp["id"]
        ok(f"Assignment created → {ids['assignment_id']}")
    except RuntimeError as exc:
        if "unique" in str(exc).lower() or "exists" in str(exc).lower() or "duplicate" in str(exc).lower():
            warn("Assignment already exists — skipping")
        else:
            raise

    # ══════════════════════════════════════════
    section("SEED COMPLETE — Summary")
    # ══════════════════════════════════════════

    rows = [
        ("super_admin login",     "superadmin@gradeloop.com",     "Strong#Pass123!"),
        ("admin user",            "admin.test@gradeloop.com",      "Test@12345!"),
        ("instructor user",       "instructor.test@gradeloop.com", "Test@12345!"),
        ("student user",          "student.test@gradeloop.com",    "Test@12345!"),
    ]

    print(f"\n  {'Role/Entity':<22}  {'Email / ID':<42}  Password")
    print(f"  {'─'*22}  {'─'*42}  {'─'*14}")
    for label, email, pwd in rows:
        print(f"  {label:<22}  {email:<42}  {pwd}")

    print()
    for k, v in ids.items():
        print(f"  {YELLOW}{k:<28}{RESET}  {v}")

    print(f"\n{GREEN}{BOLD}  All done! 🎉{RESET}\n")


# ──────────────────────────────────────────────
# Entry-point
# ──────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed GradeLoop test data")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="API gateway base URL (default: http://localhost:8000)",
    )
    args = parser.parse_args()

    try:
        seed(args.base_url.rstrip("/"))
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(1)
    except Exception as exc:
        err(str(exc))
        sys.exit(1)
