import { jsPDF } from 'jspdf';

type PdfDoc = jsPDF;

interface PdfFrame {
  doc: PdfDoc;
  pageWidth: number;
  pageHeight: number;
  contentX: number;
  contentWidth: number;
  cursorY: number;
  bottomY: number;
  nextPage: () => void;
  ensureSpace: (height: number) => void;
}

interface PatientMeta {
  displayName?: string;
  age?: number;
  sex?: string;
  weightKg?: number | null;
}

interface PrescriptionPdfRow {
  medication: string;
  form: string;
  dose: string;
  frequency: string;
  duration: string;
  note?: string;
}

interface TreatmentPdfRow {
  form: string;
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
}

export interface EncounterPdfInput {
  filename?: string;
  generatedAt?: number;
  patient?: PatientMeta;
  chips?: string[];
  diagnosis: string;
  management: string;
  investigations?: string[];
  prescriptions?: PrescriptionPdfRow[];
  counseling?: string[];
  followUp?: string[];
  prognosis: string;
  prevention: string;
}

export interface DrugProtocolPdfInput {
  filename?: string;
  generatedAt?: number;
  protocolLabel: string;
  weightBasis: string;
  patient?: PatientMeta;
  rows: TreatmentPdfRow[];
}

export interface VisitRecordPdfInput {
  filename?: string;
  generatedAt?: number;
  visitLabel: string;
  status: string;
  diagnosis: string;
  complaint?: string;
  notes?: string;
  soap: {
    S?: Record<string, unknown>;
    O?: Record<string, unknown>;
    A?: Record<string, unknown>;
    P?: Record<string, unknown>;
  };
  clerking?: {
    hpc?: string;
    pmh?: string;
    dh?: string;
    sh?: string;
    fh?: string;
  };
}

const COLORS = {
  pageBg: [244, 247, 252] as [number, number, number],
  sheetBg: [255, 255, 255] as [number, number, number],
  heroBg: [23, 78, 205] as [number, number, number],
  heroAccent: [83, 149, 255] as [number, number, number],
  heroText: [255, 255, 255] as [number, number, number],
  sectionBg: [247, 249, 253] as [number, number, number],
  chipBg: [233, 239, 248] as [number, number, number],
  heading: [30, 41, 59] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  muted: [71, 85, 105] as [number, number, number],
  tableHead: [226, 238, 255] as [number, number, number],
  rowA: [249, 251, 255] as [number, number, number],
  rowB: [243, 248, 254] as [number, number, number],
  orbOuter: [221, 236, 255] as [number, number, number],
  orbMid: [191, 219, 255] as [number, number, number],
  orbCore: [96, 165, 250] as [number, number, number],
  watermarkText: [227, 234, 245] as [number, number, number],
};

const normalizeString = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toFileName = (prefix: string, suffix?: string): string => {
  const stamp = new Date().toISOString().slice(0, 10);
  const normalizedSuffix = suffix ? normalizeString(suffix).slice(0, 44) : '';
  const parts = [prefix, normalizedSuffix, stamp].filter(Boolean);
  return `${parts.join('-')}.pdf`;
};

const formatTimestamp = (value: number): string =>
  new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const setFill = (doc: PdfDoc, color: [number, number, number]) => {
  doc.setFillColor(color[0], color[1], color[2]);
};

const setTextColor = (doc: PdfDoc, color: [number, number, number]) => {
  doc.setTextColor(color[0], color[1], color[2]);
};

const drawOrbWatermark = (doc: PdfDoc, pageWidth: number, pageHeight: number) => {
  const orbX = pageWidth - 78;
  const orbY = 54;
  setFill(doc, COLORS.orbOuter);
  doc.circle(orbX, orbY, 18, 'F');
  setFill(doc, COLORS.orbMid);
  doc.circle(orbX, orbY, 12, 'F');
  setFill(doc, COLORS.orbCore);
  doc.circle(orbX, orbY, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  setTextColor(doc, COLORS.watermarkText);
  doc.text('Dr Dyrane', pageWidth - 56, pageHeight - 72, {
    align: 'right',
  });
};

const formatStructuredRecord = (value?: Record<string, unknown>): string => {
  if (!value || Object.keys(value).length === 0) return 'Not recorded.';
  const rows = Object.entries(value)
    .map(([key, item]) => {
      const nextValue =
        item === null || item === undefined
          ? '-'
          : typeof item === 'string'
            ? item
            : typeof item === 'number' || typeof item === 'boolean'
              ? String(item)
              : JSON.stringify(item);
      return `${key}: ${nextValue}`;
    })
    .filter((row) => row.trim().length > 0);
  return rows.length > 0 ? rows.join('\n') : 'Not recorded.';
};

const createFrame = (): PdfFrame => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const frame: PdfFrame = {
    doc,
    pageWidth,
    pageHeight,
    contentX: 42,
    contentWidth: pageWidth - 84,
    cursorY: 56,
    bottomY: pageHeight - 56,
    nextPage: () => {
      doc.addPage();
      drawPage();
    },
    ensureSpace: (height: number) => {
      if (frame.cursorY + height > frame.bottomY) {
        frame.nextPage();
      }
    },
  };

  const drawPage = () => {
    setFill(doc, COLORS.pageBg);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    setFill(doc, COLORS.sheetBg);
    doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 18, 18, 'F');
    setFill(doc, COLORS.sectionBg);
    doc.roundedRect(20, 20, pageWidth - 40, 102, 18, 18, 'F');
    drawOrbWatermark(doc, pageWidth, pageHeight);
    frame.cursorY = 56;
  };

  drawPage();
  return frame;
};

const drawHeader = (
  frame: PdfFrame,
  title: string,
  subtitle: string,
  metaLines: string[],
  chips: string[]
) => {
  const { doc, contentX, contentWidth } = frame;
  frame.ensureSpace(110);

  setFill(doc, COLORS.heroBg);
  doc.roundedRect(contentX, frame.cursorY, contentWidth, 72, 16, 16, 'F');
  setFill(doc, COLORS.heroAccent);
  doc.circle(contentX + contentWidth - 20, frame.cursorY + 8, 38, 'F');
  setFill(doc, COLORS.heroBg);
  doc.circle(contentX + contentWidth - 26, frame.cursorY + 12, 28, 'F');
  setFill(doc, COLORS.heroAccent);
  doc.circle(contentX + contentWidth - 30, frame.cursorY + 16, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setTextColor(doc, COLORS.heroText);
  doc.text(title, contentX + 16, frame.cursorY + 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const subtitleLines = doc.splitTextToSize(subtitle, contentWidth - 32);
  doc.text(subtitleLines, contentX + 16, frame.cursorY + 45);

  frame.cursorY += 84;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setTextColor(doc, COLORS.muted);
  for (const line of metaLines.filter((item) => item.trim().length > 0)) {
    frame.ensureSpace(14);
    doc.text(line, contentX + 2, frame.cursorY + 10);
    frame.cursorY += 14;
  }

  if (chips.length > 0) {
    let x = contentX;
    let y = frame.cursorY + 4;
    for (const chip of chips) {
      const value = chip.trim();
      if (!value) continue;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const width = Math.min(contentWidth, doc.getTextWidth(value) + 18);
      if (x + width > contentX + contentWidth) {
        x = contentX;
        y += 24;
      }
      if (y + 20 > frame.bottomY) {
        frame.nextPage();
        x = contentX;
        y = frame.cursorY;
      }
      setFill(doc, COLORS.chipBg);
      doc.roundedRect(x, y, width, 20, 10, 10, 'F');
      setTextColor(doc, COLORS.heading);
      doc.text(value, x + 9, y + 13);
      x += width + 6;
    }
    frame.cursorY = y + 26;
  } else {
    frame.cursorY += 10;
  }
};

const drawParagraphSection = (frame: PdfFrame, title: string, value: string) => {
  const { doc, contentX, contentWidth } = frame;
  const source = value.trim().length > 0 ? value.trim() : 'Not recorded.';
  const lines = doc.splitTextToSize(source, contentWidth - 24);
  let index = 0;

  while (index < lines.length) {
    const remainingHeight = frame.bottomY - frame.cursorY - 46;
    const chunkLineCapacity = Math.max(1, Math.floor(remainingHeight / 13));
    const chunk = lines.slice(index, index + chunkLineCapacity);
    const cardHeight = 30 + chunk.length * 13 + 10;
    frame.ensureSpace(cardHeight + 10);

    setFill(doc, COLORS.sectionBg);
    doc.roundedRect(contentX, frame.cursorY, contentWidth, cardHeight, 14, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, COLORS.muted);
    const label = index === 0 ? title.toUpperCase() : `${title.toUpperCase()} (CONT.)`;
    doc.text(label, contentX + 12, frame.cursorY + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setTextColor(doc, COLORS.text);
    doc.text(chunk, contentX + 12, frame.cursorY + 33);

    frame.cursorY += cardHeight + 10;
    index += chunk.length;
  }
};

const drawListSection = (frame: PdfFrame, title: string, items: string[]) => {
  if (items.length === 0) return;
  const listText = items
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  drawParagraphSection(frame, title, listText);
};

interface TableColumn {
  key: string;
  title: string;
  ratio: number;
}

type TableRow = Record<string, string>;

const drawTableSection = (
  frame: PdfFrame,
  title: string,
  columns: TableColumn[],
  rows: TableRow[]
) => {
  if (rows.length === 0) return;
  const { doc, contentX, contentWidth } = frame;
  const rowPaddingX = 8;
  const rowPaddingY = 6;
  const lineHeight = 11.5;

  const totalRatio = columns.reduce((sum, col) => sum + col.ratio, 0);
  const colWidths = columns.map((col) => (contentWidth * col.ratio) / totalRatio);

  const drawHeaderRow = () => {
    frame.ensureSpace(30);
    setFill(doc, COLORS.tableHead);
    doc.roundedRect(contentX, frame.cursorY, contentWidth, 24, 8, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setTextColor(doc, COLORS.heading);

    let x = contentX;
    for (let index = 0; index < columns.length; index += 1) {
      doc.text(columns[index].title, x + rowPaddingX, frame.cursorY + 15);
      x += colWidths[index];
    }
    frame.cursorY += 28;
  };

  frame.ensureSpace(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, COLORS.muted);
  doc.text(title.toUpperCase(), contentX + 2, frame.cursorY + 10);
  frame.cursorY += 16;
  drawHeaderRow();

  rows.forEach((row, rowIndex) => {
    const wrapped = columns.map((col, colIndex) =>
      doc.splitTextToSize(row[col.key] || '-', colWidths[colIndex] - rowPaddingX * 2)
    );
    const maxLines = wrapped.reduce((max, lines) => Math.max(max, lines.length), 1);
    const rowHeight = rowPaddingY * 2 + maxLines * lineHeight;
    if (frame.cursorY + rowHeight > frame.bottomY) {
      frame.nextPage();
      drawHeaderRow();
    }

    setFill(doc, rowIndex % 2 === 0 ? COLORS.rowA : COLORS.rowB);
    doc.roundedRect(contentX, frame.cursorY, contentWidth, rowHeight, 8, 8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setTextColor(doc, COLORS.text);

    let x = contentX;
    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      doc.text(wrapped[colIndex], x + rowPaddingX, frame.cursorY + rowPaddingY + 9);
      x += colWidths[colIndex];
    }

    frame.cursorY += rowHeight + 4;
  });

  frame.cursorY += 6;
};

const drawFooters = (frame: PdfFrame, footnote: string) => {
  const pages = frame.doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    frame.doc.setPage(page);
    frame.doc.setFont('helvetica', 'normal');
    frame.doc.setFontSize(8.5);
    setTextColor(frame.doc, COLORS.muted);
    setFill(frame.doc, COLORS.orbOuter);
    frame.doc.circle(frame.contentX - 2, frame.pageHeight - 34, 4, 'F');
    setFill(frame.doc, COLORS.orbCore);
    frame.doc.circle(frame.contentX - 2, frame.pageHeight - 34, 2.1, 'F');
    frame.doc.text(footnote, frame.contentX, frame.pageHeight - 32);
    frame.doc.text(`Page ${page}/${pages}`, frame.pageWidth - frame.contentX, frame.pageHeight - 32, {
      align: 'right',
    });
  }
};

const buildPatientMetaLine = (patient?: PatientMeta): string => {
  if (!patient) return '';
  const bits = [
    patient.displayName ? `Name: ${patient.displayName}` : null,
    typeof patient.age === 'number' ? `Age: ${patient.age}` : null,
    patient.sex ? `Sex: ${patient.sex}` : null,
    typeof patient.weightKg === 'number' ? `Weight: ${patient.weightKg} kg` : null,
  ].filter(Boolean);
  return bits.join(' | ');
};

export const exportEncounterPdf = (input: EncounterPdfInput) => {
  const frame = createFrame();
  const generatedAt = formatTimestamp(input.generatedAt || Date.now());
  const patientMetaLine = buildPatientMetaLine(input.patient);
  const chips = ['Encounter Summary', ...(input.chips || [])];

  drawHeader(
    frame,
    'Dr Dyrane Encounter',
    'Clinical encounter summary prepared for continuity of care.',
    [`Generated: ${generatedAt}`, patientMetaLine],
    chips
  );

  drawParagraphSection(frame, 'Diagnosis', input.diagnosis);
  drawParagraphSection(frame, 'Management', input.management);
  drawListSection(frame, 'Investigations', input.investigations || []);
  drawTableSection(
    frame,
    'Prescription',
    [
      { key: 'medication', title: 'Medication', ratio: 1.45 },
      { key: 'form', title: 'Form', ratio: 0.62 },
      { key: 'dose', title: 'Dose', ratio: 0.95 },
      { key: 'frequency', title: 'Frequency', ratio: 0.95 },
      { key: 'duration', title: 'Duration', ratio: 0.9 },
      { key: 'note', title: 'Note', ratio: 1.55 },
    ],
    (input.prescriptions || []).map((item) => ({
      medication: item.medication,
      form: item.form,
      dose: item.dose,
      frequency: item.frequency || '-',
      duration: item.duration || '-',
      note: item.note || '-',
    }))
  );
  drawListSection(frame, 'Pharmacy Counseling', input.counseling || []);
  drawListSection(frame, 'Follow-Up', input.followUp || []);
  drawParagraphSection(frame, 'Prognosis', input.prognosis);
  drawParagraphSection(frame, 'Prevention', input.prevention);

  drawFooters(frame, 'Dr Dyrane - Clinical Encounter');
  frame.doc.save(input.filename || toFileName('dr-dyrane-encounter', input.diagnosis));
};

export const exportDrugProtocolPdf = (input: DrugProtocolPdfInput) => {
  const frame = createFrame();
  const generatedAt = formatTimestamp(input.generatedAt || Date.now());
  const patientMetaLine = buildPatientMetaLine(input.patient);

  drawHeader(
    frame,
    'Dr Dyrane Treatment Sheet',
    'Prescription sheet with structured medication lines.',
    [`Generated: ${generatedAt}`, patientMetaLine],
    [input.protocolLabel, input.weightBasis]
  );

  drawTableSection(
    frame,
    'Prescription',
    [
      { key: 'form', title: 'Form', ratio: 0.85 },
      { key: 'medication', title: 'Medication', ratio: 1.55 },
      { key: 'dose', title: 'Dose', ratio: 1.05 },
      { key: 'frequency', title: 'Frequency', ratio: 1.05 },
      { key: 'duration', title: 'Duration', ratio: 1.05 },
    ],
    input.rows.map((row) => ({
      form: row.form,
      medication: row.medication,
      dose: row.dose,
      frequency: row.frequency || '-',
      duration: row.duration || '-',
    }))
  );

  drawFooters(frame, 'Dr Dyrane - Treatment Sheet');
  frame.doc.save(input.filename || toFileName('dr-dyrane-treatment', input.protocolLabel));
};

export const exportVisitRecordPdf = (input: VisitRecordPdfInput) => {
  const frame = createFrame();
  const generatedAt = formatTimestamp(input.generatedAt || Date.now());

  drawHeader(
    frame,
    'Dr Dyrane Visit Record',
    'Archived consultation summary with SOAP and clerking notes.',
    [`Generated: ${generatedAt}`, `Visit: ${input.visitLabel}`, `Status: ${input.status}`],
    [input.diagnosis]
  );

  drawParagraphSection(frame, 'Diagnosis', input.diagnosis);
  drawParagraphSection(frame, 'Complaint', input.complaint || 'Not recorded.');
  drawParagraphSection(frame, 'Record Notes', input.notes || 'None.');

  drawParagraphSection(frame, 'SOAP - Subjective', formatStructuredRecord(input.soap.S));
  drawParagraphSection(frame, 'SOAP - Objective', formatStructuredRecord(input.soap.O));
  drawParagraphSection(frame, 'SOAP - Assessment', formatStructuredRecord(input.soap.A));
  drawParagraphSection(frame, 'SOAP - Plan', formatStructuredRecord(input.soap.P));

  drawParagraphSection(frame, 'HPC', input.clerking?.hpc || 'Not recorded.');
  drawParagraphSection(frame, 'PMH', input.clerking?.pmh || 'Not recorded.');
  drawParagraphSection(frame, 'DH', input.clerking?.dh || 'Not recorded.');
  drawParagraphSection(frame, 'SH', input.clerking?.sh || 'Not recorded.');
  drawParagraphSection(frame, 'FH', input.clerking?.fh || 'Not recorded.');

  drawFooters(frame, 'Dr Dyrane - Visit Record');
  frame.doc.save(input.filename || toFileName('dr-dyrane-visit', input.visitLabel));
};
