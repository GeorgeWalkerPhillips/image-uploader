// Test-only setup. Also see "jest.moduleNameMapper" in package.json: it maps
// "react-router/dom" to its built file because Jest 27 (CRA 5) cannot resolve
// that package "exports" subpath, which react-router-dom v7 imports.
// react-router 7 expects TextEncoder, which Jest 27's jsdom environment lacks.
import { webcrypto } from 'crypto';
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Jest 27's jsdom has no Web Crypto; Node provides one (used for upload ids).
if (!globalThis.crypto) Object.assign(globalThis, { crypto: webcrypto });
