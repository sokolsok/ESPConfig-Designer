import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { syncChangelog } from "./sync-changelog.mjs";
import { validateVersionTree } from "./version-contract.mjs";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function replaceTomlPackageVersion(source, version) {
    const packageHeader = /^\[package\]\s*$/m.exec(source);
    if (!packageHeader) throw new Error("Missing [package] section in Cargo.toml");

    const sectionStart = packageHeader.index + packageHeader[0].length;
    const remainder = source.slice(sectionStart);
    const nextSection = remainder.search(/^\s*\[/m);
    const sectionEnd = nextSection === -1 ? source.length : sectionStart + nextSection;
    const section = source.slice(sectionStart, sectionEnd);
    const replacement = section.replace(/^(\s*version\s*=\s*)"[^"]+"\s*$/m, `$1"${version}"`);
    if (replacement === section) throw new Error("Missing package version in Cargo.toml");

    return `${source.slice(0, sectionStart)}${replacement}${source.slice(sectionEnd)}`;
}

function replaceCargoLockPackageVersion(source, packageName, version) {
    const blocks = source.split(/^(\[\[package\]\]\s*)$/m);
    let updated = false;

    for (let index = 1; index < blocks.length; index += 2) {
        const block = blocks[index + 1];
        if (!/^name\s*=\s*"esp-config-designer-desktop"\s*$/m.test(block)) continue;

        blocks[index + 1] = block.replace(/^(version\s*=\s*)"[^"]+"\s*$/m, `$1"${version}"`);
        updated = true;
        break;
    }

    if (!updated) throw new Error(`Missing ${packageName} package version in Cargo.lock`);
    return blocks.join("");
}

function withJsonVersion(source, path, version, includeRootPackage) {
    const content = JSON.parse(source);
    if (typeof content.version !== "string") throw new Error(`Missing version in ${path}`);
    content.version = version;

    if (includeRootPackage) {
        if (typeof content.packages?.[""]?.version !== "string") {
            throw new Error(`Missing packages[\"\"].version in ${path}`);
        }
        content.packages[""].version = version;
    }

    return `${JSON.stringify(content, null, 2)}\n`;
}

async function main() {
    const [version] = process.argv.slice(2);
    if (process.argv.length !== 3 || !SEMVER.test(version ?? "")) {
        throw new Error("Usage: node scripts/sync-version.mjs X.Y.Z");
    }

    const scriptsRoot = dirname(fileURLToPath(import.meta.url));
    const repositoryRoot = resolve(scriptsRoot, "..");
    const files = [
        ["VERSION", async () => `${version}\n`],
        ["esp-config-designer/config.json", (source) => withJsonVersion(source, "esp-config-designer/config.json", version, false)],
        ["esp-config-designer/frontend/package.json", (source) => withJsonVersion(source, "esp-config-designer/frontend/package.json", version, false)],
        ["esp-config-designer/frontend/package-lock.json", (source) => withJsonVersion(source, "esp-config-designer/frontend/package-lock.json", version, true)],
        ["desktop/package.json", (source) => withJsonVersion(source, "desktop/package.json", version, false)],
        ["desktop/package-lock.json", (source) => withJsonVersion(source, "desktop/package-lock.json", version, true)],
        ["desktop/src-tauri/Cargo.toml", (source) => replaceTomlPackageVersion(source, version)],
        ["desktop/src-tauri/Cargo.lock", (source) => replaceCargoLockPackageVersion(source, "esp-config-designer-desktop", version)],
        ["desktop/src-tauri/tauri.conf.json", (source) => withJsonVersion(source, "desktop/src-tauri/tauri.conf.json", version, false)],
    ];

    const updates = await Promise.all(files.map(async ([path, update]) => {
        const fullPath = resolve(repositoryRoot, path);
        const source = path === "VERSION" ? "" : await readFile(fullPath, "utf8");
        return [fullPath, await update(source)];
    }));

    await Promise.all(updates.map(([path, content]) => writeFile(path, content, "utf8")));
    await syncChangelog(repositoryRoot);
    console.log(`Synchronized product version ${version}.`);

    const result = await validateVersionTree(repositoryRoot);
    console.log(`product version contract: PASS (${result.version}, ${result.checks} projections)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
