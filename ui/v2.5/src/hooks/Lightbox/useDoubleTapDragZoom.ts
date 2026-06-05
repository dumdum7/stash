import type PhotoSwipe from "photoswipe";

/**
 * Double-tap-drag-to-zoom gesture for PhotoSwipe.
 *
 * Implements the "Google Photos" style zoom gesture:
 * 1. User taps once (finger down then up)
 * 2. User taps again quickly and HOLDS (finger down, does not release)
 * 3. User drags vertically to continuously control zoom level
 * 4. Releasing the finger ends the gesture and snaps zoom to valid bounds
 *
 * This works by intercepting raw pointer events in capture phase before
 * PhotoSwipe's gesture system processes them, and using PhotoSwipe's event
 * hooks with `preventDefault()` to suppress internal handling during the gesture.
 */

// Timing and distance thresholds
const DOUBLE_TAP_DELAY = 300; // ms — max interval between first tap-up and second tap-down
const TAP_MAX_DISTANCE = 25; // px — max movement allowed during first tap
const DRAG_ACTIVATE_DISTANCE = 5; // px — min vertical drag before zoom starts

// Zoom sensitivity: how much zoom change per pixel of vertical drag.
// Dragging down (positive deltaY) zooms in, dragging up zooms out.
const ZOOM_SENSITIVITY = 0.03;

type Phase =
  | "idle"
  | "firstTapDown"
  | "waitSecondTap"
  | "secondTapDown"
  | "zooming";

interface DoubleTapDragState {
  phase: Phase;
  firstTapDownPos: { x: number; y: number };
  firstTapUpTime: number;
  secondTapDownPos: { x: number; y: number };
  startZoomLevel: number;
  startPanX: number;
  startPanY: number;
  waitTimer: ReturnType<typeof setTimeout> | null;
  activePointerId: number | null;
}

function createState(): DoubleTapDragState {
  return {
    phase: "idle",
    firstTapDownPos: { x: 0, y: 0 },
    firstTapUpTime: 0,
    secondTapDownPos: { x: 0, y: 0 },
    startZoomLevel: 1,
    startPanX: 0,
    startPanY: 0,
    waitTimer: null,
    activePointerId: null,
  };
}

function resetState(state: DoubleTapDragState) {
  state.phase = "idle";
  state.activePointerId = null;
  if (state.waitTimer) {
    clearTimeout(state.waitTimer);
    state.waitTimer = null;
  }
}

function getDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Attaches the double-tap-drag-to-zoom gesture to a PhotoSwipe instance.
 * Call this after `pswp.init()`.
 *
 * @returns A cleanup function to remove all listeners.
 */
export function setupDoubleTapDragZoom(pswp: PhotoSwipe): () => void {
  const state = createState();

  // ─── Zoom Helpers ─────────────────────────────────────────────────

  /**
   * Apply a zoom level centered on the given anchor point.
   * Mirrors PhotoSwipe's ZoomHandler.change() approach:
   * adjusts pan so that the zoom appears to originate from the anchor.
   */
  function applyZoomAtPoint(newZoom: number, anchorX: number, anchorY: number) {
    if (!pswp?.currSlide) return;

    const slide = pswp.currSlide;
    const { zoomLevels } = slide;

    // Apply friction beyond bounds (same constants PhotoSwipe uses)
    // We use fit as the minimum to prevent shrinking smaller than the screen
    const min = zoomLevels.fit;
    const max = zoomLevels.max;
    if (newZoom < min) {
      newZoom = min - (min - newZoom) * 0.15;
      // Hard cap the rubber band so it never gets absurdly small (max 25% smaller than fit)
      newZoom = Math.max(min * 0.75, newZoom);
    } else if (newZoom > max) {
      newZoom = max + (newZoom - max) * 0.05;
    }

    // Calculate pan position to keep the anchor point stationary.
    const zoomFactor = newZoom / state.startZoomLevel;
    const panX = anchorX - (anchorX - state.startPanX) * zoomFactor;
    const panY = anchorY - (anchorY - state.startPanY) * zoomFactor;

    slide.setZoomLevel(newZoom);
    slide.pan.x = panX;
    slide.pan.y = panY;
    slide.applyCurrentZoomPan();
  }

  function finishZoomGesture() {
    if (!pswp?.currSlide) return;

    // Use PhotoSwipe's correctZoomPan to animate snap-back to valid bounds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gestures = (pswp as any).gestures;
    if (gestures?.zoomLevels?.correctZoomPan) {
      gestures.zoomLevels.correctZoomPan(true);
    }
  }

  function getAnchor(): { x: number; y: number } {
    return {
      x: state.secondTapDownPos.x,
      y: state.secondTapDownPos.y,
    };
  }

  // ─── Raw Pointer Event Handlers (capture phase) ───────────────────

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    if (!pswp?.currSlide) return;

    const pos = { x: e.clientX, y: e.clientY };

    switch (state.phase) {
      case "idle":
        state.phase = "firstTapDown";
        state.firstTapDownPos = { ...pos };
        state.activePointerId = e.pointerId;
        break;

      case "waitSecondTap":
        if (
          getDistance(pos, state.firstTapDownPos) < TAP_MAX_DISTANCE &&
          pswp.currSlide.isZoomable()
        ) {
          state.phase = "secondTapDown";
          state.secondTapDownPos = { ...pos };
          state.startZoomLevel = pswp.currSlide.currZoomLevel;
          state.startPanX = pswp.currSlide.pan.x;
          state.startPanY = pswp.currSlide.pan.y;
          state.activePointerId = e.pointerId;

          if (state.waitTimer) {
            clearTimeout(state.waitTimer);
            state.waitTimer = null;
          }

          // Stop any ongoing PhotoSwipe animations
          pswp.animations.stopAll();
        } else {
          // Too far — treat as new first tap
          resetState(state);
          state.phase = "firstTapDown";
          state.firstTapDownPos = { ...pos };
          state.activePointerId = e.pointerId;
        }
        break;

      default:
        // Multi-touch or unexpected state — abort
        if (state.phase === "zooming") {
          finishZoomGesture();
        }
        resetState(state);
        break;
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    if (e.pointerId !== state.activePointerId) return;
    if (!pswp?.currSlide) return;

    const pos = { x: e.clientX, y: e.clientY };

    switch (state.phase) {
      case "firstTapDown":
        if (getDistance(pos, state.firstTapDownPos) > TAP_MAX_DISTANCE) {
          resetState(state);
        }
        break;

      case "secondTapDown": {
        const deltaY = pos.y - state.secondTapDownPos.y;
        if (Math.abs(deltaY) > DRAG_ACTIVATE_DISTANCE) {
          state.phase = "zooming";

          // Clear PhotoSwipe's internal tap timer to prevent
          // single-tap from firing when we eventually release
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gestures = (pswp as any).gestures;
          if (gestures?._clearTapTimer) {
            gestures._clearTapTimer();
          }

          // Apply first zoom frame
          const anchor = getAnchor();
          const zoomDelta = deltaY * ZOOM_SENSITIVITY;
          const newZoom =
            zoomDelta >= 0
              ? state.startZoomLevel * (1 + zoomDelta)
              : state.startZoomLevel / (1 - zoomDelta);

          applyZoomAtPoint(newZoom, anchor.x, anchor.y);
        }
        break;
      }

      case "zooming": {
        const deltaY = pos.y - state.secondTapDownPos.y;
        const zoomDelta = deltaY * ZOOM_SENSITIVITY;
        const anchor = getAnchor();
        const newZoom =
          zoomDelta >= 0
            ? state.startZoomLevel * (1 + zoomDelta)
            : state.startZoomLevel / (1 - zoomDelta);

        applyZoomAtPoint(newZoom, anchor.x, anchor.y);
        break;
      }
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    if (e.pointerId !== state.activePointerId) return;

    switch (state.phase) {
      case "firstTapDown": {
        const pos = { x: e.clientX, y: e.clientY };
        if (getDistance(pos, state.firstTapDownPos) < TAP_MAX_DISTANCE) {
          state.phase = "waitSecondTap";
          state.firstTapUpTime = Date.now();
          state.activePointerId = null;
          state.waitTimer = setTimeout(() => {
            resetState(state);
          }, DOUBLE_TAP_DELAY);
        } else {
          resetState(state);
        }
        break;
      }

      case "secondTapDown":
        // Released without enough drag — this is a normal double-tap.
        // Let PhotoSwipe handle toggleZoom. Reset our state.
        resetState(state);
        break;

      case "zooming":
        finishZoomGesture();
        resetState(state);
        break;

      default:
        resetState(state);
        break;
    }
  }

  function handlePointerCancel(e: PointerEvent) {
    if (e.pointerId !== state.activePointerId) return;

    if (state.phase === "zooming") {
      finishZoomGesture();
    }
    resetState(state);
  }

  // ─── PhotoSwipe Event Hooks ─────────────────────────────────────────
  // Suppress PhotoSwipe's internal gesture processing during our gesture.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handlePswpPointerDown(e: any) {
    if (state.phase === "zooming") {
      e.preventDefault();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handlePswpPointerMove(e: any) {
    if (state.phase === "zooming") {
      e.preventDefault();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handlePswpPointerUp(e: any) {
    if (state.phase === "zooming") {
      e.preventDefault();
    }
  }

  // ─── Bind Events ──────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrollWrap = (pswp as any).scrollWrap as HTMLElement | null;
  if (scrollWrap) {
    scrollWrap.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    window.addEventListener("pointermove", handlePointerMove, {
      capture: true,
    });
    window.addEventListener("pointerup", handlePointerUp, { capture: true });
    window.addEventListener("pointercancel", handlePointerCancel, {
      capture: true,
    });
  }

  pswp.on("pointerDown", handlePswpPointerDown);
  pswp.on("pointerMove", handlePswpPointerMove);
  pswp.on("pointerUp", handlePswpPointerUp);

  // ─── Cleanup ──────────────────────────────────────────────────────

  return () => {
    resetState(state);

    if (scrollWrap) {
      scrollWrap.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      window.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", handlePointerUp, {
        capture: true,
      });
      window.removeEventListener("pointercancel", handlePointerCancel, {
        capture: true,
      });
    }

    pswp.off("pointerDown", handlePswpPointerDown);
    pswp.off("pointerMove", handlePswpPointerMove);
    pswp.off("pointerUp", handlePswpPointerUp);
  };
}
