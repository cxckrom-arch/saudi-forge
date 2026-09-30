import fs from 'node:fs/promises';
import path from 'node:path';

// Prefer a real executable or npm's JS entry point; never concatenate user input into a shell command.
export async function resolveCommand(program: string, args: string[]) {
  if (process.platform !== 'win32' || !['npm','npx','pnpm','yarn','bun'].includes(program)) return {program,args};
  if (program==='npm' && process.env.npm_execpath && /\.[cm]?js$/i.test(process.env.npm_execpath)) {
    return {program:process.execPath,args:[process.env.npm_execpath,...args]};
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const base=directory.replace(/^"|"$/g,'');
    const executable=path.join(base,`${program}.exe`);
    try { await fs.access(executable); return {program:executable,args}; } catch {}
    if(program==='npm'||program==='npx') {
      const cli=path.join(base,'node_modules','npm','bin',`${program}-cli.js`);
      try { await fs.access(cli); return {program:process.execPath,args:[cli,...args]}; } catch {}
    }
  }
  throw new Error(`No directly executable ${program} installation found. Install Node/npm or expose the package manager executable on PATH.`);
}
