const { app, BrowserWindow, ipcMain, webContents } = require("electron");

function isSupportedChatUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (/business\.facebook\.com$/i.test(url.hostname) && /\/latest(?:\/|$)|\/inbox(?:\/|$)/i.test(url.pathname)) return true;
    if (/messenger\.com$/i.test(url.hostname) || /www\.messenger\.com$/i.test(url.hostname)) return true;
    if (/facebook\.com$/i.test(url.hostname) && /\/messages(?:\/|$)/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function activeBrowserContents() {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      const children = Array.isArray(win?.contentView?.children) ? win.contentView.children : [];
      const hit = children.find((child) => {
        const contents = child?.webContents;
        return contents && !contents.isDestroyed() && isSupportedChatUrl(contents.getURL());
      });
      if (hit?.webContents) return hit.webContents;
    } catch {}
  }
  return webContents.getAllWebContents().find((contents) => {
    try { return !contents.isDestroyed() && isSupportedChatUrl(contents.getURL()); }
    catch { return false; }
  }) || null;
}

function captureScript() {
  return `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 3 && r.height > 3 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const fastVisible = (el) => {
      if (!el || !el.isConnected || el.closest('[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight;
    };

    const selectors = [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[contenteditable="true"][aria-label*="Trả lời"]',
      '[contenteditable="true"][aria-label*="Reply"]',
      'div[contenteditable="true"]',
      'textarea'
    ].join(',');
    const input = Array.from(document.querySelectorAll(selectors))
      .filter(visible)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((item) => item.r.width > 150 && item.r.top > innerHeight * 0.42)
      .sort((a, b) => b.r.bottom - a.r.bottom || b.r.width - a.r.width)[0];

    if (!input) {
      return { inputFound: false, latestText: '', latestDirection: 'unknown', incoming: false, history: [], messages: [], messageCount: 0, title: document.title || '', conversationKey: location.href, url: location.href, confidence: 0, scanCount: 0 };
    }

    const ir = input.r;
    let root = null;
    let parent = input.el.parentElement;
    while (parent && parent !== document.body) {
      const r = parent.getBoundingClientRect();
      const spansComposer = r.left <= ir.left + 12 && r.right >= ir.right - 12;
      const enoughHistory = r.top < ir.top - Math.min(170, innerHeight * 0.2);
      const usefulWidth = r.width >= ir.width * 0.78 && r.width <= Math.min(780, innerWidth * 0.68);
      const usefulHeight = r.height >= Math.min(340, innerHeight * 0.46);
      if (spansComposer && enoughHistory && usefulWidth && usefulHeight) {
        root = parent;
        break;
      }
      parent = parent.parentElement;
    }
    root = root || input.el.closest('[role="main"]') || document.body;
    const rr = root.getBoundingClientRect ? root.getBoundingClientRect() : { top: 0 };

    const leftLimit = Math.max(0, ir.left - Math.min(90, ir.width * 0.23));
    const rightLimit = Math.min(innerWidth, ir.right + Math.min(70, ir.width * 0.18));
    const topLimit = Math.max(Number(rr.top || 0), ir.top - Math.max(780, innerHeight * 1.0));
    const skipExact = /^(Gửi|Send|Đã xem|Seen|Like|Thích|Reply|Trả lời|Enter|Nhấn Enter|Message|Tin nhắn|More|Xem thêm|Forward|Chuyển tiếp|Actions|Hành động|Xem danh bạ|Tạo quảng cáo nhắn tin)$/i;
    const skipTime = /^\\d{1,2}:\\d{2}(?:\\s?[AP]M)?$/i;
    const rows = [];
    const seen = new Set();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 2200) {
      const text = clean(node.nodeValue);
      const el = node.parentElement;
      scanned += 1;
      node = walker.nextNode();
      if (!text || !el || text.length > 1000 || skipExact.test(text) || skipTime.test(text)) continue;
      if (/^(Messenger|Instagram|WhatsApp|Tất cả tin nhắn|Chưa đọc|Ưu tiên|Trao đổi)$/i.test(text)) continue;
      if (!fastVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom >= ir.top - 2 || r.top < topLimit) continue;
      if (r.right < leftLimit || r.left > rightLimit) continue;
      if (r.height > 210 || r.width > ir.width * 1.06) continue;
      const key = Math.round(r.left / 6) + ':' + Math.round(r.top / 6) + ':' + text;
      if (seen.has(key)) continue;
      seen.add(key);
      const leftGap = Math.max(0, r.left - ir.left);
      const rightGap = Math.max(0, ir.right - r.right);
      let direction = 'unknown';
      if (leftGap + 16 < rightGap) direction = 'incoming';
      else if (rightGap + 16 < leftGap) direction = 'outgoing';
      rows.push({ text, direction, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) });
    }

    rows.sort((a, b) => a.bottom - b.bottom || a.top - b.top || a.left - b.left);
    const deduped = [];
    for (const row of rows) {
      const duplicate = deduped.some((item) => item.text === row.text && Math.abs(item.bottom - row.bottom) < 10 && Math.abs(item.left - row.left) < 24);
      if (!duplicate) deduped.push(row);
    }

    let messages = deduped.filter((item) => item.direction !== 'unknown').slice(-14);
    if (!messages.length) messages = deduped.slice(-14);
    const latest = messages[messages.length - 1] || null;

    const headings = Array.from(root.querySelectorAll ? root.querySelectorAll('h1,h2,h3,[role="heading"]') : [])
      .filter(visible)
      .map((el) => ({ text: clean(el.innerText || el.textContent), r: el.getBoundingClientRect() }))
      .filter((item) => item.text && item.text.length < 100 && item.r.bottom < ir.top && item.r.right > leftLimit && item.r.left < rightLimit)
      .sort((a, b) => b.r.bottom - a.r.bottom);

    const u = new URL(location.href);
    const keyParam = ['selected_item_id','thread_id','conversation_id','selected_item','id'].map((name) => u.searchParams.get(name)).find(Boolean);
    const title = headings[0]?.text || document.title || '';
    const conversationKey = keyParam || (title ? u.hostname + '|' + title : location.href.split('#')[0]);
    const incoming = latest?.direction === 'incoming';
    let confidence = 0.34;
    if (latest?.text) confidence += 0.24;
    if (latest?.direction && latest.direction !== 'unknown') confidence += 0.24;
    if (messages.length >= 2) confidence += 0.08;
    if (conversationKey) confidence += 0.06;

    return {
      inputFound: true,
      latestText: latest?.text || '',
      latestDirection: latest?.direction || 'unknown',
      incoming,
      history: messages.slice(-10).map((item) => (item.direction === 'incoming' ? 'Khách: ' : item.direction === 'outgoing' ? 'Bạn/Page: ' : '') + item.text),
      messages: messages.map((item) => ({ text: item.text, direction: item.direction })),
      messageCount: messages.length,
      title,
      conversationKey,
      url: location.href,
      confidence: Math.min(0.96, confidence),
      scanCount: scanned
    };
  })()`;
}

async function snapshot() {
  const contents = activeBrowserContents();
  if (!contents || contents.isDestroyed()) return null;
  const value = await contents.executeJavaScript(captureScript(), true);
  return {
    ...value,
    supportedChat: isSupportedChatUrl(contents.getURL()),
    confidence: Math.min(1, Number(value?.confidence || 0) + 0.04)
  };
}

function register() {
  ipcMain.removeHandler("chat:snapshot");
  ipcMain.handle("chat:snapshot", () => snapshot());
}

app.whenReady().then(() => {
  // chat-runtime registers at 120ms. Replace only the snapshot reader afterwards.
  // This does no work until Inspect/Auto explicitly requests a snapshot.
  setTimeout(register, 240);
});
