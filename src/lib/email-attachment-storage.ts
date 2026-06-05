import { promises as fs } from "fs";
import path from "path";
import { getD1 } from "./server-db";

const ATTACHMENTS_ROOT = path.join(process.cwd(), ".data", "email-attachments");
const SESSIONS_ROOT = path.join(process.cwd(), ".data", "email-intake-sessions");

/** In-memory fallback when neither filesystem nor D1 is available (e.g. unenv dev). */
const memorySessions = new Map<
  string,
  { meta?: unknown; files: Record<string, Buffer> }
>();

let fsAvailable: boolean | null = null;

async function canUseFilesystem(): Promise<boolean> {
  if (fsAvailable != null) return fsAvailable;
  try {
    await fs.mkdir(path.join(process.cwd(), ".data"), { recursive: true });
    fsAvailable = true;
  } catch {
    fsAvailable = false;
  }
  return fsAvailable;
}

export function attachmentStoragePath(
  projectId: string,
  intakeId: string,
  fileName: string
): string {
  const safe = fileName.replace(/[<>:"/\\|?*]/g, "_");
  return path.join(ATTACHMENTS_ROOT, projectId, intakeId, safe);
}

export function attachmentStorageKey(
  projectId: string,
  intakeId: string,
  fileName: string
): string {
  const safe = fileName.replace(/[<>:"/\\|?*]/g, "_");
  return `${projectId}/${intakeId}/${safe}`;
}

function sessionDir(sessionId: string): string {
  return path.join(SESSIONS_ROOT, sessionId);
}

async function readSessionFilesJson(
  sessionId: string
): Promise<Record<string, string>> {
  const d1 = getD1();
  if (d1) {
    const row = (
      await d1.prepare("SELECT files_json FROM email_intake_sessions WHERE id = ?").bind(sessionId).all()
    ).results[0];
    if (!row?.files_json) return {};
    try {
      return JSON.parse(String(row.files_json)) as Record<string, string>;
    } catch {
      return {};
    }
  }
  const mem = memorySessions.get(sessionId);
  if (mem) {
    const out: Record<string, string> = {};
    for (const [k, buf] of Object.entries(mem.files)) {
      out[k] = buf.toString("base64");
    }
    return out;
  }
  return {};
}

async function writeSessionFilesJson(
  sessionId: string,
  files: Record<string, string>
): Promise<void> {
  const d1 = getD1();
  if (d1) {
    const existing = (
      await d1.prepare("SELECT meta_json FROM email_intake_sessions WHERE id = ?").bind(sessionId).all()
    ).results[0];
    const metaJson = existing?.meta_json ? String(existing.meta_json) : "{}";
    await d1
      .prepare(
        `INSERT INTO email_intake_sessions (id, meta_json, files_json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET files_json = excluded.files_json`
      )
      .bind(sessionId, metaJson, JSON.stringify(files))
      .run();
    return;
  }
  const mem = memorySessions.get(sessionId) ?? { files: {} };
  mem.files = Object.fromEntries(
    Object.entries(files).map(([k, b64]) => [k, Buffer.from(b64, "base64")])
  );
  memorySessions.set(sessionId, mem);
}

export async function writeSessionFile(
  sessionId: string,
  name: string,
  data: Buffer
): Promise<string> {
  if (await canUseFilesystem()) {
    const dir = sessionDir(sessionId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  const files = await readSessionFilesJson(sessionId);
  files[name] = data.toString("base64");
  await writeSessionFilesJson(sessionId, files);
  return name;
}

export async function listSessionFiles(sessionId: string): Promise<string[]> {
  if (await canUseFilesystem()) {
    try {
      return await fs.readdir(sessionDir(sessionId));
    } catch {
      return [];
    }
  }
  const files = await readSessionFilesJson(sessionId);
  return Object.keys(files);
}

export async function readSessionFile(sessionId: string, name: string): Promise<Buffer> {
  if (await canUseFilesystem()) {
    return fs.readFile(path.join(sessionDir(sessionId), name));
  }
  const files = await readSessionFilesJson(sessionId);
  const b64 = files[name];
  if (!b64) throw new Error(`Session file not found: ${name}`);
  return Buffer.from(b64, "base64");
}

export async function removeSession(sessionId: string): Promise<void> {
  const d1 = getD1();
  if (d1) {
    try {
      await d1.prepare("DELETE FROM email_intake_sessions WHERE id = ?").bind(sessionId).run();
    } catch {
      /* table may not exist yet */
    }
  }
  memorySessions.delete(sessionId);
  if (await canUseFilesystem()) {
    try {
      await fs.rm(sessionDir(sessionId), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function promoteSessionAttachments(
  sessionId: string,
  projectId: string,
  intakeId: string,
  attachmentFileNames: string[]
): Promise<
  { fileName: string; storageKey: string; size: number; contentBase64?: string }[]
> {
  const promoted: {
    fileName: string;
    storageKey: string;
    size: number;
    contentBase64?: string;
  }[] = [];

  for (const name of attachmentFileNames) {
    if (name === "email.msg") continue;
    try {
      const buf = await readSessionFile(sessionId, name);
      const storageKey = attachmentStorageKey(projectId, intakeId, name);

      if (await canUseFilesystem()) {
        const dest = attachmentStoragePath(projectId, intakeId, name);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, buf);
        promoted.push({ fileName: name, storageKey, size: buf.length });
      } else {
        promoted.push({
          fileName: name,
          storageKey,
          size: buf.length,
          contentBase64: buf.toString("base64"),
        });
      }
    } catch {
      /* skip missing */
    }
  }
  return promoted;
}

export async function readAttachmentByKey(storageKey: string): Promise<Buffer> {
  return fs.readFile(path.join(ATTACHMENTS_ROOT, storageKey));
}

export function sessionMetaPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "meta.json");
}

export async function writeSessionMeta(sessionId: string, data: unknown): Promise<void> {
  const d1 = getD1();
  if (d1) {
    const existing = (
      await d1.prepare("SELECT files_json FROM email_intake_sessions WHERE id = ?").bind(sessionId).all()
    ).results[0];
    const filesJson = existing?.files_json ? String(existing.files_json) : "{}";
    await d1
      .prepare(
        `INSERT INTO email_intake_sessions (id, meta_json, files_json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET meta_json = excluded.meta_json`
      )
      .bind(sessionId, JSON.stringify(data), filesJson)
      .run();
    return;
  }

  if (await canUseFilesystem()) {
    const dir = sessionDir(sessionId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(data), "utf-8");
    return;
  }

  const mem = memorySessions.get(sessionId) ?? { files: {} };
  mem.meta = data;
  memorySessions.set(sessionId, mem);
}

export async function readSessionMeta<T>(sessionId: string): Promise<T | null> {
  const d1 = getD1();
  if (d1) {
    try {
      const row = (
        await d1.prepare("SELECT meta_json FROM email_intake_sessions WHERE id = ?").bind(sessionId).all()
      ).results[0];
      if (!row?.meta_json) return null;
      return JSON.parse(String(row.meta_json)) as T;
    } catch {
      return null;
    }
  }

  if (await canUseFilesystem()) {
    try {
      const raw = await fs.readFile(path.join(sessionDir(sessionId), "meta.json"), "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const mem = memorySessions.get(sessionId);
  return (mem?.meta as T) ?? null;
}
