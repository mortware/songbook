"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Reads the song slug from window.location rather than useParams().
 * The service worker serves a cached shell page for any /songs/* URL
 * when offline, so the router's params can't be trusted — the URL can.
 */
export function useSlugFromLocation(): string | null {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const match = window.location.pathname.match(/^\/songs\/([^/]+)/);
    setSlug(match ? decodeURIComponent(match[1]) : null);
  }, []);
  return slug;
}

const SWIPE_MIN_PX = 60;

function hasHorizontalScroll(el: Element | null): boolean {
  while (el) {
    const style = window.getComputedStyle(el);
    const ox = style.overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/** Navigate to prev/next song on horizontal swipe. Ignores swipes that start on a scrollable element. */
export function useSwipeNav(prevSlug: string | null, nextSlug: string | null): void {
  const router = useRouter();
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let active = false;
    const onStart = (e: TouchEvent) => {
      if (hasHorizontalScroll(e.target as Element)) {
        active = false;
        return;
      }
      active = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0 && nextSlug) router.push(`/songs/${encodeURIComponent(nextSlug)}`);
      if (dx > 0 && prevSlug) router.push(`/songs/${encodeURIComponent(prevSlug)}`);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [prevSlug, nextSlug, router]);
}

/** Keep the screen awake while the component is mounted (performance view). */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await navigator.wakeLock.request("screen");
          if (cancelled) await lock.release();
        }
      } catch {
        // Wake lock not available/allowed — fine
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };

    request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      lock?.release().catch(() => {});
    };
  }, []);
}
