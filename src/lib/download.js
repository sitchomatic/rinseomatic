// Tiny CSV / file-download helpers — no deps.

function escapeCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => escapeCell(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")
  );
  return [header, ...body].join("\n");
}

export function downloadFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}