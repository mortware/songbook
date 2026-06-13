import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

// Lazy so that `next build` (which imports route modules without runtime
// env vars) never constructs the client.
let client: Auth0Client | null = null;

export function getAuth0(): Auth0Client {
  return (client ??= new Auth0Client());
}

/** Returns a 401 response if there is no session, otherwise null. */
export async function requireSession(): Promise<NextResponse | null> {
  const session = await getAuth0().getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
