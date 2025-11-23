import videojs, { VideoJsPlayer } from "video.js";
import { PointerEvent, TouchEvent } from "react";

// prettier-ignore
const BigPlayButton = videojs.getComponent("BigPlayButton") as unknown as typeof videojs.BigPlayButton;

class BigPlayPauseButton extends BigPlayButton {
  handleClick(event: videojs.EventTarget.Event) {
    if (this.player().paused()) {
      super.handleClick(event);
    } else {
      this.player().pause();
    }
  }

  buildCSSClass() {
    return "vjs-control vjs-button vjs-big-play-pause-button";
  }
}

class BigButtonGroup extends videojs.getComponent("Component") {
  constructor(player: VideoJsPlayer) {
    super(player);

    this.addChild("seekButton", {
      direction: "back",
      seconds: 5,
    });

    this.addChild("BigPlayPauseButton");

    this.addChild("seekButton", {
      direction: "forward",
      seconds: 5,
    });
  }

  createEl() {
    return super.createEl("div", {
      className: "vjs-big-button-group",
    });
  }
}

class BigButtonsPlugin extends videojs.getPlugin("plugin") {
  private readonly options: {
    maxScale: number;
    pullDistance: number;
    scaleSensitivity: number;
    holdDelay: number;
    minScale: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly videoEl: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bigButtonGroupEl: any;

  constructor(player: VideoJsPlayer, options = {}) {
    super(player);

    this.player = player;
    this.options = Object.assign(
      {
        maxScale: 1.25, // Scale when pulling up (enter fullscreen)
        minScale: 0.95, // Scale when pulling down (exit fullscreen)
        pullDistance: 150, // Distance threshold to trigger fullscreen toggle
        scaleSensitivity: 300,
        holdDelay: 500,
      },
      options
    );

    this.videoEl = this.player.el().querySelector("video");
    if (!this.videoEl) return;

    this.videoEl.classList.add("vjs-touch-gestures");
    this.addStyles();

    this.initEvents();
  }

  addStyles() {
    const style = document.createElement("style");
    style.textContent = `
        .vjs-touch-gestures {
          transition: transform 0.2s ease;
          transform-origin: center bottom;
          touch-action: none; /* prevent page scrolling / panning */
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none; /* prevent iOS long-press menu */
        }
      `;
    document.head.appendChild(style);
  }

  initEvents() {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let holdTimeout: number | null | undefined = null;
    let isHolding = false;
    let distanceMoved = 0;
    const TOUCH_MOVE_2X_THRESHOLD = 15;

    const { maxScale, minScale, pullDistance, scaleSensitivity, holdDelay } =
      this.options;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addTouchEventListeners = (element: any, videoEl: any) => {
      // Prevent long-press context menu (Android/Chrome)
      element.addEventListener("contextmenu", (e: PointerEvent) =>
        e.preventDefault()
      );

      // === TOUCH START ===
      element.addEventListener(
        "touchstart",
        (e: TouchEvent) => {
          if (e.touches.length !== 1) return;
          e.preventDefault();

          startY = e.touches[0].clientY;
          currentY = startY;
          // todo: find a way to get accurate status bar height, if there is one
          const STATUS_BAR_HEIGHT = 40;
          // ignores touches that started at top of screen - user likely pulled down to show status bar
          if (startY < STATUS_BAR_HEIGHT) return;
          isDragging = true;
          isHolding = false;

          holdTimeout = setTimeout(() => {
            if (distanceMoved > TOUCH_MOVE_2X_THRESHOLD) return;
            isHolding = true;
            this.player.playbackRate(2);
          }, holdDelay);
        },
        { passive: false }
      );

      // === TOUCH MOVE ===
      element.addEventListener(
        "touchmove",
        (e: TouchEvent) => {
          if (!isDragging || e.touches.length !== 1) return;
          e.preventDefault();

          distanceMoved = Math.abs(currentY - startY);

          if (isHolding) return;

          currentY = e.touches[0].clientY;
          const deltaY = startY - currentY;
          const isFullscreen = this.player.isFullscreen();

          if (!isFullscreen) {
            // Pull-up to enter fullscreen
            const scale = Math.min(
              Math.max(1 + deltaY / scaleSensitivity, 1),
              maxScale
            );
            videoEl.style.transform = `scale(${scale})`;
          } else {
            // Pull-down to exit fullscreen
            const scale = Math.max(
              Math.min(1 + deltaY / scaleSensitivity, 1),
              minScale
            );
            const translateY = Math.min(Math.max(-deltaY / 2, 0), 100);
            videoEl.style.transform = `scale(${scale}) translateY(${translateY}px)`;
          }
        },
        { passive: false }
      );

      // === TOUCH END ===
      element.addEventListener("touchend", () => {
        if (holdTimeout != null) clearTimeout(holdTimeout);

        if (isHolding) {
          this.player.playbackRate(1);
        }

        const deltaY = startY - currentY;
        const isFullscreen = this.player.isFullscreen();

        if (!isFullscreen && deltaY > pullDistance) {
          this.player.requestFullscreen();
        } else if (isFullscreen && deltaY < -pullDistance) {
          this.player.exitFullscreen();
        }

        // Reset transform smoothly
        videoEl.style.transform = "scale(1) translateY(0)";
        isDragging = false;
      });

      // === TOUCH CANCEL ===
      element.addEventListener("touchcancel", () => {
        if (holdTimeout != null) clearTimeout(holdTimeout);
        if (isHolding) this.player.playbackRate(1);
        videoEl.style.transform = "scale(1) translateY(0)";
        isDragging = false;
      });
    };

    addTouchEventListeners(this.videoEl, this.videoEl);

    this.player.ready(() => {
      this.player.addChild("BigButtonGroup");
      this.bigButtonGroupEl = this.player
        .el()
        .querySelector(".vjs-big-button-group");
      addTouchEventListeners(this.bigButtonGroupEl, this.videoEl);
    });
  }
}

// Register the plugin with video.js.
videojs.registerComponent("BigButtonGroup", BigButtonGroup);
videojs.registerComponent("BigPlayPauseButton", BigPlayPauseButton);
videojs.registerPlugin("bigButtons", BigButtonsPlugin);

/* eslint-disable @typescript-eslint/naming-convention */
declare module "video.js" {
  interface VideoJsPlayer {
    bigButtons: () => BigButtonsPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    bigButtons?: {};
  }
}

export default BigButtonsPlugin;
