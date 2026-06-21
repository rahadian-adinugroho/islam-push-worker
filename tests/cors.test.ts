import { describe, it, expect } from 'vitest';
import { isOriginAllowed, corsHeaders, ALLOWED_ORIGINS } from '../src/cors';

describe('ALLOWED_ORIGINS', () => {
  it('includes production, preview, and local dev', () => {
    expect(ALLOWED_ORIGINS).toContain('https://islam.raharoho.me');
    expect(ALLOWED_ORIGINS).toContain('https://*.raharoho-islam.pages.dev');
    expect(ALLOWED_ORIGINS.some((o) => o.startsWith('http://localhost'))).toBe(true);
  });
});

describe('isOriginAllowed', () => {
  describe('exact matches', () => {
    it('allows production origin', () => {
      expect(isOriginAllowed('https://islam.raharoho.me')).toBe(true);
    });

    it('allows localhost dev servers', () => {
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://localhost:4321')).toBe(true);
    });
  });

  describe('wildcard matches (Cloudflare Pages preview)', () => {
    it('allows any subdomain of raharoho-islam.pages.dev', () => {
      expect(isOriginAllowed('https://abc123.raharoho-islam.pages.dev')).toBe(true);
      expect(isOriginAllowed('https://6fafef33.raharoho-islam.pages.dev')).toBe(true);
      expect(isOriginAllowed('https://deploy-preview-42.raharoho-islam.pages.dev')).toBe(true);
    });

    it('does not allow arbitrary subdomains of other domains', () => {
      expect(isOriginAllowed('https://abc123.evil.com')).toBe(false);
      expect(isOriginAllowed('https://abc123.raharoho-islam.pages.dev.evil.com')).toBe(false);
    });

    it('does not allow different protocols on the wildcard domain', () => {
      expect(isOriginAllowed('http://abc123.raharoho-islam.pages.dev')).toBe(false);
    });
  });

  describe('rejections', () => {
    it('rejects unknown origins', () => {
      expect(isOriginAllowed('https://evil.com')).toBe(false);
      expect(isOriginAllowed('https://google.com')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isOriginAllowed('')).toBe(false);
    });

    it('rejects similar but not matching origins', () => {
      // Similar but not the same
      expect(isOriginAllowed('https://islam.raharoho.me.evil.com')).toBe(false);
      expect(isOriginAllowed('https://www.islam.raharoho.me')).toBe(false);
    });
  });
});

describe('corsHeaders', () => {
  it('reflects the request origin if allowed', () => {
    const headers = corsHeaders('https://6fafef33.raharoho-islam.pages.dev');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://6fafef33.raharoho-islam.pages.dev');
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('defaults to production origin if request origin is not allowed', () => {
    const headers = corsHeaders('https://evil.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://islam.raharoho.me');
  });

  it('defaults to production origin if request origin is null', () => {
    const headers = corsHeaders(null);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://islam.raharoho.me');
  });
});
