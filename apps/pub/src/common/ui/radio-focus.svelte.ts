// The keyboard of a group of radios that commits only on Space, Enter or a click: the arrow keys,
// Home and End move focus and choose nothing, since a choice (going public) may have consequences
// the owner of the value asks about first. The radio in the tab order is the focused one while
// focus is inside the group, and the chosen one otherwise.

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export class RadioFocus {
  radios: HTMLElement[] = $state([]);
  #focused: number | null = $state(null);
  readonly #count: () => number;
  readonly #chosen: () => number;

  /** `count` and `chosen` are read each time, so the group's options and value may change. */
  constructor(count: () => number, chosen: () => number) {
    this.#count = count;
    this.#chosen = chosen;
  }

  get tabStop(): number {
    return this.#focused ?? this.#chosen();
  }

  /** A key pressed on radio `from`: move focus if it is a key that moves it. */
  move(event: KeyboardEvent, from: number): void {
    const count = this.#count();
    const step = STEPS[event.key];
    const to =
      step !== undefined
        ? (from + step + count) % count
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? count - 1
            : null;
    if (to === null) {
      return;
    }
    event.preventDefault();
    this.#focused = to;
    this.radios[to]?.focus();
  }

  focus(index: number): void {
    this.#focused = index;
  }

  /** Focus left the group: the chosen radio is the tab stop again. */
  leave(event: FocusEvent): void {
    const group = event.currentTarget as HTMLElement;
    if (!group.contains(event.relatedTarget as Node | null)) {
      this.#focused = null;
    }
  }

  /** Put focus back on the chosen radio, as after a choice was asked about and declined. */
  focusChosen(): void {
    this.#focused = null;
    this.radios[this.#chosen()]?.focus();
  }
}
