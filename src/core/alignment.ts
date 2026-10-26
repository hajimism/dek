import type { Box, MeasuredElement } from "./slide-measure.ts";

/** What lining up needs to know of an element. */
export type AlignedElement = Pick<
  MeasuredElement,
  | "box"
  | "parent"
  | "rect"
  | "textRects"
  | "baseline"
  | "opacity"
  | "decorative"
  | "inline"
  | "tilted"
  | "paints"
  | "picture"
  | "fontSize"
>;

/** An edge items side by side share (`top`, `middle`, `bottom`), or items stacked (`left`, …). */
export type AlignedEdge = "top" | "middle" | "bottom" | "left" | "center" | "right";

/**
 * Two items that nearly line up and do not: `element` is the one off the line, `other` the one it
 * misses, both indices into the elements measured. `of` says whether their boxes miss each other
 * or the text that starts inside them.
 */
export type Misalignment = {
  element: number;
  other: number;
  edge: AlignedEdge;
  of: "box" | "text";
  /** How far apart, in the slide's own pixels. */
  by: number;
};

/** Edges this close are one line; layout rounds to fractions of a pixel nobody sees. */
const SAME = 0.5;
/** Edges closer than this look like one, on a projector as on a laptop. */
const SEEN = 1.5;
/** Edges this far apart, or farther, read as a choice; nearer, as a mistake. */
const NEAR = 8;

type Side = "start" | "center" | "end";
const SIDES: Side[] = ["start", "center", "end"];
type Axis = Record<Side, AlignedEdge>;
/** Items side by side, compared down the slide. */
const ROW: Axis = { start: "top", center: "middle", end: "bottom" };
/** Items stacked, compared across it. */
const COLUMN: Axis = { start: "left", center: "center", end: "right" };

function along(rect: Box, axis: Axis): Record<Side, number> {
  return axis === ROW
    ? { start: rect.top, center: (rect.top + rect.bottom) / 2, end: rect.bottom }
    : { start: rect.left, center: (rect.left + rect.right) / 2, end: rect.right };
}

/** Side by side when only their heights overlap, stacked when only their widths do. */
function relation(a: Box, b: Box): Axis | undefined {
  const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (down > 0 && across <= 0) {
    return ROW;
  }
  if (across > 0 && down <= 0) {
    return COLUMN;
  }
  return undefined;
}

function union(rects: Box[]): Box {
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

const near = (apart: number): boolean => Math.abs(apart) >= SEEN && Math.abs(apart) <= NEAR;

/** What an item is, as its tag and first class say, whatever beat it shows at or id it has. */
const kindOf = (box: string): string => box.replace(/#[^.[]+|\[data-step="[^"]*"\]/g, "");

/** An item compared: one element, or the row or the stack several form beside another item. */
type Group = {
  members: number[];
  rect: Box;
  line: FirstLine | undefined;
  /** Whether every member paints its box or is a picture, so its edges show. */
  framed: boolean;
  kind: string | undefined;
};

/**
 * The items on a slide that nearly line up and do not. Items are compared within one parent, and
 * only when they sit side by side, compared by top, middle, and bottom, or stacked, compared by
 * left, center, and right. Several items in a row under one item, or stacked beside it, are
 * compared with it as the row or the stack they form, by the member at that edge. An item lines
 * up when it shares one of those edges, or, side by side, a baseline: a heading over a wider list,
 * an icon centered beside a line of text, and a number on its unit's baseline all pass. Where
 * nothing is shared and the nearest edge is two pixels to eight away, it reads as a mistake; so
 * does a start, top or left, that nearly meets where the end meets, between items that hold text.
 * Items of one kind whose box the audience sees, as a row of cards, are held to more: one that
 * shares its top and nearly its bottom with the others is a little shorter, and ones that start
 * on one line should start their text on one line too.
 *
 * Inline boxes, which sit on a line of text, decoration, what the beat has not shown, what a
 * transform turns, and the parts of a picture, such as an SVG's shapes, are not items. Of two
 * items that miss each other, the one fewer others line up with is off the line, and of two alike
 * the later; each is named once for each of its edges.
 */
export function findMisalignments(elements: AlignedElement[]): Misalignment[] {
  const inPicture = (index: number): boolean => {
    for (let at = elements[index]?.parent ?? -1; at >= 0; at = elements[at]?.parent ?? -1) {
      if (elements[at]?.picture) {
        return true;
      }
    }
    return false;
  };
  const items = elements.flatMap((element, index) =>
    element.opacity >= 0.01 &&
    !element.decorative &&
    !element.inline &&
    !element.tilted &&
    element.rect.right > element.rect.left &&
    element.rect.bottom > element.rect.top &&
    !inPicture(index)
      ? [index]
      : [],
  );
  const lines = firstLines(elements);
  const rectOf = (index: number): Box => elements[index]?.rect ?? union([]);

  // The row or the stack `item` forms beside `other`: the items `other` relates to as it does to
  // `item`, which sit across that from `item` or from one another.
  const groupOf = (item: number, other: number, axis: Axis, siblings: number[]): Group => {
    const across = axis === ROW ? COLUMN : ROW;
    const members = [item];
    for (let at = 0; at < members.length; at++) {
      const member = members[at] ?? item;
      for (const candidate of siblings) {
        if (
          !members.includes(candidate) &&
          candidate !== other &&
          relation(rectOf(candidate), rectOf(other)) === axis &&
          relation(rectOf(candidate), rectOf(member)) === across
        ) {
          members.push(candidate);
        }
      }
    }
    members.sort((a, b) => a - b);
    const kinds = new Set(members.map((member) => kindOf(elements[member]?.box ?? "")));
    const memberLines = members.flatMap((member) => lines[member] ?? []);
    return {
      members,
      rect: union(members.map(rectOf)),
      line: memberLines.reduce<FirstLine | undefined>(
        (first, line) => (!first || earlier(line.rect, first.rect) ? line : first),
        undefined,
      ),
      framed: members.every(
        (member) => elements[member]?.paints === true || elements[member]?.picture === true,
      ),
      kind: kinds.size === 1 ? [...kinds][0] : undefined,
    };
  };
  // The member whose edge is the group's on that side.
  const at = (group: Group, axis: Axis, side: Side): number =>
    side === "center"
      ? (group.members[0] ?? -1)
      : group.members.reduce((best, member) => {
          const value = along(rectOf(member), axis)[side];
          const kept = along(rectOf(best), axis)[side];
          return (side === "start" ? value < kept : value > kept) ? member : best;
        });

  type Miss = Misalignment & { key: string };
  const misses: Miss[] = [];
  // How many items each one lines up with, edge by edge.
  const support = new Map<string, number>();
  const lineUp = (index: number, key: string) => {
    support.set(`${index}\0${key}`, (support.get(`${index}\0${key}`) ?? 0) + 1);
  };
  const compare = (
    [a, b]: [number, number],
    edge: AlignedEdge,
    of: Miss["of"],
    apart: number,
  ): void => {
    const key = `${of}\0${edge}`;
    if (Math.abs(apart) < SAME) {
      lineUp(a, key);
      lineUp(b, key);
    } else if (near(apart)) {
      misses.push({ element: b, other: a, edge, of, by: Math.round(Math.abs(apart)), key });
    }
  };

  const siblings = Map.groupBy(items, (index) => elements[index]?.parent ?? -1);
  for (const group of siblings.values()) {
    for (const [index, a] of group.entries()) {
      for (const b of group.slice(index + 1)) {
        const axis = relation(rectOf(a), rectOf(b));
        if (!axis) {
          continue;
        }
        const one = groupOf(a, b, axis, group);
        const two = groupOf(b, a, axis, group);
        // A row or a stack is compared once, as its first member.
        if (one.members[0] !== a || two.members[0] !== b) {
          continue;
        }
        const from = along(one.rect, axis);
        const to = along(two.rect, axis);
        const apart = (side: Side) => to[side] - from[side];
        const shared = (side: Side) => Math.abs(apart(side)) < SAME;
        const pair = (side: Side): [number, number] => [at(one, axis, side), at(two, axis, side)];
        for (const side of SIDES.filter(shared)) {
          compare(pair(side), axis[side], "box", 0);
        }
        const texts = one.line !== undefined && two.line !== undefined;
        const cards =
          one.framed && two.framed && texts && one.kind !== undefined && one.kind === two.kind;
        // Text set on one baseline lines up, whatever boxes that do not show do. A baseline is
        // worked out from the font's ascent, which layout may round where a canvas does not, so
        // two that look like one count as one.
        const baseline =
          axis === ROW &&
          !(one.framed && two.framed) &&
          one.line?.baseline !== undefined &&
          two.line?.baseline !== undefined &&
          Math.abs(one.line.baseline - two.line.baseline) < SEEN;
        if (baseline) {
          // Nothing more to compare.
        } else if (shared("center")) {
          // Centered on one line, whatever their sizes.
        } else if (shared("start") || shared("end")) {
          // Side by side, text starts at the top, so a top a few pixels off reads where the
          // bottoms meet; and a row of cards is one height, so one that shares its top and nearly
          // its bottom is a little shorter. Stacked, items take the width their words give them,
          // as tags set flush right do, and only an edge none of them shares can be off.
          if (axis === ROW && shared("end") && texts) {
            compare(pair("start"), axis.start, "box", apart("start"));
          } else if (axis === ROW && shared("start") && cards) {
            compare(pair("end"), axis.end, "box", apart("end"));
          }
        } else {
          const nearest = SIDES.reduce((best, side) =>
            Math.abs(apart(side)) < Math.abs(apart(best)) ? side : best,
          );
          compare(pair(nearest), axis[nearest], "box", apart(nearest));
        }
        // Text in cards off the line moved with them, and is named by their edge. Text centered
        // in its card lines up by its middle, whatever its length.
        if (cards && shared("start") && one.line && two.line) {
          const [from, to] = [along(one.line.rect, axis), along(two.line.rect, axis)];
          const centered = Math.abs(to.center - from.center) < SAME;
          if (axis === COLUMN || one.line.fontSize === two.line.fontSize) {
            compare([a, b], axis.start, "text", centered ? 0 : to.start - from.start);
          }
        }
      }
    }
  }

  const named = new Set<string>();
  return misses.flatMap(({ key, ...miss }) => {
    const ofOther = support.get(`${miss.other}\0${key}`) ?? 0;
    const ofElement = support.get(`${miss.element}\0${key}`) ?? 0;
    const found =
      ofElement > ofOther ? { ...miss, element: miss.other, other: miss.element } : miss;
    const id = `${found.element}\0${key}`;
    if (named.has(id)) {
      return [];
    }
    named.add(id);
    return [found];
  });
}

/** The first line of text in an element: where it is drawn, its baseline, and its size. */
type FirstLine = { rect: Box; baseline?: number; fontSize: number };

/** Whether `a` comes before `b` in reading order: higher, or as high and further left. */
function earlier(a: Box, b: Box): boolean {
  return a.top < b.top - SAME || (Math.abs(a.top - b.top) < SAME && a.left < b.left);
}

/**
 * Each element's first line of text, its own or a descendant's, in reading order. Decoration and
 * what the beat has not shown have none.
 */
function firstLines(elements: AlignedElement[]): Array<FirstLine | undefined> {
  const first: Array<FirstLine | undefined> = elements.map(() => undefined);
  // A parent comes before its children, so walking back reaches every child before its parent.
  for (let index = elements.length - 1; index >= 0; index--) {
    const element = elements[index];
    if (!element || element.decorative || element.opacity < 0.01) {
      continue;
    }
    const [own] = element.textRects;
    const kept = first[index];
    if (own && (!kept || earlier(own, kept.rect))) {
      first[index] = {
        rect: own,
        fontSize: element.fontSize,
        ...(element.baseline !== undefined ? { baseline: element.baseline } : {}),
      };
    }
    const mine = first[index];
    const parent = first[element.parent];
    if (mine && element.parent >= 0 && (!parent || earlier(mine.rect, parent.rect))) {
      first[element.parent] = mine;
    }
  }
  return first;
}
