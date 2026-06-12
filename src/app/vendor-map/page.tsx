"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { VendorMap } from "@/components/VendorMap";
import { useDb } from "@/components/DbProvider";
import { PageHeader, PageActionCards, PageActionCard } from "@/components/layout";

function VendorMapPageInner() {
  const { db } = useDb();
  const params = useSearchParams();
  const projectId = params.get("projectId") ?? undefined;
  const quoteId = params.get("quoteId") ?? undefined;
  const addressParam = params.get("address") ?? undefined;
  const nameParam = params.get("name") ?? undefined;
  const [open, setOpen] = useState(true);

  let project = projectId ? db.projects.find((p) => p.id === projectId) : undefined;
  if (!project && quoteId) {
    const quote = db.quotes.find((q) => q.id === quoteId);
    if (quote) project = db.projects.find((p) => p.id === quote.projectId);
  }

  const projectAddress = project?.address || addressParam;
  const projectName = project?.name || nameParam;

  if (open) {
    return (
      <VendorMap
        onClose={() => setOpen(false)}
        projectAddress={projectAddress}
        projectName={projectName}
      />
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        icon={MapPin}
        title="Vendor Map"
        description="View quarries and disposal sites on a map and build quote routes"
      />
      <PageActionCards>
        <PageActionCard
          icon={MapPin}
          title="Open map"
          description="Explore vendors by location and add materials to quotes."
          buttonLabel="Open vendor map"
          onClick={() => setOpen(true)}
        />
      </PageActionCards>
    </div>
  );
}

export default function VendorMapPage() {
  return (
    <Suspense fallback={null}>
      <VendorMapPageInner />
    </Suspense>
  );
}
