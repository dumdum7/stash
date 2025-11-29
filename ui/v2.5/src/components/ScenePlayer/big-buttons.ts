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

    this.addChild("BigPlayPauseButton");
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
    minScale: number;
    pullDistance: number;
    scaleSensitivity: number;
    holdDelay: number;
    seekAmount: number;
    tapTimeout: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly videoEl: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private topOverlay: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private topIndicator: any;

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
        seekAmount: 5, // seconds to seek
        tapTimeout: 300, // milliseconds between taps
      },
      options
    );

    // only use gestures on mobile
    if (!videojs.browser.IS_ANDROID && !videojs.browser.IS_IOS) {
      player.ready(() => {
        player.addChild("BigButtonGroup");
      });
      return;
    }

    this.videoEl = this.player.el().querySelector("video");
    if (!this.videoEl) return;

    this.videoEl.classList.add("vjs-touch-gestures");
    this.addStyles();
    this.initTopOverlay();
    this.initDoubleTap();
    this.initEvents();
  }

  // Top overlay is used for showing speed indicator (2x)
  initTopOverlay() {
    this.topOverlay = videojs.dom.createEl("div", {
      className: "vjs-top-overlay",
    });
    // Create speed indicator for top
    this.topIndicator = videojs.dom.createEl("div", {
      className: "vjs-speed-indicator",
      innerHTML: `
          <span class="vjs-seek-amount">2x</span>
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF">
            <path d="M100-240v-480l360 240-360 240Zm400 0v-480l360 240-360 240ZM180-480Zm400 0Zm-400 90 136-90-136-90v180Zm400 0 136-90-136-90v180Z"/>
          </svg>
        `,
    });
    this.topOverlay.appendChild(this.topIndicator);
    this.player.el().appendChild(this.topOverlay);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private leftOverlay: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rightOverlay: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private leftIndicator: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rightIndicator: any;

  initDoubleTap() {
    this.leftOverlay = videojs.dom.createEl("div", {
      className: "vjs-doubletap-overlay vjs-doubletap-left",
    });

    // Create right overlay
    this.rightOverlay = videojs.dom.createEl("div", {
      className: "vjs-doubletap-overlay vjs-doubletap-right",
    });

    // Create seek indicator for left
    this.leftIndicator = videojs.dom.createEl("div", {
      className: "vjs-seek-indicator",
      innerHTML: `
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF">
            <path d="M440-240 200-480l240-240 56 56-183 184 183 184-56 56Zm264 0L464-480l240-240 56 56-183 184 183 184-56 56Z"/>
          </svg>
          <span class="vjs-seek-amount">-${this.options.seekAmount}s</span>
        `,
    });

    // Create seek indicator for right
    this.rightIndicator = videojs.dom.createEl("div", {
      className: "vjs-seek-indicator",
      innerHTML: `
          <span class="vjs-seek-amount">+${this.options.seekAmount}s</span>
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF">
            <path d="M383-480 200-664l56-56 240 240-240 240-56-56 183-184Zm264 0L464-664l56-56 240 240-240 240-56-56 183-184Z"/>
          </svg>
        `,
    });

    this.leftOverlay.appendChild(this.leftIndicator);
    this.rightOverlay.appendChild(this.rightIndicator);

    this.player.el().appendChild(this.leftOverlay);
    this.player.el().appendChild(this.rightOverlay);

    const touchStartListener = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();

      this.tapStartX = e.touches[0].clientX;
      this.tapStartY = e.touches[0].clientY;
    };

    this.leftOverlay.addEventListener("touchstart", touchStartListener);
    this.rightOverlay.addEventListener("touchstart", touchStartListener);

    // Touch events for mobile
    this.leftOverlay.addEventListener("touchend", (e: TouchEvent) => {
      this.handleTap(e, "left");
    });
    this.rightOverlay.addEventListener("touchend", (e: TouchEvent) => {
      this.handleTap(e, "right");
    });
  }

  private tapStartX: number = 0;
  private tapStartY: number = 0;

  private lastTapTime: number = 0;
  private lastTapSide: "left" | "right" | null = null;

  private seekCount: number = 0;
  private leftSeekAnimationTimeout: number | undefined = undefined;
  private rightSeekAnimationTimeout: number | undefined = undefined;
  private isSeekActive: boolean = false;

  private MAX_DIST_BETWEEN_DOUBLE_TAPS = 50;

  handleTap(event: TouchEvent, side: "left" | "right") {
    event.preventDefault();
    event.stopPropagation();

    if (event.changedTouches.length == 1) {
      const tapCurrentX = event.changedTouches[0].clientX;
      const tapCurrentY = event.changedTouches[0].clientY;
      if (
        Math.abs(tapCurrentX - this.tapStartX) >
          this.MAX_DIST_BETWEEN_DOUBLE_TAPS ||
        Math.abs(tapCurrentY - this.tapStartY) >
          this.MAX_DIST_BETWEEN_DOUBLE_TAPS
      )
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - this.lastTapTime;

    // If seek is already active on this side, increment the count
    if (this.isSeekActive && this.lastTapSide === side) {
      this.seekCount++;
      this.performSeek(side, event);
      this.player.userActive(false);
      return;
    }

    // Check if this is a double tap on the same side
    if (
      timeSinceLastTap < this.options.tapTimeout &&
      this.lastTapSide === side
    ) {
      // Double tap detected - start seek sequence
      this.seekCount = 1;
      this.isSeekActive = true;
      this.performSeek(side, event);
      this.player.userActive(false);
    } else {
      // First tap
      this.seekCount = 0;
      this.lastTapTime = currentTime;
      this.lastTapSide = side;

      // don't show player controls if event wasn't a tap
      if (!this.isHolding && !(this.isDragging && this.yDistanceMoved > 1))
        this.player.userActive(!this.player.userActive());
    }
  }

  performSeek(side: "left" | "right", event: TouchEvent) {
    const currentTime = this.player.currentTime();
    const totalSeekAmount = this.seekCount * this.options.seekAmount;
    const seekDirection = side === "left" ? -1 : 1;
    const seekAmount = seekDirection * this.options.seekAmount;
    const newTime = Math.max(
      0,
      Math.min(this.player.duration(), currentTime + seekAmount)
    );

    this.player.currentTime(newTime);

    // Update the indicator to show cumulative seek amount
    this.updateSeekIndicator(side, totalSeekAmount);

    // Show visual feedback
    this.showSeekFeedback(side);
    this.createRipple(side, event);

    // Reset the seek sequence after a delay
    if (side == "left") {
      clearTimeout(this.leftSeekAnimationTimeout);
      this.leftSeekAnimationTimeout = setTimeout(() => {
        this.resetSeekSequence(side);
      }, 800);
    } else {
      clearTimeout(this.rightSeekAnimationTimeout);
      this.rightSeekAnimationTimeout = setTimeout(() => {
        this.resetSeekSequence(side);
      }, 800);
    }
  }

  updateSeekIndicator(side: "left" | "right", totalAmount: number) {
    const indicator =
      side === "left" ? this.leftIndicator : this.rightIndicator;
    const seekAmountSpan = indicator.querySelector(".vjs-seek-amount");
    const sign = side === "left" ? "-" : "+";
    seekAmountSpan.textContent = `${sign}${totalAmount}s`;
  }

  resetSeekSequence(side: "left" | "right") {
    const overlay = side === "left" ? this.leftOverlay : this.rightOverlay;
    overlay.classList.remove("show");
    this.seekCount = 0;
    this.isSeekActive = false;
    this.lastTapTime = 0;
    this.lastTapSide = null;
  }

  showSeekFeedback(side: "left" | "right") {
    const overlay = side === "left" ? this.leftOverlay : this.rightOverlay;

    // Show overlay with indicator
    overlay.classList.add("show");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRipple(side: "left" | "right", event: any) {
    const overlay = side === "left" ? this.leftOverlay : this.rightOverlay;
    const rect = overlay.getBoundingClientRect();

    // Get tap position
    let x, y;
    if (event.touches && event.touches[0]) {
      x = event.touches[0].clientX - rect.left;
      y = event.touches[0].clientY - rect.top;
    } else if (event.changedTouches && event.changedTouches[0]) {
      x = event.changedTouches[0].clientX - rect.left;
      y = event.changedTouches[0].clientY - rect.top;
    } else {
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    // Create ripple element
    const ripple = videojs.dom.createEl("div", {
      className: "vjs-ripple",
    }) as HTMLElement;

    const size = Math.max(rect.width, rect.height);
    ripple.style.width = size + "px";
    ripple.style.height = size + "px";
    ripple.style.left = x - size / 2 + "px";
    ripple.style.top = y - size / 2 + "px";

    overlay.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      overlay.removeChild(ripple);
    }, 500);
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

          .vjs-top-overlay {
            position: absolute;
            top: 0;
            width: 100%;
            z-index: 1;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .vjs-top-overlay.show {
            opacity: 1;
          }

          .vjs-speed-indicator {
            position: absolute;
            top: 10px;
            left: calc(50% - 39px);
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
            width: 78px;
            background-color: rgba(0,0,0,0.6);
            padding: 7px 16px;
            border-radius: 16px;
            pointer-events: none;
            user-select: none;
          }

          .vjs-top-overlay.show .vjs-speed-indicator {
            opacity: 1;
          }



          .vjs-doubletap-overlay {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 40%;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .vjs-doubletap-left {
            left: 0;
          }

          .vjs-doubletap-right {
            right: 0;
          }

          .vjs-fullscreen .vjs-doubletap-overlay {
            display: block;
          }

          .vjs-doubletap-overlay.show {
            opacity: 1;
          }

          .vjs-seek-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            user-select: none;
          }

          .vjs-doubletap-overlay.show .vjs-seek-indicator {
            opacity: 1;
          }

          .vjs-seek-amount {
            color: white;
            font-size: 16px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          }

          .vjs-ripple {
            position: absolute;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.4);
            pointer-events: none;
            animation: ripple-animation 500ms ease-out;
          }

          @keyframes ripple-animation {
            from {
              transform: scale(0);
              opacity: 1;
            }
            to {
              transform: scale(2);
              opacity: 0;
            }
          }
      `;
    document.head.appendChild(style);
  }

  toggleSpeedFeedback(show: boolean) {
    // Show overlay with indicator
    if (show) this.topOverlay.classList.add("show");
    else this.topOverlay.classList.remove("show");
  }

  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private isDragging = false;
  private holdTimeout: number | null | undefined = null;
  private isHolding = false;
  private xDistanceMoved = 0;
  private yDistanceMoved = 0;
  private TOUCH_MOVE_2X_THRESHOLD = 15;

  initEvents() {
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

          this.startX = e.touches[0].clientX;
          this.startY = e.touches[0].clientY;
          this.currentX = this.startX;
          this.currentY = this.startY;
          // todo: find a way to get accurate status bar height, if there is one
          const STATUS_BAR_HEIGHT = 40;
          // ignores touches that started at top of screen - user likely pulled down to show status bar
          if (this.startY < STATUS_BAR_HEIGHT) return;
          this.isDragging = true;
          this.isHolding = false;

          this.holdTimeout = setTimeout(() => {
            if (
              this.xDistanceMoved > this.TOUCH_MOVE_2X_THRESHOLD ||
              this.yDistanceMoved > this.TOUCH_MOVE_2X_THRESHOLD
            )
              return;
            this.isHolding = true;
            this.player.playbackRate(2);
            navigator.vibrate?.(10);
            this.player.userActive(false);

            // reset dragging
            videoEl.style.transform = "scale(1) translateY(0)";
            this.isDragging = false;

            this.toggleSpeedFeedback(true);
          }, holdDelay);
        },
        { passive: false }
      );

      // === TOUCH MOVE ===
      element.addEventListener(
        "touchmove",
        (e: TouchEvent) => {
          if (!this.isDragging || e.touches.length !== 1) return;
          e.preventDefault();

          this.xDistanceMoved = Math.abs(this.currentX - this.startX);
          this.yDistanceMoved = Math.abs(this.currentY - this.startY);

          if (this.isHolding) return;

          this.currentX = e.touches[0].clientX;
          this.currentY = e.touches[0].clientY;
          const deltaY = this.startY - this.currentY;
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
        if (this.holdTimeout != null) clearTimeout(this.holdTimeout);

        if (this.isHolding) {
          this.player.playbackRate(1);
          this.toggleSpeedFeedback(false);
        }

        const deltaY = this.startY - this.currentY;
        const isFullscreen = this.player.isFullscreen();

        if (!isFullscreen && deltaY > pullDistance) {
          this.player.requestFullscreen();
        } else if (isFullscreen && deltaY < -pullDistance) {
          this.player.exitFullscreen();
        }

        // Reset transform smoothly
        videoEl.style.transform = "scale(1) translateY(0)";
        this.isDragging = false;
      });

      // === TOUCH CANCEL ===
      element.addEventListener("touchcancel", () => {
        if (this.holdTimeout != null) clearTimeout(this.holdTimeout);
        if (this.isHolding) this.player.playbackRate(1);
        videoEl.style.transform = "scale(1) translateY(0)";
        this.isDragging = false;
      });
    };

    addTouchEventListeners(this.videoEl, this.videoEl);

    addTouchEventListeners(this.leftOverlay, this.videoEl);
    addTouchEventListeners(this.rightOverlay, this.videoEl);

    this.player.ready(() => {
      this.player.addChild("BigButtonGroup");
      const bigButtonGroupEl = this.player
        .el()
        .querySelector(".vjs-big-button-group");
      addTouchEventListeners(bigButtonGroupEl, this.videoEl);
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
