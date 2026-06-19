"use client";

import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

export default function NotificationActions() {
  const router = useRouter();
  async function markAll() {
    await fetch("/api/notifications/read", { method: "POST" });
    router.refresh();
  }
  return (
    <button className="btn btn-ghost btn-sm" onClick={markAll}>
      <CheckCheck className="h-4 w-4" /> Mark all read
    </button>
  );
}
