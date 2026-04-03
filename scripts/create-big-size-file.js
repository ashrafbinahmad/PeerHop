const fs = require("fs");
const path = require("path");

// Args: node createfile.js 4gb ./folder
const sizeArg = process.argv[2];
const folderPath = process.argv[3];

if (!sizeArg || !folderPath) {
  console.log("Usage: node createfile.js <size> <folderPath>");
  process.exit(1);
}

// Convert size (e.g., 4gb, 500mb) → bytes
function parseSize(size) {
  const match = size.toLowerCase().match(/^(\d+)(kb|mb|gb)$/);
  if (!match) throw new Error("Invalid size format (use kb, mb, gb)");

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const map = {
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
  };

  return value * map[unit];
}

const totalSize = parseSize(sizeArg);

// Ensure folder exists
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

// File path
const filePath = path.join(folderPath, `file_${sizeArg}.bin`);

// Create write stream
const stream = fs.createWriteStream(filePath);

// Write in chunks (1MB)
const chunkSize = 1024 * 1024;
const chunk = Buffer.alloc(chunkSize, 0);

let written = 0;

function write() {
  while (written < totalSize) {
    const remaining = totalSize - written;
    const currentChunkSize = Math.min(chunkSize, remaining);

    const canContinue = stream.write(chunk.slice(0, currentChunkSize));
    written += currentChunkSize;

    if (!canContinue) {
      stream.once("drain", write);
      return;
    }
  }

  stream.end(() => {
    console.log(`✅ File created: ${filePath}`);
    console.log(`📦 Size: ${sizeArg}`);
  });
}

write();
