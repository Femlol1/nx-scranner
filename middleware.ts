import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
	// Only protect /admin routes
	if (request.nextUrl.pathname.startsWith("/admin")) {
		// Check for authorization
		const authHeader = request.headers.get("authorization");
		const basicAuth = authHeader?.split(" ")[1];

		// Get credentials from environment or use defaults (CHANGE THESE!)
		const adminUsername = process.env.ADMIN_USERNAME;
		const adminPassword = process.env.ADMIN_PASSWORD;

		if (basicAuth) {
			const [username, password] = Buffer.from(basicAuth, "base64")
				.toString()
				.split(":");

			if (username === adminUsername && password === adminPassword) {
				return NextResponse.next();
			}
		}

		// Return 401 and request authentication
		return new NextResponse("Authentication required", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Admin Area"',
			},
		});
	}

	return NextResponse.next();
}

export const config = {
	matcher: "/admin/:path*",
};
