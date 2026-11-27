import ExcelJS from "exceljs";
import { LOGO_PNG_BASE64 } from "./logoBase64.js";
import { letterInfo, resultRows, tableCells } from "./exportData.js";

/**
 * Hasil ujian dalam bentuk Excel (.xlsx). Kop, kotak informasi, tabel, dan
 * kolom tanda tangan sama susunannya dengan versi PDF.
 */

const Workbook = ExcelJS.Workbook || ExcelJS.default?.Workbook;

const INK = "FF111111";
const GRID = "FF555555";

const thin = { style: "thin", color: { argb: GRID } };
const medium = { style: "medium", color: { argb: "FF000000" } };
const allThin = { top: thin, left: thin, bottom: thin, right: thin };

// 9 adalah lebar bawaan ExcelJS, jadi ditulis 8.5 supaya kolomnya tetap diatur
const COLUMN_WIDTHS = [5, 32, 7, 7, 6, 14, 8.5, 12];
const LAST_COLUMN = "H";

function styleCell(ws, ref, options = {}) {
  const cell = ws.getCell(ref);
  if (options.value !== undefined) cell.value = options.value;
  cell.font = { name: "Times New Roman", size: options.size ?? 10.5, bold: !!options.bold, italic: !!options.italic };
  cell.alignment = {
    horizontal: options.align ?? "left",
    vertical: "middle",
    wrapText: !!options.wrap,
  };
  if (options.border) cell.border = options.border;
  if (options.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.fill } };
  }
  return cell;
}

export async function buildResultXlsx({ exam, sessions, settings, scoreOf }) {
  const info = letterInfo(exam, sessions, settings);
  const rows = resultRows(sessions, scoreOf);

  const workbook = new Workbook();
  workbook.creator = "Sistem Ujian MTs YTI Sukamerang";
  workbook.created = new Date();

  const sheetName = String(exam?.title || "Hasil Ujian").replace(/[*?:/\\[\]]/g, "").slice(0, 28) || "Hasil Ujian";
  const ws = workbook.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: false,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  COLUMN_WIDTHS.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  /* ------------------------------------------------------------- kop */
  const logoId = workbook.addImage({ base64: `data:image/png;base64,${LOGO_PNG_BASE64}`, extension: "png" });
  ws.addImage(logoId, {
    tl: { col: 0, row: 0 },
    ext: { width: 54, height: 64 },
    editAs: "oneCell",
  });

  ws.getRow(1).height = 24;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 22;
  ws.mergeCells("B1:H1");
  styleCell(ws, "B1", { value: info.madrasah, size: 15, bold: true, align: "center", wrap: true });
  ws.mergeCells("B2:H2");
  styleCell(ws, "B2", { value: `Tahun Pelajaran ${info.academicYear}`, size: 11, align: "center" });
  ws.mergeCells("A3:H3");
  styleCell(ws, "A3", { value: info.heading, size: 13, bold: true, align: "center", wrap: true });

  /* -------------------------------------------------- garis pemisah */
  ws.getRow(4).height = 6;
  for (let col = 1; col <= 8; col += 1) {
    ws.getCell(4, col).border = { bottom: medium };
  }

  /* -------------------------------------------------- kotak informasi */
  info.items.forEach((item, index) => {
    const row = 5 + index;
    ws.getRow(row).height = 18;
    ws.mergeCells(`A${row}:B${row}`);
    styleCell(ws, `A${row}`, { value: item.label, size: 10.5, border: allThin });
    styleCell(ws, `B${row}`, { border: allThin });
    ws.mergeCells(`C${row}:${LAST_COLUMN}${row}`);
    styleCell(ws, `C${row}`, { value: item.value, size: 10.5, bold: true, border: allThin });
    ws.getCell(`D${row}`).border = allThin;
    ws.getCell(`E${row}`).border = allThin;
    ws.getCell(`F${row}`).border = allThin;
    ws.getCell(`G${row}`).border = allThin;
    ws.getCell(`H${row}`).border = allThin;
  });

  ws.getRow(8).height = 8;

  /* --------------------------------------------------------- tabel */
  const headerTop = 9;
  const headerBottom = 10;
  ws.getRow(headerTop).height = 20;
  ws.getRow(headerBottom).height = 20;

  const headerStyle = { size: 10.5, bold: true, align: "center", wrap: true, border: allThin, fill: "FFEDEDED" };
  ws.mergeCells(`A${headerTop}:A${headerBottom}`);
  styleCell(ws, `A${headerTop}`, { ...headerStyle, value: "No" });
  styleCell(ws, `A${headerBottom}`, { ...headerStyle });
  ws.mergeCells(`B${headerTop}:B${headerBottom}`);
  styleCell(ws, `B${headerTop}`, { ...headerStyle, value: "Nama Siswa" });
  styleCell(ws, `B${headerBottom}`, { ...headerStyle });
  ws.mergeCells(`C${headerTop}:G${headerTop}`);
  styleCell(ws, `C${headerTop}`, { ...headerStyle, value: "Jumlah Benar" });
  ["D", "E", "F", "G"].forEach((col) => {
    styleCell(ws, `${col}${headerTop}`, { ...headerStyle });
  });
  const subHeaders = [
    ["C", "PG"],
    ["D", "PGK"],
    ["E", "BS"],
    ["F", "Menjodohkan"],
    ["G", "Uraian"],
  ];
  subHeaders.forEach(([col, label]) => {
    styleCell(ws, `${col}${headerBottom}`, { ...headerStyle, value: label });
  });
  ws.mergeCells(`H${headerTop}:H${headerBottom}`);
  styleCell(ws, `H${headerTop}`, { ...headerStyle, value: "Total Nilai" });
  styleCell(ws, `H${headerBottom}`, { ...headerStyle });

  let rowIndex = headerBottom + 1;
  if (rows.length === 0) {
    ws.mergeCells(`A${rowIndex}:${LAST_COLUMN}${rowIndex}`);
    styleCell(ws, `A${rowIndex}`, {
      value: "Belum ada peserta pada ujian ini.",
      size: 10.5,
      italic: true,
      align: "center",
      border: allThin,
    });
    rowIndex += 1;
  }

  rows.forEach((row, index) => {
    const cells = tableCells(row);
    const zebra = index % 2 === 1 ? "FFF8F8F8" : undefined;
    const aligns = ["center", "left", "center", "center", "center", "center", "center", "center"];
    cells.forEach((value, colIndex) => {
      styleCell(ws, `${String.fromCharCode(65 + colIndex)}${rowIndex}`, {
        value,
        size: 10.5,
        align: aligns[colIndex],
        border: allThin,
        fill: zebra,
      });
    });
    ws.getRow(rowIndex).height = 18;
    rowIndex += 1;
  });

  /* --------------------------------------------------------- catatan */
  ws.mergeCells(`A${rowIndex}:${LAST_COLUMN}${rowIndex}`);
  styleCell(ws, `A${rowIndex}`, {
    value:
      "Tanda (-) berarti peserta belum menyelesaikan ujian atau belum dinilai. Kolom PG, PGK, BS, dan " +
      "Menjodohkan berisi jumlah jawaban benar dari jumlah soal; kolom Uraian berisi poin perolehan dari poin maksimal.",
    size: 9,
    italic: true,
    wrap: true,
  });
  ws.getRow(rowIndex).height = 26;
  rowIndex += 1;

  /* ----------------------------------------------------- tanda tangan */
  rowIndex += 1;
  const leftLabel = rowIndex;
  ws.mergeCells(`A${leftLabel}:C${leftLabel}`);
  styleCell(ws, `A${leftLabel}`, { value: "Kepala Madrasah,", size: 11, align: "center" });
  ws.mergeCells(`F${leftLabel}:${LAST_COLUMN}${leftLabel}`);
  styleCell(ws, `F${leftLabel}`, { value: "Guru Mata Pelajaran,", size: 11, align: "center" });

  const nameRow = leftLabel + 4;
  ws.getRow(nameRow - 1).height = 16;
  ws.mergeCells(`A${nameRow}:C${nameRow}`);
  styleCell(ws, `A${nameRow}`, {
    value: info.headName || "(...................................)",
    size: 11,
    bold: !!info.headName,
    align: "center",
  });
  ws.mergeCells(`F${nameRow}:${LAST_COLUMN}${nameRow}`);
  styleCell(ws, `F${nameRow}`, {
    value: info.teacherName || "(...................................)",
    size: 11,
    bold: !!info.teacherName,
    align: "center",
  });

  if (rows.length > 0) {
    ws.views = [{ state: "frozen", ySplit: headerBottom }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
