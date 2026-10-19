import { NextResponse } from "next/server";
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/areas", request.url), 303);
}
