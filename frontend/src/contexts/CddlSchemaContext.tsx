import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { CddlSchema } from "@/types/Cbor"
import { prepareCddlSchema } from "@/utils/cbor"
import cddlApi from "@/api/cddl"

interface CddlSchemaContextType {
  schemas: CddlSchema[]
  isLoading: boolean
  error: string | null
  refreshSchemas: () => Promise<void>
}

const CddlSchemaContext = createContext<CddlSchemaContextType | null>(null)

interface CddlSchemaProviderProps {
  children: ReactNode
}

export function CddlSchemaProvider({ children }: CddlSchemaProviderProps) {
  const [schemas, setSchemas] = useState<CddlSchema[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSchemas = async () => {
    if (isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const backendSchemas = await cddlApi.index()
      const prepared = backendSchemas.map((schema) => prepareCddlSchema(schema))
      setSchemas(prepared)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load schemas"
      setError(errorMessage)
      console.error("Failed to load CDDL schemas:", err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSchemas()
  }, [])

  const refreshSchemas = async () => {
    await loadSchemas()
  }

  return (
    <CddlSchemaContext.Provider
      value={{
        schemas,
        isLoading,
        error,
        refreshSchemas,
      }}
    >
      {children}
    </CddlSchemaContext.Provider>
  )
}

export function useCddlSchemas(): CddlSchemaContextType {
  const context = useContext(CddlSchemaContext)
  if (!context) {
    throw new Error("useCddlSchemas must be used within a CddlSchemaProvider")
  }
  return context
}
