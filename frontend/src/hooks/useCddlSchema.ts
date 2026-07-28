import { useState, useEffect, useMemo, useCallback } from "react"
import { CborDecodedData, CddlSchema } from "@/types/Cbor"
import { decodeAndValidateCbor, getRulesFromSchema } from "@/utils/cbor"
import { CddlTopicCache } from "@/utils/cbor/CddlTopicCache"
import { useCddlSchemas } from "@/contexts/CddlSchemaContext"

const CACHE_CONFIDENCE_THRESHOLD = 0.5

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
    () => schemas.find((s) => s.id === selectedSchemaId || s.name === selectedSchemaId),
    [schemas, selectedSchemaId],
  )

  const availableRules = useMemo(
    () => (selectedSchema ? getRulesFromSchema(selectedSchema) : []),
    [selectedSchema],
  )

  const autoDetectRule = useCallback(async () => {
    if (!binaryData || schemas.length === 0) return

    setIsAutoDetecting(true)
    try {
      let bestMatch: { schemaId: string; rule: string; score: number } | null = null

      for (const schema of schemas.slice(0, 5)) {
        if (schema.error) continue
        const rules = getRulesFromSchema(schema)
        for (const rule of rules) {
          const result = decodeAndValidateCbor(binaryData, schema, rule)
          if (result.success && result.data != null) {
            const dataStr = JSON.stringify(result.data)
            const fieldCount =
              (dataStr.match(/":/g) || []).length
            const score = 50 + Math.min(30, fieldCount * 2) + Math.min(20, dataStr.length / 50)
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = {
                schemaId: schema.id || schema.name,
                rule,
                score,
              }
            }
            if (score > 90) break
          }
        }
        if (bestMatch && bestMatch.score > 90) break
      }

      if (bestMatch) {
        setSelectedSchemaId(bestMatch.schemaId)
        setSelectedRule(bestMatch.rule)
      } else if (!selectedSchemaId && schemas[0]) {
        // Fall back to first schema/rule so UI is usable; raw CBOR still decodes
        const first = schemas[0]
        setSelectedSchemaId(first.id || first.name)
        const rules = getRulesFromSchema(first)
        if (rules[0]) setSelectedRule(rules[0])
      }
    } finally {
      setIsAutoDetecting(false)
    }
  }, [binaryData, schemas, selectedSchemaId])

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
          const cachedSchema = schemas.find(
            (s) => s.id === cached.schema || s.name === cached.schema,
          )
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

    // Always decode CBOR; validate when schema+rule selected
    const result = decodeAndValidateCbor(
      binaryData,
      selectedSchema,
      selectedRule || undefined,
    )
    setDecodedData(result)

    if (subject && selectedSchema && selectedRule && !isFromCache) {
      const cache = getTopicCache()
      const schemaIdentifier = selectedSchema.id || selectedSchema.name
      if (result.success && !result.validationErrors?.length) {
        cache.onSuccessfulDecode(subject, schemaIdentifier, selectedRule)
      } else if (result.error && selectedRule) {
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
