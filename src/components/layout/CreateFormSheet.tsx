"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function CreateFormSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  disabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full max-w-[384px] flex-col gap-0 p-0 sm:max-w-[384px]">
        <SheetHeader className="shrink-0 border-b border-gray-100 px-6 py-5">
          <SheetTitle className="text-lg font-semibold text-gray-900">{title}</SheetTitle>
          <SheetDescription className="text-sm text-gray-500">{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-8">{children}</div>
        </div>
        <SheetFooter className="shrink-0 gap-2 border-t border-gray-200 bg-white px-6 py-4">
          <Button
            className="h-10 w-full bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
            onClick={onSubmit}
            disabled={disabled}
          >
            {submitLabel}
          </Button>
          <Button
            variant="outline"
            className="h-10 w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
