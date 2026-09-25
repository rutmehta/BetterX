/// <reference types="bun" />
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import type { BrowserWindow } from "electron";
import { parseHTML } from "linkedom";
import { AgentController } from "../main/agent.js";

// Substitute only the Electron/website boundary; run the real controller and its
// serialized DOM extractor against actual documents, including scroll changes.
function fixture(options: { nestedScroll?: boolean; stalledScrolls?: number } = {}) {
  let url = "https://x.com/home";
  let account = "owner";
  let page = 0;
  let scrolls = 0;
  let draft = false;
  const document = () => {
    const doc = parseHTML(`<a data-testid="AppTabBar_Profile_Link" href="/${account}">Profile</a>
    ${draft ? '<div contenteditable="true" data-testid="tweetTextarea_0">Unsaved draft</div>' : ""}
    <div id="timeline"><article data-testid="tweet"><div data-testid="User-Name"><a href="/alice/status/${100 + page}"><time datetime="2026-09-07">Today</time></a></div><div data-testid="tweetText">Memory notes ${page}</div></article></div>`)
      .document;
    if (options.nestedScroll) {
      const timeline = doc.querySelector("#timeline")!;
      Object.defineProperties(timeline, {
        scrollHeight: { value: 2000 },
        clientHeight: { value: 500 },
        scrollBy: { value: () => { if (++scrolls > (options.stalledScrolls ?? 0)) page++; } },
      });
    }
    return doc;
  };
  const win = {
    isDestroyed: () => false,
    loadURL: async (next: string) => {
      url = next;
      page = 0;
    },
    webContents: {
      getURL: () => url,
      stop() {},
      executeJavaScriptInIsolatedWorld: async (_world: number, scripts: { code: string }[]) =>
        runInNewContext(scripts[0]?.code ?? "", {
          document: document(),
          location: { href: url },
          URL,
          Date,
          innerHeight: 720,
          getComputedStyle: () => ({ overflowY: options.nestedScroll ? "auto" : "visible" }),
          window: {
            scrollBy: () => {
              if (!options.nestedScroll) page++;
            },
          },
        }),
    },
  };
  return {
    controller: new AgentController(() => win as unknown as BrowserWindow),
    setUrl: (next: string) => {
      url = next;
    },
    setAccount: (next: string) => {
      account = next;
    },
    setDraft: () => {
      draft = true;
    },
    getUrl: () => url,
  };
}

test("controller scrolls an inner bookmark timeline instead of the window", async () => {
  const f = fixture({ nestedScroll: true });
  const result = (await f.controller.execute(
    { name: "collect_bookmarks", args: { pages: 2 } },
    new AbortController().signal
  )) as { posts: { id: string }[]; pagesRead: number; stoppedBecause: string };
  expect(result.posts.map((post) => post.id)).toEqual(["100", "101"]);
  expect(result.pagesRead).toBe(2);
  expect(result.stoppedBecause).toBe("page_limit");
}, 10_000);

test("controller retries one stalled bookmark scroll before ending collection", async () => {
  const f = fixture({ nestedScroll: true, stalledScrolls: 1 });
  const result = (await f.controller.execute(
    { name: "collect_bookmarks", args: { pages: 2 } },
    new AbortController().signal
  )) as { posts: { id: string }[]; pagesRead: number; stoppedBecause: string };
  expect(result.posts.map((post) => post.id)).toEqual(["100", "101"]);
  expect(result.stoppedBecause).toBe("page_limit");
}, 12_000);

test("controller tolerates two stalled scrolls without counting them as pages", async () => {
  const f = fixture({ nestedScroll: true, stalledScrolls: 2 });
  const result = (await f.controller.execute(
    { name: "collect_bookmarks", args: { pages: 2 } },
    new AbortController().signal
  )) as { posts: { id: string }[]; pagesRead: number; stoppedBecause: string };
  expect(result.posts.map((post) => post.id)).toEqual(["100", "101"]);
  expect(result.pagesRead).toBe(2);
  expect(result.stoppedBecause).toBe("page_limit");
}, 16_000);

test("controller collects successive bookmark screens and searches them without conflating accounts", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  const result = (await f.controller.execute(
    { name: "collect_bookmarks", args: { pages: 2 } },
    signal
  )) as { posts: { id: string }[]; complete: boolean; pagesRead: number };
  expect(result.posts.map((post) => post.id)).toEqual(["100", "101"]);
  expect(result.complete).toBe(false);
  expect(result.pagesRead).toBe(2);
  const search = (await f.controller.execute(
    { name: "search_collected_posts", args: { query: "memory", limit: 20 } },
    signal
  )) as { indexedPosts: number };
  expect(search.indexedPosts).toBe(2);
  f.setAccount("other");
  const changed = (await f.controller.execute(
    { name: "search_collected_posts", args: { query: "memory", limit: 20 } },
    signal
  )) as { indexedPosts: number; account: string };
  expect(changed.indexedPosts).toBe(1);
  expect(changed.account).toBe("other");
});

test("controller blocks unsupported pages, aborted calls and navigation over a draft", async () => {
  const f = fixture();
  f.setUrl("https://x.com/i/chat");
  await expect(
    f.controller.execute({ name: "read_visible_posts", args: {} }, new AbortController().signal)
  ).rejects.toThrow("outside agent access");
  await expect(
    f.controller.execute({ name: "open_bookmarks", args: {} }, AbortSignal.abort())
  ).rejects.toThrow();
  expect(f.getUrl()).toBe("https://x.com/i/chat");
  f.setUrl("https://x.com/home");
  f.setDraft();
  await expect(
    f.controller.execute({ name: "open_bookmarks", args: {} }, new AbortController().signal)
  ).rejects.toThrow("draft");
  expect(f.getUrl()).toBe("https://x.com/home");
});
