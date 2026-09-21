/**
 * Turns picked files into inline prompt context. There is no dedicated
 * attachment channel through the agent pipeline today (ModelRequest only
 * carries text messages), so text-ish files are read and folded directly
 * into the prompt with a clear delimiter; anything else is still named so
 * the agent -- and the user -- know a file was attached even though its
 * contents couldn't be inlined.
 */

export interface AttachedFile {
  name: string;
  sizeBytes: number;
  /** Full extracted text for a readable file; undefined for a binary/oversized one. */
  text?: string;
}

const TEXT_EXTENSIONS = [
  '.txt', '.md', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml',
  '.fasta', '.fa', '.pdb', '.sdf', '.mol', '.smi', '.vcf', '.gff', '.gtf',
  '.log', '.py', '.r', '.ts', '.js',
];

// Keep inlined attachment content bounded so one large file can't blow out
// the prompt; anything past this is truncated with a clear marker.
const MAX_INLINE_CHARS = 20_000;

function looksLikeText(file: File): boolean {
  if (file.type.startsWith('text/') || file.type === 'application/json') return true;
  const lower = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export async function readAttachedFiles(files: FileList | File[]): Promise<AttachedFile[]> {
  const list = Array.from(files);
  return Promise.all(
    list.map(async (file) => {
      if (!looksLikeText(file)) {
        return { name: file.name, sizeBytes: file.size };
      }
      try {
        const raw = await readFileAsText(file);
        const truncated = raw.length > MAX_INLINE_CHARS;
        return {
          name: file.name,
          sizeBytes: file.size,
          text: truncated ? `${raw.slice(0, MAX_INLINE_CHARS)}\n...[truncated, ${raw.length - MAX_INLINE_CHARS} more characters]` : raw,
        };
      } catch {
        return { name: file.name, sizeBytes: file.size };
      }
    })
  );
}

/** Renders attached files as a prompt-prefix block to prepend before the user's own text. */
export function buildAttachmentContext(files: AttachedFile[]): string {
  if (files.length === 0) return '';
  const blocks = files.map((f) => {
    if (f.text !== undefined) {
      return `--- Attached file: ${f.name} ---\n${f.text}\n--- End of ${f.name} ---`;
    }
    return `--- Attached file: ${f.name} (${Math.round(f.sizeBytes / 1024)} KB, binary -- contents not inlined; referenced by name only) ---`;
  });
  return `${blocks.join('\n\n')}\n\n`;
}
