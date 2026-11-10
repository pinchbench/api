import { createContext, runInContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";
import { adminHTML } from "./adminHtml";

function adminScript() {
  const script = adminHTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error("Admin script not found");
  return script.replace(/\binit\(\);\s*$/, "");
}

function setup() {
  const elements: Record<string, { innerHTML: string; value: string }> = {};
  let click: (event: { target: { closest: (selector: string) => unknown } }) => void = () => {};
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ versions: [] }) }));
  const context = createContext({
    document: {
      getElementById: (id: string) => (elements[id] ??= { innerHTML: "", value: "" }),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: (name: string, listener: typeof click) => {
        if (name === "click") click = listener;
      },
    },
    window: { location: { hash: "" }, addEventListener: () => {} },
    fetch,
    setTimeout: () => {},
    confirm: () => true,
  });
  runInContext(adminScript(), context);

  return {
    render: (functionName: string, data: unknown, ...args: unknown[]) => {
      Object.assign(context, { data, args });
      runInContext(`${functionName}(data, ...args)`, context);
    },
    html: (id: string) => elements[id]?.innerHTML ?? "",
    action: (action: string, id: string, value?: string) => {
      click({ target: { closest: () => ({ dataset: { action, id, value } }) } });
    },
    fetch,
  };
}

describe("admin HTML rendering", () => {
  const payload = `v'\"><img src=x onerror=alert(1)>`;

  test("renders stored version IDs as text and inert action attributes", () => {
    const admin = setup();
    admin.render("renderVersions", [{
      id: payload, created_at: "2026-01-01", submission_count: 1,
      is_current: false, is_hidden: false,
    }]);
    const html = admin.html("versions-content");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("data-action=\"toggle-current\"");
    expect(html).toContain("data-id=\"v&#39;&quot;&gt;&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onclick=\"toggleCurrent");
  });

  test("renders stored submission, token, and username fields safely", () => {
    const admin = setup();
    admin.render("renderSubmissions", [{
      id: payload, model: payload, provider: payload, benchmark_version: payload,
      score_percentage: 0.5, official: false, timestamp: "2026-01-01",
    }], 1, true);
    const submissions = admin.html("submissions-content");
    expect(submissions).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(submissions).not.toContain("<img");
    expect(submissions).not.toContain("onclick=\"deleteSubmission");
    expect(submissions).toContain("data-action=\"delete-submission\"");

    admin.render("renderTokens", [{
      id: payload, created_at: "2026-01-01", last_used_at: null,
      submission_count: 0, claimed_at: null, claim_code: null,
    }], 1, true);
    expect(admin.html("tokens-content")).not.toContain("<img");
    expect(admin.html("tokens-content")).not.toContain("onclick=\"copyToken");

    admin.render("renderUsers", [{
      github_username: payload, submission_count: 1, token_count: 1,
      first_seen: null, last_active: null,
    }], 1, true);
    expect(admin.html("users-content")).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(admin.html("users-content")).not.toContain("<img");
  });

  test("actions use original IDs and encode them in request paths", async () => {
    const admin = setup();
    admin.action("toggle-current", payload, "true");
    await vi.waitFor(() => expect(admin.fetch).toHaveBeenCalledWith(
      `/admin/api/versions/${encodeURIComponent(payload)}`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ current: true }) }),
    ));
    admin.action("toggle-official", payload, "false");
    await vi.waitFor(() => expect(admin.fetch).toHaveBeenCalledWith(
      `/admin/api/submissions/${encodeURIComponent(payload)}/official`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ official: false }) }),
    ));
  });

  test("escapes alert and API error messages", async () => {
    const admin = setup();
    admin.render("showAlert", payload, "error");
    expect(admin.html("alert")).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(admin.html("alert")).not.toContain("<img");

    admin.fetch.mockImplementationOnce(async () => ({
      ok: false, json: async () => ({ error: payload }),
    }));
    admin.render("loadVersions", undefined);
    await vi.waitFor(() => expect(admin.html("versions-content")).toContain("&lt;img"));
    expect(admin.html("versions-content")).not.toContain("<img");
  });
});
