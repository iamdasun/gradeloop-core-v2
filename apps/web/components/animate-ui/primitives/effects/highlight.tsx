"use client";

import * as React from "react";

export interface HighlightProps {
  children?: React.ReactNode;
  enabled?: boolean;
  hover?: boolean;
  controlledItems?: boolean;
  mode?: "parent" | "item";
  containerClassName?: string;
  transition?: any;
  forceUpdateBounds?: boolean;
}

export function Highlight({ children, containerClassName }: HighlightProps) {
  return (
    <div className={containerClassName}>
      {children}
    </div>
  );
}

export interface HighlightItemProps {
  children?: React.ReactNode;
  activeClassName?: string;
}

export function HighlightItem({ children }: HighlightItemProps) {
  return <>{children}</>;
}
