import { writeFile, mkdir } from "node:fs/promises";

const chrome = "http://127.0.0.1:9222";
const app = "http://127.0.0.1:3000";
const outDir = "ui-verification";
let id = 0;

async function newTab(url) {
  const response = await fetch(`${chrome}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await response.json();
  return connect(target.webSocketDebuggerUrl);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else {
      events.push(message);
    }
  };
  const opened = new Promise((resolve) => {
    ws.onopen = resolve;
  });
  async function send(method, params = {}) {
    await opened;
    const callId = ++id;
    ws.send(JSON.stringify({ id: callId, method, params }));
    const result = await new Promise((resolve) => pending.set(callId, resolve));
    if (result.error) throw new Error(`${method}: ${result.error.message}`);
    return result.result;
  }
  return { send, events, close: () => ws.close() };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function evalJs(tab, expression) {
  const result = await tab.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  return result.result.value;
}

async function navigate(tab, path) {
  await tab.send("Page.navigate", { url: app + path });
  await delay(1200);
}

async function screenshot(tab, name) {
  const result = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(`${outDir}/${name}.png`, Buffer.from(result.data, "base64"));
}

async function clickText(tab, text) {
  const box = await evalJs(tab, `
    (() => {
      const els = [...document.querySelectorAll('button,a')];
      const el = els.find((item) => item.textContent?.includes(${JSON.stringify(text)}));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()
  `);
  if (!box) throw new Error(`Could not find clickable text: ${text}`);
  await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await delay(700);
}

async function clickSelector(tab, selector) {
  const box = await evalJs(tab, `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()
  `);
  if (!box) throw new Error(`Could not find selector: ${selector}`);
  await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await delay(700);
}

async function typeChat(tab, message) {
  const focused = await evalJs(tab, `
    (() => {
      const input = document.querySelector('input[placeholder*="tin nhắn"]');
      if (!input) return false;
      input.focus();
      return true;
    })()
  `);
  if (!focused) throw new Error("Chat input not found");
  await tab.send("Input.insertText", { text: message });
  await tab.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await tab.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await delay(900);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const tab = await newTab(app);
  await tab.send("Page.enable");
  await tab.send("Runtime.enable");
  await tab.send("Log.enable");
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false
  });

  const pages = ["/", "/dashboard", "/conversations", "/leads", "/products", "/settings"];
  const findings = [];
  for (const path of pages) {
    await navigate(tab, path);
    const info = await evalJs(tab, `
      (() => ({
        title: document.querySelector('h1')?.textContent ?? '',
        textLength: document.body.innerText.length,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        buttons: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).filter(Boolean).slice(0, 8)
      }))()
    `);
    await screenshot(tab, path === "/" ? "chat" : path.slice(1));
    findings.push({ path, ...info });
  }

  await navigate(tab, "/");
  await clickSelector(tab, "button[title='Reset conversation']");
  for (const message of [
    "Chào em, anh đang cần sơn lại nhà.",
    "Nhà anh 2 tầng.",
    "Khoảng 100 mét vuông.",
    "Anh muốn sơn cả trong và ngoài.",
    "Loại nào tốt?",
    "0987654321"
  ]) {
    await typeChat(tab, message);
  }
  const chatState = await evalJs(tab, `
    (() => ({
      hasPhone: document.body.innerText.includes('0987654321'),
      hasQualified: document.body.innerText.includes('QUALIFIED'),
      hasScore: document.body.innerText.includes('100/100'),
      messageCount: [...document.querySelectorAll('div')].filter((el) => el.textContent?.includes('Dạ')).length
    }))()
  `);
  await screenshot(tab, "chat-after-flow");

  const pageResults = [];
  for (const path of pages.slice(1)) {
    await navigate(tab, path);
    pageResults.push(await evalJs(tab, `
      (() => ({
        path: ${JSON.stringify(path)},
        title: document.querySelector('h1')?.textContent ?? '',
        textLength: document.body.innerText.length,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      }))()
    `));
    await screenshot(tab, path.slice(1));
  }

  await navigate(tab, "/conversations");
  const returnVisible = await evalJs(tab, `document.body.innerText.includes('Return to AI')`);
  if (returnVisible) await clickText(tab, "Return to AI");
  const afterReturn = await evalJs(tab, `document.body.innerText.includes('Take over conversation')`);

  const errors = tab.events.filter((event) =>
    (event.method === "Runtime.exceptionThrown") ||
    (event.method === "Log.entryAdded" && ["error", "assert"].includes(event.params?.entry?.level))
  );

  console.log(JSON.stringify({ initialPages: findings, pageResults, chatState, handoffReturnWorked: afterReturn, consoleErrorCount: errors.length }, null, 2));
  tab.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
