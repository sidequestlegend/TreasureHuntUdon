// TreasureReturner.cs (TR) on the portkit runtime: the invisible "return button" on each treasure.
//
// Upstream: Interact (VRChat proximity 0.7 m, text "Found!") calls ReturnItem with the button's name as the
// pool index, then adds 1 to the local player's saved count under the treasure's name (TR:22-30). OnDisable
// spawns the pick effect where the button was (TR:35-38).
//
// Here:
//   - the button is a click on a layer-5 collider the kit builder made; the distance check is the
//     controller's (find-distance, nearest of head and hands). There is no hover label.
//   - the count goes up only when the referee has recorded this player's find (CreditFind, called by the
//     controller), not at the click: a simultaneous find by two players is credited once (PORT.md 10.1 row 8).
//   - the effect comes from a pool of four, played by the controller when the treasure hides on a client.

import { Behaviour, type Vector3 } from "../portkit/src/index.ts";
import { AddFind } from "./PlayerData.ts";
import { kindOfSlot, type Kind } from "./Settings.ts";
import type { TreasureHuntController } from "./TreasureHuntController.ts";

export class TreasureReturner extends Behaviour {
  // From bindings.json.
  treasureHuntController!: TreasureHuntController;
  /** Upstream: the button's name, the pool index (THC:115). Here the kit slot; the controller maps it. */
  slot = 0;
  /** Upstream: the name of the treasure the button sits on (TR:28), the saved-data key. */
  treasureName: Kind | "" = "";

  /** Credits counted on this client (for tests). */
  credited = 0;

  override Interact(): void {
    // Convert slot to the pool index and ask the controller to return it (TR:25).
    this.treasureHuntController.RequestReturn(this.slot);
  }

  /** TR:28-30: check current score, add 1 and save. Runs on the finder's client once the find is recorded. */
  CreditFind(): void {
    const parentName: Kind = this.treasureName || kindOfSlot(this.slot);
    const value = AddFind(this.PlayerData, this.Networking.LocalPlayer, parentName);
    this.credited++;
    this.Debug.Log(`Treasure ${parentName} found, updating score to ${value}`);
  }

  /** TR:35-38: the pick effect where the treasure was. */
  OnDisable(position: Vector3): void {
    this.treasureHuntController.PlayPickEffect(position);
  }
}
