import crypto from 'node:crypto';

/** URL-safe random token with `bytes` bytes of entropy. */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Tokens are stored as SHA-256 hashes so a database leak does not leak live tokens. */
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Human-friendly random code, e.g. for certificate IDs. */
export const randomCode = (length: number) => {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
};
