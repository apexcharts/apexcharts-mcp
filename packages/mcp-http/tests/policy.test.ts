import { describe, expect, it } from 'vitest';

import {
  hostnameOf,
  isHostAllowed,
  LOOPBACK_HOSTNAMES,
  parseHostAllowList,
  parseOriginAllowList,
  resolveAllowedOrigin,
} from '../src/policy.js';

describe('hostnameOf', () => {
  it('strips the port and lowercases', () => {
    expect(hostnameOf('MCP.ApexCharts.com:443')).toBe('mcp.apexcharts.com');
    expect(hostnameOf('localhost')).toBe('localhost');
  });

  it('keeps IPv6 brackets', () => {
    expect(hostnameOf('[::1]:3000')).toBe('[::1]');
  });

  it('rejects values that could make URL parsing pick another hostname', () => {
    // new URL('http://evil.example@good.example').hostname is "good.example".
    expect(hostnameOf('evil.example@good.example')).toBeUndefined();
    expect(hostnameOf('good.example/evil')).toBeUndefined();
    expect(hostnameOf('good.example evil')).toBeUndefined();
  });

  it('returns undefined for a missing or empty header', () => {
    expect(hostnameOf(undefined)).toBeUndefined();
    expect(hostnameOf('')).toBeUndefined();
  });
});

describe('parseHostAllowList', () => {
  it('falls back when unset or blank', () => {
    expect(parseHostAllowList(undefined, LOOPBACK_HOSTNAMES)).toBe(LOOPBACK_HOSTNAMES);
    expect(parseHostAllowList('  ', LOOPBACK_HOSTNAMES)).toBe(LOOPBACK_HOSTNAMES);
  });

  it('normalises entries to bare hostnames', () => {
    expect(parseHostAllowList(' mcp.apexcharts.com:443 , LOCALHOST ', [])).toEqual([
      'mcp.apexcharts.com',
      'localhost',
    ]);
  });

  it('treats any * entry as allow-all', () => {
    expect(parseHostAllowList('a.example,*', [])).toBe('*');
  });

  it('throws on an entry that is not a hostname, so a typo fails at startup', () => {
    expect(() => parseHostAllowList('mcp.apexcharts.com,https://x/y', [])).toThrow(/not a hostname/);
  });
});

describe('parseOriginAllowList', () => {
  it('normalises trailing slashes and case', () => {
    expect(parseOriginAllowList('https://ApexCharts.com/', [])).toEqual(['https://apexcharts.com']);
  });

  it('treats any * entry as allow-all', () => {
    expect(parseOriginAllowList('*', [])).toBe('*');
  });

  it('throws on a non-http(s) entry', () => {
    expect(() => parseOriginAllowList('ftp://apexcharts.com', [])).toThrow(/not an http\(s\) origin/);
    expect(() => parseOriginAllowList('apexcharts.com', [])).toThrow(/not an http\(s\) origin/);
  });
});

describe('isHostAllowed', () => {
  it('matches port-agnostically against the list', () => {
    expect(isHostAllowed('mcp.apexcharts.com:443', ['mcp.apexcharts.com'])).toBe(true);
    expect(isHostAllowed('evil.example', ['mcp.apexcharts.com'])).toBe(false);
  });

  it('refuses a missing Host unless the check is off', () => {
    expect(isHostAllowed(undefined, LOOPBACK_HOSTNAMES)).toBe(false);
    expect(isHostAllowed(undefined, '*')).toBe(true);
  });
});

describe('resolveAllowedOrigin', () => {
  it('passes a request with no Origin (a non-browser client) without a CORS header', () => {
    expect(resolveAllowedOrigin(undefined, [])).toEqual({ allowed: true });
  });

  it('answers * when every origin is allowed', () => {
    expect(resolveAllowedOrigin('https://any.example', '*')).toEqual({
      allowed: true,
      corsOrigin: '*',
    });
  });

  it('reflects a listed origin in normalised form', () => {
    expect(resolveAllowedOrigin('https://APEXCHARTS.com', ['https://apexcharts.com'])).toEqual({
      allowed: true,
      corsOrigin: 'https://apexcharts.com',
    });
  });

  it('refuses unlisted origins and the opaque "null" origin', () => {
    expect(resolveAllowedOrigin('https://evil.example', ['https://apexcharts.com'])).toEqual({
      allowed: false,
    });
    expect(resolveAllowedOrigin('null', ['https://apexcharts.com'])).toEqual({ allowed: false });
  });
});
