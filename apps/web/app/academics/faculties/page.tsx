import React from "react";
import Breadcrumbs from "@/components/academics/Breadcrumbs";
import VirtualizedTable from "@/components/academics/VirtualizedTable";

export default function FacultiesPage() {
  return (
    <div className="p-6">
      <Breadcrumbs items={[{ label: "Academics", href: "/academics" }, { label: "Faculties", href: "/academics/faculties" }]} />
      <h1 className="text-2xl font-bold mb-4">Faculties</h1>
      <VirtualizedTable entity="faculty" />
    </div>
  );
}
