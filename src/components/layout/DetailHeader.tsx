import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export function DetailBreadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-300">&gt;</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function DetailHeader({
  backHref,
  icon: Icon,
  title,
  description,
  children,
}: {
  backHref: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start gap-4">
      <Link
        href={backHref}
        className="mt-1 text-gray-400 hover:text-gray-600"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0f6b4f]/10">
        <Icon className="h-7 w-7 text-[#0f6b4f]" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}
