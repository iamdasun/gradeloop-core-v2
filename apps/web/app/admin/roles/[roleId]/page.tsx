import { RolePermissionConfigPage } from "@/features/role-permissions/components/role-permission-config-page";

interface PageProps {
  params: Promise<{
    roleId: string;
  }>;
}

export default async function RoleConfigPage({ params }: PageProps) {
  const { roleId } = await params;
  
  return <RolePermissionConfigPage roleId={roleId} />;
}
