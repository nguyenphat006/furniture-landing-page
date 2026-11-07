"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/*
 * Tabs (Radix, theo khung shadcn) kiểu gạch chân như Gloster: hàng tab chữ in hoa, tab đang chọn gạch đen.
 * Radix lo phím ← → / Home / End, aria-selected, aria-controls.
 * TabsContent mặc định forceMount + ẩn tab không chọn, để nội dung mọi tab vẫn có trong HTML (SEO, Ctrl+F).
 */

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "border-line flex flex-wrap gap-x-8 border-b sm:gap-x-12",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "text-ink-mute hover:text-ink data-[state=active]:text-ink focus-visible:outline-forest relative -mb-px shrink-0 cursor-pointer border-b-2 border-transparent py-4 text-base font-medium tracking-[.06em] whitespace-nowrap uppercase transition-colors duration-(--duration-base) focus-visible:outline-2 focus-visible:-outline-offset-2 data-[state=active]:border-current sm:text-lg",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  forceMount = true,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      forceMount={forceMount || undefined}
      className={cn(
        "focus-visible:outline-forest outline-none focus-visible:outline-2 data-[state=inactive]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
