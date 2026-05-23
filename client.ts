import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "fs";

function createPrismaClient() {
  try {
    return new PrismaClient();
  } catch (e) {
    console.log("🔄 Running prisma generate...");
    execSync("npx prisma generate", { stdio: "inherit" });
    const { PrismaClient: PC } = require("@prisma/client");
    return new PC();
  }
}

export const prisma = createPrismaClient();

export async function initFonts() {
  // مسارات الفونتات اللي بيثبّتها apt على Debian/Ubuntu
  const candidates = [
    // NotoSans Latin
    {
      paths: [
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans[wdth,wght].ttf",
      ],
      family: "NotoSans",
    },
    {
      paths: [
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans[wdth,wght].ttf",
      ],
      family: "NotoSansBold",
    },
    // NotoSans Arabic
    {
      paths: [
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic[wdth,wght].ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
      ],
      family: "NotoSansArabic",
    },
    {
      paths: [
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic[wdth,wght].ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf",
      ],
      family: "NotoSansArabicBold",
    },
  ];

  for (const { paths, family } of candidates) {
    const found = paths.find(p => existsSync(p));
    if (found) {
      GlobalFonts.registerFromPath(found, family);
      console.log(`✅ Font registered: ${family} → ${found}`);
    } else {
      // fallback: سجّل أي فونت Noto موجود
      const fallbackDirs = [
        "/usr/share/fonts/truetype/noto",
        "/usr/share/fonts/opentype/noto",
        "/usr/share/fonts/truetype/liberation",
      ];
      let registered = false;
      for (const dir of fallbackDirs) {
        if (!existsSync(dir)) continue;
        const { readdirSync } = require("fs");
        const files = readdirSync(dir) as string[];
        const ttf = files.find(
          (f: string) => f.endsWith(".ttf") && !f.includes("Italic")
        );
        if (ttf) {
          GlobalFonts.registerFromPath(`${dir}/${ttf}`, family);
          console.log(`⚠️  Font fallback: ${family} → ${dir}/${ttf}`);
          registered = true;
          break;
        }
      }
      if (!registered) {
        console.error(`❌ No font found for: ${family}`);
      }
    }
  }

  console.log("✅ initFonts done");
}
