// UI panels: a game describes world-space UI Toolkit panels (BS.UIPanel filled with the Altspace UI Kit's controls,
// BS.UIKit*) and the platform builds them under kit objects. Games make their panels in Start and update elements from
// their state; the layer sends only what changed, once per tick.
//
//   const board = this.UI.Panel({
//     id: "board", anchor: "boardAnchor", size: [1.6, 0.75],
//     root: el("KitSurface", { variant: "page", padding: "s4" }, [
//       el("KitText", { id: "title", text: "Scores", variant: "title" }),
//       el("KitButton", { id: "reset", text: "Reset", variant: "secondary" }),
//     ]),
//   });
//   board.Get("reset").OnClick(() => this.SendCommand("Reset"));
//   board.Get("title").text = "Scores: 3";
//
// A panel is `size` metres (width, height) drawn at `pixelsPerMetre` (default 400): its resolution is size x density in
// pixels and its object is scaled to match, so kit sizes (a 16 px body text, a 40 px button) are sizes on that grid
// (at 400 px/m a 16 px text is 4 cm tall). It is read from its object's back (-Z), like a uGUI canvas, and centred on it.
// Element ids are the elements' names in Unity, so a Play-mode test finds them (`uiclick`, `uiprobe`).
// Platform facts this rests on (spike, treasure hunt, SDK 4.0.29 Play mode) are in the README, "UI panels".

import type { HostObject, Platform, PlatformPanel, UiEventKind, UiOp, UiValue, Unsubscribe } from "./types.ts";
import { Vector3 } from "./values.ts";

export type { UiEventKind, UiValue } from "./types.ts";

/**
 * The properties each control takes (Creator SDK docs, components/ui-kit.md and ui-system.md), besides the common
 * `visible`, `enabled`, `tooltip`. A name not listed is refused with a warning, here and in the fake room, so a typo
 * fails in Node rather than as a silent no-op in the app.
 */
export const UI_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  KitText: ["text", "variant", "tone", "wrap", "truncate"],
  KitIcon: ["icon", "size", "tone", "image"],
  KitImage: ["image", "fit", "radius", "corners", "aspect"],
  KitButton: ["text", "icon", "iconPosition", "variant", "size", "block", "selected", "loading"],
  KitIconButton: ["icon", "size", "variant", "selected"],
  KitTextField: ["value", "text", "label", "placeholder", "multiline", "maxLength", "isReadOnly", "isPasswordField", "size", "invalid", "icon"],
  KitToggle: ["checked", "value", "label", "size"],
  KitSlider: ["value", "minValue", "maxValue", "step", "showValue", "valueFormat", "label", "tone"],
  KitDropdown: ["choices", "value", "index", "placeholder", "size", "open", "maxVisible"],
  KitChip: ["text", "selected", "count", "icon", "caret", "variant"],
  KitBadge: ["text", "icon", "tone", "variant", "size"],
  KitAvatar: ["image", "initials", "size", "presence", "speaking", "ring", "badgeImage"],
  KitDivider: ["orientation", "inset"],
  KitProgressBar: ["value", "tone", "size", "label"],
  KitSpinner: ["size", "tone", "paused"],
  KitScrollView: ["scrollbar", "horizontalScrolling", "verticalScrolling"],
  KitSurface: ["variant", "radius", "padding", "direction"],
  KitSearchBar: ["value", "text", "placeholder", "size", "clearable"],
  KitOptionRow: ["label", "description", "valueText", "divider"],
  KitFormField: ["label", "counter", "required", "help", "error"],
  KitTabs: ["choices", "value", "variant", "disabledChoices"],
  KitChipGroup: ["label", "choices", "value", "multiple"],
  KitCountPill: ["icon", "count", "active", "tone", "size", "interactive"],
  KitStat: ["icon", "value", "label", "tone"],
  KitListRow: ["title", "subtitle", "meta", "icon", "image", "imageShape", "selected", "unread"],
  KitMessageBubble: ["text", "side", "author", "time", "grouped"],
  KitNavItem: ["key", "text", "icon", "selected", "badge"],
  KitEmptyState: ["icon", "title", "message"],
  KitSectionHeader: ["eyebrow", "title", "count", "actionText"],
  KitCard: ["variant", "image", "title", "subtitle", "badges", "count", "countIcon", "countActive", "liveCount", "actionText", "actionIcon", "stats", "selected", "menu"],
  KitEventCard: ["day", "month", "image", "title", "time", "host", "badges", "live", "liveCount", "interested", "count", "countActive"],
  KitPersonCard: ["variant", "image", "title", "subtitle", "meta", "presence", "speaking", "status", "badge", "badgeTone"],
  KitHeroBanner: ["image", "eyebrow", "eyebrowTone", "title", "meta", "size"],
  KitDetailHeader: ["image", "eyebrow", "title", "badges", "meta", "stats"],
  KitModal: ["open", "title", "message", "variant", "showClose", "primaryText", "secondaryText", "primaryVariant", "scrim", "dismissOnScrim"],
  KitNavBar: ["value"],
  KitActionGrid: ["columns"],
  // the plain elements (ui-system.md), for layout around the kit's controls
  VisualElement: [],
  Label: ["text"],
  Button: ["text"],
  Toggle: ["checked"],
  Slider: ["minValue", "maxValue", "value"],
  ScrollView: ["horizontalScrolling", "verticalScrolling"],
  TextField: ["value", "placeholder", "maxLength", "isPasswordField", "isReadOnly", "label"],
};

/** Every element takes these (UIElement base class). */
export const UI_COMMON_PROPERTIES: readonly string[] = ["visible", "enabled", "tooltip"];

/** The controls whose change event carries their own value, and the property that holds it. */
const VALUE_PROPERTY: Readonly<Record<string, string>> = {
  KitToggle: "checked",
  Toggle: "checked",
  KitSlider: "value",
  Slider: "value",
  KitDropdown: "value",
  KitTabs: "value",
  KitChipGroup: "value",
  KitTextField: "value",
  TextField: "value",
  KitSearchBar: "value",
  KitNavBar: "value",
};

export function uiTypeKnown(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(UI_PROPERTIES, type);
}

export function uiPropertyKnown(type: string, name: string): boolean {
  return UI_COMMON_PROPERTIES.indexOf(name) >= 0 || (UI_PROPERTIES[type] ?? []).indexOf(name) >= 0;
}

// ---- describing a panel ---------------------------------------------------------------------------------------

export interface UiNode {
  type: string;
  id?: string;
  props: Record<string, UiValue>;
  style: Record<string, string>;
  classes: string[];
  children: UiNode[];
}

export interface UiAttributes {
  /** The element's id in its panel (letters, digits, `_`, `-`): `panel.Get(id)`, and its name in Unity. */
  id?: string;
  /** Styles by camelCase name (`backgroundColor`, `width`): ui-system.md, "Style Properties Reference". */
  style?: Record<string, string | number>;
  /** UI Kit classes (`alt-row`, `alt-grow`, ...): a plain element needs `alt` first. */
  class?: string | string[];
  /** Everything else is a property of the control: `text`, `variant`, `visible`, ... */
  [property: string]: UiValue | Record<string, string | number> | string[] | undefined;
}

/** One element of a panel: `el("KitText", { id: "title", text: "Hi", variant: "heading" })`. */
export function el(type: string, attributes: UiAttributes = {}, children: UiNode[] = []): UiNode {
  const props: Record<string, UiValue> = {};
  const style: Record<string, string> = {};
  let classes: string[] = [];
  let id: string | undefined;
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    if (key === "id") id = String(value);
    else if (key === "style") for (const [k, v] of Object.entries(value as Record<string, string | number>)) style[k] = typeof v === "number" ? `${v}px` : String(v);
    else if (key === "class") classes = Array.isArray(value) ? value.map(String) : String(value).split(/\s+/).filter(Boolean);
    else props[key] = value as UiValue;
  }
  const node: UiNode = { type, props, style, classes, children };
  if (id !== undefined) node.id = id;
  return node;
}

export interface PanelDef {
  /** Unique in the instance: letters, digits, `_`, `-`. The panel's object is named `pk1ui:<slug>:<inst>:<id>`. */
  id: string;
  /** The bindings key of the kit object the panel hangs under (it follows that object). */
  anchor: string;
  /** Width and height in metres. */
  size: [number, number];
  /** Pixels per metre of the panel's grid (default 400). */
  pixelsPerMetre?: number;
  /** Offset from the anchor, in its axes (metres). */
  position?: Vector3 | [number, number, number];
  /** Euler degrees, in the anchor's axes. */
  rotation?: Vector3 | [number, number, number];
  /** False: the panel starts hidden (`panel.visible`). */
  visible?: boolean;
  /** The elements: one node or several, under the panel's own top element (which fills the panel). */
  root: UiNode | UiNode[];
}

// ---- the game's handles ---------------------------------------------------------------------------------------

export interface UiView {
  /** Makes a panel (in Start: the kit is loaded by then). */
  Panel(def: PanelDef): UiPanel;
  /** A panel made earlier, by id; null if there is none. */
  GetPanel(id: string): UiPanel | null;
  readonly panels: readonly UiPanel[];
}

const ID = /^[A-Za-z0-9_-]{1,48}$/;

export class UiElement {
  readonly id: string;
  readonly type: string;
  readonly panel: UiPanel;
  parent: UiElement | null;
  readonly children: UiElement[] = [];
  destroyed = false;
  private readonly props = new Map<string, UiValue>();
  private readonly styles = new Map<string, string>();
  private readonly classSet = new Set<string>();
  private readonly clickHandlers: Array<() => void> = [];
  private readonly changeHandlers: Array<(value: UiValue) => void> = [];

  /** @internal made by UiPanel */
  constructor(panel: UiPanel, id: string, type: string, parent: UiElement | null) {
    this.panel = panel;
    this.id = id;
    this.type = type;
    this.parent = parent;
  }

  /** A property as the game last set it (or as the player changed it), or undefined. */
  Get(name: string): UiValue | undefined {
    return this.props.get(name);
  }

  /** Sets a control property; sent at the end of the tick, and only if it differs from what was sent. */
  Set(name: string, value: UiValue): this {
    if (this.destroyed) return this;
    if (!uiPropertyKnown(this.type, name)) {
      this.panel._warn(`${this.type} '${this.id}' has no property '${name}' (UI_PROPERTIES)`);
      return this;
    }
    this.props.set(name, value);
    this.panel._queueSet(this, name, value);
    return this;
  }

  get text(): string { return String(this.props.get("text") ?? ""); }
  set text(value: string) { this.Set("text", value); }
  /** False hides the element and takes it out of the layout. */
  get visible(): boolean { return this.props.get("visible") !== false; }
  set visible(value: boolean) { this.Set("visible", value); }
  /** False greys it out and stops input. */
  get enabled(): boolean { return this.props.get("enabled") !== false; }
  set enabled(value: boolean) { this.Set("enabled", value); }
  get value(): UiValue | undefined { return this.props.get("value"); }
  set value(value: UiValue) { this.Set("value", value); }
  get checked(): boolean { return this.props.get("checked") === true; }
  set checked(value: boolean) { this.Set("checked", value); }

  /** True when this element and every element above it are visible, and the panel is. */
  get shown(): boolean {
    for (let at: UiElement | null = this; at; at = at.parent) if (!at.visible || at.styles.get("display") === "none") return false;
    return this.panel.visible && !this.destroyed;
  }

  get enabledInHierarchy(): boolean {
    for (let at: UiElement | null = this; at; at = at.parent) if (!at.enabled) return false;
    return true;
  }

  GetStyle(name: string): string | undefined {
    return this.styles.get(name);
  }

  /** A style by camelCase name; a number is pixels. */
  SetStyle(name: string, value: string | number): this {
    if (this.destroyed) return this;
    const text = typeof value === "number" ? `${value}px` : value;
    this.styles.set(name, text);
    this.panel._queueStyle(this, name, text);
    return this;
  }

  HasClass(name: string): boolean {
    return this.classSet.has(name);
  }

  AddClass(name: string): this {
    if (this.destroyed || this.classSet.has(name)) return this;
    this.classSet.add(name);
    this.panel._queue({ op: "class", id: this.id, name, on: true });
    return this;
  }

  RemoveClass(name: string): this {
    if (this.destroyed || !this.classSet.has(name)) return this;
    this.classSet.delete(name);
    this.panel._queue({ op: "class", id: this.id, name, on: false });
    return this;
  }

  /** The player pressed it. */
  OnClick(handler: () => void): Unsubscribe {
    if (!this.clickHandlers.length) this.panel._queue({ op: "listen", id: this.id, kind: "click" });
    this.clickHandlers.push(handler);
    return () => remove(this.clickHandlers, handler);
  }

  /**
   * The player changed it (a toggle, a slider, tabs, a dropdown, a text field: the new value), or pressed one of a
   * control's named parts (`card:action`, `modal:close`: the action's name). Not raised when the script sets a value.
   */
  OnChange(handler: (value: UiValue) => void): Unsubscribe {
    if (!this.changeHandlers.length) this.panel._queue({ op: "listen", id: this.id, kind: "change" });
    this.changeHandlers.push(handler);
    return () => remove(this.changeHandlers, handler);
  }

  /** Adds an element (and its children) at the end of this one. */
  Append(node: UiNode): UiElement {
    return this.panel._build(node, this);
  }

  /** Removes the element and everything under it. */
  Destroy(): void {
    if (this.destroyed) return;
    this.panel._destroy(this);
  }

  /** @internal what the platform reported */
  _event(kind: UiEventKind, raw: unknown): void {
    if (this.destroyed || !this.shown || !this.enabledInHierarchy) return; // a click that raced a hide or a disable
    if (kind === "click") {
      for (const handler of this.clickHandlers.slice()) this.panel._guard(`${this.panel.id}/${this.id} click`, () => handler());
      return;
    }
    const valueProperty = VALUE_PROPERTY[this.type];
    let value: UiValue = raw === null || raw === undefined ? "" : typeof raw === "number" || typeof raw === "boolean" ? raw : String(raw);
    const named = typeof value === "string" && /^[a-z]+:[a-z]+$/.test(value) && valueProperty !== "value";
    if (valueProperty && !named) {
      if (valueProperty === "checked") value = value === true || value === "true" || value === "True" || value === 1 || value === "1";
      else if (this.type === "KitSlider" || this.type === "Slider") value = Number(value);
      this.props.set(valueProperty, value);
      this.panel._accepted(this, valueProperty, value);
    }
    for (const handler of this.changeHandlers.slice()) this.panel._guard(`${this.panel.id}/${this.id} change`, () => handler(value));
  }

  /** @internal */
  _initial(node: UiNode): void {
    for (const [name, value] of Object.entries(node.props)) this.Set(name, value);
    for (const [name, value] of Object.entries(node.style)) this.SetStyle(name, value);
    for (const name of node.classes) this.AddClass(name);
  }
}

export class UiPanel {
  readonly id: string;
  /** The panel GameObject's name: `pk1ui:<slug>:<inst>:<id>`. */
  readonly name: string;
  readonly def: Readonly<PanelDef>;
  /** The panel's own top element (it fills the panel); the definition's nodes are its children. */
  readonly root: UiElement;
  readonly resolution: { x: number; y: number };
  readonly scale: number;
  destroyed = false;
  private readonly layer: UiLayer;
  private readonly elements = new Map<string, UiElement>();
  private readonly platform: PlatformPanel | null;
  private ops: UiOp[] = [];
  /** (id, property) -> the pending op, so a second change before the flush replaces the first in place. */
  private readonly pendingSets = new Map<string, UiOp & { op: "set" | "style" }>();
  /** (id, property) -> what the platform has (sent, or reported by the player). */
  private readonly sent = new Map<string, UiValue>();
  private autoId = 0;

  /** @internal made by UiLayer */
  constructor(layer: UiLayer, def: PanelDef, name: string, platform: (panel: UiPanel) => PlatformPanel | null) {
    this.layer = layer;
    this.id = def.id;
    this.def = def;
    this.name = name;
    const density = def.pixelsPerMetre && def.pixelsPerMetre > 0 ? def.pixelsPerMetre : DEFAULT_PIXELS_PER_METRE;
    this.resolution = { x: Math.max(1, Math.round(def.size[0] * density)), y: Math.max(1, Math.round(def.size[1] * density)) };
    // The SDK draws a panel at 100 pixels per metre of its object (ui-system.md, and the panel settings' pixels per unit).
    this.scale = 100 / density;
    this.platform = platform(this);
    this.root = new UiElement(this, "__root", "VisualElement", null);
    this.elements.set(this.root.id, this.root);
    this._queue({ op: "create", id: this.root.id, type: "VisualElement", parent: null });
    this.root.SetStyle("width", "100%");
    this.root.SetStyle("height", "100%");
    if (def.visible === false) this.root.visible = false;
    for (const node of Array.isArray(def.root) ? def.root : [def.root]) this._build(node, this.root);
  }

  /** The element with that id. Throws if there is none (a typo in a game should fail loudly in its tests). */
  Get(id: string): UiElement {
    const found = this.elements.get(id);
    if (!found || found.destroyed) throw new Error(`panel '${this.id}' has no element '${id}'`);
    return found;
  }

  Has(id: string): boolean {
    const found = this.elements.get(id);
    return !!found && !found.destroyed;
  }

  get elementIds(): string[] {
    return [...this.elements.keys()].filter((id) => id !== "__root");
  }

  /** The whole panel shown or hidden (its top element: a panel's object is never switched off, see README). */
  get visible(): boolean {
    return this.root.visible;
  }
  set visible(value: boolean) {
    this.root.visible = value;
  }

  Destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const element of this.elements.values()) element.destroyed = true;
    this.ops = [];
    this.pendingSets.clear();
    this.platform?.destroy();
    this.layer._forget(this);
  }

  /** @internal sends what changed since the last flush */
  _flush(): void {
    if (this.destroyed || !this.ops.length) return;
    const ops: UiOp[] = [];
    for (const op of this.ops) {
      if (op.op === "set" || op.op === "style") {
        const key = `${op.id}\u0000${op.op}\u0000${op.name}`;
        this.pendingSets.delete(key);
        if (this.sent.has(key) && this.sent.get(key) === op.value) continue;
        this.sent.set(key, op.value);
      }
      ops.push(op);
    }
    this.ops = [];
    this.pendingSets.clear();
    if (ops.length) {
      this.layer.stats.flushes++;
      this.layer.stats.ops += ops.length;
      this.platform?.apply(ops);
    }
  }

  /** @internal */
  _event(id: string, kind: UiEventKind, value: unknown): void {
    if (this.destroyed) return;
    const element = this.elements.get(id);
    if (element) element._event(kind, value);
  }

  /** @internal */
  _build(node: UiNode, parent: UiElement): UiElement {
    if (this.destroyed) throw new Error(`panel '${this.id}' is destroyed`);
    if (!uiTypeKnown(node.type)) throw new Error(`panel '${this.id}': no UI element type '${node.type}' (UI_PROPERTIES)`);
    let id = node.id;
    if (id === undefined) {
      do id = `e${++this.autoId}`;
      while (this.elements.has(id) && !this.elements.get(id)!.destroyed);
    } else if (!ID.test(id) || id === "__root") throw new Error(`panel '${this.id}': '${id}' is not an element id (letters, digits, _ and -, up to 48)`);
    const existing = this.elements.get(id);
    if (existing && !existing.destroyed) throw new Error(`panel '${this.id}' already has an element '${id}'`);
    const element = new UiElement(this, id, node.type, parent);
    this.elements.set(id, element);
    parent.children.push(element);
    this._queue({ op: "create", id, type: node.type, parent: parent.id });
    element._initial(node);
    for (const child of node.children) this._build(child, element);
    return element;
  }

  /** @internal */
  _destroy(element: UiElement): void {
    const mark = (e: UiElement) => {
      e.destroyed = true;
      for (const child of e.children) mark(child);
      for (const key of [...this.sent.keys()]) if (key.startsWith(e.id + "\u0000")) this.sent.delete(key);
    };
    mark(element);
    if (element.parent) remove(element.parent.children, element);
    // pending property changes of what is going are dropped; the platform removes the children with it
    const gone = new Set<string>();
    const collect = (e: UiElement) => {
      gone.add(e.id);
      e.children.forEach(collect);
    };
    collect(element);
    this.ops = this.ops.filter((op) => !((op.op === "set" || op.op === "style" || op.op === "class" || op.op === "listen") && gone.has(op.id)));
    for (const key of [...this.pendingSets.keys()]) if (gone.has(key.slice(0, key.indexOf("\u0000")))) this.pendingSets.delete(key);
    this._queue({ op: "destroy", id: element.id });
  }

  /** @internal */
  _queue(op: UiOp): void {
    if (this.destroyed) return;
    this.ops.push(op);
  }

  /** @internal */
  _queueSet(element: UiElement, name: string, value: UiValue): void {
    this.queueValue("set", element, name, value);
  }

  /** @internal */
  _queueStyle(element: UiElement, name: string, value: string): void {
    this.queueValue("style", element, name, value);
  }

  private queueValue(kind: "set" | "style", element: UiElement, name: string, value: UiValue): void {
    if (this.destroyed) return;
    const key = `${element.id}\u0000${kind}\u0000${name}`;
    const pending = this.pendingSets.get(key);
    if (pending) {
      pending.value = value as string;
      return;
    }
    const op = (kind === "set" ? { op: "set", id: element.id, name, value } : { op: "style", id: element.id, name, value: String(value) }) as UiOp & { op: "set" | "style" };
    this.pendingSets.set(key, op);
    this.ops.push(op);
  }

  /** @internal the player changed a value: the platform has it already, so it is not sent back */
  _accepted(element: UiElement, name: string, value: UiValue): void {
    this.sent.set(`${element.id}\u0000set\u0000${name}`, value);
  }

  /** @internal */
  _warn(message: string): void {
    this.layer._warn(`panel '${this.id}': ${message}`);
  }

  /** @internal */
  _guard(where: string, fn: () => void): void {
    this.layer._guard(where, fn);
  }
}

export const DEFAULT_PIXELS_PER_METRE = 400;

export interface UiLayerHost {
  slug: string;
  inst: string;
  platform: Platform | null;
  /** The kit object a panel hangs under, by bindings key (null: none, so the panel exists for the game only). */
  anchor(key: string): HostObject | null;
  /** Runs game code (event handlers) guarded, and only while the instance runs. */
  guard(where: string, fn: () => void): void;
  log(level: "info" | "warn" | "error", message: string): void;
  /** The kit path of a bindings key (for `switchedOff`). */
  pathOf?(key: string): string | undefined;
}

/** One instance's panels. */
export class UiLayer implements UiView {
  private readonly host: UiLayerHost;
  private readonly list: UiPanel[] = [];
  private readonly warned = new Set<string>();
  /** For tests: flushes that sent something, and the ops they sent. */
  readonly stats = { flushes: 0, ops: 0 };
  disposed = false;

  constructor(host: UiLayerHost) {
    this.host = host;
  }

  get panels(): readonly UiPanel[] {
    return this.list;
  }

  GetPanel(id: string): UiPanel | null {
    return this.list.find((p) => p.id === id) ?? null;
  }

  Panel(def: PanelDef): UiPanel {
    if (this.disposed) throw new Error("the instance is gone");
    if (!ID.test(def.id)) throw new Error(`'${def.id}' is not a panel id (letters, digits, _ and -, up to 48)`);
    if (this.GetPanel(def.id)) throw new Error(`there is already a panel '${def.id}'`);
    if (!Array.isArray(def.size) || def.size.length !== 2 || !(def.size[0] > 0) || !(def.size[1] > 0)) throw new Error(`panel '${def.id}': size must be [width, height] in metres`);
    const name = `pk1ui:${this.host.slug}:${this.host.inst}:${def.id}`;
    const panel = new UiPanel(this, def, name, (made) => {
      const platform = this.host.platform;
      if (!platform || !platform.createPanel) return null;
      const anchor = this.host.anchor(def.anchor);
      if (!anchor) {
        this.host.log("warn", `panel '${def.id}': its anchor '${def.anchor}' is not a kit object that was found; the panel is not shown`);
        return null;
      }
      return platform.createPanel(
        { name, anchor, position: vec(def.position), rotation: vec(def.rotation), scale: made.scale, resolution: made.resolution },
        (id, kind, value) => {
          if (this.disposed) return;
          this.host.guard(`ui ${def.id}/${id} ${kind}`, () => made._event(id, kind, value));
        },
      );
    });
    this.list.push(panel);
    return panel;
  }

  /**
   * A kit object at `path` (under the kit root; "" the root) is being switched off. In SDK 4.0.29 Play mode that destroys
   * every page-made object under it, so a panel anchored there or below is gone for good: said loudly, once per panel.
   * Hide a panel with `panel.visible`, and keep its anchor on.
   */
  switchedOff(path: string): void {
    for (const panel of this.list) {
      const anchorPath = this.host.pathOf?.(panel.def.anchor);
      if (anchorPath === undefined) continue;
      if (path === "" || anchorPath === path || anchorPath.startsWith(path + "/")) {
        this._error(`panel '${panel.id}': its anchor '${panel.def.anchor}' (${anchorPath}) is under '${path || "the kit root"}', which was switched off: the app destroys a page-made panel whose parent goes off. Hide the panel with panel.visible instead.`);
      }
    }
  }

  /** Sends every panel's changes (the instance calls it at the end of each tick). */
  flush(): void {
    if (this.disposed) return;
    for (const panel of this.list) panel._flush();
  }

  dispose(): void {
    if (this.disposed) return;
    for (const panel of this.list.slice()) panel.Destroy();
    this.disposed = true;
  }

  /** @internal */
  _forget(panel: UiPanel): void {
    remove(this.list, panel);
  }

  /** @internal */
  _warn(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.host.log("warn", message);
  }

  /** @internal */
  _guard(where: string, fn: () => void): void {
    this.host.guard(where, fn);
  }

  private _error(message: string): void {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.host.log("error", message);
  }
}

function vec(v: Vector3 | [number, number, number] | undefined): Vector3 {
  if (!v) return new Vector3();
  return Array.isArray(v) ? new Vector3(v[0], v[1], v[2]) : new Vector3(v.x, v.y, v.z);
}

function remove<T>(list: T[], item: T): void {
  const at = list.indexOf(item);
  if (at >= 0) list.splice(at, 1);
}
