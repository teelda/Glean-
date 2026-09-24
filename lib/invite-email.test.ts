import { describe, expect, it } from "vitest";
import { formInvitationEmail } from "./invite-email";

describe("form invitation email", () => {
  it("explains the role and includes a branded action", () => {
    const email = formInvitationEmail({ formName: "Checkout research", role: "reviewer", inviteUrl: "https://glean.folde.work/invite?token=test" });
    expect(email.subject).toContain("Checkout research");
    expect(email.text).toContain("review the form and leave notes");
    expect(email.html).toContain("Open form in Glean");
    expect(email.html).toContain("Glean");
  });

  it("escapes owner-controlled content", () => {
    const email = formInvitationEmail({ formName: "<script>alert(1)</script>", role: "editor", inviteUrl: "https://example.com/?a=1&b=2", note: "<img src=x>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("a=1&amp;b=2");
  });
});
