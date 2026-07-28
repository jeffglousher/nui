import { useState, useEffect, useMemo, useCallback } from "react"
import { CborDecodedData, CddlSchema } from "@/types/Cbor"
import { decodeAndValidateCbor, getRulesFromSchema, validateCborPayload } from "@/utils/cbor"
import { CddlTopicCache } from "@/utils/cbor/CddlTopicCache"
import { useCddlSchemas } from "@/contexts/CddlSchemaContext"

const CACHE_CONFIDENCE_THRESHOLD = 0.5
const MAX_SCHEMAS_TO_PROBE = 5


interface UseCddlSchemaReturn {
  schemas: CddlSchema[]
  selectedSchemaId: string
  selectedRule: string
  decodedData: CborDecodedData | null
  isLoadingSchemas: boolean
  isAutoDetecting: boolean
  showSchemaControls: boolean
  availableRules: string[]
  selectedSchema: CddlSchema | undefined
  setSelectedSchemaId: (id: string) => void
  setSelectedRule: (rule: string) => void
  setShowSchemaControls: (show: boolean) => void
  refreshSchemas: () => Promise<void>
  autoDetectRule: () => Promise<void>
  resetSelection: () => void
}

let topicCache: CddlTopicCache | null = null

function getTopicCache(): CddlTopicCache {
  if (!topicCache) {
    topicCache = new CddlTopicCache()
  }
  return topicCache
}

export function useCddlSchema(binaryData?: string, subject?: string): UseCddlSchemaReturn {
  const { schemas, isLoading: isLoadingSchemas, refreshSchemas } = useCddlSchemas()

  const [selectedSchemaId, setSelectedSchemaId] = useState("")
  const [selectedRule, setSelectedRule] = useState("")
  const [decodedData, setDecodedData] = useState<CborDecodedData | null>(null)
  const [isAutoDetecting, setIsAutoDetecting] = useState(false)
  const [showSchemaControls, setShowSchemaControls] = useState(false)
  const [isFromCache, setIsFromCache] = useState(false)

  const selectedSchema = useMemo(
    () => schemas.find(s => s.id === selectedSchemaId || s.name === selectedSchemaId),
    [schemas, selectedSchemaId],
  )

  const availableRules = useMemo(
    () => selectedSchema ? getRulesFromSchema(selectedSchema) : [],
    [selectedSchema],
  )

  const autoDetectRule = useCallback(async () => {
    if (!binaryData || schemas.length === 0) return

    setIsAutoDetecting(true)
    try {
      // every CBOR payload decodes, so only the CDDL verdict tells the rules
      // apart: the first rule the payload matches wins
      for (const schema of schemas.slice(0, MAX_SCHEMAS_TO_PROBE)) {
        if (schema.error) continue
        const match = getRulesFromSchema(schema)
          .find(rule => validateCborPayload(binaryData, schema, rule).valid)
        if (match) {
          setSelectedSchemaId(schema.id || schema.name)
          setSelectedRule(match)
          return
        }
      }
      // nothing matched: leave the selection empty so the payload is shown as
      // plain CBOR instead of flagged against a schema it was never meant for
    } finally {
      setIsAutoDetecting(false)
    }
  }, [binaryData, schemas])

  const resetSelection = useCallback(() => {
    setSelectedSchemaId("")
    setSelectedRule("")
    setShowSchemaControls(false)
    setDecodedData(null)
  }, [])

  useEffect(() => {
    setSelectedSchemaId("")
    setSelectedRule("")
    setShowSchemaControls(false)
    setDecodedData(null)

    if (binaryData && schemas.length > 0) {
      if (subject) {
        const cached = getTopicCache().lookup(subject)
        if (cached && cached.confidence > CACHE_CONFIDENCE_THRESHOLD) {
          const cachedSchema = schemas.find(s => s.id === cached.schema || s.name === cached.schema)
          if (cachedSchema) {
            setSelectedSchemaId(cachedSchema.id || cachedSchema.name)
            setSelectedRule(cached.messageType)
            setIsFromCache(true)
            return
          }
        }
      }
      setIsFromCache(false)
      autoDetectRule()
    }
  }, [binaryData, schemas.length, subject])

  useEffect(() => {
    if (!binaryData) {
      setDecodedData(null)
      return
    }

    // the payload is decoded with or without a schema: CDDL only adds a verdict
    const result = decodeAndValidateCbor(binaryData, selectedSchema, selectedRule || undefined)
    setDecodedData(result)

    if (subject && selectedSchema && selectedRule && !isFromCache) {
      const cache = getTopicCache()
      if (result.valid) {
        cache.onSuccessfulDecode(subject, selectedSchema.id || selectedSchema.name, selectedRule)
      } else {
        cache.onDecodeFailed(subject)
      }
    }
  }, [binaryData, selectedSchema, selectedRule, subject, isFromCache])

  return {
    schemas,
    selectedSchemaId,
    selectedRule,
    decodedData,
    isLoadingSchemas,
    isAutoDetecting,
    showSchemaControls,
    availableRules,
    selectedSchema,
    setSelectedSchemaId,
    setSelectedRule,
    setShowSchemaControls,
    refreshSchemas,
    autoDetectRule,
    resetSelection,
  }
}
