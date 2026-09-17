"use strict";

const { app } = require("electron");

// Keep embedded Facebook/Meta views smooth on modest hardware without
// interrupting slow navigations. Chromium already owns navigation recovery;
// forcing reloadIgnoringCache from a timer can create an endless reload loop
// on slower PCs or networks before the page ever reaches DOM ready.
app.on("web-contents-created", (_event, contents) => {
  if (!contents || contents.getType() === "window") return;

  try { contents.setFrameRate?.(30); } catch {}
});
