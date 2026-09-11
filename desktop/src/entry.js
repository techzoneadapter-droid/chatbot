const { app } = require("electron");

// Meta/Facebook can automatically trigger WebAuthn/passkey discovery on login.
// In an unsigned Electron DEV build Windows then shows the native "Making sure
// it's you / Insert your security key" dialog repeatedly. PageBot uses password,
// OTP and normal Facebook login instead, so disable WebAuthn in this embedded
// browser before Chromium starts. This prevents the OS security-key popup.
app.commandLine.appendSwitch(
  "disable-features",
  "WebAuthentication,WebAuthenticationConditionalUI"
);

require("./bootstrap");
