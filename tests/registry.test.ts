import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// server.json is what the official MCP Registry lists. The registry checks the
// npm package's `mcpName` against the server name before it accepts a listing,
// and a version that disagrees with package.json would list a release that is
// not the one on npm. A release bumps both files.
const read = (file: string) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const pkg = read('package.json');
const server = read('server.json');

describe('server.json', () => {
  it('names the server what the npm package declares', () => {
    expect(server.name).toBe(pkg.mcpName);
  });

  it('lists the version in package.json, for the server and its npm package', () => {
    expect(server.version).toBe(pkg.version);
    const npm = server.packages.find((p: { registryType: string }) => p.registryType === 'npm');
    expect(npm.identifier).toBe(pkg.name);
    expect(npm.version).toBe(pkg.version);
  });

  it('keeps the description within the registry limit', () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
