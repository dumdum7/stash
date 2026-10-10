/* eslint-disable @typescript-eslint/naming-convention */
import videojs, { VideoJsPlayer } from "video.js";
import { faWaveSquare } from "@fortawesome/free-solid-svg-icons";

function iconSvg() {
  const [width, height, , , path] = faWaveSquare.icon;
  const d = Array.isArray(path) ? path.join(" ") : path;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

class InteractiveButton extends videojs.getComponent("Button") {
  private devicePaused = false;

  constructor(player: VideoJsPlayer) {
    super(player);
    const placeholder = this.el().querySelector(".vjs-icon-placeholder");
    if (placeholder) {
      placeholder.innerHTML = iconSvg();
    }
    this.updateState();
  }

  buildCSSClass() {
    return `vjs-interactive-button ${super.buildCSSClass()}`;
  }

  private updateState() {
    this.toggleClass("vjs-interactive-paused", this.devicePaused);
    if (this.devicePaused) {
      this.controlText(
        this.localize("Interactive device paused (click to resume)")
      );
    } else {
      this.controlText(this.localize("Pause interactive device"));
    }
  }

  handleClick(event: Event) {
    // Prevent the click from bubbling up and affecting the video player
    event.stopPropagation();
    this.trigger("interactivetoggle");
  }

  public setPaused(paused: boolean) {
    this.devicePaused = paused;
    this.updateState();
  }
}

class InteractiveButtonPlugin extends videojs.getPlugin("plugin") {
  private button: InteractiveButton;

  onToggle: () => void = () => {};

  constructor(player: VideoJsPlayer) {
    super(player);

    this.button = new InteractiveButton(player);
    this.button.hide();
    this.button.on("interactivetoggle", () => this.onToggle());

    player.ready(() => {
      // Add button to control bar, before the fullscreen button
      const { controlBar } = this.player;
      controlBar.addChild(this.button);
      const fullscreenToggle = controlBar.getChild("fullscreenToggle");
      if (fullscreenToggle) {
        controlBar.el().insertBefore(this.button.el(), fullscreenToggle.el());
      }
    });
  }

  public setShowButton(show: boolean) {
    if (show) {
      this.button.show();
    } else {
      this.button.hide();
    }
  }

  public setPaused(paused: boolean) {
    this.button.setPaused(paused);
  }
}

// Register the plugin with video.js.
videojs.registerComponent("InteractiveButton", InteractiveButton);
videojs.registerPlugin("interactiveButton", InteractiveButtonPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    interactiveButton: () => InteractiveButtonPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    interactiveButton?: {};
  }
}

export default InteractiveButtonPlugin;
