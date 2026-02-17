import React from "react";
import Link from "next/link";

export default function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500 mb-3">
      <ol className="inline-flex items-center space-x-1">
        {items.map((it, idx) => (
          <li key={idx} className="inline-flex items-center">
            {it.href ? (
              <Link href={it.href} className="hover:text-primary">
                {it.label}
              </Link>
            ) : (
              <span>{it.label}</span>
            )}
            {idx < items.length - 1 && <span className="mx-2">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
