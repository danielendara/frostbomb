import { describe, expect, it } from "vitest";
import { filesForExportIdentity, formatExportFileName } from "../../src/ui/download";

interface Marker {
  id: string;
}

function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const ORIGINAL: Marker = { id: "crystal-a" };
const IDENTITY = { habit: "fernlike_dendrite", seed: "abcde" };

describe("3D export identity (#343)", () => {
  it("formats both downloads from the captured habit and seed", () => {
    expect(formatExportFileName(IDENTITY, "stl")).toBe("frostbomb-fernlike-dendrite-abcde.stl");
    expect(formatExportFileName(IDENTITY, "glb")).toBe("frostbomb-fernlike-dendrite-abcde.glb");
    expect(formatExportFileName({ habit: "capped_column", seed: "a1b" }, "stl")).toBe(
      "frostbomb-capped-column-a1b.stl",
    );
  });

  it("keeps the captured identity when the importer resolves after a regrow", async () => {
    const gate = deferred();
    const identity = { ...IDENTITY };
    let encoded: Marker | null = null;
    const pending = filesForExportIdentity(identity, ORIGINAL, async () => {
      await gate.promise;
      identity.habit = "needle";
      identity.seed = "zzzzz";
      return async (data) => {
        encoded = data;
        return { stl: new Blob(["stl-a"]), glb: new Blob(["glb-a"]) };
      };
    });

    identity.habit = "column";
    identity.seed = "xxxx";
    gate.resolve();
    const files = await pending;

    expect(encoded).toBe(ORIGINAL);
    expect(files.map((file) => file.filename)).toEqual([
      "frostbomb-fernlike-dendrite-abcde.stl",
      "frostbomb-fernlike-dendrite-abcde.glb",
    ]);
    expect(await files[0].blob.text()).toBe("stl-a");
    expect(await files[1].blob.text()).toBe("glb-a");
  });

  it("keeps the captured identity when the encoder resolves after a regrow", async () => {
    const started = deferred();
    const gate = deferred();
    const identity = { ...IDENTITY };
    let encoded: Marker | null = null;
    const pending = filesForExportIdentity(identity, ORIGINAL, async () => {
      return async (data) => {
        encoded = data;
        started.resolve();
        await gate.promise;
        identity.habit = "plate";
        identity.seed = "yyyyy";
        return { stl: new Blob(["stl-a"]), glb: new Blob(["glb-a"]) };
      };
    });

    await started.promise;
    expect(encoded).toBe(ORIGINAL);
    identity.habit = "needle";
    identity.seed = "zzzzz";
    gate.resolve();
    const files = await pending;

    expect(files.map((file) => file.filename)).toEqual([
      "frostbomb-fernlike-dendrite-abcde.stl",
      "frostbomb-fernlike-dendrite-abcde.glb",
    ]);
  });

  it("rejects when encoding fails and does not invent a later identity", async () => {
    const identity = { ...IDENTITY };
    const pending = filesForExportIdentity(identity, ORIGINAL, async () => {
      identity.habit = "plate";
      identity.seed = "zzzzz";
      return async () => {
        throw new Error("encode failed");
      };
    });
    await expect(pending).rejects.toThrow("encode failed");
  });
});
