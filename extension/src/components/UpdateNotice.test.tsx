import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpdateNoticeContent } from "./UpdateNotice";
import { parseStableRelease, type UpdateCheck } from "../lib/updates";

function render(version: string, failed = false, checking = false) {
  const result: UpdateCheck = {
    release: parseStableRelease({ tag_name: "v" + version, draft: false, prerelease: false }),
    failed, checkedAt: Date.now()
  };
  return renderToStaticMarkup(<UpdateNoticeContent installed="1.0.1" result={result}
    checking={checking} onCheck={() => undefined} />);
}

describe("main-screen update notice", () => {
  it("shows a newer version and an Update link to its GitHub release", () => {
    const html = render("1.0.2");
    expect(html).toContain("Update available: v1.0.2");
    expect(html).toContain('href="https://github.com/aungkyawswarzed/Browser-Xray/releases/tag/v1.0.2"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Check for updates");
  });

  it.each(["1.0.1", "1.0.0", "1.0"])("does not offer an update for %s", (version) => {
    const html = render(version);
    expect(html).not.toContain('class="update-banner"');
    expect(html).not.toContain('href=');
    expect(html).toContain("up to date");
  });

  it("retains a discovered update but reports a failed refresh honestly", () => {
    const html = render("1.0.2", true);
    expect(html).toContain("Update available: v1.0.2");
    expect(html).toContain("check GitHub. Try again.");
    expect(html).not.toContain("up to date");
  });

  it("disables manual checks while a request is running", () => {
    const html = render("1.0.1", false, true);
    expect(html).toContain('disabled=""');
    expect(html).toContain("Checking");
    expect(html).not.toContain("up to date");
  });

  it("never reports up to date without a check result", () => {
    const html = renderToStaticMarkup(<UpdateNoticeContent installed="1.0.1"
      result={null} checking={false} onCheck={() => undefined} />);
    expect(html).not.toContain("up to date");
    expect(html).toContain("check GitHub. Try again.");
  });
});
