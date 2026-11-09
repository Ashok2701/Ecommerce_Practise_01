/**
 * The backend shares pure domain code with the portal (types, pricing and
 * credit rules, module access rules). Those files import each other with the
 * portal's "@/..." alias; this maps it at run time for the compiled build
 * (tsx and Jest resolve it from tsconfig / jest.config.js).
 */
import * as path from 'path';
import Module = require('module');

const root = path.resolve(__dirname, '..', '..'); // dist/backend/src -> dist   |   backend/src -> repo root
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = M._resolveFilename;
M._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request.startsWith('@/')) request = path.join(root, request.slice(2));
  return original.call(this, request, ...rest);
};
