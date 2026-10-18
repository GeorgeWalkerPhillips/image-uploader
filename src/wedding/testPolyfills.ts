// react-router 7 expects TextEncoder, which Jest 27's jsdom environment lacks.
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
