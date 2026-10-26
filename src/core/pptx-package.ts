import { zipStored } from "./zip.ts";

// A PowerPoint file as dek writes it: the fewest OOXML parts PowerPoint opens without a repair,
// as strings. Each slide is a picture of what the browser drew, with what is laid over it taken
// out of it: the text, in text boxes line by line where the browser set it, and with `--shapes`
// the boxes, pictures, and the text in them, as PowerPoint's own shapes.

/** One run of text on one line, as the browser drew it. Sizes are in the slide's own pixels. */
export type PptxRun = {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: [number, number, number];
  /** 0..1: the text's own alpha times the opacity of everything it is in. */
  alpha: number;
  letterSpacing: number;
  /** The font the browser drew it with; PowerPoint's default when none is known. */
  font?: string;
};

/** One line of text, or the part of one that sits together, at its box on the slide. */
export type PptxTextBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The distance from one line to the next, which places the line in its box. */
  lineHeight: number;
  runs: PptxRun[];
};

/** A color and its alpha, 0..1, the opacity of everything it is in included. */
export type PptxPaint = { color: [number, number, number]; alpha: number };

/** A box on the slide in its own pixels. */
type PptxRect = { x: number; y: number; width: number; height: number };

export type PptxTextLayer = PptxTextBox & { kind: "text" };

/** What a picture embeds: the PNG every renderer shows, and the SVG one that draws SVG prefers. */
type PptxImage = { png: Uint8Array; svg?: string };

/** A box the browser drew with no more than a color, a solid border, and round corners. */
export type PptxShape<I = PptxImage> = PptxRect & {
  kind: "shape";
  fill?: PptxPaint;
  /** A border the same on every side, inside the box as CSS draws it. */
  outline?: { width: number; paint: PptxPaint };
  /** The border box's corner radius; PowerPoint draws half the shorter side at most. */
  radius: number;
  text?: PptxShapeText;
  /** What the shape holds, in the order the browser painted it, grouped with it. */
  layers: PptxLayer<I>[];
};

/** One side of a border that differs per side: a straight line on the border's midline. */
export type PptxRule = {
  kind: "rule";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  paint: PptxPaint;
};

/**
 * An image, a canvas, or an SVG, drawn alone. What it embeds is `I`: the files in a package,
 * where to find them on the way there.
 */
export type PptxPicture<I = PptxImage> = PptxRect & { kind: "picture"; description: string } & I;

export type PptxLayer<I = PptxImage> = PptxTextLayer | PptxShape<I> | PptxRule | PptxPicture<I>;

/** The same layers with each picture's embedding replaced. */
export function mapPictures<A, B>(
  layers: PptxLayer<A>[],
  replace: (picture: PptxPicture<A>) => PptxPicture<B>,
): PptxLayer<B>[] {
  return layers.map((layer): PptxLayer<B> => {
    switch (layer.kind) {
      case "picture":
        return replace(layer);
      case "shape":
        return { ...layer, layers: mapPictures(layer.layers, replace) };
      default:
        return layer;
    }
  });
}

/** The text a shape holds, as paragraphs PowerPoint sets from the top of the shape's insets. */
export type PptxShapeText = {
  /** From the border box to where the text is set. */
  inset: { left: number; top: number; right: number; bottom: number };
  /** Whether PowerPoint wraps it: a text the browser set on one line is kept on one. */
  wrap: boolean;
  paragraphs: PptxParagraph[];
};

export type PptxParagraph = {
  align: "left" | "center" | "right" | "justify";
  /** The distance from one line to the next. */
  lineHeight: number;
  spaceBefore: number;
  /** From the text's insets to where its lines start, and to where they end. */
  marginLeft: number;
  marginRight: number;
  /** Where the first line, or the bullet, starts from the margin: negative hangs it. */
  indent: number;
  /** A bullet, or a number counted from `startAt` along the paragraphs that share it. */
  bullet?: { char: string } | { startAt: number };
  /** Its runs; a line break inside one, as `\n`, is PowerPoint's line break. */
  runs: PptxRun[];
};

export type PptxSlide = {
  /** The slide drawn without what is laid over it, as a PNG. */
  picture: Uint8Array;
  /** What the picture shows, for a screen reader: the slide's own alternative texts. */
  description: string;
  /** What is laid over the picture, in the order the browser painted it. */
  layers: PptxLayer[];
  /** The script for this slide, a paragraph a line. */
  notes: string;
};

export type PptxDeck = {
  title: string;
  lang: string;
  /** The slide's logical size in pixels; one pixel is 1/96 inch, as CSS has it. */
  size: { width: number; height: number };
  slides: PptxSlide[];
};

/** English Metric Units in one CSS pixel: 914400 to the inch, 96 pixels to the inch. */
const EMU_PER_PX = 9525;
/** Points in one CSS pixel. */
const PT_PER_PX = 0.75;

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  rel: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  pkg: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const PML = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const CT = "application/vnd.openxmlformats-officedocument";

/** The whole `.pptx`, ready to write. */
export function pptxPackage(deck: PptxDeck): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Array<{ path: string; data: Uint8Array }> = [];
  const add = (path: string, xml: string) => parts.push({ path, data: encoder.encode(xml) });
  const count = deck.slides.length;
  const numbers = deck.slides.map((_, index) => index + 1);

  // Each slide's own pictures are numbered after the slides' pictures, across the deck.
  const media = { next: count + 1 };
  const slides = deck.slides.map((slide) => slideParts(slide, deck, media));
  add(
    "[Content_Types].xml",
    contentTypes(
      numbers,
      slides.some((slide) => slide.media.some((file) => file.path.endsWith(".svg"))),
    ),
  );
  add(
    "_rels/.rels",
    relationships([
      [`${NS.rel}/officeDocument`, "ppt/presentation.xml"],
      [`${NS.pkg}/metadata/core-properties`, "docProps/core.xml"],
      [`${NS.rel}/extended-properties`, "docProps/app.xml"],
    ]),
  );
  add("docProps/core.xml", coreProperties(deck));
  add("docProps/app.xml", appProperties(count));
  add("ppt/presentation.xml", presentation(deck, numbers));
  add(
    "ppt/_rels/presentation.xml.rels",
    relationships([
      [`${NS.rel}/slideMaster`, "slideMasters/slideMaster1.xml"],
      [`${NS.rel}/notesMaster`, "notesMasters/notesMaster1.xml"],
      [`${NS.rel}/theme`, "theme/theme1.xml"],
      [`${NS.rel}/presProps`, "presProps.xml"],
      [`${NS.rel}/viewProps`, "viewProps.xml"],
      [`${NS.rel}/tableStyles`, "tableStyles.xml"],
      ...numbers.map((n): [string, string] => [`${NS.rel}/slide`, `slides/slide${n}.xml`]),
    ]),
  );
  add("ppt/presProps.xml", `${DECL}<p:presentationPr ${PML}/>`);
  add(
    "ppt/viewProps.xml",
    `${DECL}<p:viewPr ${PML}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="75000"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
  );
  add(
    "ppt/tableStyles.xml",
    `${DECL}<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
  );
  add("ppt/theme/theme1.xml", theme("dek"));
  add("ppt/theme/theme2.xml", theme("dek notes"));
  add("ppt/slideMasters/slideMaster1.xml", slideMaster());
  add(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    relationships([
      [`${NS.rel}/slideLayout`, "../slideLayouts/slideLayout1.xml"],
      [`${NS.rel}/theme`, "../theme/theme1.xml"],
    ]),
  );
  add("ppt/slideLayouts/slideLayout1.xml", slideLayout());
  add(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    relationships([[`${NS.rel}/slideMaster`, "../slideMasters/slideMaster1.xml"]]),
  );
  add("ppt/notesMasters/notesMaster1.xml", notesMaster());
  add(
    "ppt/notesMasters/_rels/notesMaster1.xml.rels",
    relationships([[`${NS.rel}/theme`, "../theme/theme2.xml"]]),
  );
  deck.slides.forEach((slide, index) => {
    const n = index + 1;
    const written = slides[index];
    if (!written) {
      return;
    }
    add(`ppt/slides/slide${n}.xml`, written.xml);
    add(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      relationships([
        [`${NS.rel}/slideLayout`, "../slideLayouts/slideLayout1.xml"],
        [`${NS.rel}/image`, `../media/image${n}.png`],
        [`${NS.rel}/notesSlide`, `../notesSlides/notesSlide${n}.xml`],
        ...written.media.map((file): [string, string] => [
          `${NS.rel}/image`,
          `../media/${file.path}`,
        ]),
      ]),
    );
    parts.push({ path: `ppt/media/image${n}.png`, data: slide.picture });
    for (const file of written.media) {
      parts.push({ path: `ppt/media/${file.path}`, data: file.data });
    }
    add(`ppt/notesSlides/notesSlide${n}.xml`, notesSlide(slide.notes, deck.lang));
    add(
      `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
      relationships([
        [`${NS.rel}/notesMaster`, "../notesMasters/notesMaster1.xml"],
        [`${NS.rel}/slide`, `../slides/slide${n}.xml`],
      ]),
    );
  });
  return zipStored(parts);
}

function contentTypes(numbers: number[], svg: boolean): string {
  const override = (part: string, type: string) =>
    `<Override PartName="/${part}" ContentType="${type}"/>`;
  return `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${svg ? '<Default Extension="svg" ContentType="image/svg+xml"/>' : ""}${[
    override("ppt/presentation.xml", `${CT}.presentationml.presentation.main+xml`),
    override("ppt/presProps.xml", `${CT}.presentationml.presProps+xml`),
    override("ppt/viewProps.xml", `${CT}.presentationml.viewProps+xml`),
    override("ppt/tableStyles.xml", `${CT}.presentationml.tableStyles+xml`),
    override("ppt/theme/theme1.xml", `${CT}.theme+xml`),
    override("ppt/theme/theme2.xml", `${CT}.theme+xml`),
    override("ppt/slideMasters/slideMaster1.xml", `${CT}.presentationml.slideMaster+xml`),
    override("ppt/slideLayouts/slideLayout1.xml", `${CT}.presentationml.slideLayout+xml`),
    override("ppt/notesMasters/notesMaster1.xml", `${CT}.presentationml.notesMaster+xml`),
    ...numbers.flatMap((n) => [
      override(`ppt/slides/slide${n}.xml`, `${CT}.presentationml.slide+xml`),
      override(`ppt/notesSlides/notesSlide${n}.xml`, `${CT}.presentationml.notesSlide+xml`),
    ]),
    override("docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
    override("docProps/app.xml", `${CT}.extended-properties+xml`),
  ].join("")}</Types>`;
}

/** A part's relationships, numbered `rId1` on in the order given. */
function relationships(targets: Array<[type: string, target: string]>): string {
  return `${DECL}<Relationships xmlns="${NS.pkg}">${targets
    .map(
      ([type, target], index) =>
        `<Relationship Id="rId${index + 1}" Type="${type}" Target="${escapeXml(target)}"/>`,
    )
    .join("")}</Relationships>`;
}

function coreProperties(deck: PptxDeck): string {
  return `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(deck.title)}</dc:title><dc:language>${escapeXml(deck.lang)}</dc:language></cp:coreProperties>`;
}

function appProperties(count: number): string {
  return `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>dek</Application><Slides>${count}</Slides><Notes>${count}</Notes></Properties>`;
}

function presentation(deck: PptxDeck, numbers: number[]): string {
  // The relationships list the master, notes master, theme, and three properties first.
  const slides = numbers.map((n) => `<p:sldId id="${255 + n}" r:id="rId${6 + n}"/>`).join("");
  return `${DECL}<p:presentation ${PML} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slides}</p:sldIdLst><p:sldSz cx="${emu(deck.size.width)}" cy="${emu(deck.size.height)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

/** An empty group: the shape tree every slide, layout, and master starts from. */
const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const LEVEL =
  '<a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>';

function slideMaster(): string {
  return `${DECL}<p:sldMaster ${PML}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${LEVEL}</p:titleStyle><p:bodyStyle>${LEVEL}</p:bodyStyle><p:otherStyle>${LEVEL}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function slideLayout(): string {
  return `${DECL}<p:sldLayout ${PML} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMaster(): string {
  const image = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>`;
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  return `${DECL}<p:notesMaster ${PML}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}${image}${body}</p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}

function notesSlide(notes: string, lang: string): string {
  const paragraphs = notes
    .split(/\r?\n/)
    .map((line) =>
      line === ""
        ? `<a:p><a:endParaRPr lang="${escapeXml(lang)}" dirty="0"/></a:p>`
        : `<a:p><a:r><a:rPr lang="${escapeXml(lang)}" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join("");
  return `${DECL}<p:notes ${PML}><p:cSld><p:spTree>${GROUP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs || `<a:p><a:endParaRPr lang="${escapeXml(lang)}" dirty="0"/></a:p>`}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

/** The relationships a slide's XML holds before its pictures': layout, picture, and notes. */
const SLIDE_RELS = 3;

type MediaFile = { path: string; data: Uint8Array };

/** What a slide writes: its XML, and the files its own pictures embed, in its relationships' order. */
function slideParts(
  slide: PptxSlide,
  deck: PptxDeck,
  media: { next: number },
): { xml: string; media: MediaFile[] } {
  const files: MediaFile[] = [];
  const encoder = new TextEncoder();
  let id = 2;
  const writer: LayerWriter = {
    lang: deck.lang,
    id: () => ++id,
    embed: (data, extension) => {
      files.push({ path: `image${media.next++}.${extension}`, data });
      return `rId${SLIDE_RELS + files.length}`;
    },
    encode: (text) => encoder.encode(text),
  };
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide" descr="${escapeAttribute(slide.description)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform({ x: 0, y: 0, ...deck.size })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const layers = slide.layers.map((layer) => layerXml(layer, writer)).join("");
  return {
    xml: `${DECL}<p:sld ${PML}><p:cSld><p:spTree>${GROUP}${picture}${layers}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    media: files,
  };
}

type LayerWriter = {
  lang: string;
  /** The next shape id on the slide. */
  id: () => number;
  /** Adds a file the slide embeds, and answers its relationship's id. */
  embed: (data: Uint8Array, extension: "png" | "svg") => string;
  encode: (text: string) => Uint8Array;
};

function layerXml(layer: PptxLayer, writer: LayerWriter): string {
  switch (layer.kind) {
    case "text":
      return textBox(layer, writer.id(), writer.lang);
    case "shape":
      return shapeXml(layer, writer);
    case "rule":
      return ruleXml(layer, writer.id());
    case "picture":
      return pictureXml(layer, writer);
    default: {
      const unknown: never = layer;
      throw new Error(`unknown layer ${JSON.stringify(unknown)}`);
    }
  }
}

/** A shape alone, or, when it holds anything, a group of it and what it holds. */
function shapeXml(shape: PptxShape, writer: LayerWriter): string {
  if (shape.layers.length === 0) {
    return shapeSp(shape, writer.id(), writer.lang);
  }
  const id = writer.id();
  const own = shapeSp(shape, writer.id(), writer.lang);
  const held = shape.layers.map((layer) => layerXml(layer, writer)).join("");
  const bounds = frameOf(shape);
  const at = `<a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/>`;
  const child = `<a:chOff x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:chExt cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/>`;
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${id - 2}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>${at}${child}</a:xfrm></p:grpSpPr>${own}${held}</p:grpSp>`;
}

/**
 * The shape itself. PowerPoint strokes the middle of a path and CSS draws a border inside the
 * box, so the path runs half the border's width inside the border box, and so do its corners.
 */
function shapeSp(shape: PptxShape, id: number, lang: string): string {
  const half = (shape.outline?.width ?? 0) / 2;
  const path = pathOf(shape);
  const radius = Math.max(0, shape.radius - half);
  const shorter = Math.min(path.width, path.height);
  const geometry =
    radius > 0 && shorter > 0
      ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((radius / shorter) * 100000))}"/></a:avLst></a:prstGeom>`
      : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const fill = shape.fill ? solidFill(shape.fill) : "<a:noFill/>";
  const line = shape.outline
    ? `<a:ln w="${emu(shape.outline.width)}">${solidFill(shape.outline.paint)}</a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  const text = shape.text ? shapeText(shape.text, half, lang) : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id - 2}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform(path)}${geometry}${fill}${line}</p:spPr>${text}</p:sp>`;
}

const ALIGN = { left: "l", center: "ctr", right: "r", justify: "just" } as const;

/** A shape's text, set inside its insets less what the path already took. */
function shapeText(text: PptxShapeText, half: number, lang: string): string {
  const inset = (px: number) => emu(Math.max(0, px - half));
  const paragraphs = text.paragraphs.map((paragraph) => paragraphXml(paragraph, lang)).join("");
  return `<p:txBody><a:bodyPr wrap="${text.wrap ? "square" : "none"}" lIns="${inset(text.inset.left)}" tIns="${inset(text.inset.top)}" rIns="${inset(text.inset.right)}" bIns="${inset(text.inset.bottom)}" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs || "<a:p/>"}</p:txBody>`;
}

function paragraphXml(paragraph: PptxParagraph, lang: string): string {
  const { bullet } = paragraph;
  const marker =
    bullet === undefined
      ? "<a:buNone/>"
      : "char" in bullet
        ? `<a:buChar char="${escapeXml(bullet.char)}"/>`
        : `<a:buAutoNum type="arabicPeriod" startAt="${bullet.startAt}"/>`;
  // A margin is never negative in DrawingML; the plan makes it at most a pixel's noise below 0.
  const margin = (px: number) => Math.max(0, emu(px));
  const properties = `<a:pPr marL="${margin(paragraph.marginLeft)}" marR="${margin(paragraph.marginRight)}" indent="${emu(paragraph.indent)}" algn="${ALIGN[paragraph.align]}"><a:lnSpc><a:spcPts val="${points(paragraph.lineHeight)}"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.max(0, points(paragraph.spaceBefore))}"/></a:spcBef>${marker}</a:pPr>`;
  // A break inside a run is PowerPoint's line break, set in the run's style.
  const runs = paragraph.runs
    .map((run) =>
      run.text
        .split("\n")
        .map((piece) => (piece === "" ? "" : textRun({ ...run, text: piece }, lang)))
        .join(`<a:br>${runProperties(run, lang)}</a:br>`),
    )
    .join("");
  return `<a:p>${properties}${runs}</a:p>`;
}

/** A rule from one end to the other, a straight connector, flipped where it runs up or left. */
function ruleXml(rule: PptxRule, id: number): string {
  const frame = frameOf(rule);
  const flips = `${rule.x2 < rule.x1 ? ' flipH="1"' : ""}${rule.y2 < rule.y1 ? ' flipV="1"' : ""}`;
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id - 2}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${flips}><a:off x="${emu(frame.x)}" y="${emu(frame.y)}"/><a:ext cx="${emu(frame.width)}" cy="${emu(frame.height)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${emu(rule.width)}" cap="flat">${solidFill(rule.paint)}</a:ln></p:spPr></p:cxnSp>`;
}

/** The extension PowerPoint 2016 and later read an SVG from; the PNG is for any other. */
const SVG_BLIP = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";

function pictureXml(picture: PptxPicture, writer: LayerWriter): string {
  const id = writer.id();
  const png = writer.embed(picture.png, "png");
  const svg =
    picture.svg === undefined
      ? ""
      : `<a:extLst><a:ext uri="${SVG_BLIP}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${writer.embed(writer.encode(picture.svg), "svg")}"/></a:ext></a:extLst>`;
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id - 2}" descr="${escapeAttribute(picture.description)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${png}">${svg}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(picture)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

/**
 * The frame a layer is written with: what PowerPoint reads its place from, and a group's extent
 * from, which it takes as the frames of what it holds put together. A group written any larger
 * or smaller is scaled to fit by a renderer that works its extent out again.
 */
function frameOf(layer: PptxLayer): PptxRect {
  switch (layer.kind) {
    case "text":
      return { x: layer.x, y: layer.y, width: layer.width + roomOf(layer), height: layer.height };
    case "rule":
      return {
        x: Math.min(layer.x1, layer.x2),
        y: Math.min(layer.y1, layer.y2),
        width: Math.abs(layer.x2 - layer.x1),
        height: Math.abs(layer.y2 - layer.y1),
      };
    case "picture":
      return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
    case "shape": {
      const frames = [pathOf(layer), ...layer.layers.map(frameOf)];
      const left = Math.min(...frames.map((frame) => frame.x));
      const top = Math.min(...frames.map((frame) => frame.y));
      const right = Math.max(...frames.map((frame) => frame.x + frame.width));
      const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
    default: {
      const unknown: never = layer;
      throw new Error(`unknown layer ${JSON.stringify(unknown)}`);
    }
  }
}

/** A shape's path: half its outline's width inside its border box, where PowerPoint strokes it. */
function pathOf(shape: PptxShape): PptxRect {
  const half = (shape.outline?.width ?? 0) / 2;
  return {
    x: shape.x + half,
    y: shape.y + half,
    width: Math.max(0, shape.width - half * 2),
    height: Math.max(0, shape.height - half * 2),
  };
}

function transform(box: PptxRect): string {
  return `<a:xfrm><a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>`;
}

function solidFill(paint: PptxPaint): string {
  return `<a:solidFill>${srgb(paint.color, paint.alpha)}</a:solidFill>`;
}

function srgb(color: [number, number, number], alpha: number): string {
  const hex = color.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  const opacity = alpha < 1 ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : "";
  return `<a:srgbClr val="${hex.toUpperCase()}">${opacity}</a:srgbClr>`;
}

/** Hundredths of a point, as DrawingML sets sizes and spacing. */
function points(px: number): number {
  return Math.round(px * PT_PER_PX * 100);
}

/**
 * One line of text in a box of its own: no wrapping, so the line breaks where the browser broke
 * it, and no insets, so the text starts where the browser started it. The box runs on past the
 * line's end, since a renderer that wraps anyway, or a substitute font a little wider, would
 * otherwise break the line again; the text is set from the left, so the room shows nowhere.
 */
function textBox(box: PptxTextBox, id: number, lang: string): string {
  const runs = box.runs.map((run) => textRun(run, lang)).join("");
  const spacing = Math.max(1, Math.round(box.lineHeight * PT_PER_PX * 100));
  const room = roomOf(box);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id - 2}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.width + room)}" cy="${emu(box.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr><a:lnSpc><a:spcPts val="${spacing}"/></a:lnSpc></a:pPr>${runs}</a:p></p:txBody></p:sp>`;
}

/** How far a text box runs on past its line's end. */
function roomOf(box: PptxTextBox): number {
  return Math.max(box.width * 0.25, box.lineHeight * 2);
}

function textRun(run: PptxRun, lang: string): string {
  return `<a:r>${runProperties(run, lang)}<a:t>${escapeXml(run.text)}</a:t></a:r>`;
}

function runProperties(run: PptxRun, lang: string): string {
  const attributes = [
    `lang="${escapeXml(lang)}"`,
    `sz="${Math.max(100, points(run.size))}"`,
    `b="${run.bold ? 1 : 0}"`,
    `i="${run.italic ? 1 : 0}"`,
    ...(run.underline ? ['u="sng"'] : []),
    ...(run.strike ? ['strike="sngStrike"'] : []),
    ...(run.letterSpacing !== 0 ? [`spc="${points(run.letterSpacing)}"`] : []),
    'dirty="0"',
  ].join(" ");
  const font = run.font
    ? `<a:latin typeface="${escapeXml(run.font)}"/><a:ea typeface="${escapeXml(run.font)}"/><a:cs typeface="${escapeXml(run.font)}"/>`
    : "";
  return `<a:rPr ${attributes}><a:solidFill>${srgb(run.color, run.alpha)}</a:solidFill>${font}</a:rPr>`;
}

function emu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

/** Text as XML holds it: markup escaped, and the characters XML 1.0 cannot hold left out. */
function escapeXml(text: string): string {
  return [...text]
    .filter((char) => xmlChar(char.codePointAt(0) ?? 0))
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** An attribute's value: as text, with its line breaks and tabs kept, which XML would make spaces. */
function escapeAttribute(text: string): string {
  return escapeXml(text).replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
}

/** Whether XML 1.0 holds the code point: tab, newline, return, and the rest of Unicode but surrogates. */
function xmlChar(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    code >= 0x10000
  );
}

/**
 * A complete theme: PowerPoint repairs a file whose theme leaves out the colors, the fonts, or
 * the three lists of fill, line, and effect styles. Nothing in a slide uses it but the notes.
 */
function theme(name: string): string {
  const solid = (value: string) => `<a:solidFill><a:schemeClr val="${value}"/></a:solidFill>`;
  const fills = `${solid("phClr")}${solid("phClr")}${solid("phClr")}`;
  const line = (width: number) =>
    `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr">${solid("phClr")}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const effect = "<a:effectStyle><a:effectLst/></a:effectStyle>";
  const clr = (tag: string, value: string) => `<a:${tag}><a:srgbClr val="${value}"/></a:${tag}>`;
  return `${DECL}<a:theme xmlns:a="${NS.a}" name="${escapeXml(name)}"><a:themeElements><a:clrScheme name="dek"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>${clr("dk2", "44546A")}${clr("lt2", "E7E6E6")}${clr("accent1", "4472C4")}${clr("accent2", "ED7D31")}${clr("accent3", "A5A5A5")}${clr("accent4", "FFC000")}${clr("accent5", "5B9BD5")}${clr("accent6", "70AD47")}${clr("hlink", "0563C1")}${clr("folHlink", "954F72")}</a:clrScheme><a:fontScheme name="dek"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="dek"><a:fillStyleLst>${fills}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst>${effect}${effect}${effect}</a:effectStyleLst><a:bgFillStyleLst>${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}
