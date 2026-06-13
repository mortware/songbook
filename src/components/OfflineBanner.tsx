"use client";

import { useSync } from "./SyncProvider";

export default function OfflineBanner() {
  const { online } = useSync();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      Offline — showing songs synced to this device
    </div>
  );
}
