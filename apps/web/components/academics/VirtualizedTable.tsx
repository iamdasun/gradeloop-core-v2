"use client";
import React from "react";
import { FixedSizeList as List } from "react-window";

type Props = { entity: string };

const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
  <div style={style} className="flex items-center px-4 border-b border-slate-100">
    <div className="w-8">{index + 1}</div>
    <div className="flex-1">Item {index + 1}</div>
    <div className="w-40 text-right">Actions</div>
  </div>
);

export default function VirtualizedTable({ entity }: Props) {
  const itemCount = 500;
  const rowHeight = 48;

  return (
    <div className="bg-white rounded shadow overflow-hidden">
      <div className="p-3 border-b">
        <strong className="text-sm">{entity}</strong>
      </div>
      <List height={400} itemCount={itemCount} itemSize={rowHeight} width="100%">
        {Row}
      </List>
    </div>
  );
}
