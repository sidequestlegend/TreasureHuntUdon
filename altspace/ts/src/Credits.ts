// Port-only: the credits under the boards (setting `credits`, default true): what the game is, that finds are saved on
// this device only (a coordinator decision: the credits must say so), and the attribution. Upstream has no such panel;
// until the UI Toolkit pass it was a uGUI canvas the kit builder made. Now a panel (portkit ui.ts) on the kit's
// "Credits" anchor. The line about saving always shows; the rest can be folded away by each viewer for themselves
// (a local convenience: nothing is synced).

import { Behaviour, el, type UiPanel } from "../portkit/src/index.ts";
import { readSettings } from "./Settings.ts";

export const CREDITS_TITLE = "Treasure Hunt";
export const CREDITS_SAVED = "Your finds are saved on this device only (another device, or clearing the app's data, starts from zero).";
export const CREDITS_ABOUT =
  "Find the coins, gems and stars that appear around here: walk up close and click one. " +
  "A port of TreasureHuntUdon by Hoshou Neko (github.com/HoshouNeko/TreasureHuntUdon, MIT). " +
  "Models, sounds and matcaps made for this port (MIT). Not affiliated with VRChat.";

/** 1.5 x 0.16 m, as upstream's credits canvas sat (1.5 x 0.15 m, 0.45 m under the root). Ids: `title`, `saved`, `fold`, `about`. */
export function creditsPanel() {
  return el("KitSurface", { id: "credits", variant: "page", radius: "card", padding: "s2", style: { width: "100%", height: "100%" } }, [
    el("VisualElement", { id: "head", class: ["alt", "alt-row"] }, [
      el("KitText", { id: "title", text: CREDITS_TITLE, variant: "label", class: ["alt-no-shrink", "alt-mr-3"] }),
      el("KitText", { id: "saved", text: CREDITS_SAVED, variant: "small", tone: "warning", wrap: true, class: "alt-grow" }),
      el("KitIconButton", { id: "fold", icon: "chevron-up", size: "xs", variant: "ghost", tooltip: "Fold the credits away" }),
    ]),
    el("KitText", { id: "about", text: CREDITS_ABOUT, variant: "caption", tone: "secondary", wrap: true, class: "alt-mt-1" }),
  ]);
}

export class Credits extends Behaviour {
  panel!: UiPanel;
  /** This viewer folded the attribution away. */
  folded = false;

  override Start(): void {
    this.panel = this.UI.Panel({ id: "credits", anchor: this.gameObject.key, size: [1.5, 0.16], pixelsPerMetre: 600, visible: readSettings(this.Settings).credits, root: creditsPanel() });
    this.panel.Get("fold").OnClick(() => this.Fold(!this.folded));
  }

  /** Folds the attribution away (the line about saving stays) or opens it again. */
  Fold(folded: boolean): void {
    this.folded = folded;
    this.panel.Get("about").visible = !folded;
    this.panel.Get("fold").Set("icon", folded ? "chevron-down" : "chevron-up").Set("tooltip", folded ? "Show the credits" : "Fold the credits away");
  }
}
