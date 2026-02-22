"use client";

// Temporarily disabled - breadcrumb provider not yet implemented
// import { useEffect } from "react";
// import { useBreadcrumbs } from "@/components/providers/breadcrumb-provider";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function useBreadcrumb(breadcrumbs: BreadcrumbItem[]) {
  // const { setBreadcrumbs } = useBreadcrumbs();

  // useEffect(() => {
  //   setBreadcrumbs(breadcrumbs);
  //
  //   // Cleanup: reset breadcrumbs when component unmounts
  //   return () => {
  //     setBreadcrumbs([]);
  //   };
  // }, [breadcrumbs, setBreadcrumbs]);

  // Placeholder implementation
  return null;
}
