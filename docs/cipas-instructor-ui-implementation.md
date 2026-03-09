# CIPAS Instructor UI - Code Similarity Analysis

## Overview

This implementation provides a comprehensive instructor interface for reviewing code similarity analysis results. It integrates with the CIPAS Syntactics backend service to detect and visualize code clones across student submissions.

## Architecture

### Backend Components

#### Database Schema (V002 Migration)
- **similarity_reports**: Cached cluster analysis results
  - `assignment_id` (PK): Assignment identifier
  - `report_json`: Full AssignmentClusterResponse as JSONB
  - `submission_count`: Number of submissions analyzed
  - `cluster_count`: Number of collusion groups detected
  - `created_at`, `updated_at`: Timestamps

- **instructor_annotations**: Instructor feedback on clusters
  - `id` (UUID, PK): Annotation identifier
  - `assignment_id`: Assignment reference
  - `instructor_id`: Who created the annotation
  - `status`: Enum (pending_review, confirmed_plagiarism, false_positive, acceptable_collaboration, requires_investigation)
  - `match_id`, `group_id`: Optional references to specific matches/groups
  - `comments`: Instructor notes
  - `action_taken`: Description of actions (contacted students, filed report, etc.)
  - `created_at`, `updated_at`: Timestamps

- **report_exports**: Export history tracking
  - `id` (UUID, PK)
  - `assignment_id`: Assignment reference
  - `instructor_id`: Who requested export
  - `format`: pdf | csv
  - `created_at`: When export was generated

#### API Endpoints

**Reports:**
- `GET /api/v1/syntactics/reports/{assignment_id}` - Fetch cached similarity report
- `GET /api/v1/syntactics/reports/{assignment_id}/metadata` - Get lightweight metadata
- `GET /api/v1/syntactics/reports/{assignment_id}/export.csv` - Export report as CSV

**Annotations:**
- `POST /api/v1/syntactics/annotations` - Create new annotation
- `PATCH /api/v1/syntactics/annotations/{id}` - Update existing annotation
- `GET /api/v1/syntactics/annotations/assignment/{assignment_id}` - List all annotations for assignment
- `GET /api/v1/syntactics/annotations/assignment/{assignment_id}/stats` - Get annotation statistics

#### Repository Layer
- `SimilarityReportRepository`: CRUD operations for cached reports
- `InstructorAnnotationRepository`: Manages instructor feedback and statistics

### Frontend Components

#### Pages

**1. Similarity Overview** (`/similarity/page.tsx`)
- Main dashboard for viewing all clusters in an assignment
- Features:
  - Network graph visualization of similarity clusters
  - Summary statistics (high/medium/low risk counts, flagged cases)
  - Filter by: threshold (50-90%), sort by (high risk first, cluster size)
  - Filter by annotation status (all, pending, confirmed, false positive)
  - Search by student name/ID
  - Data table with cluster details
  - "Run Analysis" button to trigger new clustering
  - Export report to CSV

**2. Cluster Inspection** (`/similarity/cluster/[clusterId]/page.tsx`)
- Detailed view of a specific cluster
- Features:
  - Focused network graph showing only cluster members
  - Submission details table with average similarity scores
  - Cluster summary stats (most significant connection, clone type distribution)
  - Recent activity timeline
  - Annotation panel for adding/updating instructor feedback
  - Export evidence button
  - Compare buttons for launching diff viewer

**3. Diff Viewer** (`/similarity/compare/page.tsx`)
- Side-by-side code comparison for two submissions
- Features:
  - Toggle between "side-by-side" and "unified" diff views
  - Syntax-highlighted code with line numbers
  - Clone type indicators (color-coded: Type-1 red, Type-2 orange, Type-3 blue)
  - Similarity summary card (overall score, clone type, match count)
  - Segment map showing similarity regions
  - Export comparison report
  - Mark review complete button

#### Reusable Components

- **SimilarityBadge** (`similarity-badge.tsx`)
  - Displays risk level badges (High ≥85%, Medium 75-85%, Low <75%)
  - Variant: `SimilarityScore` shows percentage with optional progress bar

- **ClusterCard** (`cluster-card.tsx`)
  - Compact cluster summary card for grid layouts

- **NetworkGraph** (`network-graph.tsx`)
  - Visual representation of clusters with positioned nodes
  - Simple CSS-based layout (production would use D3.js)

- **SummaryStats** (`summary-stats.tsx`)
  - Batch statistics display (total submissions, flagged cases)
  - Risk distribution bar
  - AI insight panel

- **AnnotationPanel** (`annotation-panel.tsx`)
  - Form for creating/updating annotations
  - Status dropdown with 5 states
  - Comments and action taken text areas
  - Annotation history display

#### API Client (`lib/api/cipas-client.ts`)

```typescript
// Similarity Reports
getSimilarityReport(assignmentId: string): Promise<AssignmentClusterResponse | null>
getSimilarityReportMetadata(assignmentId: string): Promise<SimilarityReportMetadata>
exportSimilarityReport(assignmentId: string, format: "pdf" | "csv"): Promise<Blob>

// Clustering
clusterAssignment(request: AssignmentClusterRequest): Promise<AssignmentClusterResponse>

// Annotations
createAnnotation(request: CreateAnnotationRequest): Promise<AnnotationResponse>
updateAnnotation(id: string, request: UpdateAnnotationRequest): Promise<AnnotationResponse>
getAnnotations(assignmentId: string): Promise<AnnotationResponse[]>
getAnnotationStats(assignmentId: string): Promise<AnnotationStatsResponse>
```

#### Next.js Proxy Routes

All routes proxy to CIPAS Syntactics service to avoid CORS issues:

```
/api/cipas/reports/[assignmentId] → GET /api/v1/syntactics/reports/{id}
/api/cipas/reports/[assignmentId]/metadata → GET /api/v1/syntactics/reports/{id}/metadata
/api/cipas/reports/[assignmentId]/export → GET /api/v1/syntactics/reports/{id}/export.csv
/api/cipas/annotations → POST /api/v1/syntactics/annotations
/api/cipas/annotations/[annotationId] → PATCH /api/v1/syntactics/annotations/{id}
/api/cipas/annotations/assignment/[assignmentId] → GET /api/v1/syntactics/annotations/assignment/{id}
/api/cipas/annotations/assignment/[assignmentId]/stats → GET /api/v1/syntactics/annotations/assignment/{id}/stats
```

## Usage

### Running the Application

1. **Start CIPAS Syntactics Backend:**
   ```bash
   cd apps/services/cipas-services/cipas-syntactics
   python -m uvicorn main:app --host 0.0.0.0 --port 8086
   ```

2. **Start Next.js Frontend:**
   ```bash
   cd apps/web
   bun dev
   ```

3. **Navigate to Assignment:**
   - Go to any assignment page
   - Click the "Similarity" tab in the sidebar

### Workflow

1. **Run Analysis:**
   - Click "Run Similarity Analysis" button
   - System fetches all submission code
   - Clusters submissions using LSH + cascade detection
   - Report is cached in database

2. **Review Clusters:**
   - Filter by threshold (e.g., only show >80% similarity)
   - Sort by risk level or cluster size
   - Click "View Cluster" to inspect details

3. **Inspect Cluster:**
   - View network graph of relationships
   - Check submission details
   - Add annotation with status (pending_review, confirmed_plagiarism, etc.)
   - Add comments and action taken
   - Export evidence as CSV

4. **Compare Submissions:**
   - Click "Compare" on any cluster edge
   - Opens diff viewer in new tab
   - Review side-by-side with clone type highlighting
   - Export comparison report

5. **Export:**
   - Export full report from overview page (all clusters)
   - Export cluster evidence from inspection page (single cluster)
   - CSV format includes: Cluster ID, students, similarity %, clone type, match count

## Data Model

### AnnotationStatus Enum
- `pending_review`: Flagged for review, no decision yet
- `confirmed_plagiarism`: Instructor confirmed as academic dishonesty
- `false_positive`: Not actually plagiarism (e.g., template code, common algorithms)
- `acceptable_collaboration`: Allowed collaboration
- `requires_investigation`: Needs further review

### AssignmentClusterResponse
```typescript
{
  assignment_id: string;
  submission_count: number;
  collusion_groups: CollusionGroup[];
  lsh_threshold: number;
  min_confidence: number;
  cascade_stages: string[];
}
```

### CollusionGroup
```typescript
{
  group_id: number;
  member_ids: string[];
  member_count: number;
  edges: CollusionEdge[];
  max_confidence: number;
  dominant_type: string;  // "Type-1" | "Type-2" | "Type-3"
}
```

### CollusionEdge
```typescript
{
  student_a: string;
  student_b: string;
  confidence: number;
  clone_type: string;
  match_count: number;
}
```

## Configuration

### Environment Variables

**Backend (cipas-syntactics):**
- `DATABASE_URL`: PostgreSQL connection string (default: localhost:5432/gradeloop)
- `CIPAS_SYNTACTICS_PORT`: Service port (default: 8086)
- `CIPAS_SYNTACTICS_HOST`: Service host (default: 0.0.0.0)

**Frontend (Next.js):**
- `CIPAS_SYNTACTICS_URL`: Backend URL (default: http://localhost:8086)

## Database Setup

```bash
# Apply V002 migration
psql -U your_user -d gradeloop -f apps/services/cipas-services/cipas-syntactics/db_migrations/V002__add_similarity_reports_and_annotations.sql
```

## CSV Export Format

```csv
Cluster ID,Student A,Student B,Similarity Score,Clone Type,Match Count,Cluster Size,Dominant Type
A,student_123,student_456,92.50%,Type-2,8,5,Type-2
A,student_123,student_789,88.30%,Type-2,7,5,Type-2
B,student_234,student_567,76.20%,Type-3,5,3,Type-3
```

## Performance Considerations

- **Report Caching:** Cluster analysis is expensive. Results are cached in `similarity_reports` table to avoid re-running for every page load.
- **Lazy Loading:** Network graphs use CSS positioning for small clusters. For large assignments, consider implementing D3.js force-directed layout with virtualization.
- **Async Operations:** All database operations use asyncpg for non-blocking I/O.

## Future Enhancements

- PDF export with embedded code snippets and annotations
- Real-time collaboration on annotations (WebSocket)
- AI-assisted similarity threshold recommendations
- Integration with LMS gradebook for automatic grade adjustments
- Plagiarism report templates for academic integrity committees
- Student notification system

## Testing

### Manual Testing Checklist

- [ ] Run analysis on assignment with >2 submissions
- [ ] Verify clusters appear in overview table
- [ ] Test threshold filter (50-90%)
- [ ] Test sort by risk/size
- [ ] Test search by student name
- [ ] Filter by annotation status
- [ ] Create annotation on cluster
- [ ] Update annotation status
- [ ] Export full report CSV
- [ ] Navigate to cluster inspection
- [ ] View cluster details and annotation panel
- [ ] Export cluster evidence CSV
- [ ] Compare two submissions in diff viewer
- [ ] Toggle side-by-side/unified views
- [ ] Export comparison report CSV

### API Testing

Use Bruno collection at `bruno/CIPAS Service/` for endpoint testing.

## Troubleshooting

**Issue:** TypeScript errors about Alert component
**Solution:** Run `cd apps/web && bun install` to ensure all dependencies are installed.

**Issue:** "Report not found" error
**Solution:** Click "Run Similarity Analysis" to generate initial report. Reports are cached after first run.

**Issue:** Empty cluster list
**Solution:** Ensure submissions have source code. Check `min_confidence` threshold (lower values show more clusters).

**Issue:** CSV export fails
**Solution:** Check CIPAS_SYNTACTICS_URL environment variable points to correct backend.

## License

Internal project - All rights reserved.
