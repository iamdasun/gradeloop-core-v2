import React from "react";
import TreeView from "@/components/academics/TreeView";

export default function AcademicsHome() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Academics</h1>
      <div className="grid grid-cols-4 gap-6">
        <aside className="col-span-1">
          <TreeView />
        </aside>
        <section className="col-span-3 bg-white p-4 rounded shadow">
          <p>Welcome to Academics management. Select a faculty or batch to inspect.</p>
        </section>
      </div>
    </div>
  );
}
