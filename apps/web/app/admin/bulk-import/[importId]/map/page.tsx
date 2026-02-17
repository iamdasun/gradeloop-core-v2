import { BulkImportMappingPage } from "@/features/bulk-import/components/bulk-import-mapping-page";

interface PageProps {
  params: Promise<{
    importId: string;
  }>;
}

export default async function BulkImportMapPage({ params }: PageProps) {
  const { importId } = await params;

  return <BulkImportMappingPage importId={importId} />;
}
