import { NextResponse, type NextRequest } from "next/server";

// Signed-out visitors go to login before any app page renders; the API still re-checks the session.
export function proxy(req: NextRequest) {
  if (req.cookies.has("sid")) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!api|_next|login|track|favicon.ico).*)"] };
