export function PageToolbar({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {trailing}
    </div>
  );
}
