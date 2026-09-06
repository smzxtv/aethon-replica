#!/usr/bin/env node
/**
 * fetch-sing-box.mjs
 *
 * Fetches the official sing-box core (network engine + routing engine in one
 * for this project), validates its SHA-256 against the published digest, and
 * installs it where the Rust/Tauri backend expects it.
 *
 *   node scripts/fetch-sing-box.mjs --platform windows [--version 1.13.14]
 *   node scripts/fetch-sing-box.mjs --platform android  [--version 1.13.14]
 *
 * Windows: extracts sing-box.exe into src-tauri/resources/sing-box/
 * Android: downloads the official .aar library per arch into android/libs/
 *          (consumed in Stage 3)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GH_HEADERS = { "User-Agent": "aethon-replica-fetcher", Accept: "application/vnd.github+json" };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function ghJson(url) {
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.json();
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow", headers: GH_HEADERS });
  if (!res.ok) throw new Error(`download ${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf;
}

async function verify(asset, buf, sumsUrl) {
  const published = String(asset.digest ?? "").replace(/^sha256:/i, "").toLowerCase();
  if (published) {
    const actual = sha256(buf);
    if (actual !== published) throw new Error(`SHA-256 mismatch for ${asset.name}`);
    console.log(`  ok   sha256 ${published.slice(0, 16)}… (GitHub asset digest)`);
    return;
  }
  if (sumsUrl) {
    const sums = await (await fetch(sumsUrl, { headers: GH_HEADERS })).text();
    const line = sums.split(/\r?\n/).find((l) => l.includes(asset.name));
    if (line) {
      const expected = line.trim().split(/\s+/)[0].toLowerCase();
      const actual = sha256(buf);
      if (expected !== actual) throw new Error(`SHA-256 mismatch for ${asset.name}`);
      console.log(`  ok   sha256 ${expected.slice(0, 16)}… (SHA256SUMS.txt)`);
      return;
    }
  }
  console.warn(`  warn no published checksum for ${asset.name}; skipping verification`);
}

const platform = arg("--platform") ?? "windows";
const wantVersion = arg("--version");

const release = wantVersion
  ? await ghJson(`https://api.github.com/repos/SagerNet/sing-box/releases/tags/v${wantVersion}`)
  : await ghJson("https://api.github.com/repos/SagerNet/sing-box/releases/latest");
const version = String(release.tag_name ?? "").replace(/^v/, "");
const assets = release.assets ?? [];
if (!assets.length) throw new Error(`no assets on sing-box v${version}`);

const pick = (arch, suffix) => {
  const exact = assets.find((a) => a.name === `sing-box-${version}-${arch}${suffix}`);
  return exact ?? assets.find((a) => a.name.includes(`-${arch}${suffix}`));
};

const sumsUrl = assets.find((a) => a.name === "SHA256SUMS.txt")?.browser_download_url ?? "";

if (platform === "windows") {
  const asset = pick("windows-amd64", ".zip");
  if (!asset) throw new Error("no windows-amd64 .zip asset in this release");

  console.log(`fetching sing-box v${version} (windows-amd64)`);
  const cache = join(ROOT, "scripts", ".cache");
  const tmpZip = join(cache, asset.name);
  const buf = await download(asset.browser_download_url, tmpZip);
  await verify(asset, buf, sumsUrl);

  mkdirSync(join(cache, "win"), { recursive: true });
  spawnSync("tar", ["-xf", tmpZip, "-C", join(cache, "win")], { stdio: "inherit" });

  const extractRoot = join(cache, "win");
  const expectedDirs = [
    `sing-box-${version}-windows-amd64`,
    "sing-box-windows-amd64",
    "",
  ].map((d) => join(extractRoot, d, "sing-box.exe"));

  let exePath = expectedDirs.find((p) => existsSync(p));
  if (!exePath) {
    exePath = readdirSync(extractRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(extractRoot, e.name, "sing-box.exe"))
      .find((p) => existsSync(p)) ?? null;
  }
  if (!exePath) throw new Error("sing-box.exe not found inside the downloaded archive");

  const destDir = join(ROOT, "src-tauri", "resources", "sing-box");
  mkdirSync(destDir, { recursive: true });
  // Copy the whole extracted runtime directory (sing-box.exe + libcronet.dll + LICENSE)
  const srcDir = dirname(exePath);
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry);
    if (statSync(src).isFile()) writeFileSync(join(destDir, entry), readFileSync(src));
  }
  writeFileSync(
    join(destDir, ".source.json"),
    JSON.stringify(
      {
        version,
        platform: "windows",
        releasedAt: release.published_at,
        sha256: sha256(exeBuf),
        url: asset.browser_download_url,
      },
      null,
      2
    )
  );
  console.log(`installed core: ${join(destDir, "sing-box.exe")} (v${version})`);

  // Windows TUN mode needs wintun.dll next to the core binary.
  try {
    const wintunUrl = "https://www.wintun.net/builds/wintun-0.14.1.zip";
    console.log("fetching wintun.dll (TUN runtime)");
    const wintunZip = join(cache, "wintun-0.14.1.zip");
    await download(wintunUrl, wintunZip);
    const wtDir = join(cache, "wintun");
    mkdirSync(wtDir, { recursive: true });
    spawnSync("tar", ["-xf", wintunZip, "-C", wtDir], { stdio: "inherit" });
    const dllCandidates = [
      join(wtDir, "wintun", "bin", "amd64", "wintun.dll"),
      join(wtDir, "amd64", "wintun.dll"),
    ];
    const dll = dllCandidates.find((p) => existsSync(p));
    if (dll) {
      writeFileSync(join(destDir, "wintun.dll"), readFileSync(dll));
      console.log("installed wintun.dll (amd64)");
    } else {
      console.warn("warn wintun.dll not found in downloaded archive layout");
    }
  } catch (e) {
    console.warn(`warn could not fetch wintun.dll (${e}); VPN/TUN mode will need it`);
  }
} else if (platform === "android") {
  const arches = ["arm64-v8a", "armeabi-v7a", "x86_64"];
  for (const arch of arches) {
    const asset = pick(`android-${arch}`, ".aar") ?? pick(`android-${arch}`, ".zip");
    if (!asset) {
      console.warn(`  warn no android-${arch} asset; skipped`);
      continue;
    }
    const dest = join(ROOT, "android", "libs", asset.name);
    const buf = await download(asset.browser_download_url, dest);
    await verify(asset, buf, sumsUrl);
    console.log(`  ok   ${asset.name}`);
  }
  writeFileSync(
    join(ROOT, "android", "libs", ".source.json"),
    JSON.stringify(
      { version, platform: "android", releasedAt: release.published_at, url: release.html_url },
      null,
      2
    )
  );
} else {
  throw new Error(`unknown platform: ${platform}`);
}