import { FunctionComponent } from "react"
import { CddlSchema } from "@/types/Cbor"
import { styles } from "./cbor.styles"

interface CompactSchemaHeaderProps {
  schema: CddlSchema
  rule: string
  valid?: boolean
  onChangeClick: () => void
}

/**
 * The rule a payload is being read through, in the one line it takes to say it.
 *
 * The same line, and the same words, as the card that writes a payload: reading
 * and writing are the same rule seen from two sides.
 */
const CompactSchemaHeader: FunctionComponent<CompactSchemaHeaderProps> = ({
  schema,
  rule,
  valid,
  onChangeClick,
}) => {
  return (
    <div style={styles.schemaHeader}>
      <button style={styles.headerButton}
        title="read this payload through another schema or rule"
        onClick={onChangeClick}
      >
        {schema.name} <span style={{ opacity: 0.5 }}>{"\u203a"}</span> {rule} {"\u2304"}
      </button>
      {valid && <span style={styles.validBadge}>matches</span>}
    </div>
  )
}

export default CompactSchemaHeader
