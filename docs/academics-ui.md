# Academics Management UI — Design & Implementation Notes

Overview
- Role-based, hierarchical UI for Faculty → Department → Degree → Specialization → Batch → Course → CourseInstance → Enrollment.

Key parts added in initial commit
- App Router routes under `/app/academics` with nested faculty route
- Components: `TreeView`, `Breadcrumbs`, `VirtualizedTable`, `RoleGuard`
- API layer: `lib/academicsApi.ts` using existing `lib/api` + Zod schemas in `schemas/academics.schema.ts`
- Store: `store/academicsStore.ts` (Zustand)

Accessibility & Performance
- All interactive controls use semantic elements and `aria-*` where appropriate.
- Virtualized lists via `react-window` for 500+ rows.
- Use keyboard-accessible tree and buttons; ensure `aria-expanded` in next iterations.

Role guards
- `RoleGuard` is a small client component that uses `useUser` (existing hook) to gate UI. Integrate with real IAM roles: `super_admin`, `faculty_admin`, `instructor`.

API contract & validation
- All API responses must be validated with Zod (`schemas/academics.schema.ts`) before usage.

Preventing cycles & business rules
- Prevent circular batch/hierarchy moves server-side; client shows warnings when cycle detected (future work: optimistic checks).

Next steps
1. Wire `TreeView` to `getFaculties` and lazy-load children.
2. Implement forms using `react-hook-form` + `zodResolver` and shadcn UI components.
3. Add Audit Log tab per entity (backend endpoint + frontend tabbed UI).
4. Add unit/integration tests and axe-core checks in CI.