export interface CddlSchema {
  id?: string
  name: string
  content: string
  description?: string
  /** Client-side only: compile/parse error */
  error?: string
}

export interface CborDecodedData {
  success: boolean
  data?: unknown
  dataJson?: string
  error?: string
  validationErrors?: string[]
  schemaUsed?: string
  rule?: string
}
