import React from "react";
import Breadcrumbs from "@/components/academics/Breadcrumbs";

export default function FacultyLayout({ children, params }: { children: React.ReactNode; params: { facultyId: string } }) {
  return (
    <div className="p-6">
      <Breadcrumbs items={[{ label: "Academics", href: "/academics" }, { label: "Faculties", href: "/academics/faculties" }, { label: `Faculty ${params.facultyId}`, href: `#` }]} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
