import type { CDPSession, Page } from "playwright";
import { type Box, PSEUDO_TEXT_HOST } from "./slide-measure.ts";

/** What `DOM.getDocument` gives of a node: enough to find a marked host's pseudo-elements. */
type DomNode = {
  nodeId: number;
  attributes?: string[];
  children?: DomNode[];
  pseudoElements?: Array<{ nodeId: number; pseudoType?: string }>;
};

/**
 * The content box of each pseudo-element `measureSlideInPage` marked as drawing text, keyed
 * `<host>::<pseudo>`. The page exposes no box for a pseudo-element, and Chromium, which lays it
 * out, does: through the DevTools protocol. One that is not laid out has no box and is left out.
 */
export function pseudoTextBoxes(page: Page): Promise<Map<string, Box>> {
  return pseudoElementBoxes(page, PSEUDO_TEXT_HOST, "content", ["before", "after"]);
}

/**
 * The `content` or `border` box, in the viewport, of each pseudo-element of the `types` given
 * of every element marked with `attr`, keyed `<the attribute's value>::<pseudo>`.
 */
export async function pseudoElementBoxes(
  page: Page,
  attr: string,
  model: "content" | "border",
  types: ReadonlyArray<"before" | "after" | "marker">,
): Promise<Map<string, Box>> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = (await cdp.send("DOM.getDocument", { depth: -1 })) as { root: DomNode };
    const boxes = new Map<string, Box>();
    for (const node of walk(root)) {
      const host = attribute(node, attr);
      for (const pseudo of host === undefined ? [] : (node.pseudoElements ?? [])) {
        const type = types.find((each) => each === pseudo.pseudoType);
        if (type === undefined) {
          continue;
        }
        const box = await boxOf(cdp, pseudo.nodeId, model);
        if (box) {
          boxes.set(`${host}::${type}`, box);
        }
      }
    }
    return boxes;
  } finally {
    await cdp.detach();
  }
}

function* walk(node: DomNode): Generator<DomNode> {
  yield node;
  for (const child of node.children ?? []) {
    yield* walk(child);
  }
}

/** An attribute's value from CDP's flat `[name, value, name, value, ...]` list. */
function attribute(node: DomNode, name: string): string | undefined {
  const attributes = node.attributes ?? [];
  const at = attributes.indexOf(name);
  return at >= 0 && at % 2 === 0 ? attributes[at + 1] : undefined;
}

async function boxOf(
  cdp: CDPSession,
  nodeId: number,
  model: "content" | "border",
): Promise<Box | undefined> {
  try {
    const { model: boxes } = (await cdp.send("DOM.getBoxModel", { nodeId })) as {
      model: { content: number[]; border: number[] };
    };
    const quad = boxes[model];
    const xs = quad.filter((_, index) => index % 2 === 0);
    const ys = quad.filter((_, index) => index % 2 === 1);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  } catch {
    return undefined;
  }
}

/** One piece of what a pseudo-element writes, on one line, where Chromium laid it out. */
export type PseudoTextPiece = {
  /** The value of the attribute its element is marked with. */
  host: string;
  pseudo: "before" | "after";
  /** The text as it is drawn: counters counted, `attr()` read. */
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What `DOMSnapshot.captureSnapshot` answers, as far as this reads it. */
type Snapshot = {
  strings: string[];
  documents: Array<{
    nodes: {
      parentIndex: number[];
      attributes: number[][];
      pseudoType?: { index: number[]; value: number[] };
    };
    layout: { nodeIndex: number[]; text: number[] };
    textBoxes: { layoutIndex: number[]; bounds: number[][]; start: number[]; length: number[] };
  }>;
};

/**
 * The text `::before` and `::after` draw in every element marked with `attr`, piece by piece
 * and line by line, in the viewport. The page can read a pseudo-element's `content` only as it
 * is written, a `counter()` uncounted, and has no box for its text at all; Chromium's layout
 * has both, and the DevTools protocol gives a snapshot of it.
 */
export async function pseudoTextPieces(page: Page, attr: string): Promise<PseudoTextPiece[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const snapshot = (await cdp.send("DOMSnapshot.captureSnapshot", {
      computedStyles: [],
    })) as Snapshot;
    const pieces: PseudoTextPiece[] = [];
    for (const doc of snapshot.documents) {
      const types = new Map<number, string>();
      doc.nodes.pseudoType?.index.forEach((node, at) => {
        types.set(node, snapshot.strings[doc.nodes.pseudoType?.value[at] ?? -1] ?? "");
      });
      doc.textBoxes.layoutIndex.forEach((layout, at) => {
        const node = doc.layout.nodeIndex[layout] ?? -1;
        const pseudo = types.get(node);
        if (pseudo !== "before" && pseudo !== "after") {
          return;
        }
        const attributes = (doc.nodes.attributes[doc.nodes.parentIndex[node] ?? -1] ?? []).map(
          (index) => snapshot.strings[index] ?? "",
        );
        const named = attributes.indexOf(attr);
        const host = named >= 0 && named % 2 === 0 ? attributes[named + 1] : undefined;
        const start = doc.textBoxes.start[at] ?? 0;
        const text = (snapshot.strings[doc.layout.text[layout] ?? -1] ?? "").slice(
          start,
          start + (doc.textBoxes.length[at] ?? 0),
        );
        const [x = 0, y = 0, width = 0, height = 0] = doc.textBoxes.bounds[at] ?? [];
        if (host !== undefined && text !== "" && width > 0 && height > 0) {
          pieces.push({ host, pseudo, text, x, y, width, height });
        }
      });
    }
    return pieces;
  } finally {
    await cdp.detach();
  }
}
