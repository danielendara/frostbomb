import { describe, expect, it } from "vitest";
import {
  SHARE_PARAM_LAB,
  SHARE_PARAM_PINK,
  SHARE_PARAM_PRISM,
  SHARE_PARAM_ROTATE,
  SHARE_PARAM_SEED,
  readShareFlag,
  setShareFlag,
  type ShareFlagName,
} from "../../src/share-url-params";

const FLAGS: ReadonlyArray<{
  name: ShareFlagName;
  writesZeroWhenOff: boolean;
}> = [
  { name: SHARE_PARAM_PINK, writesZeroWhenOff: false },
  { name: SHARE_PARAM_PRISM, writesZeroWhenOff: false },
  { name: SHARE_PARAM_ROTATE, writesZeroWhenOff: true },
  { name: SHARE_PARAM_LAB, writesZeroWhenOff: true },
];

describe("share URL param names", () => {
  it("pins the wire names", () => {
    expect(SHARE_PARAM_SEED).toBe("seed");
    expect(SHARE_PARAM_PINK).toBe("pink");
    expect(SHARE_PARAM_PRISM).toBe("prism");
    expect(SHARE_PARAM_ROTATE).toBe("rotate");
    expect(SHARE_PARAM_LAB).toBe("lab");
  });
});

describe("setShareFlag / readShareFlag", () => {
  it.each(FLAGS)("$name on encodes as 1 and reads as 1", ({ name }) => {
    const params = new URLSearchParams();
    setShareFlag(params, name, true);
    expect(params.get(name)).toBe("1");
    expect(readShareFlag(params, name)).toBe("1");
  });

  it.each(FLAGS.filter((f) => !f.writesZeroWhenOff))(
    "$name off omits the param and reads as absent",
    ({ name }) => {
      const params = new URLSearchParams(`${name}=1`);
      setShareFlag(params, name, false);
      expect(params.get(name)).toBeNull();
      expect(readShareFlag(params, name)).toBeNull();
    },
  );

  it.each(FLAGS.filter((f) => f.writesZeroWhenOff))(
    "$name off encodes as 0 and reads as 0",
    ({ name }) => {
      const params = new URLSearchParams();
      setShareFlag(params, name, false);
      expect(params.get(name)).toBe("0");
      expect(readShareFlag(params, name)).toBe("0");
    },
  );

  it.each(FLAGS)("$name absent reads as absent", ({ name }) => {
    expect(readShareFlag(new URLSearchParams(), name)).toBeNull();
  });

  it.each([SHARE_PARAM_ROTATE, SHARE_PARAM_LAB] as const)(
    "reads explicit %s=0 as 0",
    (name) => {
      const params = new URLSearchParams(`${name}=0`);
      expect(params.get(name)).toBe("0");
      expect(readShareFlag(params, name)).toBe("0");
    },
  );

  it("treats a present non-1 value as 0", () => {
    expect(readShareFlag(new URLSearchParams("pink=yes"), SHARE_PARAM_PINK)).toBe("0");
  });
});
