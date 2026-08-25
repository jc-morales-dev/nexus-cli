# NEXUS on Windows

NEXUS ships a native Windows binary and is developed on Windows, so it is a
supported platform rather than an afterthought. This page covers the few
Windows-specific things worth knowing.

## Install

```powershell
npm install -g @victor00128/nexus-cli
```

The package pulls a self-contained binary for your platform — you do not need
Node or Bun installed separately. Then run:

```powershell
nexus
```

On first run, type `/key` and paste your [OpenRouter](https://openrouter.ai/keys)
API key. There is no account and no browser login: the key is stored locally and
never leaves your machine except to call OpenRouter.

## Bash is required

This is the one hard requirement on Windows. NEXUS runs terminal commands
through bash, so if you see:

```
Bash is required but was not found on this Windows system.
```

pick one of these:

1. **Install Git for Windows** (recommended) — <https://git-scm.com/download/win>.
   It provides `bash.exe`, which NEXUS detects automatically. This works whether
   you run NEXUS from PowerShell, CMD, or Git Bash.

2. **Run inside WSL** — a full Linux environment. Install with `wsl --install`
   from an elevated PowerShell, then run NEXUS inside it.

3. **Point NEXUS at a custom bash** — if `bash.exe` lives somewhere unusual:

   ```powershell
   $env:NEXUS_GIT_BASH_PATH = "C:\path\to\bash.exe"
   ```

   The lookup order is implemented in `sdk/src/tools/run-terminal-command.ts`:
   `NEXUS_GIT_BASH_PATH` first, then the standard Git for Windows locations.

The same requirement explains most "git command failed with a syntax error"
reports: complex git invocations are quoted for bash, so they need a real bash
to run under.

## Paths

Tool output uses forward slashes on every platform (`src/index.ts`, never
`src\index.ts`) so that the model sees one consistent form. Paths handed to the
filesystem stay in native Windows form. If you are working on the code, the
distinction is documented on `ResolvedProjectPath` in
`sdk/src/tools/path-utils.ts` — do not "fix" one into the other.

## Reporting a problem

Open an issue at
<https://github.com/Victor00128/nexus-cli/issues> and include your Windows
version, your terminal (PowerShell / CMD / Git Bash / WSL), the output of
`nexus --version`, and whether `bash.exe` is on your `PATH`.
