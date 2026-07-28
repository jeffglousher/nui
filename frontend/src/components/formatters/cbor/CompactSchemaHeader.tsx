import { FunctionComponent } from "react"
import { CddlSchema } from "@/types/Cbor"
import { styles } from "./cbor.styles"

interface CompactSchemaHeaderProps {
  schema: CddlSchema
  rule: string
  valid?: boolean
  onChangeClick: () => void
}

const CompactSchemaHeader: FunctionComponent<CompactSchemaHeaderProps> = ({
  schema,
  rule,
  valid,
  onChangeClick,
}) => {
  return (
    <div style={styles.schemaHeader}>
      <span style={styles.schemaText}>
        <span style={{ opacity: 0.7 }}>CDDL:</span> {schema.name}{" "}
        <span style={{ opacity: 0.5 }}>→</span> {rule}
        {valid && <span style={styles.validBadge}>valid</span>}
      </span>
      <button onClick={onChangeClick} style={styles.changeButton}>
        Change
      </button>
    </div>
  )
}

export default CompactSchemaHeader
