import { describe, expect, test } from "bun:test";
import {
  EMBED_PROTOCOL,
  embedStop,
  gotoPosition,
  movedMessage,
  pickedMessage,
  readEmbedRequest,
  readyMessage,
} from "../../src/core/embed-protocol.ts";
import { ElementTarget } from "../../src/pub/protocol.ts";

const slides = [
  { slug: "intro", beats: [] },
  { slug: "plan", beats: [{ id: "chart" }, {}] },
];

const box = { x: 10, y: 20, width: 300, height: 40 };

describe("readEmbedRequest", () => {
  test("reads each request a framing page may send", () => {
    expect(readEmbedRequest({ type: "dek:goto", slug: "plan" })).toEqual({
      type: "dek:goto",
      slug: "plan",
    });
    expect(readEmbedRequest({ type: "dek:goto", slug: "plan", step: "chart" })).toEqual({
      type: "dek:goto",
      slug: "plan",
      step: "chart",
    });
    expect(readEmbedRequest({ type: "dek:current" })).toEqual({ type: "dek:current" });
    expect(readEmbedRequest({ type: "dek:pick", on: true })).toEqual({
      type: "dek:pick",
      on: true,
    });
    const mark = { id: "c_1", number: 1, slug: "plan", step: "0", box };
    expect(readEmbedRequest({ type: "dek:marks", marks: [mark] })).toEqual({
      type: "dek:marks",
      marks: [mark],
    });
    expect(readEmbedRequest({ type: "dek:marks", marks: [] })).toEqual({
      type: "dek:marks",
      marks: [],
    });
  });

  test("ignores anything malformed, unknown, or carrying more than it should", () => {
    const bad: unknown[] = [
      null,
      "dek:current",
      [],
      { type: "dek:ready" },
      { type: "dek:moved", slug: "plan", step: "0", index: 1 },
      { type: "dek:nope" },
      { type: "dek:current", extra: 1 },
      { type: "dek:goto" },
      { type: "dek:goto", slug: 1 },
      { type: "dek:goto", slug: "plan", step: 2 },
      { type: "dek:goto", slug: "plan", step: null },
      { type: "dek:goto", slug: "plan", script: "x" },
      { type: "dek:pick" },
      { type: "dek:pick", on: "yes" },
      { type: "dek:marks" },
      { type: "dek:marks", marks: {} },
      { type: "dek:marks", marks: [{ id: "c_1", number: 1, slug: "plan", step: "0" }] },
      { type: "dek:marks", marks: [{ id: "c_1", number: 1.5, slug: "plan", step: "0", box }] },
      { type: "dek:marks", marks: [{ id: "", number: 1, slug: "plan", step: "0", box }] },
      { type: "dek:marks", marks: [{ id: "c_1", number: -1, slug: "plan", step: "0", box }] },
      {
        type: "dek:marks",
        marks: [{ id: "c_1", number: 1, slug: "plan", step: "0", box: { ...box, x: "1" } }],
      },
      {
        type: "dek:marks",
        marks: [{ id: "c_1", number: 1, slug: "plan", step: "0", box: { ...box, width: -1 } }],
      },
      {
        type: "dek:marks",
        marks: [{ id: "c_1", number: 1, slug: "plan", step: "0", box: { ...box, y: Infinity } }],
      },
      {
        type: "dek:marks",
        marks: [{ id: "c_1", number: 1, slug: "plan", step: "0", box: { ...box, z: 0 } }],
      },
      {
        type: "dek:marks",
        marks: [{ id: "c_1", number: 1, slug: "plan", step: "0", box, color: "red" }],
      },
      { type: "dek:goto", slug: "x".repeat(1000) },
      {
        type: "dek:marks",
        marks: Array.from({ length: 1001 }, (_, i) => ({
          id: `c_${i}`,
          number: i,
          slug: "plan",
          step: "0",
          box,
        })),
      },
    ];
    for (const value of bad) {
      expect(readEmbedRequest(value)).toBeUndefined();
    }
  });

  test("takes no list of marks with a hole in it or a field besides its marks", () => {
    const mark = { id: "c_1", number: 1, slug: "plan", step: "0", box };
    const sparse = [mark, mark];
    delete sparse[0];
    expect(readEmbedRequest({ type: "dek:marks", marks: sparse })).toBeUndefined();
    expect(readEmbedRequest({ type: "dek:marks", marks: new Array(3) })).toBeUndefined();
    expect(readEmbedRequest(structuredClone({ type: "dek:marks", marks: sparse }))).toBeUndefined();
    const extra = Object.assign([mark], { more: mark });
    expect(readEmbedRequest({ type: "dek:marks", marks: extra })).toBeUndefined();
  });

  test("hands back marks of its own, not the message's", () => {
    const marks = [{ id: "c_1", number: 1, slug: "plan", step: "0", box }];
    const read = readEmbedRequest({ type: "dek:marks", marks });
    expect(read).toEqual({ type: "dek:marks", marks });
    expect(read?.type === "dek:marks" && read.marks).not.toBe(marks);
  });

  test("reads only the fields it names, not ones inherited", () => {
    const inherited = Object.create({ slug: "plan" }) as Record<string, unknown>;
    inherited.type = "dek:goto";
    expect(readEmbedRequest(inherited)).toBeUndefined();
  });
});

describe("gotoPosition", () => {
  test("finds the slide and the stop as dekc shot --step takes it", () => {
    expect(gotoPosition(slides, "plan")).toEqual({ slideIndex: 1, beatIndex: 0 });
    expect(gotoPosition(slides, "plan", "chart")).toEqual({ slideIndex: 1, beatIndex: 1 });
    expect(gotoPosition(slides, "plan", "2")).toEqual({ slideIndex: 1, beatIndex: 2 });
    expect(gotoPosition(slides, "intro", "0")).toEqual({ slideIndex: 0, beatIndex: 0 });
  });

  test("goes nowhere for a slide or a stop the deck does not have", () => {
    expect(gotoPosition(slides, "gone")).toBeUndefined();
    expect(gotoPosition(slides, "plan", "3")).toBeUndefined();
    expect(gotoPosition(slides, "plan", "missing")).toBeUndefined();
    expect(gotoPosition(slides, "intro", "1")).toBeUndefined();
  });
});

describe("the messages a framed deck sends", () => {
  test("ready names the deck, every slide's steps, and where it stands, and nothing more", () => {
    const ready = readyMessage({ name: "demo", size: { width: 1024, height: 768 } }, slides, {
      slideIndex: 1,
      beatIndex: 1,
    });
    expect(ready).toEqual({
      type: "dek:ready",
      protocol: EMBED_PROTOCOL,
      deck: "demo",
      size: { width: 1024, height: 768 },
      slides: [
        { slug: "intro", steps: ["0"] },
        { slug: "plan", steps: ["0", "chart", "2"] },
      ],
      current: { slug: "plan", step: "chart", index: 1 },
    });
  });

  test("moved says whether the framing page moved the deck or the reader did", () => {
    expect(movedMessage(slides, { slideIndex: 1, beatIndex: 0 }, "embed")).toEqual({
      type: "dek:moved",
      slug: "plan",
      step: "0",
      index: 1,
      by: "embed",
    });
  });

  test("a stop is the slug, the step key, and the slide's index", () => {
    expect(embedStop(slides, { slideIndex: 1, beatIndex: 2 })).toEqual({
      slug: "plan",
      step: "2",
      index: 1,
    });
  });

  test("picked carries an element target in the shape dek.pub anchors comments with", () => {
    const picked = pickedMessage({ slug: "plan", step: "0" }, { name: "div", text: "", box });
    const target = picked.type === "dek:picked" ? picked.target : undefined;
    expect(ElementTarget.parse(target)).toEqual(target as NonNullable<typeof target>);
    expect(
      pickedMessage({ slug: "plan", step: "0" }, { name: "div.chevron", text: "cut short", box }),
    ).toEqual({
      type: "dek:picked",
      slug: "plan",
      step: "0",
      target: {
        kind: "element",
        path: "slides/plan.html",
        name: "div.chevron",
        text: "cut short",
        box,
      },
    });
  });
});
