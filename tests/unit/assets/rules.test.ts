import { describe, expect, it } from "vitest";

import { detectMime, isImage, maxSizeFor, PURPOSE_RULES } from "@/modules/assets/rules";

describe("upload rules (OI-39, UC-13)", () => {
  it("detects PDF, PNG and JPEG by content, not by name", () => {
    expect(detectMime(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
  });

  it("does not recognise an executable renamed to .pdf", () => {
    expect(detectMime(Buffer.from("MZ\x90\x00\x03\x00"))).toBeNull();
    expect(detectMime(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
  });

  it("applies per-purpose type and size limits; faculty photos are import-only", () => {
    expect(maxSizeFor("STUDY_MATERIAL", "application/pdf")).toBe(20 * 1024 * 1024);
    expect(maxSizeFor("SOCIETY_LOGO", "application/pdf")).toBeNull();
    expect(maxSizeFor("SOCIETY_LOGO", "image/png")).toBe(2 * 1024 * 1024);
    expect(PURPOSE_RULES.FACULTY_PHOTO.userUpload).toBe(false);
    expect(isImage("image/png")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
  });
});
