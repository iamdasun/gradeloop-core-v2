import Link from "next/link";
import React from "react";
import { Users, Shield, Settings, UploadCloud, Grid } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

/**
 * Admin layout used for all routes under /admin
 * - Renders a left sidebar with admin navigation (no dummy items)
 * - Main area renders the page content (children)
 *
 * Note:
 * - Authentication/authorization gating should be handled at the page level
 *   (or with a wrapper client component) so this layout remains a server component.
 * - Links:
 *   - /admin/dashboard  -> Admin dashboard (create this page to load user-management or other admin widgets)
 *   - /admin/users      -> User management (already exists)
 *   - /admin/roles      -> Roles management
 *   - /admin/bulk-import -> Bulk import
 */
export default function AdminLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-6 pt-8 pb-12">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-5 border-b">
                <Link href="/admin" className="flex items-center gap-3">
                  <Grid className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-lg">Administration</span>
                </Link>
              </div>

              <nav aria-label="Admin navigation" className="px-2 py-4">
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/admin"
                      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      <Shield className="h-4 w-4 text-slate-600 group-hover:text-primary" />
                      <span className="text-sm font-medium">Dashboard</span>
                    </Link>
                  </li>

                  <li>
                    <Link
                      href="/admin/users"
                      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      <Users className="h-4 w-4 text-slate-600 group-hover:text-primary" />
                      <span className="text-sm font-medium">
                        User Management
                      </span>
                    </Link>
                  </li>

                  <li>
                    <Link
                      href="/admin/roles"
                      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="h-4 w-4 text-slate-600 group-hover:text-primary" />
                      <span className="text-sm font-medium">Roles</span>
                    </Link>
                  </li>

                  <li>
                    <Link
                      href="/admin/bulk-import"
                      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50 transition-colors"
                    >
                      <UploadCloud className="h-4 w-4 text-slate-600 group-hover:text-primary" />
                      <span className="text-sm font-medium">Bulk Import</span>
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1">
            <div className="bg-white border rounded-xl shadow-sm p-6 min-h-[60vh]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
