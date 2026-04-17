import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Fail loud if AUTH_SECRET is missing — never silently fall back to a weak default.
function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 24) {
    throw new Error(
      "AUTH_SECRET is missing or too short (< 24 chars). " +
        "Set a long random string in Netlify → Site settings → Environment variables."
    );
  }
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, role: string) {
  return await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get("sp_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { userId: string; role: string };
  } catch {
    return null;
  }
}
