import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageActionCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  );
}

export function PageActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onClick,
  variant = "primary",
  disabled,
  disabledTitle,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  onClick?: () => void;
  variant?: "primary" | "outline";
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
        <Icon className="h-5 w-5 text-gray-600" />
      </div>
      <h3 className="font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <Button
        className={
          variant === "primary"
            ? "mt-4 bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
            : "mt-4"
        }
        variant={variant === "outline" ? "outline" : "default"}
        onClick={onClick}
        disabled={disabled}
        title={disabledTitle}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
