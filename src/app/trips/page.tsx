import Link from "next/link";
import { Route } from "lucide-react";
import { PageHeader } from "@/components/layout";

export default function TripsStubPage() {
  return (
    <div className="p-8">
      <PageHeader
        icon={Route}
        title="Trips"
        description="Trip browse is coming in a future release"
      />
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        <p className="mb-4">
          Trips are created when you assign dispatch and appear in the{" "}
          <Link href="/tickets" className="text-[#0f6b4f] underline">
            Tickets Inbox
          </Link>{" "}
          and on{" "}
          <Link href="/orders" className="text-[#0f6b4f] underline">
            order detail
          </Link>
          .
        </p>
        <Link href="/dispatch" className="text-[#0f6b4f] underline">
          Go to Dispatch board
        </Link>
      </div>
    </div>
  );
}
