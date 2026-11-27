import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { splitCveIds } from "./cve";
import { WORDMARK } from "./wordmark";

/**
 * The patching report as a real PDF.
 *
 * The screen version is printed through the browser, which stamps its own
 * header and footer (page title, URL, date) on every sheet and sometimes drops
 * the logo. This module draws the same sheet itself, so the file that leaves the
 * building has the wordmark, our own page numbers and nothing else on it.
 *
 * Everything here is pure: the caller hands over a {@link PatchReportModel} and
 * gets bytes back. No database, no network, no React.
 */

export type ReportTone = "positive" | "danger" | "pending" | "neutral";

export type ReportField = { label: string; value: string; tone?: ReportTone };

export type ReportUpdate = {
  name: string;
  kb: string;
  cve: string;
  severity: string;
};

export type ReportEndpoint = {
  name: string;
  status: string;
  statusTone: ReportTone;
  /** Planned date, handler, approver, verifier, update status. */
  fields: ReportField[];
  /** "12 missing patches · 3 other updates" line. */
  counts: string;
  note: string;
  updates: ReportUpdate[];
  /** Set instead of `updates` when the patch list could not be read. */
  listMessage?: string;
};

/**
 * The organisation's own logo, as the patching report prints it.
 *
 * `pdf-lib` can embed PNG and JPEG only, which is why the upload form accepts
 * exactly those two. `type` says which embedder to use.
 */
export type ReportLogoImage = { type: "png" | "jpeg"; bytes: Uint8Array };

export type PatchReportModel = {
  /** 19 Nov 2026 */
  prepared: string;
  endpoints: ReportEndpoint[];
  summary: string;
  outcomes: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89; // A4, the sheet the report already prints on.
const MARGIN = { left: 44, right: 44, top: 50, bottom: 58 };
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN.left - MARGIN.right;

const NAVY = rgb(23 / 255, 44 / 255, 82 / 255);
const BODY = rgb(44 / 255, 58 / 255, 79 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const LINE = rgb(227 / 255, 231 / 255, 239 / 255);
const WASH = rgb(247 / 255, 249 / 255, 252 / 255);

const TONE_COLOR: Record<ReportTone, ReturnType<typeof rgb>> = {
  positive: rgb(21 / 255, 122 / 255, 77 / 255),
  danger: rgb(180 / 255, 35 / 255, 24 / 255),
  pending: rgb(165 / 255, 106 / 255, 16 / 255),
  neutral: MUTED,
};

/**
 * The base-14 fonts speak WinAnsi, so an em dash is fine but a stray emoji is
 * not — pdf-lib throws on anything it cannot encode. Unknown characters become
 * "?" rather than failing the whole report.
 */
function safe(value: string): string {
  return value.replace(
    /[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u00B7\u20AC]/g,
    "?",
  );
}

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

/** A page plus a cursor measured downwards from the top edge. */
class Sheet {
  private page: PDFPage;
  private pages: PDFPage[] = [];
  /** Distance from the top of the current page to the next thing to draw. */
  y = MARGIN.top;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
  }

  get all(): PDFPage[] {
    return this.pages;
  }

  /** PDF y for a point measured downwards from the top. */
  private flip(fromTop: number) {
    return PAGE_HEIGHT - fromTop;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = MARGIN.top;
  }

  /** Reserve `height`; returns true when that meant starting a new page. */
  ensure(height: number) {
    if (this.y + height <= PAGE_HEIGHT - MARGIN.bottom) return false;
    this.newPage();
    return true;
  }

  text(
    value: string,
    x: number,
    baselineFromTop: number,
    options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
  ) {
    this.page.drawText(safe(value), {
      x,
      y: this.flip(baselineFromTop),
      font: options.font,
      size: options.size,
      color: options.color ?? BODY,
    });
  }

  textRight(
    value: string,
    rightEdge: number,
    baselineFromTop: number,
    options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
  ) {
    const width = options.font.widthOfTextAtSize(safe(value), options.size);
    this.text(value, rightEdge - width, baselineFromTop, options);
  }

  rule(fromTop: number, color = LINE, thickness = 0.7, x0 = MARGIN.left, x1 = PAGE_WIDTH - MARGIN.right) {
    this.page.drawLine({
      start: { x: x0, y: this.flip(fromTop) },
      end: { x: x1, y: this.flip(fromTop) },
      thickness,
      color,
    });
  }

  fill(fromTop: number, height: number, color: ReturnType<typeof rgb>, x = MARGIN.left, width = CONTENT_WIDTH) {
    this.page.drawRectangle({
      x,
      y: this.flip(fromTop + height),
      width,
      height,
      color,
    });
  }

  /** Greedy word wrap — the report has no rich text, only runs of words. */
  wrap(value: string, font: PDFFont, size: number, width: number): string[] {
    const clean = safe(value).replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const lines: string[] = [];
    let line = "";
    for (const word of clean.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single word longer than the column is cut rather than overflowing.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Draws wrapped lines and returns the height used. */
  paragraph(
    value: string,
    x: number,
    width: number,
    options: { font: PDFFont; size: number; leading: number; color?: ReturnType<typeof rgb> },
  ): number {
    const lines = this.wrap(value, options.font, options.size, width);
    lines.forEach((line, index) => {
      this.text(line, x, this.y + index * options.leading, options);
    });
    return lines.length * options.leading;
  }

  /**
   * A bitmap, top-left corner at the point given, scaled to `width` and its own
   * aspect ratio. Returns the height used so the header can measure itself.
   */
  image(image: PDFImage, x: number, top: number, width: number): number {
    const height = (width * image.height) / image.width;
    this.page.drawImage(image, { x, y: this.flip(top + height), width, height });
    return height;
  }

  /** The wordmark, ink box anchored at the top-left corner given. */
  logo(x: number, top: number, width: number) {
    this.page.drawSvgPath(WORDMARK.path, {
      x,
      y: this.flip(top),
      scale: width / WORDMARK.width,
      color: NAVY,
    });
  }

}

/**
 * Embeds the uploaded logo, or gives up quietly.
 *
 * A file that passed the upload checks can still be unreadable to pdf-lib (a
 * progressive JPEG, a PNG saved as a JPEG under the wrong name). The report is
 * more important than the mark on it, so a failure falls back to the wordmark.
 */
async function embedReportLogo(
  doc: PDFDocument,
  logo: ReportLogoImage,
): Promise<PDFImage | null> {
  try {
    return logo.type === "png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
  } catch (error) {
    console.error("[report] the uploaded logo could not be embedded", error);
    return null;
  }
}

export async function buildPatchReportPdf(
  model: PatchReportModel,
  options: { logo?: ReportLogoImage } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  doc.setTitle(`Patching report - ${model.prepared}`);
  doc.setSubject("Patching plan, approvals and the update list reported by Action1");
  doc.setAuthor("TaskTornado");
  doc.setCreator("TaskTornado");
  doc.setProducer("TaskTornado");

  const sheet = new Sheet(doc, fonts);

  /* ---------------------------------------------------------------- header */

  // The header mark: the uploaded logo when there is one, the wordmark otherwise.
  // Either way it is anchored top-left and kept inside a band tall enough to sit
  // beside the title block on the right.
  const LOGO_WIDTH = 112;
  const LOGO_MAX_HEIGHT = 40;
  const rightEdge = PAGE_WIDTH - MARGIN.right;
  const headTop = MARGIN.top;

  const customLogo = options.logo ? await embedReportLogo(doc, options.logo) : null;
  let logoHeight = (LOGO_WIDTH * WORDMARK.height) / WORDMARK.width;
  if (customLogo) {
    const width = Math.min(LOGO_WIDTH, (LOGO_MAX_HEIGHT * customLogo.width) / customLogo.height);
    logoHeight = sheet.image(customLogo, MARGIN.left, headTop + 12, width);
  } else {
    sheet.logo(MARGIN.left, headTop + 12, LOGO_WIDTH);
  }

  sheet.textRight("PATCHING REPORT", rightEdge, headTop + 6, {
    font: fonts.bold,
    size: 6.8,
    color: MUTED,
  });
  sheet.textRight("Patching report", rightEdge, headTop + 21, {
    font: fonts.bold,
    size: 14,
    color: NAVY,
  });
  sheet.textRight(`Prepared ${model.prepared}`, rightEdge, headTop + 33, {
    font: fonts.regular,
    size: 8.4,
    color: MUTED,
  });
  const headBottom = headTop + Math.max(logoHeight + 12, 44);
  sheet.textRight(model.summary, rightEdge, headTop + 44, {
    font: fonts.regular,
    size: 8.4,
    color: MUTED,
  });
  sheet.textRight(model.outcomes, rightEdge, headTop + 54, {
    font: fonts.regular,
    size: 8.4,
    color: MUTED,
  });

  sheet.rule(headBottom + 14, NAVY, 1);
  sheet.y = headBottom + 30;

  /* -------------------------------------------------------------- sections */

  /**
   * Breathing room, in points.
   *
   * Every gap on the sheet comes from here rather than from numbers typed at the
   * point of drawing, so the report reads as one rhythm: a little space inside a
   * field, a little more between field rows, a clear band between the header of
   * a section and its table.
   */
  const SPACE = {
    /** Under an endpoint's name rule, before the first field label. */
    afterHeading: 12,
    /** Row top to the field label's baseline. */
    fieldLabel: 7,
    /** Row top to the first line of a field's value. */
    fieldValue: 17.5,
    fieldLeading: 10.8,
    /** Between the bottom of one field row and the top of the next. */
    fieldRowGap: 6,
    beforeNote: 7,
    beforeCounts: 3,
    beforeTable: 13,
    /** Table header's top to its baseline, and to the rule under it. */
    header: 8,
    headerRule: 3,
    /** Column edge to the text inside it. */
    cellX: 8,
    /** Row top to the first baseline, and last baseline to the row's rule. */
    cellTop: 8,
    cellBottom: 6,
    afterTable: 22,
  };

  // The CVE column is wider than a single id needs: an update can name several
  // bulletins, and they are printed one per line rather than run together.
  const TABLE_COLUMNS = [26, 280, 122, 79];
  const TABLE_LEADING = 10;
  const CVE_LEADING = 9.8;

  function tableHeader(sheetRef: Sheet) {
    const base = sheetRef.y;
    let x = MARGIN.left;
    ["S.No", "Patch name", "CVE", "Severity"].forEach((label, index) => {
      // S.No is a two-character column, so it gets a smaller inset than the rest.
      const inset = index === 0 ? 4 : SPACE.cellX;
      sheetRef.text(label.toUpperCase(), x + inset, base + SPACE.header, {
        font: fonts.bold,
        size: 6.6,
        color: MUTED,
      });
      x += TABLE_COLUMNS[index];
    });
    sheetRef.rule(base + SPACE.header + SPACE.headerRule);
    sheetRef.y = base + SPACE.header + 12;
  }

  model.endpoints.forEach((endpoint, index) => {
    // A section never starts at the very bottom of a page: keep its heading and
    // first rows together.
    sheet.ensure(110);

    const headingTop = sheet.y;
    sheet.text(`${index + 1}. ${endpoint.name}`, MARGIN.left, headingTop + 9, {
      font: fonts.bold,
      size: 11.5,
      color: NAVY,
    });
    sheet.textRight(endpoint.status, PAGE_WIDTH - MARGIN.right, headingTop + 9, {
      font: fonts.bold,
      size: 8.4,
      color: TONE_COLOR[endpoint.statusTone],
    });
    sheet.rule(headingTop + 15);
    sheet.y = headingTop + 15 + SPACE.afterHeading;

    // Fields: three to a row, label above value, as on the screen.
    const gap = 18;
    const columnWidth = (CONTENT_WIDTH - gap * 2) / 3;
    for (let start = 0; start < endpoint.fields.length; start += 3) {
      const row = endpoint.fields.slice(start, start + 3);
      const heights = row.map((field) => {
        const lines = sheet.wrap(field.value || "—", fonts.regular, 8.8, columnWidth);
        return (
          SPACE.fieldValue + (Math.max(1, lines.length) - 1) * SPACE.fieldLeading + 4
        );
      });
      const rowHeight = Math.max(...heights);
      if (sheet.ensure(rowHeight + SPACE.fieldRowGap)) {
        // A field row is allowed to continue on the next page.
        sheet.text(`${index + 1}. ${endpoint.name} (continued)`, MARGIN.left, sheet.y + 8, {
          font: fonts.bold,
          size: 8.4,
          color: MUTED,
        });
        sheet.y += 20;
      }
      const rowTop = sheet.y;
      row.forEach((field, column) => {
        const x = MARGIN.left + column * (columnWidth + gap);
        sheet.text(field.label.toUpperCase(), x, rowTop + SPACE.fieldLabel, {
          font: fonts.bold,
          size: 6.4,
          color: MUTED,
        });
        const lines = sheet.wrap(field.value || "—", fonts.regular, 8.8, columnWidth);
        lines.forEach((line, lineIndex) => {
          sheet.text(line, x, rowTop + SPACE.fieldValue + lineIndex * SPACE.fieldLeading, {
            font: fonts.regular,
            size: 8.8,
            color: field.tone ? TONE_COLOR[field.tone] : NAVY,
          });
        });
      });
      sheet.y = rowTop + rowHeight + SPACE.fieldRowGap;
    }

    if (endpoint.note) {
      sheet.y += SPACE.beforeNote;
      sheet.y += sheet.paragraph(endpoint.note, MARGIN.left, CONTENT_WIDTH, {
        font: fonts.regular,
        size: 8,
        leading: 10.6,
        color: MUTED,
      });
    }
    sheet.y += SPACE.beforeCounts;
    sheet.y += sheet.paragraph(endpoint.counts, MARGIN.left, CONTENT_WIDTH, {
      font: fonts.regular,
      size: 8,
      leading: 10.6,
      color: MUTED,
    });
    sheet.y += SPACE.beforeTable;

    /* ---------------------------------------------------------- patch list */

    if (endpoint.listMessage) {
      sheet.ensure(24);
      sheet.fill(sheet.y, 18, WASH);
      sheet.text(endpoint.listMessage, MARGIN.left + SPACE.cellX, sheet.y + 12, {
        font: fonts.regular,
        size: 8.2,
        color: MUTED,
      });
      sheet.y += 30;
      return;
    }

    if (endpoint.updates.length === 0) {
      sheet.ensure(18);
      sheet.text("Action1 reports no missing updates for this endpoint.", MARGIN.left, sheet.y + 9, {
        font: fonts.regular,
        size: 8.2,
        color: MUTED,
      });
      sheet.y += 22;
      return;
    }

    sheet.ensure(46);
    tableHeader(sheet);

    endpoint.updates.forEach((update, row) => {
      const nameWidth = TABLE_COLUMNS[1] - SPACE.cellX * 2;
      const nameLines = sheet.wrap(update.name, fonts.regular, 8.4, nameWidth);
      // One CVE id per line. Several ids in one run used to spill into the
      // severity column and throw the row out of shape.
      const cveIds = splitCveIds(update.cve);
      const cveLines = (cveIds.length > 0 ? cveIds : ["—"]).flatMap((id) =>
        sheet.wrap(id, fonts.mono, 7.6, TABLE_COLUMNS[2] - SPACE.cellX * 2),
      );
      const bodyHeight = Math.max(
        Math.max(1, nameLines.length) * TABLE_LEADING,
        cveLines.length * CVE_LEADING,
        9,
      );
      const rowHeight = SPACE.cellTop + bodyHeight + SPACE.cellBottom;

      if (sheet.ensure(rowHeight)) {
        sheet.text(
          `${index + 1}. ${endpoint.name} (continued)`,
          MARGIN.left,
          sheet.y + 8,
          { font: fonts.bold, size: 8.4, color: MUTED },
        );
        sheet.y += 20;
        tableHeader(sheet);
      }

      const rowTop = sheet.y;
      const baseline = rowTop + SPACE.cellTop;
      if (row % 2 === 1) sheet.fill(rowTop, rowHeight - 1, WASH);

      sheet.text(String(row + 1), MARGIN.left + 4, baseline, {
        font: fonts.regular,
        size: 8,
        color: MUTED,
      });
      nameLines.forEach((line, lineIndex) => {
        sheet.text(line, MARGIN.left + TABLE_COLUMNS[0] + SPACE.cellX, baseline + lineIndex * TABLE_LEADING, {
          font: fonts.regular,
          size: 8.4,
          color: BODY,
        });
      });
      // The KB number rides along with the name when there is room for it.
      if (update.kb) {
        const lastLine = nameLines[nameLines.length - 1] ?? "";
        const used = fonts.regular.widthOfTextAtSize(safe(lastLine), 8.4);
        const kb = fonts.regular.widthOfTextAtSize(safe(` · ${update.kb}`), 8.4);
        if (used + kb <= nameWidth) {
          sheet.text(
            ` · ${update.kb}`,
            MARGIN.left + TABLE_COLUMNS[0] + SPACE.cellX + used,
            baseline + (nameLines.length - 1) * TABLE_LEADING,
            { font: fonts.regular, size: 8.4, color: MUTED },
          );
        }
      }
      const cveX = MARGIN.left + TABLE_COLUMNS[0] + TABLE_COLUMNS[1];
      cveLines.forEach((line, lineIndex) => {
        sheet.text(line, cveX + SPACE.cellX, baseline + lineIndex * CVE_LEADING, {
          font: fonts.mono,
          size: 7.6,
          color: BODY,
        });
      });
      const severityX = cveX + TABLE_COLUMNS[2];
      const severityTone: ReportTone =
        update.severity.toLowerCase() === "critical"
          ? "danger"
          : update.severity.toLowerCase() === "important"
            ? "pending"
            : "neutral";
      sheet.text(update.severity || "—", severityX + SPACE.cellX, baseline, {
        font: fonts.regular,
        size: 8,
        color: TONE_COLOR[severityTone],
      });

      sheet.rule(rowTop + rowHeight - 1, LINE, 0.5);
      sheet.y = rowTop + rowHeight;
    });

    sheet.y += SPACE.afterTable;
  });

  /* -------------------------------------------------------------- footers */

  const pages = sheet.all;
  pages.forEach((page, index) => {
    const ruleY = MARGIN.bottom - 16;
    page.drawLine({
      start: { x: MARGIN.left, y: ruleY },
      end: { x: PAGE_WIDTH - MARGIN.right, y: ruleY },
      thickness: 0.6,
      color: LINE,
    });
    page.drawText(
      safe(
        `Patch data as Action1 reports it on ${model.prepared}. TaskTornado · Developed by Infeara Technologies.`,
      ),
      { x: MARGIN.left, y: ruleY - 11, size: 7, font: fonts.regular, color: MUTED },
    );
    const counter = `Page ${index + 1} of ${pages.length}`;
    const width = fonts.regular.widthOfTextAtSize(counter, 7);
    page.drawText(counter, {
      x: PAGE_WIDTH - MARGIN.right - width,
      y: ruleY - 11,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
  });

  return doc.save();
}
