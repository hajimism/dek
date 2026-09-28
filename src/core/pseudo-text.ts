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
export async function pseudoTextBoxes(page: Page): Promise<Map<string, Box>> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = (await cdp.send("DOM.getDocument", { depth: -1 })) as { root: DomNode };
    const boxes = new Map<string, Box>();
    for (const node of walk(root)) {
      const host = attribute(node, PSEUDO_TEXT_HOST);
      for (const pseudo of host === undefined ? [] : (node.pseudoElements ?? [])) {
        const box = await contentBox(cdp, pseudo.nodeId);
        if (box && (pseudo.pseudoType === "before" || pseudo.pseudoType === "after")) {
          boxes.set(`${host}::${pseudo.pseudoType}`, box);
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

async function contentBox(cdp: CDPSession, nodeId: number): Promise<Box | undefined> {
  try {
    const { model } = (await cdp.send("DOM.getBoxModel", { nodeId })) as {
      model: { content: number[] };
    };
    const xs = model.content.filter((_, index) => index % 2 === 0);
    const ys = model.content.filter((_, index) => index % 2 === 1);
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
