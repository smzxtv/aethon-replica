import { readFileSync, writeFileSync } from 'fs';
const root = 'C:/Users/smjm/.cline/data/workspaces/chat/aethon-replica';

// package.json
let pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
pkg.version = '2.0.0';
writeFileSync(`${root}/package.json`, JSON.stringify(pkg, null, 2) + '\n');

// tauri.conf.json
let tauri = JSON.parse(readFileSync(`${root}/src-tauri/tauri.conf.json`, 'utf8'));
tauri.version = '2.0.0';
writeFileSync(`${root}/src-tauri/tauri.conf.json`, JSON.stringify(tauri, null, 2) + '\n');

// Cargo.toml — only the [package] version line
let cargo = readFileSync(`${root}/src-tauri/Cargo.toml`, 'utf8');
cargo = cargo.replace(/(^name = "aethon-replica"\r?\nversion = ")[^"]+(")/m, '$12.0.0$2');
writeFileSync(`${root}/src-tauri/Cargo.toml`, cargo);

console.log(
  'pkg:', pkg.version,
  '| tauri:', tauri.version,
  '| cargo:', /version = "([^"]+)"/.exec(cargo)[1]
);
