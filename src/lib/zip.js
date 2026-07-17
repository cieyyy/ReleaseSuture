import { open } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_CENTRAL_DIRECTORY_SIZE = 16 * 1024 * 1024;
const MAX_ENTRY_COUNT = 50_000;

async function readBuffer(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

export async function listZipEntries(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const details = await handle.stat();
    const tailLength = Math.min(details.size, MAX_EOCD_SEARCH);
    const tailPosition = details.size - tailLength;
    const tail = await readBuffer(handle, tailLength, tailPosition);
    let eocdIndex = -1;

    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        eocdIndex = index;
        break;
      }
    }
    if (eocdIndex < 0) throw new Error('ZIP end-of-central-directory record not found');

    const totalEntries = tail.readUInt16LE(eocdIndex + 10);
    const centralSize = tail.readUInt32LE(eocdIndex + 12);
    const centralOffset = tail.readUInt32LE(eocdIndex + 16);
    if (totalEntries > MAX_ENTRY_COUNT) {
      throw new Error(`ZIP contains more than ${MAX_ENTRY_COUNT} entries`);
    }
    if (centralSize > MAX_CENTRAL_DIRECTORY_SIZE) {
      throw new Error(`ZIP central directory is larger than ${MAX_CENTRAL_DIRECTORY_SIZE} bytes`);
    }
    if (centralOffset + centralSize > details.size) {
      throw new Error('ZIP central directory points outside the archive');
    }
    const central = await readBuffer(handle, centralSize, centralOffset);
    const entries = [];
    let offset = 0;

    for (let count = 0; count < totalEntries && offset + 46 <= central.length; count += 1) {
      if (central.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
        throw new Error(`Invalid central directory signature at offset ${offset}`);
      }
      const compressionMethod = central.readUInt16LE(offset + 10);
      const compressedSize = central.readUInt32LE(offset + 20);
      const uncompressedSize = central.readUInt32LE(offset + 24);
      const fileNameLength = central.readUInt16LE(offset + 28);
      const extraLength = central.readUInt16LE(offset + 30);
      const commentLength = central.readUInt16LE(offset + 32);
      const localHeaderOffset = central.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nextOffset = nameStart + fileNameLength + extraLength + commentLength;
      if (nextOffset > central.length || localHeaderOffset >= details.size) {
        throw new Error('ZIP entry metadata points outside the archive');
      }
      const name = central.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
      entries.push({
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      offset = nextOffset;
    }

    return entries;
  } finally {
    await handle.close();
  }
}

export async function readZipEntry(filePath, entry, maxUncompressedSize = 2 * 1024 * 1024) {
  if (entry.uncompressedSize > maxUncompressedSize) {
    throw new Error(`ZIP entry is larger than ${maxUncompressedSize} bytes`);
  }
  if (![0, 8].includes(entry.compressionMethod)) {
    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`);
  }
  const maxCompressedSize = Math.max(maxUncompressedSize * 2, maxUncompressedSize + 65_536);
  if (entry.compressedSize > maxCompressedSize) {
    throw new Error(`ZIP entry compressed data is larger than ${maxCompressedSize} bytes`);
  }

  const handle = await open(filePath, 'r');
  try {
    const header = await readBuffer(handle, 30, entry.localHeaderOffset);
    if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw new Error('Invalid ZIP local file header');
    }
    const fileNameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
    const compressed = await readBuffer(handle, entry.compressedSize, dataOffset);
    if (compressed.length !== entry.compressedSize) {
      throw new Error('ZIP entry data points outside the archive');
    }
    if (entry.compressionMethod === 0) return compressed;
    const result = inflateRawSync(compressed, { maxOutputLength: maxUncompressedSize });
    if (result.length > maxUncompressedSize) {
      throw new Error(`ZIP entry expands beyond ${maxUncompressedSize} bytes`);
    }
    return result;
  } finally {
    await handle.close();
  }
}
