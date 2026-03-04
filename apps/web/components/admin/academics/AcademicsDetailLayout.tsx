'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';

interface Tab<T extends string = string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface AcademicsDetailLayoutProps<T extends string = string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tabId: T) => void;
  headerSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function AcademicsDetailLayout<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  headerSlot,
  children,
}: AcademicsDetailLayoutProps<T>) {
  return (
    <div className="space-y-6">
      {/* Header Section (optional) */}
      {headerSlot && headerSlot}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LHS Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Tab Navigation Buttons */}
          <div className="flex flex-col gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  className={cn(
                    'justify-start font-semibold w-full',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => onTabChange(tab.id)}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Main Content Pane */}
        <div className="lg:col-span-3 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
