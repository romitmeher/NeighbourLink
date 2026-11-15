const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function sharedSite(value) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && localHosts.has(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !localHttp)) {
    throw new Error("Enter an HTTPS site URL or a local HTTP development URL.");
  }
  return url;
}

function sameSite(value, origin) {
  try {
    return sharedSite(value).origin === origin;
  } catch {
    return false;
  }
}

module.exports = { sharedSite, sameSite };
