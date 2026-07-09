"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CarrierSettlementsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/billing/ap?tab=carriers");
  }, [router]);
  return <div className="p-8 text-gray-400">Redirecting to Accounts Payable…</div>;
}
