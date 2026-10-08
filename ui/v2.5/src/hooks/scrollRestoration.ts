import { useEffect, useLayoutEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";

const storageKey = "scrollPositions";
const maxEntries = 100;
// how long to keep trying to restore the scroll position while content loads
const restoreTimeout = 5000;
// how long the page height must remain unchanged after reaching the target
// before the restoration is considered complete
const settleTime = 500;

function loadPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

function savePositions(positions: Record<string, number>) {
  try {
    const keys = Object.keys(positions);
    if (keys.length > maxEntries) {
      for (const k of keys.slice(0, keys.length - maxEntries)) {
        delete positions[k];
      }
    }
    sessionStorage.setItem(storageKey, JSON.stringify(positions));
  } catch {
    // ignore
  }
}

function locationKey(location: { key?: string; pathname: string }) {
  return location.key ?? location.pathname;
}

const userEvents = ["wheel", "touchstart", "keydown", "mousedown"];

// Restores the window scroll position when navigating back/forward.
// The browser's native scroll restoration fails when the page content is
// loaded asynchronously (e.g. a list refetching after its cache was evicted),
// since the page is too short at the time of restoration. This keeps
// retrying until the page is tall enough and has settled, the user
// interacts with the page, or a timeout.
export function useScrollRestoration() {
  const location = useLocation();
  const history = useHistory();
  const positions = useRef<Record<string, number>>(loadPositions());
  const currentKey = useRef(locationKey(location));
  const cancelRestore = useRef<() => void>();

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  // continuously record the scroll position of the current location
  useEffect(() => {
    function onScroll() {
      positions.current[currentKey.current] = window.scrollY;
    }

    function persist() {
      positions.current[currentKey.current] = window.scrollY;
      savePositions(positions.current);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      cancelRestore.current?.();
    };
  }, []);

  useLayoutEffect(() => {
    const key = locationKey(location);
    const prevKey = currentKey.current;
    if (key === prevKey) return;

    currentKey.current = key;

    // Pages often replace the URL when they mount (e.g. lists syncing the
    // filter to the query string). Treat this as the same page: carry over
    // the scroll position and let any in-progress restoration continue.
    if (history.action === "REPLACE") {
      positions.current[key] = positions.current[prevKey] ?? window.scrollY;
      delete positions.current[prevKey];
      savePositions(positions.current);
      return;
    }

    // the scroll position of the previous location has already been
    // recorded by the scroll listener
    savePositions(positions.current);

    cancelRestore.current?.();
    cancelRestore.current = undefined;

    if (history.action !== "POP") return;

    const target = positions.current[key];
    if (!target) return;

    let frame = 0;
    const start = Date.now();
    let lastHeight = -1;
    let settledSince = 0;

    function cleanup() {
      cancelAnimationFrame(frame);
      userEvents.forEach((e) => window.removeEventListener(e, cleanup));
      if (cancelRestore.current === cleanup) {
        cancelRestore.current = undefined;
      }
    }

    function attempt() {
      const now = Date.now();
      const height = document.documentElement.scrollHeight;
      const maxScroll = height - window.innerHeight;
      const reached = maxScroll >= target;

      if (
        Math.round(window.scrollY) !== Math.round(Math.min(target, maxScroll))
      ) {
        window.scrollTo(0, Math.min(target, maxScroll));
      }

      if (!reached || height !== lastHeight) {
        settledSince = now;
      }
      lastHeight = height;

      if (
        (reached && now - settledSince >= settleTime) ||
        now - start > restoreTimeout
      ) {
        cleanup();
        return;
      }

      frame = requestAnimationFrame(attempt);
    }

    // stop trying if the user interacts with the page
    userEvents.forEach((e) =>
      window.addEventListener(e, cleanup, { passive: true })
    );
    cancelRestore.current = cleanup;

    attempt();
  }, [location, history]);
}
