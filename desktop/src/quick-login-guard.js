"use strict";

const { app } = require("electron");

const PASSKEY_GUARD_SCRIPT = `(() => {
  try {
    const Credentials = globalThis.CredentialsContainer;
    const proto = Credentials?.prototype;
    if (!proto || proto.__pagebotPasskeyGuard) return true;

    const originalGet = proto.get;
    const originalCreate = proto.create;

    Object.defineProperty(proto, "__pagebotPasskeyGuard", {
      value: true,
      configurable: false,
      enumerable: false
    });

    if (typeof originalGet === "function") {
      Object.defineProperty(proto, "get", {
        configurable: true,
        writable: true,
        value: function pageBotCredentialGet(options) {
          if (options?.publicKey) {
            return Promise.reject(new DOMException(
              "PageBot quick login uses password/TOTP instead of a hardware security key.",
              "NotAllowedError"
            ));
          }
          return originalGet.call(this, options);
        }
      });
    }

    if (typeof originalCreate === "function") {
      Object.defineProperty(proto, "create", {
        configurable: true,
        writable: true,
        value: function pageBotCredentialCreate(options) {
          if (options?.publicKey) {
            return Promise.reject(new DOMException(
              "PageBot quick login does not enroll passkeys.",
              "NotAllowedError"
            ));
          }
          return originalCreate.call(this, options);
        }
      });
    }

    return true;
  } catch {
    return false;
  }
})()`;

function shouldGuard(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    if (contents.getType() === "window") return false;
    const url = new URL(contents.getURL() || "https://www.facebook.com/");
    return /(^|\.)facebook\.com$/i.test(url.hostname) || /(^|\.)meta\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function injectGuard(contents) {
  if (!shouldGuard(contents)) return;
  contents.executeJavaScript(PASSKEY_GUARD_SCRIPT, true).catch(() => {});
}

app.on("web-contents-created", (_event, contents) => {
  if (!contents || contents.getType() === "window") return;

  contents.on("dom-ready", () => injectGuard(contents));
  contents.on("did-navigate-in-page", () => injectGuard(contents));
});

module.exports = { PASSKEY_GUARD_SCRIPT };
