import { describe, expect, it } from "vitest";
import { buildEvidenceCsv, buildWordReport, csvCell, escapeHtml, executiveSummary } from "./export";
import { sampleStudy } from "./sample-data";
import type { Study } from "./types";

const approvedStudy: Study = {
  ...sampleStudy,
  themes: sampleStudy.themes.map((theme, index) => ({ ...theme, status: index === 0 ? "approved" : "draft" }))
};

const hostile = (): Study => ({
  ...approvedStudy,
  title: "=cmd|'/c calc'!A1 <img src=x onerror=alert(1)>",
  themes: approvedStudy.themes.map((theme, index) =>
    index === 0
      ? {
          ...theme,
          title: "=cmd|'/c calc'!A1",
          summary: "<script>alert('xss')</script>",
          evidence: [{ ...theme.evidence[0], quote: '@SUM(1+1)*cmd "quoted"' }]
        }
      : theme
  )
});

describe("csvCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(1)"])("neutralises the formula prefix in %s", value => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });

  it("doubles embedded quotes", () => {
    expect(csvCell('he said "no"')).toBe('"he said ""no"""');
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Studio owner")).toBe('"Studio owner"');
  });

  it("does not mangle a quote that merely contains a dash", () => {
    expect(csvCell("well - it depends")).toBe('"well - it depends"');
  });
});

describe("buildEvidenceCsv", () => {
  it("never emits a cell that opens as a formula", () => {
    const csv = buildEvidenceCsv(hostile());
    csv.split("\r\n").forEach(row =>
      row.split(",").forEach(cell => expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@]/))
    );
  });

  it("keeps the injected text readable rather than dropping it", () => {
    expect(buildEvidenceCsv(hostile())).toContain("cmd|'/c calc'!A1");
  });

  it("exports one row per evidence item, not per finding", () => {
    const study = {
      ...approvedStudy,
      themes: [{ ...approvedStudy.themes[0], evidence: [approvedStudy.themes[0].evidence[0], { ...approvedStudy.themes[0].evidence[0], id: "e2" }] }]
    };
    expect(buildEvidenceCsv(study).split("\r\n")).toHaveLength(3); // header + 2
  });
});

describe("buildWordReport", () => {
  it("escapes markup coming from transcripts and titles", () => {
    const html = buildWordReport(hostile());
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("dates the report when it is generated, not at a fixed point in the past", () => {
    expect(buildWordReport(approvedStudy, new Date("2026-09-02T00:00:00Z"))).toContain("2 September 2026");
  });

  it("includes every approved finding and excludes drafts", () => {
    const html = buildWordReport(approvedStudy);
    expect(html).toContain(approvedStudy.themes[0].title);
    expect(html).not.toContain(approvedStudy.themes[1].title);
  });
});

describe("executiveSummary", () => {
  it("asks for approvals when there are none", () => {
    expect(executiveSummary({ ...sampleStudy, themes: [] })).toMatch(/waiting for approved findings/i);
  });

  it("never claims a count of zero interviews supports anything", () => {
    const orphaned = { ...approvedStudy, interviews: [] };
    expect(executiveSummary(orphaned)).not.toMatch(/^0 interviews suggest/);
    expect(executiveSummary(orphaned)).toMatch(/no longer linked/i);
  });

  it("agrees in number for a single interview", () => {
    expect(executiveSummary({ ...approvedStudy, interviews: [approvedStudy.interviews[0]] }))
      .toContain("1 interview suggests");
  });
});

describe("escapeHtml", () => {
  it("escapes every character that can break out of markup", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#039;");
  });
});
