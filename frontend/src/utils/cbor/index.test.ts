import { describe, it, expect, beforeEach } from "vitest"
import { CBOR } from "@cbortech/cbor"
import {
  binaryStringToBytes,
  decodeCborPayload,
  decodeAndValidateCbor,
  getRulesFromSchema,
  prepareCddlSchema,
} from "./index"
import { CddlTopicCache } from "./CddlTopicCache"

function bytesToBinaryString(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i])
  }
  return s
}

const PERSON_CDDL = `
person = {
  name: tstr,
  age: uint,
}
`

const PRODUCT_CDDL = `
product = {
  id: int,
  name: tstr,
  price: float64,
}
`

describe("cbor utils", () => {
  it("converts binary string to bytes", () => {
    const bytes = new Uint8Array([0xa1, 0x61, 0x61, 0x01])
    const bin = bytesToBinaryString(bytes)
    expect(Array.from(binaryStringToBytes(bin))).toEqual(Array.from(bytes))
  })

  it("decodes CBOR payload to JSON", () => {
    const bytes = CBOR.encode({ name: "ada", age: 36 })
    const result = decodeCborPayload(bytesToBinaryString(bytes))
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: "ada", age: 36 })
    expect(result.dataJson).toContain("ada")
  })

  it("fails on invalid CBOR", () => {
    const result = decodeCborPayload("not-cbor")
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/CBOR decode failed/)
  })

  it("lists rules from a CDDL schema", () => {
    const rules = getRulesFromSchema({ name: "simple.cddl", content: PERSON_CDDL })
    expect(rules).toContain("person")
  })

  it("validates matching CDDL rule", () => {
    const bytes = CBOR.encode({ name: "ada", age: 36 })
    const schema = { id: "simple", name: "simple.cddl", content: PERSON_CDDL }
    const result = decodeAndValidateCbor(bytesToBinaryString(bytes), schema, "person")
    expect(result.success).toBe(true)
    expect(result.rule).toBe("person")
    expect(result.validationErrors).toBeUndefined()
  })

  it("reports CDDL mismatch while still providing decoded JSON", () => {
    const bytes = CBOR.encode({ name: "ada", age: 36 })
    const schema = { id: "simple2", name: "simple2.cddl", content: PRODUCT_CDDL }
    const result = decodeAndValidateCbor(bytesToBinaryString(bytes), schema, "product")
    expect(result.dataJson).toContain("ada")
    expect(result.success).toBe(false)
    expect(result.error || result.validationErrors?.length).toBeTruthy()
  })

  it("prepareCddlSchema attaches compile errors", () => {
    const bad = prepareCddlSchema({ name: "bad.cddl", content: "this is not = valid cddl {" })
    expect(bad.error).toMatch(/Failed to compile/)
  })
})

describe("CddlTopicCache", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    // Vitest node environment has no localStorage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
    }
    localStorage.clear()
  })

  it("stores and looks up successful decode mappings", () => {
    const cache = new CddlTopicCache()
    cache.clear()
    cache.onSuccessfulDecode("user.1.events.created", "simple", "person")
    const hit = cache.lookup("user.1.events.created")
    expect(hit).not.toBeNull()
    expect(hit?.schema).toBe("simple")
    expect(hit?.messageType).toBe("person")
    cache.dispose()
  })
})
