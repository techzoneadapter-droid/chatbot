const { BrowserWindow, ipcMain, webContents } = require("electron");

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

function listScript() {
  return `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const norm = (value) => clean(value).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
    const visible = (el) => {
      if (!el || !el.isConnected || el.closest('[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 150 && r.height >= 34 && r.height <= 170 && r.bottom > 90 && r.top < innerHeight - 90 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const skip = /^(Tất cả tin nhắn|Messenger|Instagram|WhatsApp|Chưa đọc|Ưu tiên|Tin trả lời quảng cáo|Trao đổi|Quản lý|Xem danh bạ|Tạo quảng cáo nhắn tin|Việc cần làm)$/i;
    const nodes = Array.from(document.querySelectorAll('a[href], [role="row"], [role="listitem"], [role="button"]'));
    const rows = [];
    const seen = new Set();
    for (const el of nodes) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left > innerWidth * 0.57 || r.right < Math.max(180, innerWidth * 0.18)) continue;
      if (r.top < 150) continue;
      const raw = clean(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
      if (!raw || raw.length < 2 || raw.length > 420 || skip.test(raw)) continue;
      const lines = String(el.innerText || el.textContent || '').split(/\\n+/).map(clean).filter(Boolean);
      const label = clean(lines[0] || el.getAttribute('aria-label') || raw).slice(0, 100);
      if (!label || skip.test(label) || /^\\d{1,2}:\\d{2}/.test(label)) continue;
      const hrefNode = el.matches('a[href]') ? el : el.querySelector?.('a[href]');
      const hrefRaw = hrefNode?.href || '';
      const usefulHref = /business\.facebook\.com|messenger\.com|facebook\.com\/messages/i.test(hrefRaw) ? hrefRaw : '';
      const aria = clean(el.getAttribute('aria-label') || '');
      const stableLabel = norm(label);
      if (!stableLabel || stableLabel.length < 2) continue;
      const key = usefulHref ? 'href:' + usefulHref : 'label:' + stableLabel;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        label,
        preview: clean(lines.slice(1, 3).join(' · ')).slice(0, 180),
        locator: usefulHref ? { kind: 'href', value: usefulHref } : { kind: 'label', value: label, aria },
        top: Math.round(r.top)
      });
    }
    rows.sort((a, b) => a.top - b.top);
    return rows.slice(0, 30);
  })()`;
}

function openScript(locator) {
  const payload = JSON.stringify(locator || {});
  return `(() => {
    const locator = ${payload};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const norm = (value) => clean(value).toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
    const visible = (el) => {
      if (!el || !el.isConnected || el.closest('[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 10 && r.height > 10 && r.bottom > 0 && r.top < innerHeight && s.display !== 'none' && s.visibility !== 'hidden';
    };
    let target = null;
    if (locator.kind === 'href' && locator.value) {
      const wanted = String(locator.value);
      target = Array.from(document.querySelectorAll('a[href]')).find((el) => visible(el) && el.href === wanted) || null;
    }
    if (!target && locator.kind === 'label' && locator.value) {
      const wanted = norm(locator.value);
      const candidates = Array.from(document.querySelectorAll('[role="row"], [role="listitem"], [role="button"], a[href]')).filter(visible);
      target = candidates.find((el) => {
        const text = norm((el.innerText || el.textContent || '').split(/\\n+/)[0]);
        const aria = norm(el.getAttribute('aria-label') || '');
        return text === wanted || aria === wanted || (wanted.length >= 4 && (text.startsWith(wanted) || aria.startsWith(wanted)));
      }) || null;
    }
    if (!target) return { ok: false, reason: 'CONVERSATION_NOT_FOUND' };
    const clickable = target.closest('a[href],[role="button"],[role="row"],[role="listitem"]') || target;
    clickable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    clickable.click();
    return { ok: true, label: clean((clickable.innerText || clickable.textContent || '').split(/\\n+/)[0]) };
  })()`;
}

async function listConversations() {
  const contents = activeBrowserContents();
  if (!contents || contents.isDestroyed()) return [];
  const rows = await contents.executeJavaScript(listScript(), true);
  return Array.isArray(rows) ? rows : [];
}

async function openConversation(locator) {
  const contents = activeBrowserContents();
  if (!contents || contents.isDestroyed()) return { ok: false, reason: "NO_ACTIVE_CHAT" };
  const result = await contents.executeJavaScript(openScript(locator), true);
  if (!result?.ok) return result || { ok: false, reason: "OPEN_FAILED" };
  await new Promise((resolve) => setTimeout(resolve, 650));
  return { ...result, url: contents.getURL(), title: contents.getTitle() };
}

ipcMain.removeHandler("chat:list-conversations");
ipcMain.removeHandler("chat:open-conversation");
ipcMain.handle("chat:list-conversations", () => listConversations());
ipcMain.handle("chat:open-conversation", (_event, locator) => openConversation(locator));
