"use client"

import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      startMonth={new Date(2020, 0)}
      endMonth={new Date(2035, 11)}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-2",
        month: "flex flex-col gap-4",
        month_caption: "flex justify-center pt-1 relative items-center w-full",
        caption_label: cn(
          "text-sm font-medium flex items-center gap-1",
          "[&>svg]:size-3.5 [&>svg]:text-muted-foreground"
        ),
        dropdowns: "flex items-center justify-center gap-1.5 w-full",
        dropdown_root: cn(
          "relative inline-flex items-center rounded-md border border-input",
          "bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
          "transition-colors cursor-pointer"
        ),
        dropdown: cn(
          "absolute inset-0 w-full opacity-0 cursor-pointer z-10"
        ),
        nav: "flex items-center gap-1 absolute inset-x-0 top-0 justify-between px-1 pt-1.5 z-20",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "size-8 bg-transparent p-0 opacity-60 hover:opacity-100 transition-opacity"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "size-8 bg-transparent p-0 opacity-60 hover:opacity-100 transition-opacity"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
        week: "flex w-full mt-1",
        day: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent/60 [&:has([aria-selected].day-outside)]:bg-accent/30",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal",
          "aria-selected:opacity-100",
          "hover:bg-accent hover:text-accent-foreground",
          "transition-colors duration-150"
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
        today:
          "bg-accent text-accent-foreground rounded-md font-semibold",
        outside:
          "day-outside text-muted-foreground/50 aria-selected:text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) => {
          if (orientation === "left") {
            return <ChevronLeftIcon className="size-4" {...chevronProps} />
          }
          return <ChevronRightIcon className="size-4" {...chevronProps} />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
