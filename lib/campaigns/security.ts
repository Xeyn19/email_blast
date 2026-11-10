import { timingSafeEqual } from "node:crypto";

export function isValidCronToken(
  providedToken: string | null,
  expectedToken: string | undefined
) {
  if (!providedToken || !expectedToken) return false;

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  return (
    provided.length === expected.length &&
    timingSafeEqual(provided, expected)
  );
}

