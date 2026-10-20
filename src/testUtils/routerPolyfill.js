// Test-only: react-router 7 expects TextEncoder, which Jest 27's jsdom lacks.
// Import this BEFORE react-router-dom. (package.json jest.moduleNameMapper
// already handles the "react-router/dom" exports subpath.)
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
