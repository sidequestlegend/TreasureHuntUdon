// PersonalScoreList.cs (PSL) on the portkit runtime: the "found:" panel with the local player's own counts.
//
// Upstream destroys and instantiates a row per name on every refresh (PSL:71-100, PSL:133-143); the panel (portkit ui.ts,
// on the kit's "PersonalScoreList" anchor, which this behaviour places) holds three rows that are shown and filled. Dead upstream code is not ported: FillValues (PSL:102-127),
// PopulateListOfPlayers (PSL:146-155) and SortListOfDictionaries (PSL:185-223, never called).

import { Behaviour, el, Quaternion, type UiPanel } from "../portkit/src/index.ts";
import { GetCount } from "./PlayerData.ts";
import { readSettings, type Kind } from "./Settings.ts";
import { UniqueNames } from "./Scoreboard.ts";
import type { TreasureHuntController } from "./TreasureHuntController.ts";

/** Rows on the personal list: one per kind. */
export const PERSONAL_ROWS = 3;

/** The "found:" panel, 0.3 x 0.24 m (upstream's was 0.28 x 0.22). Element ids: `title`, `prow<r>`, `pname<r>`, `pscore<r>`. */
export function personalPanel() {
  const rows = [];
  for (let r = 0; r < PERSONAL_ROWS; r++) {
    rows.push(
      el("VisualElement", { id: `prow${r}`, class: ["alt", "alt-row", "alt-row--between"], visible: false }, [
        el("KitText", { id: `pname${r}`, text: "", variant: "body" }),
        el("KitText", { id: `pscore${r}`, text: "", variant: "body", tone: "accent" }),
      ]),
    );
  }
  return el("KitSurface", { id: "personal", variant: "page", radius: "panel", padding: "s3", style: { width: "100%", height: "100%" } }, [
    el("KitText", { id: "title", text: "found:", variant: "heading" }),
    el("KitDivider", { inset: "s1" }),
    ...rows,
  ]);
}

export class PersonalScoreList extends Behaviour {
  // From bindings.json.
  treasuresPool!: TreasureHuntController;

  panel!: UiPanel;

  listOfTreasures: Kind[] = [];
  /** Name -> the local player's count (PSL's dataBase). */
  dataBase = new Map<Kind, number>();
  private initiated = false;

  override Start(): void {
    // Port-only: the panel has its own place (setting `personal-list`), as upstream's separate object did.
    const settings = readSettings(this.Settings);
    const r = settings.personalListRotation;
    this.transform.SetPositionAndRotation(settings.personalListPosition, Quaternion.Euler(r.x, r.y, r.z));
    this.panel = this.UI.Panel({ id: "personal", anchor: this.gameObject.key, size: [0.3, 0.24], pixelsPerMetre: 600, root: personalPanel() });
    this.SendCustomEventDelayedSeconds("Initiate", 1);
  }

  /** PSL:33-39. */
  Initiate(): void {
    this.InitiateItems();
    this.FillDataBase();
    this.initiated = true;
    this.PrintElements();
  }

  /** PSL:40-54. */
  InitiateItems(): void {
    this.dataBase.clear();
    this.listOfTreasures = UniqueNames(this.treasuresPool.PoolKinds()) as Kind[];
    for (const t of this.listOfTreasures) this.dataBase.set(t, 0);
  }

  /** PSL:56-69: a missing key reads 0 (PSL:67). */
  FillDataBase(): void {
    for (const key of this.listOfTreasures) this.dataBase.set(key, GetCount(this.PlayerData, this.Networking.LocalPlayer, key));
  }

  /** PSL:71-100. */
  PrintElements(): void {
    if (!this.initiated) return;
    for (let i = 0; i < PERSONAL_ROWS; i++) {
      const name = this.listOfTreasures[i];
      this.panel.Get(`prow${i}`).visible = name !== undefined;
      if (name === undefined) continue;
      this.panel.Get(`pname${i}`).text = name;
      this.panel.Get(`pscore${i}`).text = String(this.dataBase.get(name) ?? 0);
    }
  }

  private Refresh(): void {
    if (!this.initiated) return;
    this.FillDataBase();
    this.PrintElements();
  }

  // PSL:157-183, plus OnPlayerRestored (the runtime's first load of saved data). A player's first saved data arrives as OnPlayerDataUpdated too (right after OnPlayerRestored).
  override OnPlayerDataUpdated(): void {
    this.Refresh();
  }
  override OnPlayerJoined(): void {
    this.Refresh();
  }
  override OnPlayerLeft(): void {
    this.Refresh();
  }
}
