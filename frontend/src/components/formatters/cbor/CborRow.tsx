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
  const { selectedSchema, selectedRule, decodedData, showSchemaControls } = useCddlSchema(
    text,
    subject,
  )

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
    return (
      <div style={style}>
        {schemaInfo && <div style={cssSchemaInfo}>{schemaInfo}</div>}
        {decodedData.error && (
          <TextRow text={`CDDL: ${decodedData.error}`} error />
        )}
        <JsonRow text={decodedData.dataJson} />
      </div>
    )
  }

  if (decodedData?.error) {
    return (
      <div style={style}>
        {schemaInfo && <div style={cssSchemaInfo}>{schemaInfo}</div>}
        <TextRow text={`CBOR decode failed: ${decodedData.error}`} error />
      </div>
    )
  }

  if (showSchemaControls || !selectedSchema || !selectedRule) {
    return (
      <div style={style}>
        <TextRow text="CBOR: decoding..." />
      </div>
    )
  }

  return (
    <div style={style}>
      <TextRow text="Decoding CBOR message..." />
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
