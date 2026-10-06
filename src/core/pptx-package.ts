import { zipStored } from "./zip.ts";

// A PowerPoint file as dek writes it: the fewest OOXML parts PowerPoint opens without a repair,
// as strings. Each slide is a picture of what the browser drew, with the text taken out of it,
// and that text laid back over it in text boxes, line by line, where the browser set it.

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

export type PptxSlide = {
  /** The slide drawn without the text the boxes carry, as a PNG. */
  picture: Uint8Array;
  /** What the picture shows, for a screen reader: the slide's own alternative texts. */
  description: string;
  texts: PptxTextBox[];
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

  add("[Content_Types].xml", contentTypes(numbers));
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
    add(`ppt/slides/slide${n}.xml`, slideXml(slide, deck));
    add(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      relationships([
        [`${NS.rel}/slideLayout`, "../slideLayouts/slideLayout1.xml"],
        [`${NS.rel}/image`, `../media/image${n}.png`],
        [`${NS.rel}/notesSlide`, `../notesSlides/notesSlide${n}.xml`],
      ]),
    );
    parts.push({ path: `ppt/media/image${n}.png`, data: slide.picture });
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

function contentTypes(numbers: number[]): string {
  const override = (part: string, type: string) =>
    `<Override PartName="/${part}" ContentType="${type}"/>`;
  return `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${[
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

function slideXml(slide: PptxSlide, deck: PptxDeck): string {
  const picture = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide" descr="${escapeXml(slide.description)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(deck.size.width)}" cy="${emu(deck.size.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const boxes = slide.texts.map((box, index) => textBox(box, index + 3, deck.lang)).join("");
  return `${DECL}<p:sld ${PML}><p:cSld><p:spTree>${GROUP}${picture}${boxes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
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
  const room = Math.max(box.width * 0.25, box.lineHeight * 2);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id - 2}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(box.x)}" y="${emu(box.y)}"/><a:ext cx="${emu(box.width + room)}" cy="${emu(box.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr><a:lnSpc><a:spcPts val="${spacing}"/></a:lnSpc></a:pPr>${runs}</a:p></p:txBody></p:sp>`;
}

function textRun(run: PptxRun, lang: string): string {
  const attributes = [
    `lang="${escapeXml(lang)}"`,
    `sz="${Math.max(100, Math.round(run.size * PT_PER_PX * 100))}"`,
    `b="${run.bold ? 1 : 0}"`,
    `i="${run.italic ? 1 : 0}"`,
    ...(run.underline ? ['u="sng"'] : []),
    ...(run.strike ? ['strike="sngStrike"'] : []),
    ...(run.letterSpacing !== 0
      ? [`spc="${Math.round(run.letterSpacing * PT_PER_PX * 100)}"`]
      : []),
    'dirty="0"',
  ].join(" ");
  const alpha = run.alpha < 1 ? `<a:alpha val="${Math.round(run.alpha * 100000)}"/>` : "";
  const color = run.color.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  const font = run.font
    ? `<a:latin typeface="${escapeXml(run.font)}"/><a:ea typeface="${escapeXml(run.font)}"/><a:cs typeface="${escapeXml(run.font)}"/>`
    : "";
  return `<a:r><a:rPr ${attributes}><a:solidFill><a:srgbClr val="${color.toUpperCase()}">${alpha}</a:srgbClr></a:solidFill>${font}</a:rPr><a:t>${escapeXml(run.text)}</a:t></a:r>`;
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
