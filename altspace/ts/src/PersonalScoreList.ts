// PersonalScoreList.cs (PSL) on the portkit runtime: the "found:" panel with the local player's own counts.
//
// Upstream destroys and instantiates a row per name on every refresh (PSL:71-100, PSL:133-143); the kit holds
// three rows that are shown and filled. Dead upstream code is not ported: FillValues (PSL:102-127),
// PopulateListOfPlayers (PSL:146-155) and SortListOfDictionaries (PSL:185-223, never called).

import { Behaviour, Quaternion, type GameObject, type TextRef } from "../portkit/src/index.ts";
import { GetCount } from "./PlayerData.ts";
import { readSettings, type Kind } from "./Settings.ts";
import { UniqueNames } from "./Scoreboard.ts";
import type { TreasureHuntController } from "./TreasureHuntController.ts";

export class PersonalScoreList extends Behaviour {
  // From bindings.json.
  treasuresPool!: TreasureHuntController;
  rowObjects: GameObject[] = [];
  rowNames: TextRef[] = [];
  rowScores: TextRef[] = [];

  listOfTreasures: Kind[] = [];
  /** Name -> the local player's count (PSL's dataBase). */
  dataBase = new Map<Kind, number>();
  private initiated = false;

  override Start(): void {
    // Port-only: the panel has its own place (setting `personal-list`), as upstream's separate object did.
    const settings = readSettings(this.Settings);
    const r = settings.personalListRotation;
    this.transform.SetPositionAndRotation(settings.personalListPosition, Quaternion.Euler(r.x, r.y, r.z));
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
    for (let i = 0; i < this.rowObjects.length; i++) {
      const name = this.listOfTreasures[i];
      this.rowObjects[i]!.SetActive(name !== undefined);
      if (name === undefined) continue;
      this.rowNames[i]!.text = name;
      this.rowScores[i]!.text = String(this.dataBase.get(name) ?? 0);
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
