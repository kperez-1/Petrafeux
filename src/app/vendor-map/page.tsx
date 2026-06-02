"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { VendorMap } from "@/components/VendorMap";
import { Button } from "@/components/ui/button";

export default function VendorMapPage() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex h-full items-center justify-center bg-gray-50">
      {!open && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <MapPin className="h-8 w-8 text-gray-400" />
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Vendor Map</h2>
          <p className="mb-6 text-sm text-gray-500">
            View all vendors on an interactive map and build quotes.
          </p>
          <Button
            className="bg-[#0f6b4f] hover:bg-[#0d5c43] text-white"
            onClick={() => setOpen(true)}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Open Vendor Map
          </Button>
        </div>
      )}
      {open && <VendorMap onClose={() => setOpen(false)} />}
    </div>
  );
}
