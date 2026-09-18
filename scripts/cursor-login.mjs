import { Cursor } from "@cursor/sdk";

const result = await Cursor.auth.login({
  openBrowser: false,
  apiKeyName: "Weave Web Agent",
  onLoginUrl(url) {
    console.log("LOGIN_URL " + url);
  },
});

console.log("LOGIN_OK");
console.log("EMAIL " + (result.email || ""));
console.log("EXPIRES_MS " + result.apiKeyExpiresAtMs);
