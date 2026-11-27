import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { LOGO_PNG_BASE64 } from "./logoBase64.js";
import { letterInfo, resultRows, tableCells } from "./exportData.js";

/**
 * Hasil ujian dalam bentuk PDF: kop madrasah seperti kop surat (logo di kiri,
 * tulisan di tengah),
 * kotak informasi ujian, tabel nilai per tipe soal, dan kolom tanda tangan.
 */

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const RIGHT = MARGIN_LEFT + CONTENT_WIDTH;

const INK = rgb(0.08, 0.08, 0.08);
const GRID = rgb(0.25, 0.25, 0.25);
const HEADER_FILL = rgb(0.93, 0.93, 0.93);
const STRIP_FILL = rgb(0.975, 0.975, 0.975);

/** No | Nama Siswa | PG | PGK | BS | Menjodohkan | Uraian | Total Nilai */
const COLUMNS = [
  { label: "No", width: 30, align: "center" },
  { label: "Nama Siswa", width: 152, align: "left" },
  { label: "PG", width: 50, align: "center", group: true },
  { label: "PGK", width: 50, align: "center", group: true },
  { label: "BS", width: 46, align: "center", group: true },
  { label: "Menjodohkan", width: 74, align: "center", group: true },
  { label: "Uraian", width: 52, align: "center", group: true },
  { label: "Total Nilai", width: 61, align: "center" },
];

const HEADER_ROW_TOP = 17;
const HEADER_ROW_SUB = 16;
const BODY_ROW = 18;

/** Ganti tanda baca "pintar" dan buang karakter di luar Latin-1. */
function sanitize(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text, font, size, maxWidth) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Perkecil ukuran huruf sampai teksnya muat di lebar yang tersedia. */
function fitSize(text, font, size, maxWidth, minSize = 9) {
  let current = size;
  while (current > minSize && font.widthOfTextAtSize(sanitize(text), current) > maxWidth) {
    current -= 0.5;
  }
  return current;
}

/** Tulis teks rata tengah pada posisi x. */
function centered(page, text, font, size, centerX, y) {
  const label = sanitize(text);
  const width = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: centerX - width / 2, y, size, font, color: INK });
}

function fit(text, font, size, maxWidth) {
  let value = sanitize(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}...`;
}

function cell(page, { x, yTop, width, height, text, font, size, align = "center", fill, textColor = INK }) {
  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    borderColor: GRID,
    borderWidth: 0.6,
    color: fill,
  });
  if (!text) return;
  const label = fit(text, font, size, width - 6);
  const textWidth = font.widthOfTextAtSize(label, size);
  const textX =
    align === "left" ? x + 4 : align === "right" ? x + width - textWidth - 4 : x + (width - textWidth) / 2;
  page.drawText(label, {
    x: textX,
    y: yTop - height + (height - size) / 2 + 1.5,
    size,
    font,
    color: textColor,
  });
}

function drawTableHeader(page, fonts, yTop) {
  const groupLabels = COLUMNS.filter((col) => col.group);
  const groupWidth = groupLabels.reduce((sum, col) => sum + col.width, 0);
  let x = MARGIN_LEFT;
  const first = COLUMNS[0];
  const second = COLUMNS[1];
  const last = COLUMNS[COLUMNS.length - 1];

  cell(page, {
    x,
    yTop,
    width: first.width,
    height: HEADER_ROW_TOP + HEADER_ROW_SUB,
    text: first.label,
    font: fonts.bold,
    size: 9.5,
    fill: HEADER_FILL,
  });
  x += first.width;
  cell(page, {
    x,
    yTop,
    width: second.width,
    height: HEADER_ROW_TOP + HEADER_ROW_SUB,
    text: second.label,
    font: fonts.bold,
    size: 9.5,
    fill: HEADER_FILL,
  });
  x += second.width;
  cell(page, {
    x,
    yTop,
    width: groupWidth,
    height: HEADER_ROW_TOP,
    text: "Jumlah Benar",
    font: fonts.bold,
    size: 9.5,
    fill: HEADER_FILL,
  });
  let groupX = x;
  for (const col of groupLabels) {
    cell(page, {
      x: groupX,
      yTop: yTop - HEADER_ROW_TOP,
      width: col.width,
      height: HEADER_ROW_SUB,
      text: col.label,
      font: fonts.bold,
      size: 9.5,
      fill: HEADER_FILL,
    });
    groupX += col.width;
  }
  x += groupWidth;
  cell(page, {
    x,
    yTop,
    width: last.width,
    height: HEADER_ROW_TOP + HEADER_ROW_SUB,
    text: last.label,
    font: fonts.bold,
    size: 9.5,
    fill: HEADER_FILL,
  });
  return yTop - HEADER_ROW_TOP - HEADER_ROW_SUB;
}

function newPage(pdf, fonts) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return page;
}

export async function buildResultPdf({ exam, sessions, settings, scoreOf }) {
  const info = letterInfo(exam, sessions, settings);
  const rows = resultRows(sessions, scoreOf);

  const pdf = await PDFDocument.create();
  pdf.setTitle(info.heading);
  pdf.setSubject(`Hasil ujian ${exam?.title || ""}`.trim());
  pdf.setCreator("Sistem Ujian MTs YTI Sukamerang");

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  let page = newPage(pdf, fonts);
  let y = PAGE_HEIGHT - MARGIN_TOP;

  /* ------------------------------------------------------------ kop */
  const logoHeight = 64;
  const logoWidth = (logo.width / logo.height) * logoHeight;
  page.drawImage(logo, { x: MARGIN_LEFT, y: y - logoHeight, width: logoWidth, height: logoHeight });

  const logoRight = MARGIN_LEFT + logoWidth;
  const centerX = PAGE_WIDTH / 2;
  // ruang aman untuk tulisan tengah: jangan sampai menyentuh logo
  const kopRoom = Math.max(220, 2 * (centerX - logoRight - 14));
  const nameSize = fitSize(info.madrasah, fonts.bold, 15, kopRoom, 10);
  const kopLines = [
    { text: info.madrasah, font: fonts.bold, size: nameSize },
    { text: `Tahun Pelajaran ${info.academicYear}`, font: fonts.regular, size: 11 },
  ];
  const kopHeight = kopLines.reduce((sum, line) => sum + line.size * 1.32, 0);
  let kopY = y - Math.max(0, (logoHeight - kopHeight) / 2);
  for (const line of kopLines) {
    centered(page, line.text, line.font, line.size, centerX, kopY - line.size);
    kopY -= line.size * 1.32;
  }

  y = y - logoHeight - 6;
  page.drawRectangle({ x: MARGIN_LEFT, y: y - 2.4, width: CONTENT_WIDTH, height: 2.4, color: INK });
  page.drawRectangle({ x: MARGIN_LEFT, y: y - 5.6, width: CONTENT_WIDTH, height: 0.7, color: INK });
  y -= 22;

  /* ---------------------------------------------- judul di bawah kop */
  const titleLines = wrap(info.heading, fonts.bold, 13.5, CONTENT_WIDTH);
  for (const line of titleLines) {
    centered(page, line, fonts.bold, 13.5, centerX, y - 13);
    y -= 13 * 1.32;
  }
  y -= 14;

  /* ------------------------------------------------- kotak informasi */
  const boxPadX = 12;
  const infoRowHeight = 19;
  const boxHeight = infoRowHeight * info.items.length + 12;
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: y - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: GRID,
    borderWidth: 0.8,
  });
  const labelWidth = 150;
  let infoY = y - 8;
  for (const item of info.items) {
    const baseline = infoY - 10;
    page.drawText(sanitize(item.label), {
      x: MARGIN_LEFT + boxPadX,
      y: baseline,
      size: 10.5,
      font: fonts.regular,
    });
    page.drawText(":", { x: MARGIN_LEFT + boxPadX + labelWidth - 6, y: baseline, size: 10.5, font: fonts.regular });
    const value = fit(item.value, fonts.bold, 10.5, CONTENT_WIDTH - labelWidth - boxPadX * 2);
    page.drawText(value, {
      x: MARGIN_LEFT + boxPadX + labelWidth + 2,
      y: baseline,
      size: 10.5,
      font: fonts.bold,
    });
    infoY -= infoRowHeight;
  }
  y = y - boxHeight - 16;

  /* ------------------------------------------------------------ tabel */
  y = drawTableHeader(page, fonts, y);

  if (rows.length === 0) {
    cell(page, {
      x: MARGIN_LEFT,
      yTop: y,
      width: CONTENT_WIDTH,
      height: BODY_ROW,
      text: "Belum ada peserta pada ujian ini.",
      font: fonts.italic,
      size: 9.5,
    });
    y -= BODY_ROW;
  }

  rows.forEach((row, index) => {
    if (y - BODY_ROW < MARGIN_BOTTOM + 130) {
      page = newPage(pdf, fonts);
      y = PAGE_HEIGHT - MARGIN_TOP;
      centered(page, info.madrasah, fonts.bold, 11, PAGE_WIDTH / 2, y - 11);
      centered(page, info.heading, fonts.regular, 9.5, PAGE_WIDTH / 2, y - 23);
      page.drawRectangle({ x: MARGIN_LEFT, y: y - 30, width: CONTENT_WIDTH, height: 0.8, color: INK });
      y -= 38;
      y = drawTableHeader(page, fonts, y);
    }
    const cells = tableCells(row);
    let x = MARGIN_LEFT;
    COLUMNS.forEach((col, colIndex) => {
      cell(page, {
        x,
        yTop: y,
        width: col.width,
        height: BODY_ROW,
        text: cells[colIndex],
        font: fonts.regular,
        size: 9.5,
        align: col.align,
        fill: index % 2 === 1 ? STRIP_FILL : undefined,
      });
      x += col.width;
    });
    y -= BODY_ROW;
  });

  /* ------------------------------------------------- catatan kecil */
  y -= 8;
  const note =
    "Tanda (-) berarti peserta belum menyelesaikan ujian atau belum dinilai. " +
    "Kolom PG, PGK, BS, dan Menjodohkan berisi jumlah jawaban benar dari jumlah soal; " +
    "kolom Uraian berisi poin perolehan dari poin maksimal.";
  if (y > MARGIN_BOTTOM + 96) {
    const noteLines = wrap(note, fonts.italic, 8.5, CONTENT_WIDTH);
    noteLines.forEach((line, index) => {
      page.drawText(line, { x: MARGIN_LEFT, y: y - 8 - index * 11, size: 8.5, font: fonts.italic });
    });
    y -= 12 + noteLines.length * 11;
  }

  /* ------------------------------------------------- blok tanda tangan */
  const signatureHeight = 96;
  if (y - signatureHeight < MARGIN_BOTTOM) {
    page = newPage(pdf, fonts);
    y = PAGE_HEIGHT - MARGIN_TOP;
  }
  const columnWidth = 210;
  const leftX = MARGIN_LEFT + 8;
  const rightX = RIGHT - columnWidth - 8;
  const labels = [
    { x: leftX, title: "Kepala Madrasah,", name: info.headName },
    { x: rightX, title: "Guru Mata Pelajaran,", name: info.teacherName },
  ];
  for (const item of labels) {
    const titleWidth = fonts.regular.widthOfTextAtSize(sanitize(item.title), 11);
    page.drawText(sanitize(item.title), {
      x: item.x + (columnWidth - titleWidth) / 2,
      y: y - 12,
      size: 11,
      font: fonts.regular,
    });
    const nameY = y - 74;
    if (item.name) {
      const nameWidth = fonts.bold.widthOfTextAtSize(sanitize(item.name), 11);
      page.drawText(sanitize(item.name), {
        x: item.x + (columnWidth - nameWidth) / 2,
        y: nameY,
        size: 11,
        font: fonts.bold,
      });
      const lineWidth = Math.max(nameWidth + 10, 120);
      page.drawLine({
        start: { x: item.x + (columnWidth - lineWidth) / 2, y: nameY - 3 },
        end: { x: item.x + (columnWidth + lineWidth) / 2, y: nameY - 3 },
        thickness: 0.6,
        color: INK,
      });
    } else {
      const dotted = "(...................................)";
      const dottedWidth = fonts.regular.widthOfTextAtSize(dotted, 11);
      page.drawText(dotted, {
        x: item.x + (columnWidth - dottedWidth) / 2,
        y: nameY,
        size: 11,
        font: fonts.regular,
      });
    }
  }

  /* --------------------------------------------------- nomor halaman */
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    const label = `Halaman ${index + 1} dari ${pages.length}`;
    const width = fonts.regular.widthOfTextAtSize(label, 8.5);
    item.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: Math.max(18, MARGIN_BOTTOM / 2 + 4),
      size: 8.5,
      font: fonts.regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  return pdf.save();
}
