const fs = require("fs");
const https = require("https");
const execSync = require("child_process").execSync;

const FORGE_API = "https://forge.sp-tarkov.com/api/v0";
const SPT_REPO = "sp-tarkov/build";

function fetch(url) {
  return fetchWithHeaders(url, { Accept: "application/json" });
}

function fetchWithHeaders(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(JSON.parse(data));
      });
    }).on("error", reject);
  });
}

function loadJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function checkSpt(state) {
  try {
    const ver = execSync(
      `gh api repos/sp-tarkov/build/releases/latest --jq .tag_name`,
      { encoding: "utf8", timeout: 10000 }
    ).trim();
    const old = state.sptVersion;
    if (old && compareVersions(ver, old) > 0) {
      state._changes.push(`SPT: ${old} -> ${ver}`);
    }
    state.sptVersion = ver;
  } catch (e) {
    console.error("SPT check failed:", e.message);
  }
}

async function checkMod(mod, state) {
  try {
    const resp = await fetch(`${FORGE_API}/mod/${mod.id}?include=versions`);
    if (!resp.success) return;
    const data = resp.data;
    const versions = data.versions || [];
    const ver = versions[0] ? versions[0].version : null;
    const date = versions[0] ? versions[0].published_at : null;
    const name = data.name || mod.name;
    const url = data.detail_url || "";

    const key = String(mod.id);
    const prev = state.mods[key];
    if (ver && prev && prev.version && compareVersions(ver, prev.version) > 0) {
      state._changes.push(`${name}: ${prev.version} -> ${ver}`);
    }
    state.mods[key] = { version: ver, name, url, updatedAt: date };

    await checkAddons(mod.id, name, state);
  } catch (e) {
    console.error(`Mod ${mod.id} failed:`, e.message);
  }
}

async function checkAddons(parentId, parentName, state) {
  try {
    const resp = await fetch(
      `${FORGE_API}/addons?filter[mod_id]=${parentId}&include=versions&per_page=50`
    );
    if (!resp.success || !resp.data) return;
    for (const addon of resp.data) {
      const versions = addon.versions || [];
      const ver = versions[0] ? versions[0].version : null;
      const date = versions[0] ? versions[0].published_at : null;
      const name = addon.name;

      const key = "a_" + addon.id;
      const prev = state.mods[key];
      if (ver && prev && prev.version && compareVersions(ver, prev.version) > 0) {
        state._changes.push(`${name} (addon for ${parentName}): ${prev.version} -> ${ver}`);
      }
      state.mods[key] = {
        version: ver,
        name,
        url: addon.detail_url || "",
        updatedAt: date,
        parentModId: parentId,
      };
    }
  } catch (e) {
    console.error(`Addons for ${parentId} failed:`, e.message);
  }
}

async function main() {
  const modsData = loadJson("mods.json");
  const parentMods = modsData
    ? modsData.mods.filter((m) => !m._isAddon)
    : [];

  const state = loadJson("state.json") || { sptVersion: null, mods: {} };
  state._changes = [];

  checkSpt(state);

  const BATCH = 5;
  for (let i = 0; i < parentMods.length; i += BATCH) {
    await Promise.allSettled(
      parentMods.slice(i, i + BATCH).map((m) => checkMod(m, state))
    );
  }

  const changes = state._changes;
  delete state._changes;

  fs.writeFileSync("state.json", JSON.stringify(state, null, 2));
  fs.writeFileSync(
    "result.json",
    JSON.stringify({
      changed: changes.length > 0,
      changes,
      modsChecked: parentMods.length,
    })
  );

  if (changes.length > 0) {
    console.log("Changes detected:");
    changes.forEach((c) => console.log("  - " + c));
  } else {
    console.log("No changes detected");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
