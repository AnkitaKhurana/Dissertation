import fs from "fs";
import path from "path";

import { attachShadowUi } from "../extension/content";

const fixturePath = path.join(__dirname, "fixtures", "github-pr.html");
const html = fs.readFileSync(fixturePath, "utf-8");

describe("content script", () => {
  beforeEach(() => {
    // Set a GitHub PR URL so the content script's URL checks pass
    window.history.pushState({}, "", "/github.com/owner/repo/pull/123");
    document.body.innerHTML = html;
  });

  it("injects analyze button inside shadow root", () => {
    attachShadowUi();
    const host = document.getElementById("pr-sentinel-analyze-button");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector("button")?.textContent).toContain("Analyze");
  });
});
