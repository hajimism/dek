import { posix } from "node:path";
import { inflateRawSync } from "node:zlib";
import { Window, type Element as XmlElement } from "happy-dom";

// What a `.pptx` holds, read from the file alone, as PowerPoint would: the eval measures the
// artifact a recipient gets, not what the exporter says it wrote.

/** The files of a ZIP archive, by path: stored or deflated entries, each checked against its CRC. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) {
    end--;
  }
  if (end < 0) {
    throw new Error("no end of central directory");
  }
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error(`bad central directory entry ${i}`);
    }
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + packed);
    if (method !== 0 && method !== 8) {
      throw new Error(`${name} is packed by method ${method}`);
    }
    const data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
    if (Bun.hash.crc32(data) !== crc) {
      throw new Error(`${name} fails its CRC`);
    }
    files.set(name, data);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** One paragraph of a text body: its characters without white space, and how it is set. */
type PackageParagraph = {
  ink: string;
  /** The lines it is written in: one more than its line breaks. */
  lines: number;
  runs: number;
  bullet: boolean;
};

/** One shape's text. */
type PackageBody = {
  /** Whether text typed into it wraps at its width. */
  wrap: boolean;
  /** The placeholder it fills, such as `title`, if any. */
  placeholder?: string;
  paragraphs: PackageParagraph[];
};

export type PackageSlide = {
  bodies: PackageBody[];
  /** Shapes and lines that are not text boxes. */
  shapes: number;
  /** Pictures of their own, the slide-sized ones left out. */
  pictures: number;
  groups: number;
  /** The slide-sized pictures: what was not laid out as PowerPoint's own. */
  rasters: string[];
  /** The picture its background is, where it is one rather than a color. */
  backdrop?: string;
  /** The fields its text holds, by type, such as `slidenum`. */
  fields: string[];
  links: number;
  /** Pictures of their own that say what they show. */
  described: number;
  notes: boolean;
  /** The shadows and glows written as PowerPoint's own effects. */
  effects: number;
};

export type PackageFacts = {
  slides: PackageSlide[];
  size: { width: number; height: number };
  bytes: number;
  /** The bytes of its XML parts, unpacked, and of its media. */
  xmlBytes: number;
  mediaBytes: number;
  core: { title: boolean; creator: boolean; created: boolean };
  /** What a reader that checks the package would trip on. */
  problems: string[];
};

const EMU_PER_PX = 9525;

/** Reads a `.pptx` as the eval needs it: each slide's text, shapes, and pictures, and what is malformed. */
export function readPackage(bytes: Uint8Array): {
  facts: PackageFacts;
  files: Map<string, Uint8Array>;
} {
  const files = readZip(bytes);
  const decoder = new TextDecoder();
  const text = (path: string) => decoder.decode(files.get(path) ?? new Uint8Array());
  const window = new Window();
  const parser = new window.DOMParser();
  const problems: string[] = [];
  const parse = (path: string) => {
    const doc = parser.parseFromString(text(path), "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0 || doc.documentElement === null) {
      problems.push(`${path} does not parse as XML`);
    }
    return doc;
  };

  let xmlBytes = 0;
  let mediaBytes = 0;
  const types = files.has("[Content_Types].xml") ? parse("[Content_Types].xml") : undefined;
  const defaults = new Set(
    [...(types?.getElementsByTagName("Default") ?? [])].map((each) =>
      (each.getAttribute("Extension") ?? "").toLowerCase(),
    ),
  );
  const overrides = new Set(
    [...(types?.getElementsByTagName("Override") ?? [])].map(
      (each) => each.getAttribute("PartName") ?? "",
    ),
  );
  for (const [path, data] of files) {
    if (path.startsWith("ppt/media/")) {
      mediaBytes += data.length;
    } else {
      xmlBytes += data.length;
    }
    if (path === "[Content_Types].xml") {
      continue;
    }
    // After the last dot, as a package reads it: `_rels/.rels` is a `rels` file.
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    if (!overrides.has(`/${path}`) && !defaults.has(extension)) {
      problems.push(`${path} has no content type`);
    }
    if (extension !== "xml" && extension !== "rels") {
      continue;
    }
    const doc = parse(path);
    if (extension !== "rels") {
      continue;
    }
    // A part's relationships are in `_rels/<name>.rels` beside it, and resolve from its folder.
    const base = posix.dirname(posix.dirname(path));
    for (const each of doc.getElementsByTagName("Relationship")) {
      const target = each.getAttribute("Target") ?? "";
      if (each.getAttribute("TargetMode") === "External") {
        continue;
      }
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : posix.normalize(posix.join(base, target));
      if (!files.has(resolved)) {
        problems.push(`${path} points at ${target}, which is not in the file`);
      }
    }
  }
  for (const part of overrides) {
    if (!files.has(part.slice(1))) {
      problems.push(`[Content_Types].xml names ${part}, which is not in the file`);
    }
  }

  const presentation = parse("ppt/presentation.xml");
  const sldSz = presentation.getElementsByTagName("p:sldSz")[0];
  const size = {
    width: Number(sldSz?.getAttribute("cx") ?? 0) / EMU_PER_PX,
    height: Number(sldSz?.getAttribute("cy") ?? 0) / EMU_PER_PX,
  };
  const rels = parse("ppt/_rels/presentation.xml.rels");
  const targets = new Map(
    [...rels.getElementsByTagName("Relationship")].map((each) => [
      each.getAttribute("Id") ?? "",
      each.getAttribute("Target") ?? "",
    ]),
  );
  const slides: PackageSlide[] = [];
  // Read from the text: happy-dom keeps one of `id` and `r:id` where an element has both.
  for (const [, relation] of text("ppt/presentation.xml").matchAll(
    /<p:sldId [^>]*r:id="([^"]+)"/g,
  )) {
    const target = targets.get(relation ?? "");
    const path = target === undefined ? undefined : posix.join("ppt", target);
    if (path === undefined || !files.has(path)) {
      problems.push(`presentation.xml lists a slide that is not in the file`);
      continue;
    }
    slides.push(readSlide(path, parse, size, problems));
  }

  const core = files.has("docProps/core.xml") ? parse("docProps/core.xml") : undefined;
  const said = (tag: string) => (core?.getElementsByTagName(tag)[0]?.textContent ?? "") !== "";
  return {
    files,
    facts: {
      slides,
      size,
      bytes: bytes.length,
      xmlBytes,
      mediaBytes,
      core: {
        title: said("dc:title"),
        creator: said("dc:creator"),
        created: said("dcterms:created"),
      },
      problems,
    },
  };
}

type Parsed = ReturnType<InstanceType<Window["DOMParser"]>["parseFromString"]>;

function readSlide(
  path: string,
  parse: (path: string) => Parsed,
  size: { width: number; height: number },
  problems: string[],
): PackageSlide {
  const doc = parse(path);
  const relsPath = posix.join(posix.dirname(path), "_rels", `${posix.basename(path)}.rels`);
  const rels = parse(relsPath);
  const targets = new Map(
    [...rels.getElementsByTagName("Relationship")].map((each) => [
      each.getAttribute("Id") ?? "",
      {
        type: each.getAttribute("Type") ?? "",
        target: posix.normalize(posix.join(posix.dirname(path), each.getAttribute("Target") ?? "")),
      },
    ]),
  );
  const slide: PackageSlide = {
    bodies: [],
    shapes: 0,
    pictures: 0,
    groups: doc.getElementsByTagName("p:grpSp").length,
    rasters: [],
    fields: [...doc.getElementsByTagName("a:fld")].map((each) => each.getAttribute("type") ?? ""),
    links: doc.getElementsByTagName("a:hlinkClick").length,
    described: 0,
    notes: false,
    effects:
      doc.getElementsByTagName("a:outerShdw").length +
      doc.getElementsByTagName("a:innerShdw").length +
      doc.getElementsByTagName("a:glow").length,
  };

  const backdrop = doc
    .getElementsByTagName("p:bg")[0]
    ?.getElementsByTagName("a:blip")[0]
    ?.getAttribute("r:embed");
  const backdropFile = backdrop ? targets.get(backdrop)?.target : undefined;
  if (backdropFile !== undefined) {
    slide.backdrop = backdropFile;
  }

  const ids = new Set<string>();
  for (const each of doc.getElementsByTagName("p:cNvPr")) {
    const id = each.getAttribute("id") ?? "";
    if (ids.has(id)) {
      problems.push(`${path} uses the shape id ${id} twice`);
    }
    ids.add(id);
  }

  for (const pic of doc.getElementsByTagName("p:pic")) {
    const ext = pic.getElementsByTagName("a:ext")[0];
    const width = Number(ext?.getAttribute("cx") ?? 0) / EMU_PER_PX;
    const height = Number(ext?.getAttribute("cy") ?? 0) / EMU_PER_PX;
    const embed = pic.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed") ?? "";
    if (width * height >= size.width * size.height * 0.95) {
      const file = targets.get(embed)?.target;
      if (file !== undefined) {
        slide.rasters.push(file);
      }
      continue;
    }
    slide.pictures++;
    if ((pic.getElementsByTagName("p:cNvPr")[0]?.getAttribute("descr") ?? "") !== "") {
      slide.described++;
    }
  }
  slide.shapes += doc.getElementsByTagName("p:cxnSp").length;
  for (const sp of doc.getElementsByTagName("p:sp")) {
    const body = sp.getElementsByTagName("p:txBody")[0];
    const paragraphs = body ? [...body.getElementsByTagName("a:p")].map(readParagraph) : [];
    const written = paragraphs.some((paragraph) => paragraph.ink !== "");
    const box = sp.getElementsByTagName("p:cNvSpPr")[0]?.getAttribute("txBox") === "1";
    const placeholder = sp.getElementsByTagName("p:ph")[0]?.getAttribute("type") ?? undefined;
    if (!box && placeholder === undefined) {
      slide.shapes++;
    }
    if (body && written) {
      const wrap = body.getElementsByTagName("a:bodyPr")[0]?.getAttribute("wrap") ?? "square";
      slide.bodies.push({
        wrap: wrap !== "none",
        ...(placeholder === undefined ? {} : { placeholder }),
        paragraphs: paragraphs.filter((paragraph) => paragraph.ink !== ""),
      });
    }
  }

  const notes = [...targets.values()].find((each) => each.type.endsWith("/notesSlide"));
  if (notes) {
    const said = [...parse(notes.target).getElementsByTagName("a:t")]
      .map((each) => each.textContent ?? "")
      .join("");
    slide.notes = said.trim() !== "";
  }
  return slide;
}

function readParagraph(paragraph: XmlElement): PackageParagraph {
  let ink = "";
  let lines = 1;
  let runs = 0;
  for (const child of paragraph.children) {
    if (child.tagName === "a:br") {
      lines++;
    } else if (child.tagName === "a:r" || child.tagName === "a:fld") {
      runs++;
      ink += (child.getElementsByTagName("a:t")[0]?.textContent ?? "").replace(/\s+/gu, "");
    }
  }
  const properties = paragraph.getElementsByTagName("a:pPr")[0];
  const bullet =
    (properties?.getElementsByTagName("a:buChar").length ?? 0) > 0 ||
    (properties?.getElementsByTagName("a:buAutoNum").length ?? 0) > 0;
  return { ink, lines, runs, bullet };
}
