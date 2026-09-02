// Report and evidence exports.
//
// Everything here interpolates third-party text — transcripts a researcher
// uploaded and answers respondents typed — so both encoders escape by default.

import type { Study } from "./types";

/** Escape text for interpolation into HTML content or a double-quoted attribute. */
export function escapeHtml(value: string) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character] ?? character));
}

/**
 * Encode one CSV cell.
 *
 * A leading =, +, - or @ makes Excel and Sheets treat the cell as a formula,
 * so a quote lifted from a transcript can execute on open. Prefixing with an
 * apostrophe is the standard neutralisation and stays invisible in the sheet.
 */
export function csvCell(value: string | number) {
  const text = String(value ?? "");
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export function executiveSummary(study: Study) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  if (!approved.length) {
    return "This report is waiting for approved findings. Review the draft patterns and verify their source quotes before sharing conclusions.";
  }
  if (!study.interviews.length) {
    return "The approved findings below are no longer linked to any interviews in this study. Re-add the source transcripts before sharing this report.";
  }
  const count = study.interviews.length;
  return `${count} ${count === 1 ? "interview suggests" : "interviews suggest"} that people lose confidence before reaching a clear first success. The strongest opportunity is to make the intended outcome visible earlier and guide users toward one safe, achievable next step.`;
}

export function buildEvidenceCsv(study: Study) {
  const rows: (string | number)[][] = [
    ["Finding", "Strength", "Participants", "Participant", "Role", "Exact quote", "Transcript segment"]
  ];
  study.themes
    .filter(theme => theme.status === "approved")
    .forEach(theme =>
      theme.evidence.forEach(item =>
        rows.push([
          theme.title,
          theme.strength,
          theme.participantCount,
          item.participantCode,
          item.participantRole,
          item.quote,
          item.segmentId
        ])
      )
    );
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function buildWordReport(study: Study, today = new Date()) {
  const approved = study.themes.filter(theme => theme.status === "approved");
  const date = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const findings = approved
    .map((theme, index) => {
      const coverage = study.interviews.length
        ? `Supported by ${theme.participantCount} of ${study.interviews.length} participants`
        : `Supported by ${theme.participantCount} participants`;
      const quotes = theme.evidence
        .map(
          item =>
            `<blockquote>&ldquo;${escapeHtml(item.quote)}&rdquo; &mdash; ${escapeHtml(item.participantCode)}, ${escapeHtml(item.participantRole)}</blockquote>`
        )
        .join("");
      return `<h2>Finding ${index + 1}. ${escapeHtml(theme.title)}</h2>
      <p>${escapeHtml(theme.summary)}</p>
      <p><strong>${escapeHtml(coverage)}</strong></p>
      ${quotes}`;
    })
    .join("");

  const limitations = study.interviews.length
    ? `This synthesis reflects ${study.interviews.length} ${study.interviews.length === 1 ? "interview" : "interviews"}. Findings should be validated with additional participants and relevant product data.`
    : "This report has no interviews attached. Re-add the source transcripts before relying on these findings.";

  return `<html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;color:#12103b;line-height:1.55}h1{font-size:32px}h2{margin-top:34px;font-size:22px}blockquote{margin:18px 0;padding:16px 20px;background:#f7f6fb;border-left:4px solid #f5c842}</style></head><body><p>Glean &middot; Powered by Folde</p><h1>${escapeHtml(study.title)}</h1><p>${escapeHtml(study.goal)}</p><p>Research report &middot; ${escapeHtml(date)}</p><h2>Executive summary</h2><p>${escapeHtml(executiveSummary(study))}</p>${findings}<h2>Limitations</h2><p>${escapeHtml(limitations)}</p></body></html>`;
}
