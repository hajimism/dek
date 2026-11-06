import { expect, test } from "bun:test";
import { placeStickers } from "../../../src/plugins/study/place.ts";

const sticker = (id: string, quote: string, line: number, prefix?: string) => ({
  id,
  quote,
  line,
  ...(prefix ? { prefix } : {}),
});

test("a prefix picks its place; a sticker without one takes the first place left", () => {
  const text = "外部視点 似た計画の実績から、外部視点で見積もる";
  const placement = placeStickers(text, [
    sticker("b", "外部視点", 2),
    sticker("a", "外部視点", 1, "実績から、"),
  ]);
  expect(placement.placed.map(({ sticker, at }) => [sticker.id, at])).toEqual([
    ["a", 15],
    ["b", 0],
  ]);
  expect(placement.lost).toEqual([]);
  expect(placement.shown).toEqual([]);
});

test("a sticker with no place is lost, and a place with no sticker shows", () => {
  const text = "律速は律速で律速";
  const placement = placeStickers(text, [
    sticker("a", "律速", 1, "律速は"),
    sticker("b", "ない", 2),
  ]);
  expect(placement.placed.map(({ sticker, at }) => [sticker.id, at])).toEqual([["a", 3]]);
  expect(placement.lost.map(({ id }) => id)).toEqual(["b"]);
  expect(placement.shown).toEqual([
    { quote: "律速", first: expect.objectContaining({ id: "a" }), count: 2 },
  ]);
});

test("compares quotes and prefixes with whitespace collapsed", () => {
  const placement = placeStickers("a b c", [sticker("a", " b\n", 1, "a  ")]);
  expect(placement.placed.map(({ at }) => at)).toEqual([2]);
});

test("in words written with spaces, a quote is whole words, not part of one", () => {
  const text = "This is art, not a start of 18680 or 1868";
  const placement = placeStickers(text, [
    sticker("a", "is", 1),
    sticker("b", "art", 2),
    sticker("c", "1868", 3),
  ]);
  expect(placement.placed.map(({ sticker, at }) => [sticker.id, at])).toEqual([
    ["a", 5],
    ["b", 8],
    ["c", 37],
  ]);
  expect(placement.shown).toEqual([]);
});

test("in words written without spaces, a quote is any run of them, beside Latin or not", () => {
  const placement = placeStickers("第3章と13章、Bunで動く", [
    sticker("a", "3", 1),
    sticker("b", "Bun", 2),
    sticker("c", "動", 3),
  ]);
  expect(placement.placed.map(({ sticker, at }) => [sticker.id, at])).toEqual([
    ["a", 1],
    ["b", 8],
    ["c", 12],
  ]);
  expect(placement.shown).toEqual([]);
});
