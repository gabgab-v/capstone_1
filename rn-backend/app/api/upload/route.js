import path from "path";
import { NextResponse } from "next/server";
import fs from "fs";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file"); // 👈 must match frontend key

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert file to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = Date.now() + "-" + file.name;

    // Save into public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ url: `/uploads/${filename}` });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
