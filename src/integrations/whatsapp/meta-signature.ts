import crypto from "node:crypto";

export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const received = signatureHeader.slice(7);
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(received),
    Buffer.from(expected)
  );
}
