import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
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

export async function buildPatchReportPdf(model: PatchReportModel): Promise<Uint8Array> {
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

  const logoWidth = 112;
  const logoHeight = (logoWidth * WORDMARK.height) / WORDMARK.width;
  const rightEdge = PAGE_WIDTH - MARGIN.right;
  const headTop = MARGIN.top;

  sheet.logo(MARGIN.left, headTop + 12, logoWidth);

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

  const TABLE_COLUMNS = [26, 300, 108, 73];
  const TABLE_LEADING = 9.9;

  function tableHeader(sheetRef: Sheet) {
    const base = sheetRef.y;
    let x = MARGIN.left;
    ["S.No", "Patch name", "CVE", "Severity"].forEach((label, index) => {
      sheetRef.text(label.toUpperCase(), x + (index === 0 ? 0 : 2), base, {
        font: fonts.bold,
        size: 6.6,
        color: MUTED,
      });
      x += TABLE_COLUMNS[index];
    });
    sheetRef.rule(base + 4.5);
    sheetRef.y = base + 14;
  }

  model.endpoints.forEach((endpoint, index) => {
    // A section never starts at the very bottom of a page: keep its heading and
    // first rows together.
    sheet.ensure(96);

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
    sheet.y = headingTop + 26;

    // Fields: three to a row, label above value, as on the screen.
    const gap = 16;
    const columnWidth = (CONTENT_WIDTH - gap * 2) / 3;
    for (let start = 0; start < endpoint.fields.length; start += 3) {
      const row = endpoint.fields.slice(start, start + 3);
      const heights = row.map((field) => {
        const lines = sheet.wrap(field.value || "—", fonts.regular, 8.8, columnWidth);
        return 9 + Math.max(1, lines.length) * 10.4;
      });
      const rowHeight = Math.max(...heights);
      if (sheet.ensure(rowHeight + 4)) {
        // A field row is allowed to continue on the next page.
        sheet.text(`${index + 1}. ${endpoint.name} (continued)`, MARGIN.left, sheet.y + 8, {
          font: fonts.bold,
          size: 8.4,
          color: MUTED,
        });
        sheet.y += 16;
      }
      const rowTop = sheet.y;
      row.forEach((field, column) => {
        const x = MARGIN.left + column * (columnWidth + gap);
        sheet.text(field.label.toUpperCase(), x, rowTop + 6, {
          font: fonts.bold,
          size: 6.4,
          color: MUTED,
        });
        const lines = sheet.wrap(field.value || "—", fonts.regular, 8.8, columnWidth);
        lines.forEach((line, lineIndex) => {
          sheet.text(line, x, rowTop + 16 + lineIndex * 10.4, {
            font: fonts.regular,
            size: 8.8,
            color: field.tone ? TONE_COLOR[field.tone] : NAVY,
          });
        });
      });
      sheet.y = rowTop + rowHeight;
    }

    sheet.y += 2;
    if (endpoint.note) {
      const noteHeight = sheet.paragraph(endpoint.note, MARGIN.left, CONTENT_WIDTH, {
        font: fonts.regular,
        size: 8,
        leading: 10,
        color: MUTED,
      });
      sheet.y += noteHeight;
    }
    sheet.paragraph(endpoint.counts, MARGIN.left, CONTENT_WIDTH, {
      font: fonts.regular,
      size: 8,
      leading: 10,
      color: MUTED,
    });
    sheet.y += 10;

    /* ---------------------------------------------------------- patch list */

    if (endpoint.listMessage) {
      sheet.ensure(20);
      sheet.fill(sheet.y, 16, WASH);
      sheet.text(endpoint.listMessage, MARGIN.left + 6, sheet.y + 11, {
        font: fonts.regular,
        size: 8.2,
        color: MUTED,
      });
      sheet.y += 24;
      return;
    }

    if (endpoint.updates.length === 0) {
      sheet.ensure(16);
      sheet.text("Action1 reports no missing updates for this endpoint.", MARGIN.left, sheet.y + 8, {
        font: fonts.regular,
        size: 8.2,
        color: MUTED,
      });
      sheet.y += 20;
      return;
    }

    sheet.ensure(26);
    tableHeader(sheet);

    endpoint.updates.forEach((update, row) => {
      const nameLines = sheet.wrap(update.name, fonts.regular, 8.4, TABLE_COLUMNS[1] - 10);
      const rowHeight = Math.max(1, nameLines.length) * TABLE_LEADING + 5.5;

      if (sheet.ensure(rowHeight + 2)) {
        sheet.text(
          `${index + 1}. ${endpoint.name} (continued)`,
          MARGIN.left,
          sheet.y + 8,
          { font: fonts.bold, size: 8.4, color: MUTED },
        );
        sheet.y += 15;
        tableHeader(sheet);
      }

      const rowTop = sheet.y;
      if (row % 2 === 1) sheet.fill(rowTop - 2.5, rowHeight, WASH);

      sheet.text(String(row + 1), MARGIN.left + 2, rowTop + 6.5, {
        font: fonts.regular,
        size: 8,
        color: MUTED,
      });
      nameLines.forEach((line, lineIndex) => {
        sheet.text(line, MARGIN.left + TABLE_COLUMNS[0] + 2, rowTop + 6.5 + lineIndex * TABLE_LEADING, {
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
        if (used + kb <= TABLE_COLUMNS[1] - 10) {
          sheet.text(
            ` · ${update.kb}`,
            MARGIN.left + TABLE_COLUMNS[0] + 2 + used,
            rowTop + 6.5 + (nameLines.length - 1) * TABLE_LEADING,
            { font: fonts.regular, size: 8.4, color: MUTED },
          );
        }
      }
      const cveX = MARGIN.left + TABLE_COLUMNS[0] + TABLE_COLUMNS[1];
      sheet.text(update.cve || "—", cveX + 2, rowTop + 6.5, {
        font: fonts.mono,
        size: 7.6,
        color: BODY,
      });
      const severityX = cveX + TABLE_COLUMNS[2];
      const severityTone: ReportTone =
        update.severity.toLowerCase() === "critical"
          ? "danger"
          : update.severity.toLowerCase() === "important"
            ? "pending"
            : "neutral";
      sheet.text(update.severity || "—", severityX + 2, rowTop + 6.5, {
        font: fonts.regular,
        size: 8,
        color: TONE_COLOR[severityTone],
      });

      sheet.rule(rowTop + rowHeight - 2.5, LINE, 0.5);
      sheet.y = rowTop + rowHeight;
    });

    sheet.y += 16;
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
