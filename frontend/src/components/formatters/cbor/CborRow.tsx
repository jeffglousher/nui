import { FunctionComponent, useMemo, memo } from "react"
import { useCddlSchema } from "@/hooks/useCddlSchema"
import JsonRow from "../json/JsonRow"
import TextRow from "../text/TextRow"

interface Props {
  text?: string
  style?: React.CSSProperties
  subject?: string
}

const CborRow: FunctionComponent<Props> = ({ text, style, subject }) => {
  const { selectedSchema, selectedRule, decodedData } = useCddlSchema(text, subject)

  const schemaInfo = useMemo(() => {
    if (!selectedSchema || !selectedRule) return null
    const schemaName =
      selectedSchema.name.length > 30
        ? `...${selectedSchema.name.slice(-27)}`
        : selectedSchema.name
    return `${schemaName}:${selectedRule}`
  }, [selectedSchema, selectedRule])

  if (!text) return null

  if (decodedData?.dataJson) {
    const validationError = decodedData.validationErrors?.[0]
    return (
      <div style={style}>
        {schemaInfo && <div style={cssSchemaInfo}>{schemaInfo}</div>}
        {validationError && <TextRow text={`CDDL: ${validationError}`} error />}
        <JsonRow text={decodedData.dataJson} />
      </div>
    )
  }

  if (decodedData?.error) {
    return (
      <div style={style}>
        {schemaInfo && <div style={cssSchemaInfo}>{schemaInfo}</div>}
        <TextRow text={decodedData.error} error />
      </div>
    )
  }

  return (
    <div style={style}>
      <TextRow text="CBOR: decoding..." />
    </div>
  )
}

export default memo(CborRow)

const cssSchemaInfo: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
  fontFamily: "monospace",
  marginBottom: 2,
}
