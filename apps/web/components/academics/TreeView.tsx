"use client";
import React from "react";
import Link from "next/link";

export default function TreeView() {
  // lightweight static tree as a starter; will be wired to store/API
  const tree = [
    { id: "fe", label: "Faculty of Engineering", href: "/academics/faculties/fe" },
    { id: "fa", label: "Faculty of Arts", href: "/academics/faculties/fa" },
  ];

  return (
    <nav aria-label="Academics hierarchy" className="bg-white rounded shadow p-3">
      <h3 className="text-sm font-semibold mb-2">Hierarchy</h3>
      <ul className="space-y-1">
        {tree.map((t) => (
          <li key={t.id}>
            <Link href={t.href} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50" aria-current={false}>
              <span className="material-icons text-slate-400">school</span>
              <span className="text-sm">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
