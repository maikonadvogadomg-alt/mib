import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import JSZip from "jszip";
import pako from "pako";
import { Platform } from "react-native";

import type { Project, ProjectFile } from "@/context/AppContext";

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    kt: "kotlin", swift: "swift", cs: "csharp", cpp: "cpp", c: "c",
    html: "html", css: "css", scss: "scss", json: "json", yaml: "yaml",
    yml: "yaml", md: "markdown", sql: "sql", sh: "bash", bash: "bash",
    dockerfile: "dockerfile", toml: "toml", xml: "xml", php: "php",
    vue: "vue", svelte: "svelte", txt: "plaintext", gradle: "plaintext",
    properties: "plaintext", dart: "plaintext", ex: "plaintext",
    exs: "plaintext", lua: "plaintext", r: "plaintext", jl: "plaintext",
    scala: "plaintext", clj: "plaintext",
  };
  return map[ext] || "plaintext";
}

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg",
  "pdf", "zip", "tar", "gz", "7z", "rar", "xz", "bz2",
  "mp3", "mp4", "wav", "mov", "avi", "mkv", "flac",
  "ttf", "otf", "woff", "woff2", "eot",
  "exe", "dll", "so", "dylib", "a", "o", "obj",
  "class", "jar", "apk", "ipa", "aab",
  "pyc", "pyo", "wasm",
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return BINARY_EXTENSIONS.has(ext);
}

// ── Base64 / Uint8Array helpers ───────────────────────────────────────────────

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToString(arr: Uint8Array): string {
  // Try UTF-8 first, fall back to latin1
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(arr);
  } catch {
    return new TextDecoder("latin1").decode(arr);
  }
}

async function readFileAsBase64(uri: string): Promise<string> {
  const errors: string[] = [];

  // Attempt 1: direct read
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
    if (b64 && b64.length > 0) return b64;
  } catch (e: any) { errors.push(`Leitura direta: ${e?.message}`); }

  // Attempt 2: copy to cache and read
  try {
    const cached = `${FileSystem.cacheDirectory}import_${Date.now()}.bin`;
    await FileSystem.copyAsync({ from: uri, to: cached });
    const b64 = await FileSystem.readAsStringAsync(cached, { encoding: "base64" as any });
    if (b64 && b64.length > 0) return b64;
  } catch (e: any) { errors.push(`Cópia para cache: ${e?.message}`); }

  // Attempt 3: fetch + blob + FileReader
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const b64 = result.split(",")[1];
        if (b64) resolve(b64);
        else reject(new Error("FileReader não retornou base64"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (e: any) { errors.push(`Fetch: ${e?.message}`); }

  throw new Error(`Não consegui ler o arquivo.\n${errors.join("\n")}`);
}

// ── TAR parser (suporte a .tar e .tar.gz / .tgz) ─────────────────────────────

function readOctal(bytes: Uint8Array, offset: number, length: number): number {
  let s = "";
  for (let i = offset; i < offset + length; i++) {
    if (bytes[i] === 0 || bytes[i] === 0x20) break;
    s += String.fromCharCode(bytes[i]);
  }
  return parseInt(s.trim(), 8) || 0;
}

function readString(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && bytes[end] !== 0) end++;
  return new TextDecoder("utf-8").decode(bytes.slice(offset, end)).trim();
}

function parseTar(data: Uint8Array): Array<{ name: string; content: Uint8Array }> {
  const files: Array<{ name: string; content: Uint8Array }> = [];
  let offset = 0;
  let longName: string | null = null;

  while (offset + 512 <= data.length) {
    const header = data.slice(offset, offset + 512);

    // Check for end-of-archive (two zero blocks)
    const isZero = header.every((b) => b === 0);
    if (isZero) break;

    // GNU long name support (type 'L')
    const typeFlag = String.fromCharCode(header[156]);
    let name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    if (prefix && typeFlag !== "L") name = prefix + "/" + name;

    const size = readOctal(header, 124, 12);
    const blocks = Math.ceil(size / 512);

    offset += 512;
    const contentBytes = data.slice(offset, offset + size);
    offset += blocks * 512;

    if (typeFlag === "L") {
      // GNU long filename extension
      longName = uint8ArrayToString(contentBytes).replace(/\0+$/, "");
      continue;
    }

    if (longName) {
      name = longName;
      longName = null;
    }

    // Skip directories and special entries
    if (typeFlag === "5" || typeFlag === "3" || typeFlag === "4" || typeFlag === "6") continue;
    // Skip empty/invalid names
    if (!name || name.endsWith("/")) continue;
    // Skip macOS metadata
    if (name.startsWith(".__") || name.includes("/__MACOSX") || name.includes(".DS_Store")) continue;
    // Skip PaxHeader entries
    if (name.includes("PaxHeader")) continue;

    if (size > 0) { // sem limite por arquivo
      files.push({ name, content: contentBytes });
    }
  }

  return files;
}

// ── Importar arquivo único ────────────────────────────────────────────────────

export async function importSingleFile(): Promise<ProjectFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const filename = asset.name || "arquivo.txt";

  // Arquivos binários importam como base64 para visualização
  if (isBinaryFile(filename)) {
    const b64 = await readFileAsBase64(asset.uri);
    return {
      id: generateId(),
      name: filename,
      path: filename,
      content: `// Arquivo binário: ${filename}\n// Conteúdo em base64:\n${b64}`,
      language: "plaintext",
    };
  }

  let content = "";

  // Tenta ler como texto direto
  try {
    content = await FileSystem.readAsStringAsync(asset.uri, { encoding: "utf8" as any });
  } catch {
    try {
      const cached = `${FileSystem.cacheDirectory}import_single_${Date.now()}_${filename}`;
      await FileSystem.copyAsync({ from: asset.uri, to: cached });
      content = await FileSystem.readAsStringAsync(cached, { encoding: "utf8" as any });
    } catch {
      // Último recurso: base64 → texto
      const b64 = await readFileAsBase64(asset.uri);
      const bytes = base64ToUint8Array(b64);
      content = uint8ArrayToString(bytes);
    }
  }

  return {
    id: generateId(),
    name: filename,
    path: filename,
    content,
    language: detectLanguage(filename),
  };
}

// ── ZIP import ────────────────────────────────────────────────────────────────

export async function importZip(): Promise<Omit<Project, "id" | "createdAt" | "updatedAt"> | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const filename = asset.name || "projeto.zip";
  const base64 = await readFileAsBase64(asset.uri);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(base64, { base64: true });
  } catch (e: any) {
    throw new Error(`Arquivo não é um ZIP válido: ${e?.message}`);
  }

  const files: ProjectFile[] = [];
  const promises: Promise<void>[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    if (relativePath.startsWith("__MACOSX")) return;
    if (relativePath.includes(".DS_Store")) return;
    if (isBinaryFile(relativePath)) return;

    const fname = relativePath.split("/").pop() || relativePath;
    promises.push(
      zipEntry.async("string").then((content) => {
        files.push({
          id: generateId(),
          name: fname,
          path: relativePath,
          content,
          language: detectLanguage(fname),
        });
      }).catch(() => {})
    );
  });

  await Promise.all(promises);

  if (files.length === 0) {
    throw new Error("O ZIP não contém arquivos de texto/código. Arquivos binários (imagens, etc.) são ignorados automaticamente.");
  }

  files.sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));

  return {
    name: filename.replace(/\.(zip)$/i, "") || "Projeto Importado",
    description: `Importado de ${filename} — ${files.length} arquivo(s)`,
    files,
  };
}

// ── TAR.GZ / TAR import ───────────────────────────────────────────────────────

export async function importTar(): Promise<Omit<Project, "id" | "createdAt" | "updatedAt"> | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const filename = asset.name || "arquivo";
  const isGzip = /\.(tar\.gz|tgz)$/i.test(filename);
  const isTar = /\.(tar)$/i.test(filename) || isGzip;

  if (!isTar) {
    throw new Error("Selecione um arquivo .tar ou .tar.gz (.tgz)");
  }

  const base64 = await readFileAsBase64(asset.uri);
  let rawBytes = base64ToUint8Array(base64);

  // Decompress gzip if needed
  if (isGzip) {
    try {
      rawBytes = pako.inflate(rawBytes);
    } catch {
      try {
        rawBytes = pako.ungzip(rawBytes);
      } catch (e: any) {
        throw new Error(`Falha ao descomprimir .tar.gz: ${e?.message}`);
      }
    }
  }

  // Parse TAR
  const tarFiles = parseTar(rawBytes);

  if (tarFiles.length === 0) {
    throw new Error("Nenhum arquivo de texto/código encontrado no TAR. O arquivo pode estar corrompido ou conter apenas binários.");
  }

  const projectFiles: ProjectFile[] = tarFiles
    .filter((f) => !isBinaryFile(f.name))
    .map((f) => {
      const fname = f.name.split("/").pop() || f.name;
      let content: string;
      try {
        content = uint8ArrayToString(f.content);
      } catch {
        return null;
      }
      return {
        id: generateId(),
        name: fname,
        path: f.name,
        content,
        language: detectLanguage(fname),
      } as ProjectFile;
    })
    .filter((f): f is ProjectFile => f !== null);

  if (projectFiles.length === 0) {
    throw new Error("Todos os arquivos do TAR são binários (imagens, executáveis, etc.).");
  }

  projectFiles.sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));

  const projectName = filename.replace(/\.(tar\.gz|tgz|tar)$/i, "") || "Projeto TAR";

  return {
    name: projectName,
    description: `Importado de ${filename} — ${projectFiles.length} arquivo(s) de ${tarFiles.length} total`,
    files: projectFiles,
  };
}

// ── ZIP export ────────────────────────────────────────────────────────────────

export async function exportZip(project: Project): Promise<boolean> {
  try {
    const zip = new JSZip();
    const folder = zip.folder(project.name) || zip;

    for (const file of project.files) {
      const filePath = file.path || file.name;
      folder.file(filePath, file.content);
    }

    const filename = `${project.name.replace(/[^a-zA-Z0-9_\-\.]/g, "_")}.zip`;

    if (Platform.OS === "web") {
      const blobData = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blobData);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const blob = await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, blob, { encoding: "base64" as any });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/zip",
        dialogTitle: `Exportar ${project.name}`,
        UTI: "public.zip-archive",
      });
      return true;
    }
    return false;
  } catch (e) {
    console.error("Erro ao exportar ZIP:", e);
    return false;
  }
}
