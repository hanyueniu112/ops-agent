import { cursorStatus } from "@/lib/cursor-runtime";

export async function GET() {
  return Response.json(cursorStatus());
}
