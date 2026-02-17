"use client";

import { Lightbulb } from "lucide-react";

export function MappingTip() {
  return (
    <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
      <div className="flex">
        <div className="flex-shrink-0">
          <Lightbulb className="h-5 w-5 text-primary" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-primary">Mapping Tip</h3>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Ensure the <span className="font-semibold">Email Address</span>{" "}
              field is mapped correctly. It is the unique identifier used to
              update existing users instead of creating duplicates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
