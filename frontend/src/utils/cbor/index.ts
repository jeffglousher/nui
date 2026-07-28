import { CBOR } from "@cbortech/cbor"
import { CDDL } from "@cbortech/cbor/cddl"
import { CborDecodedData, CddlSchema } from "@/types/Cbor"

/** Convert NUI binary-string payload to Uint8Array */
export function binaryStringToBytes(binaryString: string): Uint8Array {
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/** Decode CBOR binary-string payload to a JS value + JSON text */
export function decodeCborPayload(binaryData: string): CborDecodedData {
  if (binaryData == null || binaryData === "") {
    return { success: false, error: "Empty payload" }
  }

  try {
    const bytes = binaryStringToBytes(binaryData)
    const data = CBOR.decode(bytes)
    return {
      success: true,
      data,
      dataJson: JSON.stringify(data, jsonReplacer, 2),
    }
  } catch (error) {
    return {
      success: false,
      error: `CBOR decode failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Decode CBOR and optionally validate against a CDDL schema rule.
 * Raw decode always runs; CDDL validation errors are reported separately.
 */
export function decodeAndValidateCbor(
  binaryData: string,
  schema?: CddlSchema | null,
  rule?: string,
): CborDecodedData {
  const decoded = decodeCborPayload(binaryData)
  if (!decoded.success) {
    return decoded
  }

  if (!schema?.content || !rule) {
    return {
      ...decoded,
      schemaUsed: schema?.id || schema?.name,
      rule,
    }
  }

  try {
    const compiled = CDDL.compile(schema.content)
    const bytes = binaryStringToBytes(binaryData)
    const result = compiled.validate(bytes, { rule })

    if (result.valid) {
      return {
        ...decoded,
        schemaUsed: schema.id || schema.name,
        rule,
      }
    }

    const validationErrors = (result.errors || []).map((e: { message?: string; path?: string }) =>
      e.path ? `${e.path}: ${e.message || "mismatch"}` : (e.message || "CDDL validation failed")
    )

    return {
      ...decoded,
      success: false,
      error: validationErrors[0] || "CDDL validation failed",
      validationErrors,
      schemaUsed: schema.id || schema.name,
      rule,
    }
  } catch (error) {
    return {
      ...decoded,
      success: false,
      error: `CDDL error: ${error instanceof Error ? error.message : "Unknown error"}`,
      schemaUsed: schema.id || schema.name,
      rule,
    }
  }
}

/** List named type rules from a CDDL schema (excludes generic/parameterized when possible) */
export function getRulesFromSchema(schema: CddlSchema): string[] {
  if (!schema?.content) return []
  try {
    const compiled = CDDL.compile(schema.content)
    const rules = compiled.rules

    if (rules instanceof Map) {
      return Array.from(rules.keys()).map(String)
    }

    if (Array.isArray(rules)) {
      return rules
        .map((r: unknown) => {
          if (typeof r === "string") return r
          if (r && typeof r === "object" && "name" in r) return String((r as { name: string }).name)
          return null
        })
        .filter((n): n is string => !!n)
    }

    if (rules && typeof rules === "object") {
      return Object.keys(rules)
    }

    // Fallback: AST rule names
    if (Array.isArray(compiled.ast)) {
      return compiled.ast
        .filter((n: { kind?: string; name?: string }) => n?.kind === "rule" && n.name)
        .map((n: { name: string }) => n.name)
    }

    return []
  } catch {
    return []
  }
}

/** Parse/compile a schema and attach any error onto the schema object */
export function prepareCddlSchema(schema: CddlSchema): CddlSchema {
  try {
    CDDL.compile(schema.content)
    return { ...schema, error: undefined }
  } catch (error) {
    return {
      ...schema,
      error: `Failed to compile: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return {
      __type: "bytes",
      hex: Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join(""),
      length: value.length,
    }
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  return value
}
