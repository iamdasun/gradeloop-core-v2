# Bulk Import Field Mapping Implementation

## Overview

The Bulk Import Field Mapping feature allows administrators to upload CSV files containing user data and map the CSV columns to GradeLoop system fields. This is step 2 of a 4-step import wizard.

## Import Wizard Steps

1. **Upload** - Upload CSV file (completed)
2. **Map Fields** - Map CSV columns to system fields (current implementation)
3. **Validate** - Validate data and identify issues
4. **Import** - Execute the import

## Features Implemented

### 1. Progress Stepper
- Visual indicator of current step in the import process
- Shows completed, current, and upcoming steps
- Interactive step navigation

### 2. File Summary Card
- Displays uploaded file information:
  - Filename
  - Number of rows detected
  - File size
- Option to change file

### 3. Column Mapping Table
- Grid layout showing CSV columns mapped to system fields
- Each row displays:
  - CSV column name with sample value
  - Dropdown to select target system field
  - Status indicator (mapped, required, ignored)
- Visual states:
  - **Mapped**: Green checkmark - successfully mapped
  - **Required**: Amber alert - required field needs attention
  - **Ignored**: Gray minus - column will be skipped
- Auto-detection of field matches
- Warning banner showing number of fields requiring attention

### 4. Data Preview Sidebar
- Live preview of first 5 rows from CSV
- Displays:
  - User avatars with initials
  - Display name
  - Email address
  - Additional field badges
- Sticky sidebar that follows scroll
- "View All Rows" option

### 5. Mapping Tip Panel
- Helper information about critical mappings
- Emphasizes email address as unique identifier

### 6. Navigation Controls
- **Back**: Return to upload step
- **Cancel**: Abandon import and return to users list
- **Next: Validate**: Proceed to validation (disabled until all required fields mapped)

## Technical Architecture

### Golden Pipeline Pattern

All API interactions follow the strict Golden Pipeline:

```
Zod Schema → Axios Fetcher → Schema.parse() → TanStack Query Hook
```

### File Structure

```
apps/web/
├── schemas/
│   └── bulk-import.schema.ts          # Zod schemas and types
├── features/
│   └── bulk-import/
│       ├── api/
│       │   └── import-mapping.ts      # Axios fetchers with validation
│       ├── hooks/
│       │   └── use-import-mapping.ts  # TanStack Query hooks
│       └── components/
│           ├── import-progress-stepper.tsx
│           ├── file-summary-card.tsx
│           ├── mapping-row.tsx
│           ├── mapping-table.tsx
│           ├── data-preview-sidebar.tsx
│           ├── mapping-tip.tsx
│           └── bulk-import-mapping-page.tsx
└── app/
    └── admin/
        └── bulk-import/
            └── [importId]/
                └── map/
                    └── page.tsx       # Dynamic route
```

## Data Schemas

### BulkImportMapping
```typescript
{
  importId: string;
  fileInfo: FileInfo;
  currentStep: "upload" | "map" | "validate" | "import";
  columnMappings: ColumnMapping[];
  previewRows: PreviewRow[];
  systemFields: SystemFieldOption[];
  requiredFieldsCount: number;
  unmappedRequiredFields: string[];
}
```

### ColumnMapping
```typescript
{
  csvColumn: string;
  sampleValue: string | null;
  mappedTo: SystemFieldType | null;
  status: "mapped" | "required" | "ignored" | "unmapped";
  isRequired: boolean;
}
```

### SystemFieldType
```typescript
"first_name" | "last_name" | "email" | "user_id" | "sis_id" | 
"phone" | "date_of_birth" | "department" | "role" | 
"custom_field_1" | "custom_field_2" | "ignore"
```

## API Endpoints

### GET `/admin/bulk-import/:importId/mapping`
Fetch current mapping configuration for an import session.

**Response**: `BulkImportMapping`

### PATCH `/admin/bulk-import/:importId/mapping/column`
Update a single column mapping.

**Request**:
```json
{
  "csvColumn": "contact_email",
  "mappedTo": "email"
}
```

**Response**: `BulkImportMapping`

### PATCH `/admin/bulk-import/:importId/mapping/batch`
Update all column mappings at once.

**Request**:
```json
{
  "mappings": [
    { "csvColumn": "First Name", "mappedTo": "first_name" },
    { "csvColumn": "Last Name", "mappedTo": "last_name" },
    { "csvColumn": "contact_email", "mappedTo": "email" }
  ]
}
```

**Response**: `BulkImportMapping`

### POST `/admin/bulk-import/:importId/validate`
Proceed to validation step.

**Response**:
```json
{
  "success": true,
  "validationId": "val_123"
}
```

## Component Usage

### Basic Usage

```tsx
import { BulkImportMappingPage } from "@/features/bulk-import/components/bulk-import-mapping-page";

export default function Page({ params }) {
  const { importId } = params;
  return <BulkImportMappingPage importId={importId} />;
}
```

### Individual Components

```tsx
// Progress Stepper
<ImportProgressStepper currentStep="map" />

// File Summary
<FileSummaryCard 
  fileInfo={fileInfo} 
  onChangeFile={() => router.push("/upload")} 
/>

// Mapping Table
<MappingTable
  mappings={columnMappings}
  systemFields={systemFields}
  requiredFieldsCount={2}
  onMappingChange={handleMappingChange}
/>

// Data Preview
<DataPreviewSidebar 
  previewRows={previewRows}
  onViewAll={() => openDialog()} 
/>
```

## State Management

### TanStack Query Cache
- Import mapping data cached with key: `["import-mapping", importId]`
- Automatic cache updates after mutations
- 5-minute stale time for mapping configuration

### Local State
- `hasChanges`: Tracks if user has made any mapping changes
- Optimistic updates for better UX

## Styling

### Color Tokens Used
- `bg-surface-light` / `dark:bg-surface-dark` - Card backgrounds
- `border-gray-200` / `dark:border-border-color` - Borders
- `text-primary` - Primary brand color actions
- `bg-amber-50` / `dark:bg-amber-900/10` - Warning states
- `bg-green-100` / `dark:bg-green-900/30` - Success states

### Icons
All icons use **lucide-react** (not Material Icons from mockup):
- `Check` - Successful mapping
- `AlertCircle` - Required attention
- `Minus` - Ignored column
- `ArrowRight` - Navigation
- `FileText` - File indicator
- `Lightbulb` - Tips

## Validation Rules

1. **Email field is required**: Must be mapped to proceed
2. **Other required fields**: Defined by backend per import type
3. **Duplicate mappings**: Each system field can only be mapped once
4. **Ignore option**: Allows skipping columns not needed

## User Experience Features

1. **Auto-matching**: System attempts to auto-match CSV columns to system fields
2. **Visual feedback**: Color-coded status indicators
3. **Sample data**: Shows actual values from CSV to aid mapping
4. **Real-time updates**: Changes reflected immediately in preview
5. **Progress tracking**: Clear indication of completion status
6. **Validation prevention**: Cannot proceed with unmapped required fields

## Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader friendly status indicators
- Focus management in dropdowns
- Semantic HTML structure

## Performance Optimizations

1. **Sticky sidebar**: Uses `position: sticky` for efficient scrolling
2. **Optimistic updates**: UI updates before server response
3. **Minimal re-renders**: Proper memoization in components
4. **Efficient queries**: 5-minute cache prevents unnecessary refetches

## Testing Recommendations

### Integration Tests
- Test mapping changes update state correctly
- Verify required field validation
- Test navigation between steps
- Verify API error handling

### E2E Tests
- Upload CSV → Map fields → Validate → Import flow
- Test with various CSV formats
- Verify duplicate handling
- Test cancel/back navigation

## Backend Integration Requirements

The backend must provide:

1. **Import session management**: Create and track import sessions
2. **Field auto-detection**: Intelligent matching of CSV columns
3. **Validation**: Check for required fields, data types, duplicates
4. **Preview generation**: First 5 rows with proper formatting
5. **State persistence**: Maintain mapping across page refreshes

## Future Enhancements

1. **Bulk mapping actions**: Select multiple columns at once
2. **Mapping templates**: Save and reuse common mappings
3. **Advanced preview**: Filter/search in preview
4. **Column statistics**: Show data quality metrics
5. **Custom field creation**: Add new system fields on the fly
6. **Import history**: View and reuse previous imports

## Troubleshooting

### Issue: "Import session not found"
- **Cause**: Invalid or expired importId
- **Solution**: Return to upload step and start new import

### Issue: Cannot proceed to validation
- **Cause**: Required fields not mapped
- **Solution**: Check warning banner, map all amber-highlighted fields

### Issue: Preview not showing data
- **Cause**: CSV parsing failed or empty file
- **Solution**: Check file format, ensure valid CSV

## Related Documentation

- [User Management Implementation](./user-management-implementation.md)
- [Role Permission Implementation](./role-permission-implementation.md)
- [LLMs.txt Guidelines](../LLMs.txt)

---

**Implementation Date**: February 15, 2026  
**Framework**: Next.js 16 (App Router)  
**Pattern**: Golden Pipeline (Zod → Axios → TanStack Query)  
**Build Status**: ✅ Successful
