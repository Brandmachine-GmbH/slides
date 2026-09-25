/** Handing the client the actual files: a ZIP writer with no compressor, and the two lines of
 *  DOM it takes to make a browser save something.
 *
 *  Only ever reached from the image inspector, and only on a deck that sets `downloads: true`.
 *
 *  A ZIP writer with no compressor: every entry is stored as-is.
 *
 *  WHY NOT A LIBRARY. The only thing that ever goes in one of these is a folder of JPEGs, and a
 *  JPEG is already compressed: deflating one saves single digits of percent and costs a
 *  dependency in the bundle of every deck, including the ones that offer no downloads at all.
 *  Stored entries need no compressor, which leaves a header, a CRC and a table of contents.
 *
 *  WHY THE BYTES GO IN UNTOUCHED. Each file is written exactly as the server sent it, so the
 *  IPTC provenance tag, the colour profile and the pixel dimensions survive the round trip.
 *  Anything that re-encodes strips those, and a deck can carry a slide claiming that every file
 *  it delivers says how it was made. That claim has to survive the download or it is not true.
 *
 *  UNIMPLEMENTED, and no deck can reach either: Zip64, which is what lifts the 4GB total and the
 *  65535 file count. A deck's whole images/ folder is single-digit megabytes.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** UTF-8 bytes in a buffer of their own. Everything here is assembled into a Blob, and a Blob
 *  takes an ArrayBuffer without argument; a typed array's `buffer` is only structurally the
 *  same thing and its type varies across TypeScript releases. */
function utf8(s: string): ArrayBuffer {
  const b = new TextEncoder().encode(s);
  const out = new ArrayBuffer(b.length);
  new Uint8Array(out).set(b);
  return out;
}

/** ZIP stores the modification time in the MS-DOS packed format: a 16-bit date counting years
 *  from 1980, and a 16-bit time whose seconds field is halved, so odd seconds do not survive.
 *  Nothing reads these except a file listing, but an entry with a zero date shows as 1980 in
 *  every unzipper, which reads as a broken file rather than a deliberate one. */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry { name: string; data: ArrayBuffer }

/** Build a .zip of `files`, in the order given. Names are written UTF-8 and must already be
 *  unique; see uniqueNames below, which is what callers use to guarantee that. */
export function zipStore(files: ZipEntry[]): Blob {
  // The fields these would overflow are silent ones: a total past 4GB wraps through setUint32
  // and produces an archive that passes a casual look and unzips to garbage. Refusing sends the
  // caller down its failure path instead, where somebody at least sees that nothing arrived.
  const total = files.reduce((n, f) => n + f.data.byteLength, 0);
  if (files.length > 0xffff || total > 0xffff_ffff) {
    throw new Error("too large for a plain zip; Zip64 is not implemented");
  }

  const stamp = dosStamp(new Date());
  const parts: ArrayBuffer[] = [];
  const central: ArrayBuffer[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const f of files) {
    const name = utf8(f.name);
    const size = f.data.byteLength;
    const crc = crc32(new Uint8Array(f.data));

    const head = new ArrayBuffer(30);
    const h = new DataView(head);
    h.setUint32(0, 0x04034b50, true);   // local file header signature
    h.setUint16(4, 20, true);           // version needed
    h.setUint16(6, 0x0800, true);       // flags: the filename is UTF-8
    h.setUint16(8, 0, true);            // method 0 = stored
    h.setUint16(10, stamp.time, true);
    h.setUint16(12, stamp.date, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, size, true);        // compressed size, the same thing when stored
    h.setUint32(22, size, true);        // uncompressed size
    h.setUint16(26, name.byteLength, true);
    h.setUint16(28, 0, true);           // no extra field
    parts.push(head, name, f.data);

    const entry = new ArrayBuffer(46);
    const c = new DataView(entry);
    c.setUint32(0, 0x02014b50, true);   // central directory header signature
    c.setUint16(4, 20, true);           // version made by
    c.setUint16(6, 20, true);           // version needed
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, stamp.time, true);
    c.setUint16(14, stamp.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.byteLength, true);
    c.setUint32(42, offset, true);      // where this entry's local header starts
    central.push(entry, name);

    offset += 30 + name.byteLength + size;
    centralSize += 46 + name.byteLength;
  }

  const end = new ArrayBuffer(22);
  const e = new DataView(end);
  e.setUint32(0, 0x06054b50, true);     // end of central directory signature
  e.setUint16(8, files.length, true);   // entries on this disk
  e.setUint16(10, files.length, true);  // entries in total
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);        // where the central directory starts
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

/** Make a list of filenames unique by suffixing repeats, so two images that happen to share a
 *  basename (images/front/01.jpg and images/back/01.jpg) do not silently become one entry that
 *  unzips to whichever copy the tool read last.
 *
 *  The suffixed name is checked against the same set, which is the difference between "usually
 *  unique" and unique: given 01.jpg, 01.jpg and 01-2.jpg, counting repeats of the ORIGINAL name
 *  invents a second 01-2.jpg and the collision it exists to prevent happens anyway.
 *
 *  Compared case-insensitively because the filesystems these land on mostly are. */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((n) => {
    const dot = n.lastIndexOf(".");
    const stem = dot < 1 ? n : n.slice(0, dot);
    const ext = dot < 1 ? "" : n.slice(dot);
    let out = n;
    for (let k = 2; taken.has(out.toLowerCase()); k++) out = `${stem}-${k}${ext}`;
    taken.add(out.toLowerCase());
    return out;
  });
}

/** Save what is already at a URL, under a name of our choosing. Same-origin only, which every
 *  deck asset is: `download` on a cross-origin href is ignored and the browser navigates to the
 *  file instead, which in a deck means leaving the presentation. */
export function saveUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Save a Blob we built in memory.
 *
 *  THE DELAY BEFORE REVOKING IS NOT A TIDINESS SETTING. Clicking the link only enqueues the
 *  download; the browser reads the object URL afterwards, on its own schedule, and revoking
 *  before that read lands gives a 0-byte file with no error anywhere. It is a race, so it fails
 *  on some machines and not others, and it fails at the moment somebody is being handed their
 *  files. A minute is far longer than any browser takes and costs a few megabytes of memory that
 *  is already allocated. FileSaver.js waits 40 seconds for the same reason. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  saveUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
