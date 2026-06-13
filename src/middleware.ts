import { NextResponse, type NextRequest } from "next/server";
import { getAuth0 } from "@/lib/auth0";

export async function middleware(request: NextRequest) {
  const auth0 = getAuth0();
  const authResponse = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  // Let the SDK handle its own routes (/auth/login, /auth/callback, ...)
  if (pathname.startsWith("/auth")) return authResponse;

  const session = await auth0.getSession(request);
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/auth/login", request.url);
    login.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(login);
  }

  // Optional allow-list: the Auth0 tenant may permit signups, but only
  // listed emails may use the app.
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0) {
    const email = (session.user.email ?? "").toLowerCase();
    if (!allowed.includes(email)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return authResponse;
}

export const config = {
  matcher: [
    // Everything except static assets and PWA files (which must load
    // without auth so the installed app can boot offline).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|icons/).*)",
  ],
};
